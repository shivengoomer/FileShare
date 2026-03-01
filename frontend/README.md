# FileShare — Frontend

React + Vite SPA for QR-based real-time file sharing.

## Tech Stack

| Package         | Purpose                   |
| --------------- | ------------------------- |
| React 18        | UI framework              |
| Vite 5          | Build tool & dev server   |
| React Router v6 | Client-side routing       |
| Axios           | HTTP client               |
| react-dropzone  | Drag-and-drop file upload |
| qrcode.react    | QR code rendering         |
| lucide-react    | Icons                     |
| Tailwind CSS 3  | Utility-first styling     |

## Project Structure

```
frontend/
├── index.html
├── vite.config.js         # Dev proxy to backend
├── tailwind.config.js
├── postcss.config.js
├── package.json
└── src/
    ├── main.jsx           # React entry point
    ├── App.jsx            # Router setup
    ├── index.css          # Tailwind base styles
    ├── api.js             # All API & WebSocket calls
    ├── pages/
    │   ├── HomePage.jsx   # Create / join room
    │   └── RoomPage.jsx   # Room view (upload, download, QR)
    └── components/
        ├── CountdownTimer.jsx
        ├── FileDropzone.jsx
        ├── JoinRoomModal.jsx
        └── QRDisplay.jsx
```

## Setup

### 1. Prerequisites

- Node.js 18+
- Backend server running at `http://localhost:8000`

### 2. Install dependencies

```bash
cd frontend
npm install
```

### 3. Start dev server

```bash
npm run dev
```

App runs at `http://localhost:5173`. API requests are proxied to the backend automatically.

### 4. Build for production

```bash
npm run build
```

Output is in `frontend/dist/`. Serve with any static file host or Nginx.

## Dev Proxy

`vite.config.js` proxies the following paths to `http://localhost:8000` so you don't need CORS headers in development:

| Path       | Target                            |
| ---------- | --------------------------------- |
| `/rooms/*` | `http://localhost:8000`           |
| `/ws/*`    | `ws://localhost:8000` (WebSocket) |
| `/health`  | `http://localhost:8000`           |

## Pages

### `/` — Home Page

- Create a new room (set expiry duration and optional password).
- Join an existing room by entering a room ID.

### `/room/:roomId` — Room Page

- Displays room ID, online user count, and countdown timer.
- QR code for sharing the room link.
- Drag-and-drop file upload with progress bar.
- Live file list updated in real time via WebSocket.
- Download individual files or all as a ZIP.
- Copy room link to clipboard.
- **End Room** button — immediately closes the room and deletes all files.

## API Layer (`src/api.js`)

| Function                                 | Description                         |
| ---------------------------------------- | ----------------------------------- |
| `createRoom(minutes, password)`          | Create a new room                   |
| `getRoom(roomId)`                        | Fetch room metadata                 |
| `joinRoom(roomId, password)`             | Join a password-protected room      |
| `endRoom(roomId)`                        | Delete the room and all its files   |
| `uploadFiles(roomId, files, onProgress)` | Upload files with progress callback |
| `listFiles(roomId)`                      | List files in the room              |
| `getDownloadUrl(roomId, fileId)`         | URL for single file download        |
| `getDownloadAllUrl(roomId)`              | URL to download all files as ZIP    |
| `getQrImageUrl(roomId)`                  | URL of QR code image                |
| `connectWebSocket(roomId)`               | Open WebSocket connection           |

## Real-time Events

The `RoomPage` listens for WebSocket messages:

| Event           | Action                                           |
| --------------- | ------------------------------------------------ |
| `user_count`    | Updates the online user count                    |
| `file_uploaded` | Adds the new file to the list                    |
| `room_expired`  | Shows expired banner, disables uploads/downloads |
