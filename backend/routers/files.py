from __future__ import annotations

import io
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, Body, Depends, HTTPException, Query, UploadFile, File as FastAPIFile
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas.file import FileResponse as FileSchema
from ..services.file_service import FileService, CHUNK_SIZE
from ..services.room_service import RoomService
from ..services.websocket_manager import manager
from ..config import get_settings

router = APIRouter(prefix="/rooms/{room_id}", tags=["files"])


# ---------------------------------------------------------------------------
# Simple streaming upload  (single request, 256 KB server-side reads)
# ---------------------------------------------------------------------------

@router.post("/upload", response_model=list[FileSchema], status_code=201)
async def upload_files(
    room_id: uuid.UUID,
    files: list[UploadFile],
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.is_expired:
        raise HTTPException(410, "Room has expired")

    results = []
    for upload in files:
        try:
            file_record = await FileService.save_file(
                db,
                room_id,
                upload=upload,
                original_filename=upload.filename or "unnamed",
                content_type=upload.content_type or "application/octet-stream",
            )
            results.append(file_record)
            await manager.broadcast_file_uploaded(
                room_id,
                {
                    "id": str(file_record.id),
                    "original_filename": file_record.original_filename,
                    "size": file_record.size,
                    "content_type": file_record.content_type,
                    "checksum": file_record.checksum,
                    "uploaded_at": file_record.uploaded_at.isoformat(),
                },
            )
        except ValueError as e:
            raise HTTPException(400, str(e))

    return results


# ---------------------------------------------------------------------------
# Chunked upload  (3-step: init → PUT chunks → complete)
# Each chunk carries a CRC-32 parity value; the final step verifies SHA-256.
# ---------------------------------------------------------------------------

@router.post("/upload/init", status_code=201)
async def init_chunked_upload(
    room_id: uuid.UUID,
    filename: str = Query(..., description="Original file name"),
    content_type: str = Query("application/octet-stream"),
    total_chunks: int = Query(..., ge=1, description="Total number of chunks"),
    db: AsyncSession = Depends(get_db),
):
    """Reserve an upload slot and return an upload_id."""
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.is_expired:
        raise HTTPException(410, "Room has expired")

    try:
        upload_id = FileService.init_chunked_upload(
            room_id, filename, content_type, total_chunks
        )
    except ValueError as e:
        raise HTTPException(400, str(e))

    return {"upload_id": upload_id}


@router.put("/upload/{upload_id}/chunk/{chunk_index}", status_code=204)
async def put_chunk(
    room_id: uuid.UUID,
    upload_id: str,
    chunk_index: int,
    crc32: int = Query(..., description="CRC-32 checksum of this chunk (unsigned 32-bit)"),
    chunk: bytes = Body(..., media_type="application/octet-stream"),
    db: AsyncSession = Depends(get_db),
):
    """
    Upload one chunk.  The client must supply the CRC-32 of the raw bytes.
    The server rejects the chunk immediately if the parity check fails.
    """
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.is_expired:
        raise HTTPException(410, "Room has expired")

    try:
        FileService.save_chunk(upload_id, chunk_index, chunk, crc32)
    except ValueError as e:
        raise HTTPException(400, str(e))


@router.post("/upload/{upload_id}/complete", response_model=FileSchema, status_code=201)
async def complete_chunked_upload(
    room_id: uuid.UUID,
    upload_id: str,
    sha256: str = Query(..., description="Expected SHA-256 hex digest of the full file"),
    db: AsyncSession = Depends(get_db),
):
    """
    Assemble chunks, verify the full-file SHA-256, and create the file record.
    """
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.is_expired:
        raise HTTPException(410, "Room has expired")

    try:
        file_record = await FileService.complete_chunked_upload(db, upload_id, sha256)
    except ValueError as e:
        raise HTTPException(400, str(e))

    await manager.broadcast_file_uploaded(
        room_id,
        {
            "id": str(file_record.id),
            "original_filename": file_record.original_filename,
            "size": file_record.size,
            "content_type": file_record.content_type,
            "checksum": file_record.checksum,
            "uploaded_at": file_record.uploaded_at.isoformat(),
        },
    )
    return file_record


# ---------------------------------------------------------------------------
# List files
# ---------------------------------------------------------------------------

@router.get("/files", response_model=list[FileSchema])
async def list_files(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    return await FileService.list_files(db, room_id)


# ---------------------------------------------------------------------------
# Streaming single-file download
# Response includes X-Checksum-SHA256 so the client can verify integrity.
# ---------------------------------------------------------------------------

@router.get("/download/{file_id}")
async def download_file(
    room_id: uuid.UUID,
    file_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.is_expired:
        raise HTTPException(410, "Room has expired — downloads blocked")

    file_record = await FileService.get_file(db, room_id, file_id)
    if not file_record:
        raise HTTPException(404, "File not found")

    try:
        file_path = FileService.get_file_path(room_id, file_record.filename)
    except PermissionError:
        raise HTTPException(403, "Access denied")

    if not file_path.exists():
        raise HTTPException(404, "File not found on disk")

    headers = {
        "Content-Disposition": f'attachment; filename="{file_record.original_filename}"',
        "Content-Length": str(file_record.size),
    }
    if file_record.checksum:
        headers["X-Checksum-SHA256"] = file_record.checksum

    return StreamingResponse(
        FileService.stream_file(file_path),
        media_type=file_record.content_type,
        headers=headers,
    )


# ---------------------------------------------------------------------------
# Streaming download-all (ZIP)
# ---------------------------------------------------------------------------

@router.get("/download-all")
async def download_all(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    if room.is_expired:
        raise HTTPException(410, "Room has expired — downloads blocked")

    files = await FileService.list_files(db, room_id)
    if not files:
        raise HTTPException(404, "No files in room")

    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            try:
                path = FileService.get_file_path(room_id, f.filename)
                if path.exists():
                    zf.write(path, arcname=f.original_filename)
            except PermissionError:
                continue
    buf.seek(0)

    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": f"attachment; filename=room_{room_id}_files.zip"},
    )

