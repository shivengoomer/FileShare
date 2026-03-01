from __future__ import annotations

import io
import uuid
import zipfile
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File as FastAPIFile
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas.file import FileResponse as FileSchema
from ..services.file_service import FileService
from ..services.room_service import RoomService
from ..services.websocket_manager import manager
from ..config import get_settings

router = APIRouter(prefix="/rooms/{room_id}", tags=["files"])


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
        content = await upload.read()
        try:
            file_record = await FileService.save_file(
                db,
                room_id,
                original_filename=upload.filename or "unnamed",
                content=content,
                content_type=upload.content_type or "application/octet-stream",
            )
            results.append(file_record)
            # Broadcast to room
            await manager.broadcast_file_uploaded(
                room_id,
                {
                    "id": str(file_record.id),
                    "original_filename": file_record.original_filename,
                    "size": file_record.size,
                    "content_type": file_record.content_type,
                    "uploaded_at": file_record.uploaded_at.isoformat(),
                },
            )
        except ValueError as e:
            raise HTTPException(400, str(e))

    return results


@router.get("/files", response_model=list[FileSchema])
async def list_files(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found")
    return await FileService.list_files(db, room_id)


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

    return FileResponse(
        path=str(file_path),
        filename=file_record.original_filename,
        media_type=file_record.content_type,
    )


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
