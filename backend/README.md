# FileShare — Backend

FastAPI-based REST + WebSocket server for QR-based real-time file sharing.

## Tech Stack

| Package                | Purpose                    |
| ---------------------- | -------------------------- |
| FastAPI 0.115          | Web framework              |
| Uvicorn                | ASGI server                |
| SQLAlchemy 2 (asyncio) | ORM                        |
| asyncpg                | Async PostgreSQL driver    |
| Alembic                | Database migrations        |
| Pydantic v2            | Data validation & settings |
| qrcode                 | QR code generation         |
| websockets             | WebSocket support          |

## Project Structure

```
backend/
├── main.py               # FastAPI app, lifespan, middleware
├── config.py             # Settings (env vars / .env)
├── database.py           # Async engine & session factory
├── alembic.ini
├── alembic/
│   └── versions/
│       └── 001_initial_schema.py
├── models/
│   ├── room.py           # Room model
│   └── file.py           # File model
├── routers/
│   ├── rooms.py          # Room CRUD + end room
│   ├── files.py          # Upload / download
│   └── ws.py             # WebSocket endpoint
├── schemas/
│   ├── room.py
│   └── file.py
└── services/
    ├── room_service.py
    ├── file_service.py
    ├── cleanup_service.py  # Auto-expires rooms every 60s
    └── websocket_manager.py
```

## Setup

### 1. Prerequisites

- Python 3.11+
- PostgreSQL running locally (or connection string to a remote instance)

### 2. Create virtual environment

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 3. Configure environment

Create a `.env` file inside `backend/`:

```env
DATABASE_URL=postgresql+asyncpg://fileshare:fileshare@localhost:5432/fileshare
SECRET_KEY=your-secret-key
ROOM_EXPIRY_MINUTES=30
MAX_FILE_SIZE_MB=100
UPLOAD_DIR=./uploads
CORS_ORIGINS=["http://localhost:5173"]
```

All variables are optional — defaults shown above are used if not set.

### 4. Run database migrations

```bash
alembic upgrade head
```

### 5. Start the server

From the **project root** (one level above `backend/`):

```bash
python3 -m backend.main
```

Or with uvicorn directly:

```bash
uvicorn backend.main:app --reload
```

Server runs at `http://localhost:8000`.

## API Endpoints

### Rooms

| Method   | Path                    | Description                    |
| -------- | ----------------------- | ------------------------------ |
| `POST`   | `/rooms/create`         | Create a new room              |
| `GET`    | `/rooms/{room_id}`      | Get room info                  |
| `POST`   | `/rooms/{room_id}/join` | Join a password-protected room |
| `DELETE` | `/rooms/{room_id}`      | End room (deletes all files)   |
| `GET`    | `/rooms/{room_id}/qr`   | Get QR code image (PNG)        |

### Files

| Method | Path                                  | Description               |
| ------ | ------------------------------------- | ------------------------- |
| `POST` | `/rooms/{room_id}/upload`             | Upload one or more files  |
| `GET`  | `/rooms/{room_id}/files`              | List files in room        |
| `GET`  | `/rooms/{room_id}/download/{file_id}` | Download a single file    |
| `GET`  | `/rooms/{room_id}/download-all`       | Download all files as ZIP |

### WebSocket

| Path                     | Description                                              |
| ------------------------ | -------------------------------------------------------- |
| `ws://host/ws/{room_id}` | Real-time events (user count, file uploads, room expiry) |

### WebSocket Message Types

```json
{ "type": "user_count", "count": 3 }
{ "type": "file_uploaded", "file": { ... } }
{ "type": "room_expired" }
```

## Room Lifecycle

1. Room is created with an expiry time (default 30 min).
2. Background `CleanupService` runs every 60 seconds, finds expired rooms, notifies WebSocket clients, deletes files from disk, and removes DB records.
3. Calling `DELETE /rooms/{room_id}` ends the room immediately — same cleanup steps run synchronously.

## File Storage

Uploaded files are stored on disk at `UPLOAD_DIR/{room_id}/{file_id}_{filename}`. When a room ends (manually or via expiry), the entire `{room_id}/` directory is deleted with `shutil.rmtree`.

## Blocked File Types

For security, the following extensions are rejected at upload:

`.exe` `.bat` `.cmd` `.com` `.msi` `.scr` `.pif` `.vbs` `.vbe` `.js` `.jse` `.wsf` `.wsh` `.ps1`
