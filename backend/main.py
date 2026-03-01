from __future__ import annotations

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import engine
from .models.base import Base
from .routers import rooms_router, files_router, ws_router
from .services.cleanup_service import CleanupService

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("fileshare")

cleanup = CleanupService(interval_seconds=60)

print()
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: create tables (dev convenience) & start cleanup
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    cleanup.start()
    logger.info("FileShare API started")
    yield
    # Shutdown
    await cleanup.stop()
    await engine.dispose()
    logger.info("FileShare API stopped")


app = FastAPI(
    title="FileShare API",
    description="QR-based real-time file sharing",
    version="1.0.0",
    lifespan=lifespan,
)

settings = get_settings()
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(rooms_router)
app.include_router(files_router)
app.include_router(ws_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", reload=True)
