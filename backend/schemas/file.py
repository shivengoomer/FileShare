from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel


class FileResponse(BaseModel):
    id: uuid.UUID
    room_id: uuid.UUID
    filename: str
    original_filename: str
    size: int
    content_type: str
    checksum: str | None = None   # SHA-256 hex digest; None for legacy files
    uploaded_at: datetime

    model_config = {"from_attributes": True}
