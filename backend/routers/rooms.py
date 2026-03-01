from __future__ import annotations

import io
import uuid

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas.room import RoomCreate, RoomJoin, RoomResponse
from ..services.room_service import RoomService
from ..services.file_service import FileService
from ..services.websocket_manager import manager

router = APIRouter(prefix="/rooms", tags=["rooms"])


def _room_to_response(room) -> RoomResponse:
    return RoomResponse(
        id=room.id,
        created_at=room.created_at,
        expires_at=room.expires_at,
        active_users=room.active_users,
        has_password=room.password_hash is not None,
        file_count=len(room.files) if room.files else 0,
    )


@router.post("/create", response_model=RoomResponse, status_code=201)
async def create_room(
    body: RoomCreate,
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.create_room(
        db,
        expiry_minutes=body.expiry_minutes,
        password=body.password,
    )
    return _room_to_response(room)


@router.get("/{room_id}", response_model=RoomResponse)
async def get_room(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found or expired")
    if room.is_expired:
        raise HTTPException(410, "Room has expired")
    return _room_to_response(room)


@router.post("/{room_id}/join", response_model=RoomResponse)
async def join_room(
    room_id: uuid.UUID,
    body: RoomJoin = RoomJoin(),
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found or expired")
    if room.is_expired:
        raise HTTPException(410, "Room has expired")
    if not await RoomService.verify_password(room, body.password):
        raise HTTPException(403, "Invalid room password")
    return _room_to_response(room)


@router.delete("/{room_id}", status_code=204)
async def end_room(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found or expired")
    await manager.broadcast_room_expired(room_id)
    FileService.delete_room_files(room_id)
    await RoomService.deactivate_room(db, room)
    await db.commit()


@router.get("/{room_id}/qr")
async def get_qr_code(
    room_id: uuid.UUID,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found")

    # Build the join URL (frontend URL)
    base_url = str(request.base_url).rstrip("/")
    # The QR code points to the frontend join page
    join_url = f"{base_url.replace(':8000', ':5173')}/room/{room_id}"

    img = qrcode.make(join_url, box_size=8, border=2)
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return StreamingResponse(buf, media_type="image/png")
