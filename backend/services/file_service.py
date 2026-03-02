from __future__ import annotations

import hashlib
import json
import os
import re
import uuid
import zlib
from pathlib import Path
from typing import AsyncIterator

from fastapi import UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.file import File
from ..config import get_settings

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Dangerous extensions that are blocked
BLOCKED_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
    ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".ps1",
}

# Read/write chunk size: 256 KB — low RAM footprint, good throughput on slow links
CHUNK_SIZE = 256 * 1024  # 256 KB


# ---------------------------------------------------------------------------
# FileService
# ---------------------------------------------------------------------------

class FileService:
    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        """Remove path separators and dangerous characters."""
        filename = os.path.basename(filename)
        filename = filename.replace("\x00", "").replace("..", "")
        filename = re.sub(r"[^\w\s\-.]", "_", filename)
        filename = re.sub(r"[_\s]+", "_", filename).strip("_")
        return filename or "unnamed_file"

    @staticmethod
    def _is_allowed_file(filename: str) -> bool:
        ext = Path(filename).suffix.lower()
        return ext not in BLOCKED_EXTENSIONS

    @staticmethod
    def _get_upload_dir(room_id: uuid.UUID) -> Path:
        settings = get_settings()
        upload_dir = Path(settings.UPLOAD_DIR) / str(room_id)
        upload_dir.mkdir(parents=True, exist_ok=True)
        return upload_dir

    @staticmethod
    def _get_chunk_dir(upload_id: str) -> Path:
        """Temp directory that holds in-progress chunked-upload data."""
        settings = get_settings()
        chunk_dir = Path(settings.UPLOAD_DIR) / ".chunks" / upload_id
        chunk_dir.mkdir(parents=True, exist_ok=True)
        return chunk_dir

    # ------------------------------------------------------------------
    # Simple Streaming Upload
    # Reads UploadFile in CHUNK_SIZE slices — never loads the whole file.
    # SHA-256 is computed incrementally during the write.
    # ------------------------------------------------------------------

    @staticmethod
    async def save_file(
        db: AsyncSession,
        room_id: uuid.UUID,
        upload: UploadFile,
        original_filename: str | None = None,
        content_type: str = "application/octet-stream",
    ) -> File:
        settings = get_settings()

        safe_name = FileService._sanitize_filename(
            original_filename or upload.filename or "unnamed"
        )
        if not FileService._is_allowed_file(safe_name):
            raise ValueError(f"File type not allowed: {Path(safe_name).suffix}")

        file_id = uuid.uuid4()
        stored_name = f"{file_id}_{safe_name}"
        upload_dir = FileService._get_upload_dir(room_id)
        file_path = upload_dir / stored_name

        hasher = hashlib.sha256()
        total_bytes = 0

        try:
            with file_path.open("wb") as fout:
                while True:
                    chunk = await upload.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    total_bytes += len(chunk)
                    if total_bytes > settings.max_file_size_bytes:
                        raise ValueError(
                            f"File too large. Maximum is {settings.MAX_FILE_SIZE_MB} MB."
                        )
                    hasher.update(chunk)
                    fout.write(chunk)
        except ValueError:
            file_path.unlink(missing_ok=True)
            raise

        sha256_hex = hasher.hexdigest()

        file_record = File(
            id=file_id,
            room_id=room_id,
            filename=stored_name,
            original_filename=safe_name,
            size=total_bytes,
            content_type=content_type,
            checksum=sha256_hex,
        )
        db.add(file_record)
        await db.flush()
        await db.refresh(file_record)
        return file_record

    # ------------------------------------------------------------------
    # Chunked Upload
    # Three-step: init → PUT chunks (each with CRC-32 parity) → complete
    # The final step assembles all chunks and verifies the full-file SHA-256.
    # ------------------------------------------------------------------

    @staticmethod
    def init_chunked_upload(
        room_id: uuid.UUID,
        original_filename: str,
        content_type: str,
        total_chunks: int,
    ) -> str:
        """Reserve a slot. Returns the upload_id the client uses for chunk PUTs."""
        safe_name = FileService._sanitize_filename(original_filename)
        if not FileService._is_allowed_file(safe_name):
            raise ValueError(f"File type not allowed: {Path(safe_name).suffix}")

        upload_id = str(uuid.uuid4())
        chunk_dir = FileService._get_chunk_dir(upload_id)
        meta = {
            "room_id": str(room_id),
            "original_filename": safe_name,
            "content_type": content_type,
            "total_chunks": total_chunks,
            "received": [],
        }
        (chunk_dir / "meta.json").write_text(json.dumps(meta))
        return upload_id

    @staticmethod
    def save_chunk(
        upload_id: str,
        chunk_index: int,
        data: bytes,
        client_crc32: int,
    ) -> None:
        """
        Persist one chunk after CRC-32 parity validation.
        Raises ValueError on mismatch (bit-flip / truncated transfer detected).
        """
        actual_crc32 = zlib.crc32(data) & 0xFFFFFFFF
        if actual_crc32 != (client_crc32 & 0xFFFFFFFF):
            raise ValueError(
                f"CRC-32 parity mismatch on chunk {chunk_index}: "
                f"expected {client_crc32:#010x}, got {actual_crc32:#010x}"
            )

        chunk_dir = FileService._get_chunk_dir(upload_id)
        meta_path = chunk_dir / "meta.json"
        if not meta_path.exists():
            raise ValueError("Unknown upload_id")

        (chunk_dir / f"{chunk_index:06d}.bin").write_bytes(data)

        meta = json.loads(meta_path.read_text())
        if chunk_index not in meta["received"]:
            meta["received"].append(chunk_index)
        meta_path.write_text(json.dumps(meta))

    @staticmethod
    async def complete_chunked_upload(
        db: AsyncSession,
        upload_id: str,
        expected_sha256: str,
    ) -> File:
        """
        Assemble chunks in order, verify full-file SHA-256, persist to DB.
        Cleans up the temp chunk directory regardless of outcome.
        """
        settings = get_settings()
        chunk_dir = FileService._get_chunk_dir(upload_id)
        meta_path = chunk_dir / "meta.json"
        if not meta_path.exists():
            raise ValueError("Unknown upload_id")

        meta = json.loads(meta_path.read_text())
        total_chunks: int = meta["total_chunks"]
        received: list[int] = meta["received"]
        missing = sorted(set(range(total_chunks)) - set(received))
        if missing:
            raise ValueError(f"Missing chunks: {missing[:10]}")

        room_id = uuid.UUID(meta["room_id"])
        safe_name: str = meta["original_filename"]
        content_type: str = meta["content_type"]

        file_id = uuid.uuid4()
        stored_name = f"{file_id}_{safe_name}"
        upload_dir = FileService._get_upload_dir(room_id)
        file_path = upload_dir / stored_name

        hasher = hashlib.sha256()
        total_bytes = 0

        try:
            with file_path.open("wb") as fout:
                for idx in range(total_chunks):
                    chunk_data = (chunk_dir / f"{idx:06d}.bin").read_bytes()
                    total_bytes += len(chunk_data)
                    if total_bytes > settings.max_file_size_bytes:
                        raise ValueError(
                            f"File too large. Maximum is {settings.MAX_FILE_SIZE_MB} MB."
                        )
                    hasher.update(chunk_data)
                    fout.write(chunk_data)
        except Exception:
            file_path.unlink(missing_ok=True)
            raise
        finally:
            import shutil
            shutil.rmtree(chunk_dir, ignore_errors=True)

        actual_sha256 = hasher.hexdigest()
        if actual_sha256.lower() != expected_sha256.lower():
            file_path.unlink(missing_ok=True)
            raise ValueError(
                f"SHA-256 mismatch: expected {expected_sha256}, got {actual_sha256}"
            )

        file_record = File(
            id=file_id,
            room_id=room_id,
            filename=stored_name,
            original_filename=safe_name,
            size=total_bytes,
            content_type=content_type,
            checksum=actual_sha256,
        )
        db.add(file_record)
        await db.flush()
        await db.refresh(file_record)
        return file_record

    # ------------------------------------------------------------------
    # Streaming Download
    # Yields CHUNK_SIZE slices from disk — low RAM footprint for downloads.
    # ------------------------------------------------------------------

    @staticmethod
    def stream_file(file_path: Path) -> AsyncIterator[bytes]:
        """Async generator yielding 256 KB chunks from the given path."""
        async def _gen():
            with file_path.open("rb") as fh:
                while True:
                    chunk = fh.read(CHUNK_SIZE)
                    if not chunk:
                        break
                    yield chunk
        return _gen()

    # ------------------------------------------------------------------
    # Database helpers
    # ------------------------------------------------------------------

    @staticmethod
    async def get_file(
        db: AsyncSession, room_id: uuid.UUID, file_id: uuid.UUID
    ) -> File | None:
        stmt = select(File).where(File.id == file_id, File.room_id == room_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def list_files(db: AsyncSession, room_id: uuid.UUID) -> list[File]:
        stmt = (
            select(File)
            .where(File.room_id == room_id)
            .order_by(File.uploaded_at.desc())
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    def get_file_path(room_id: uuid.UUID, stored_filename: str) -> Path:
        settings = get_settings()
        path = (Path(settings.UPLOAD_DIR) / str(room_id) / stored_filename).resolve()
        base_dir = Path(settings.UPLOAD_DIR).resolve()
        if not str(path).startswith(str(base_dir)):
            raise PermissionError("Invalid file path")
        return path

    @staticmethod
    def delete_room_files(room_id: uuid.UUID) -> None:
        settings = get_settings()
        upload_dir = Path(settings.UPLOAD_DIR) / str(room_id)
        if upload_dir.exists():
            import shutil
            shutil.rmtree(upload_dir, ignore_errors=True)

