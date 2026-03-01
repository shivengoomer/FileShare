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
    uploaded_at: datetime

    model_config = {"from_attributes": True}
