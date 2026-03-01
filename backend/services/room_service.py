from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from ..models.room import Room
from ..models.file import File
from ..config import get_settings


class RoomService:
    @staticmethod
    def _hash_password(password: str) -> str:
        return hashlib.sha256(password.encode()).hexdigest()

    @staticmethod
    async def create_room(
        db: AsyncSession,
        expiry_minutes: int | None = None,
        password: str | None = None,
    ) -> Room:
        settings = get_settings()
        minutes = expiry_minutes or settings.ROOM_EXPIRY_MINUTES
        now = datetime.now(timezone.utc)
        room = Room(
            id=uuid.uuid4(),
            created_at=now,
            expires_at=now + timedelta(minutes=minutes),
            active_users=0,
            password_hash=RoomService._hash_password(password) if password else None,
        )
        db.add(room)
        await db.flush()
        await db.refresh(room)
        return room

    @staticmethod
    async def get_room(db: AsyncSession, room_id: uuid.UUID) -> Room | None:
        stmt = (
            select(Room)
            .options(selectinload(Room.files))
            .where(Room.id == room_id, Room.is_active == True)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    @staticmethod
    async def verify_password(room: Room, password: str | None) -> bool:
        if room.password_hash is None:
            return True
        if password is None:
            return False
        return room.password_hash == RoomService._hash_password(password)

    @staticmethod
    async def increment_users(db: AsyncSession, room_id: uuid.UUID) -> None:
        room = await db.get(Room, room_id)
        if room:
            room.active_users += 1
            await db.flush()

    @staticmethod
    async def decrement_users(db: AsyncSession, room_id: uuid.UUID) -> None:
        room = await db.get(Room, room_id)
        if room and room.active_users > 0:
            room.active_users -= 1
            await db.flush()

    @staticmethod
    async def get_expired_rooms(db: AsyncSession) -> list[Room]:
        now = datetime.now(timezone.utc)
        stmt = (
            select(Room)
            .options(selectinload(Room.files))
            .where(Room.expires_at <= now, Room.is_active == True)
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    @staticmethod
    async def deactivate_room(db: AsyncSession, room: Room) -> None:
        # Delete the room record; cascade="all, delete-orphan" removes File rows too
        await db.delete(room)
        await db.flush()
