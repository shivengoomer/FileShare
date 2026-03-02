from __future__ import annotations

import io
import uuid
from datetime import datetime, timezone

import qrcode
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..schemas.room import RoomCreate, RoomJoin, RoomJoinOTP, RoomResponse, OTPResponse
from ..services.room_service import RoomService
from ..services.otp_service import OTPService
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


@router.post("/join/otp", response_model=RoomResponse)
async def global_join_with_otp(
    body: RoomJoinOTP,
    db: AsyncSession = Depends(get_db),
):
    """
    Join any room using only a 6-digit OTP code — no room ID needed.
    The OTP is consumed on success.
    """
    otp = await OTPService.resolve_otp(db, body.otp)
    if otp is None:
        raise HTTPException(403, "Invalid or expired OTP")

    room = await RoomService.get_room(db, otp.room_id)
    if not room or room.is_expired:
        raise HTTPException(410, "Room has expired")

    await db.commit()
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


@router.post("/{room_id}/join/otp", response_model=RoomResponse)
async def join_room_with_otp(
    room_id: uuid.UUID,
    body: RoomJoinOTP,
    db: AsyncSession = Depends(get_db),
):
    """Join a room using a one-time password. The OTP is consumed on success."""
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found or expired")
    if room.is_expired:
        raise HTTPException(410, "Room has expired")
    if not await OTPService.verify_otp(db, room_id, body.otp):
        raise HTTPException(403, "Invalid or expired OTP")
    await db.commit()
    return _room_to_response(room)


@router.post("/{room_id}/otp/generate", response_model=OTPResponse, status_code=201)
async def generate_otp(
    room_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
):
    """
    Generate a fresh 6-digit, single-use OTP valid for 10 minutes.
    The room owner calls this and shares the code with guests.
    """
    room = await RoomService.get_room(db, room_id)
    if not room:
        raise HTTPException(404, "Room not found or expired")
    if room.is_expired:
        raise HTTPException(410, "Room has expired")

    # Housekeeping: remove stale OTPs before creating a new one
    await OTPService.purge_expired(db, room_id)

    otp = await OTPService.create_otp(db, room_id)
    await db.commit()

    now = datetime.now(timezone.utc)
    expires_in = max(0, int((otp.expires_at - now).total_seconds()))
    return OTPResponse(
        otp_code=otp.code,
        expires_in_seconds=expires_in,
        expires_at=otp.expires_at,
    )


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
