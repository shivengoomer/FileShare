from __future__ import annotations

import json
import uuid
from dataclasses import dataclass, field

from fastapi import WebSocket


@dataclass
class ConnectionManager:
    """Manages WebSocket connections per room with P2P signaling support."""

    _rooms: dict[uuid.UUID, list[WebSocket]] = field(default_factory=dict)
    _peers: dict[str, WebSocket] = field(default_factory=dict)      # peer_id -> ws
    _ws_to_peer: dict[int, str] = field(default_factory=dict)        # id(ws) -> peer_id

    def _room(self, room_id: uuid.UUID) -> list[WebSocket]:
        return self._rooms.setdefault(room_id, [])

    async def connect(self, room_id: uuid.UUID, ws: WebSocket, peer_id: str) -> None:
        await ws.accept()
        self._room(room_id).append(ws)
        self._peers[peer_id] = ws
        self._ws_to_peer[id(ws)] = peer_id

    def disconnect(self, room_id: uuid.UUID, ws: WebSocket) -> None:
        conns = self._rooms.get(room_id, [])
        if ws in conns:
            conns.remove(ws)
        if not conns:
            self._rooms.pop(room_id, None)
        peer_id = self._ws_to_peer.pop(id(ws), None)
        if peer_id:
            self._peers.pop(peer_id, None)

    def get_peer_id(self, ws: WebSocket) -> str | None:
        return self._ws_to_peer.get(id(ws))

    def participant_count(self, room_id: uuid.UUID) -> int:
        return len(self._rooms.get(room_id, []))

    async def send_to_peer(self, peer_id: str, message: dict) -> bool:
        """Relay a message to a specific peer. Returns False if peer not found."""
        ws = self._peers.get(peer_id)
        if not ws:
            return False
        try:
            await ws.send_text(json.dumps(message, default=str))
            return True
        except Exception:
            return False

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
