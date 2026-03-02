from __future__ import annotations

import random
import string
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..models.otp import RoomOTP

OTP_LENGTH = 6
OTP_TTL_MINUTES = 10


class OTPService:
    @staticmethod
    def _generate_code() -> str:
        """Return a cryptographically random 6-digit string."""
        return "".join(random.SystemRandom().choices(string.digits, k=OTP_LENGTH))

    @staticmethod
    async def create_otp(db: AsyncSession, room_id: uuid.UUID) -> RoomOTP:
        """Generate a fresh OTP for a room (invalidates nothing — each is single-use)."""
        code = OTPService._generate_code()
        otp = RoomOTP(
            id=uuid.uuid4(),
            room_id=room_id,
            code=code,
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=OTP_TTL_MINUTES),
            used=False,
        )
        db.add(otp)
        await db.flush()
        await db.refresh(otp)
        return otp

    @staticmethod
    async def verify_otp(
        db: AsyncSession, room_id: uuid.UUID, code: str
    ) -> bool:
        """
        Validate the code for a known room_id. If valid, mark it as used and return True.
        Returns False for wrong code, expired, or already-used OTPs.
        """
        stmt = select(RoomOTP).where(
            RoomOTP.room_id == room_id,
            RoomOTP.code == code.strip(),
            RoomOTP.used == False,  # noqa: E712
        )
        result = await db.execute(stmt)
        otp = result.scalar_one_or_none()

        if otp is None:
            return False
        if otp.is_expired:
            return False

        otp.used = True
        await db.flush()
        return True

    @staticmethod
    async def resolve_otp(
        db: AsyncSession, code: str
    ) -> RoomOTP | None:
        """
        Look up an OTP by code alone (no room_id required).
        Returns the OTP row (with room_id) if valid, else None.
        The OTP is consumed (marked used) on success.
        """
        stmt = select(RoomOTP).where(
            RoomOTP.code == code.strip(),
            RoomOTP.used == False,  # noqa: E712
        )
        result = await db.execute(stmt)
        otp = result.scalar_one_or_none()

        if otp is None or otp.is_expired:
            return None

        otp.used = True
        await db.flush()
        return otp

    @staticmethod
    async def purge_expired(db: AsyncSession, room_id: uuid.UUID) -> None:
        """Clean up expired / used OTPs for a room (housekeeping)."""
        now = datetime.now(timezone.utc)
        stmt = select(RoomOTP).where(
            RoomOTP.room_id == room_id,
            (RoomOTP.expires_at <= now) | (RoomOTP.used == True),  # noqa: E712
        )
        result = await db.execute(stmt)
        for otp in result.scalars().all():
            await db.delete(otp)
        await db.flush()
