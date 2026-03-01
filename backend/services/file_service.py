from __future__ import annotations

import os
import re
import uuid
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.file import File
from ..config import get_settings

# Dangerous extensions that are blocked
BLOCKED_EXTENSIONS = {
    ".exe", ".bat", ".cmd", ".com", ".msi", ".scr", ".pif",
    ".vbs", ".vbe", ".js", ".jse", ".wsf", ".wsh", ".ps1",
}


class FileService:
    @staticmethod
    def _sanitize_filename(filename: str) -> str:
        """Remove path separators and dangerous characters."""
        # Strip any directory components
        filename = os.path.basename(filename)
        # Remove null bytes and path traversal
        filename = filename.replace("\x00", "").replace("..", "")
        # Allow only safe characters
        filename = re.sub(r"[^\w\s\-.]", "_", filename)
        # Collapse multiple underscores / spaces
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
    async def save_file(
        db: AsyncSession,
        room_id: uuid.UUID,
        original_filename: str,
        content: bytes,
        content_type: str = "application/octet-stream",
    ) -> File:
        settings = get_settings()

        if len(content) > settings.max_file_size_bytes:
            raise ValueError(
                f"File too large. Maximum size is {settings.MAX_FILE_SIZE_MB} MB."
            )

        safe_name = FileService._sanitize_filename(original_filename)
        if not FileService._is_allowed_file(safe_name):
            raise ValueError(f"File type not allowed: {Path(safe_name).suffix}")

        file_id = uuid.uuid4()
        # Store with UUID prefix to avoid collisions
        stored_name = f"{file_id}_{safe_name}"
        upload_dir = FileService._get_upload_dir(room_id)
        file_path = upload_dir / stored_name

        # Write file to disk
        file_path.write_bytes(content)

        # Persist metadata
        file_record = File(
            id=file_id,
            room_id=room_id,
            filename=stored_name,
            original_filename=safe_name,
            size=len(content),
            content_type=content_type,
        )
        db.add(file_record)
        await db.flush()
        await db.refresh(file_record)
        return file_record

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
        # Prevent directory traversal
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
