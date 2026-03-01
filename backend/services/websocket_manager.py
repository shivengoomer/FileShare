from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field

from fastapi import WebSocket


@dataclass
class ConnectionManager:
    """Manages WebSocket connections per room."""

    _rooms: dict[uuid.UUID, list[WebSocket]] = field(default_factory=dict)

    def _room(self, room_id: uuid.UUID) -> list[WebSocket]:
        return self._rooms.setdefault(room_id, [])

    async def connect(self, room_id: uuid.UUID, ws: WebSocket) -> None:
        await ws.accept()
        self._room(room_id).append(ws)

    def disconnect(self, room_id: uuid.UUID, ws: WebSocket) -> None:
        conns = self._rooms.get(room_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self._rooms.pop(room_id, None)

    def participant_count(self, room_id: uuid.UUID) -> int:
        return len(self._rooms.get(room_id, []))

    async def broadcast(self, room_id: uuid.UUID, message: dict) -> None:
        payload = json.dumps(message, default=str)
        dead: list[WebSocket] = []
        for ws in self._room(room_id):
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(room_id, ws)

    async def broadcast_user_count(self, room_id: uuid.UUID) -> None:
        await self.broadcast(
            room_id,
            {"type": "user_count", "count": self.participant_count(room_id)},
        )

    async def broadcast_file_uploaded(
        self, room_id: uuid.UUID, file_data: dict
    ) -> None:
        await self.broadcast(
            room_id, {"type": "file_uploaded", "file": file_data}
        )

    async def broadcast_room_expired(self, room_id: uuid.UUID) -> None:
        await self.broadcast(room_id, {"type": "room_expired"})


# Singleton
manager = ConnectionManager()
