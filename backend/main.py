from __future__ import annotations

import logging
import socket
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from .config import get_settings
from .database import engine
from .models.base import Base
from .routers import rooms_router, files_router, ws_router
from .services.cleanup_service import CleanupService

# Resolve the built React frontend dist folder
# Works both locally (../frontend/dist) and on Azure App Service (/home/site/wwwroot/frontend/dist)
FRONTEND_DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

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


@app.get("/server-info")
async def server_info():
    try:
        network_ip = get_local_ip()
        return {
            "network_ip": network_ip,
            "port": 8000,
            "protocol": "http"
        }
    except Exception:
        # Fallback to localhost if network IP detection fails
        return {
            "network_ip": "127.0.0.1",
            "port": 8000,
            "protocol": "http"
        }


# ---------------------------------------------------------------------------
# Serve built React frontend (production / Azure App Service)
# This must come AFTER all API routes so they take priority.
# ---------------------------------------------------------------------------
if FRONTEND_DIST.is_dir():
    # Serve static assets (JS, CSS, images, etc.)
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    async def serve_spa(full_path: str):
        """Catch-all: return index.html so React Router handles client-side routing."""
        return FileResponse(FRONTEND_DIST / "index.html")
def get_local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
    finally:
        s.close()
    return ip


if __name__ == "__main__":
    import uvicorn

    ip = get_local_ip()

    print("\nServer running on:")
    print(f"Local:   http://127.0.0.1:8000")
    print(f"Network: http://{ip}:8000\n")

    uvicorn.run("backend.main:app", host="0.0.0.0", port=8000, reload=True)