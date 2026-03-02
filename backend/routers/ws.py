from __future__ import annotations

import json
import uuid

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from ..database import async_session_factory
from ..services.room_service import RoomService
from ..services.websocket_manager import manager

router = APIRouter(tags=["websocket"])

# Message types that are relayed point-to-point (require a "to" field).
# Everything else is either handled server-side or broadcast to the room.
RELAY_TYPES = {"webrtc_offer", "webrtc_answer", "webrtc_ice", "file_request"}


@router.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: uuid.UUID):
    # Validate room exists
    async with async_session_factory() as db:
        room = await RoomService.get_room(db, room_id)
        if not room or room.is_expired:
            await websocket.close(code=4004, reason="Room not found or expired")
            return

    peer_id = str(uuid.uuid4())
    await manager.connect(room_id, websocket, peer_id)

    # Tell this client its own peer_id
    await websocket.send_text(json.dumps({"type": "hello", "peer_id": peer_id}))

    # Increment active users in DB
    async with async_session_factory() as db:
        await RoomService.increment_users(db, room_id)
        await db.commit()

    await manager.broadcast_user_count(room_id)
    await manager.broadcast(room_id, {"type": "user_joined"})

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")
            to_peer = msg.get("to")

            if msg_type in RELAY_TYPES and to_peer:
                # Point-to-point relay — stamp sender's peer_id and forward
                msg["from"] = peer_id
                await manager.send_to_peer(to_peer, msg)

            elif msg_type == "file_available":
                # Uploader announces a file; stamp peer_id so receivers know
                # who to request from, then broadcast to the room.
                msg["file"]["peer_id"] = peer_id
                await manager.broadcast(room_id, msg)

            elif msg_type == "file_removed":
                msg["peer_id"] = peer_id
                await manager.broadcast(room_id, msg)

            # Any other type is silently ignored.

    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_id, websocket)
        async with async_session_factory() as db:
            await RoomService.decrement_users(db, room_id)
            await db.commit()
        await manager.broadcast_user_count(room_id)
        # Include leaving peer_id so clients can mark their files unavailable
        await manager.broadcast(room_id, {"type": "user_left", "peer_id": peer_id})
