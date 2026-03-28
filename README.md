# FileShare

A full-stack QR-based file sharing application with real-time room updates, secure temporary rooms, one-time access codes, and both streaming and chunked upload support.

## What this project does

FileShare lets users:

- create temporary sharing rooms
- upload files securely into a room
- join rooms via room ID, password, OTP, or QR code
- watch live room activity via WebSocket events
- download single files or all room files as a ZIP
- end a room manually or let it expire automatically
- run as a combined backend + frontend app locally or in production

## Core features

- Room creation and management
  - temporary room lifecycle with expiry
  - optional password protection
  - one-time password (OTP) generation and consumption
  - manual room termination
- File upload
  - streaming upload with server-side chunked reads
  - chunked upload extension with CRC-32 parity and SHA-256 verification
  - upload size limit configured from environment
  - blocked executable and script file types
- Real-time updates
  - WebSocket user count updates
  - live file upload notifications
  - room expiration broadcast
- Shareable access
  - QR code generation for room join links
  - room link copying
- Storage and cleanup
  - uploads saved on disk under `uploads/{room_id}`
  - cleanup service removes expired rooms and files every 60 seconds
  - production support for serving built frontend from backend

## Tech stack

- Backend: Python, FastAPI, SQLAlchemy (async), Alembic, PostgreSQL, qrcode
- Frontend: React, Vite, Tailwind CSS, React Router, Axios
- Deployment: Uvicorn, Azure App Service compatible startup script

## Repository structure

```text
FileShare/
├── backend/                # Python API service
│   ├── alembic/            # DB migrations
│   ├── models/             # SQLAlchemy models
│   ├── routers/            # API and WebSocket routes
│   ├── schemas/            # Pydantic request/response schemas
│   ├── services/           # business logic and cleanup
│   ├── config.py
│   ├── database.py
│   ├── main.py
│   ├── requirements.txt
│   └── README.md
├── frontend/               # React SPA
│   ├── src/
│   ├── package.json
│   └── README.md
├── uploads/                # persisted uploaded files
├── run.sh                  # local startup helper
└── startup.sh              # Azure App Service startup script
```

## Backend details

### Main backend capabilities

- `backend/main.py` starts the FastAPI app, initializes the database schema automatically in development, and runs the cleanup service.
- `backend/config.py` loads environment variables and default settings.
- `backend/routers/rooms.py` implements room creation, room joining, password validation, OTP generation, QR code generation, and room termination.
- `backend/routers/files.py` implements:
  - simple upload API
  - chunked upload lifecycle (`init`, `upload chunk`, `complete`)
  - file listing
  - single-file download with checksum headers
  - download-all as ZIP
- `backend/services/file_service.py` handles safe filenames, blocked file types, streaming writes, chunk assembly, and checksum validation.
- `backend/services/cleanup_service.py` expires rooms and deletes their files regularly.
- `backend/services/websocket_manager.py` broadcasts real-time events to connected clients.

### Backend API endpoints

| Method   | Path                                                      | Description                          |
| -------- | --------------------------------------------------------- | ------------------------------------ |
| `POST`   | `/rooms/create`                                           | Create a new room                    |
| `POST`   | `/rooms/{room_id}/join`                                   | Join a room with optional password   |
| `POST`   | `/rooms/{room_id}/join/otp`                               | Join a room with a one-time code     |
| `POST`   | `/rooms/join/otp`                                         | Resolve a room by OTP code           |
| `POST`   | `/rooms/{room_id}/otp/generate`                           | Generate a new single-use OTP        |
| `GET`    | `/rooms/{room_id}`                                        | Get room metadata                    |
| `DELETE` | `/rooms/{room_id}`                                        | End the room immediately             |
| `GET`    | `/rooms/{room_id}/qr`                                     | Generate a QR code for the room link |
| `POST`   | `/rooms/{room_id}/upload`                                 | Upload files in one request          |
| `POST`   | `/rooms/{room_id}/upload/init`                            | Start a chunked upload               |
| `PUT`    | `/rooms/{room_id}/upload/{upload_id}/chunk/{chunk_index}` | Upload a chunk with CRC-32           |
| `POST`   | `/rooms/{room_id}/upload/{upload_id}/complete`            | Finalize chunked upload with SHA-256 |
| `GET`    | `/rooms/{room_id}/files`                                  | List uploaded files                  |
| `GET`    | `/rooms/{room_id}/download/{file_id}`                     | Download a single file               |
| `GET`    | `/rooms/{room_id}/download-all`                           | Download all room files as ZIP       |
| `GET`    | `/ws/{room_id}`                                           | WebSocket room event channel         |
| `GET`    | `/health`                                                 | Health check                         |
| `GET`    | `/server-info`                                            | Local network server metadata        |

### Supported security / safety

- blocks uploads with dangerous file extensions
- sanitizes incoming filenames
- verifies chunk integrity using CRC-32
- verifies final file content using SHA-256 for chunked uploads
- automatically removes expired rooms and stored files

## Frontend details

### What the React app provides

- Home page for creating a room or joining by ID
- Room page with:
  - room details and expiry countdown
  - QR code for sharing the room link
  - drag-and-drop file uploads
  - live file list updates over WebSocket
  - file downloads and download-all ZIP
  - copy-to-clipboard room link
  - manual room termination button

### Frontend files

- `frontend/src/main.jsx` — application entry point
- `frontend/src/App.jsx` — router and global layout
- `frontend/src/pages/HomePage.jsx` — room creation and join UI
- `frontend/src/pages/RoomPage.jsx` — room dashboard and upload UI
- `frontend/src/components/` — reusable UI building blocks
- `frontend/src/api.js` — HTTP and WebSocket client logic

## Local development setup

### 1. Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Create `.env` inside `backend/` with values like:

```env
DATABASE_URL=postgresql+asyncpg://fileshare:fileshare@localhost:5432/fileshare
SECRET_KEY=your-secret-key
ROOM_EXPIRY_MINUTES=30
MAX_FILE_SIZE_MB=100
UPLOAD_DIR=./uploads
CORS_ORIGINS=["http://localhost:5173"]
```

Run migrations if needed:

```bash
cd backend
alembic upgrade head
```

Start the backend:

```bash
python3 -m backend.main
```

or with Uvicorn:

```bash
uvicorn backend.main:app --reload
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in the browser.

### 3. Run both with helpers

- `./run.sh` starts the backend from the project root
- `startup.sh` is configured for Azure App Service deployment

## Production / deployment notes

- The backend can serve the built frontend from `frontend/dist` when available.
- `startup.sh` is ready for Azure App Service and launches Uvicorn.
- The backend will mount `frontend/dist/assets` and return `index.html` for any unmatched route.

## Notes

- Uploaded files are stored under `uploads/{room_id}`.
- Rooms are removed automatically when expired.
- If `frontend/dist` exists, the backend serves the React app directly.
- The project is designed for temporary, anonymous file sharing rather than long-term storage.

## Recommended enhancements

If you want to extend the app further, consider:

- user authentication and persistent accounts
- cloud storage backend (S3/Azure Blob)
- file type previews for images and text
- room access audit logs
- file size progress bars for large uploads
