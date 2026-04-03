# FileShare — Backend

FastAPI-based REST + WebSocket server for QR-based real-time file sharing. Designed for temporary, private room sharing with upload integrity and secure access.

## Key features

- Room management
  - create temporary rooms with automatic expiry
  - optional password-protected rooms
  - one-time OTP access for guests
  - manual room termination
  - QR code generation for join links
- File upload
  - simple streaming upload for standard files
  - chunked upload support with `init`, `PUT chunk`, and `complete`
  - CRC-32 validation for every chunk
  - SHA-256 verification of the assembled file
  - file sanitization and blocked dangerous extensions
  - maximum upload size configurable by environment
- Real-time collaboration
  - WebSocket room channel at `/ws/{room_id}`
  - live user count updates
  - live file upload notifications
  - room expiration broadcast
- Privacy and security
  - room passwords stored hashed using SHA-256
  - OTP codes are single-use and time-limited
  - uploads are kept only while the room is active
  - no user account data is stored
  - file metadata is kept minimal and securely handled
- Production readiness
  - backend can serve built React frontend from `frontend/dist`
  - health check endpoint
  - server info endpoint

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
│   ├── rooms.py          # Room CRUD + join + OTP + QR
│   ├── files.py          # Upload + download + chunked upload
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

`SECRET_KEY` is used for app secrets and should be changed in production.

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

| Method   | Path                            | Description                        |
| -------- | ------------------------------- | ---------------------------------- |
| `POST`   | `/rooms/create`                 | Create a new room                  |
| `GET`    | `/rooms/{room_id}`              | Get room metadata                  |
| `POST`   | `/rooms/{room_id}/join`         | Join a room with optional password |
| `POST`   | `/rooms/{room_id}/join/otp`     | Join a room with a one-time OTP    |
| `POST`   | `/rooms/join/otp`               | Resolve any room by OTP            |
| `POST`   | `/rooms/{room_id}/otp/generate` | Generate a fresh one-time OTP      |
| `DELETE` | `/rooms/{room_id}`              | End a room and delete stored files |
| `GET`    | `/rooms/{room_id}/qr`           | Get QR code PNG for room link      |

### Files

| Method | Path                                                      | Description                                       |
| ------ | --------------------------------------------------------- | ------------------------------------------------- |
| `POST` | `/rooms/{room_id}/upload`                                 | Upload one or more files                          |
| `POST` | `/rooms/{room_id}/upload/init`                            | Start a chunked upload                            |
| `PUT`  | `/rooms/{room_id}/upload/{upload_id}/chunk/{chunk_index}` | Upload one chunk with CRC-32 validation           |
| `POST` | `/rooms/{room_id}/upload/{upload_id}/complete`            | Complete chunked upload with SHA-256 verification |
| `GET`  | `/rooms/{room_id}/files`                                  | List files in a room                              |
| `GET`  | `/rooms/{room_id}/download/{file_id}`                     | Download a single file                            |
| `GET`  | `/rooms/{room_id}/download-all`                           | Download all room files as ZIP                    |

### WebSocket

| Path            | Description                                |
| --------------- | ------------------------------------------ |
| `/ws/{room_id}` | Real-time room events and presence updates |

### Support endpoints

| Method | Path           | Description              |
| ------ | -------------- | ------------------------ |
| `GET`  | `/health`      | Health check             |
| `GET`  | `/server-info` | Basic local network info |

## Data protection and privacy

- Room passwords are hashed before storage.
- OTP codes are single-use and expire automatically.
- Uploaded files are stored only while the room is active.
- The cleanup service removes expired room records and uploaded data.
- Filenames are sanitized before saving to prevent path traversal.
- Dangerous executable/script extensions are blocked at upload.
- File integrity is verified using SHA-256 checksums and CRC-32 chunk validation.

## Room lifecycle

1. Room is created with a configurable expiry time.
2. Users join using room ID, password, OTP, or QR code.
3. Files are uploaded and stored under `UPLOAD_DIR/{room_id}`.
4. The cleanup service deletes expired rooms and removes stored files.
5. Manual room deletion also removes all room files immediately.

## File storage

Uploaded files are stored under `UPLOAD_DIR/{room_id}/{file_id}_{filename}`. When a room ends, the entire room folder is removed.

## Blocked file types

For security, the following extensions are rejected at upload:

`.exe` `.bat` `.cmd` `.com` `.msi` `.scr` `.pif` `.vbs` `.vbe` `.js` `.jse` `.wsf` `.wsh` `.ps1`
