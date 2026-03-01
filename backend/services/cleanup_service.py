from __future__ import annotations

import asyncio
import logging

from ..database import async_session_factory
from .room_service import RoomService
from .file_service import FileService
from .websocket_manager import manager

logger = logging.getLogger("fileshare.cleanup")


class CleanupService:
    """Background task that periodically cleans up expired rooms."""

    def __init__(self, interval_seconds: int = 60) -> None:
        self.interval = interval_seconds
        self._task: asyncio.Task | None = None

    async def _run(self) -> None:
        while True:
            try:
                async with async_session_factory() as db:
                    expired = await RoomService.get_expired_rooms(db)
                    for room in expired:
                        logger.info("Cleaning up expired room %s", room.id)
                        # Notify connected clients
                        await manager.broadcast_room_expired(room.id)
                        # Delete files from disk
                        FileService.delete_room_files(room.id)
                        # Mark room inactive
                        await RoomService.deactivate_room(db, room)
                    await db.commit()
            except Exception:
                logger.exception("Error during cleanup cycle")
            await asyncio.sleep(self.interval)

    def start(self) -> None:
        self._task = asyncio.create_task(self._run())
        logger.info("Cleanup service started (interval=%ds)", self.interval)

    async def stop(self) -> None:
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
