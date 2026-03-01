from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db, async_session_factory
from ..services.room_service import RoomService
from ..services.websocket_manager import manager

router = APIRouter(tags=["websocket"])


@router.websocket("/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: uuid.UUID):
    # Validate room exists
    async with async_session_factory() as db:
        room = await RoomService.get_room(db, room_id)
        if not room or room.is_expired:
            await websocket.close(code=4004, reason="Room not found or expired")
            return

    await manager.connect(room_id, websocket)

    # Increment active users in DB
    async with async_session_factory() as db:
        await RoomService.increment_users(db, room_id)
        await db.commit()

    await manager.broadcast_user_count(room_id)
    await manager.broadcast(room_id, {"type": "user_joined"})

    try:
        while True:
            # Keep connection alive; handle incoming messages if needed
            data = await websocket.receive_text()
            # Currently we don't process client messages, but the loop keeps
            # the connection open.
    except WebSocketDisconnect:
        pass
    finally:
        manager.disconnect(room_id, websocket)
        async with async_session_factory() as db:
            await RoomService.decrement_users(db, room_id)
            await db.commit()
        await manager.broadcast_user_count(room_id)
        await manager.broadcast(room_id, {"type": "user_left"})
