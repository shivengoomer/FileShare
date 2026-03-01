from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, Field


class RoomCreate(BaseModel):
    expiry_minutes: int = Field(default=30, ge=5, le=1440)
    password: str | None = Field(default=None, max_length=128)


class RoomJoin(BaseModel):
    password: str | None = None


class RoomResponse(BaseModel):
    id: uuid.UUID
    created_at: datetime
    expires_at: datetime
    active_users: int
    has_password: bool
    file_count: int = 0

    model_config = {"from_attributes": True}
