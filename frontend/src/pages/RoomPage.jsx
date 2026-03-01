import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRoom,
  listFiles,
  joinRoom,
  endRoom,
  connectWebSocket,
  getQrImageUrl,
  getDownloadUrl,
  getDownloadAllUrl,
  uploadFiles,
} from "../api";
import {
  Users,
  Clock,
  Download,
  FileIcon,
  Archive,
  Link2,
  Copy,
  CheckCircle2,
  Lock,
  X,
} from "lucide-react";
import FileDropzone from "../components/FileDropzone";
import CountdownTimer from "../components/CountdownTimer";
import QRDisplay from "../components/QRDisplay";

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState(null);
  // null = loading, false = needs password, true = inside
  const [joined, setJoined] = useState(null);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(null);
  const [joiningWithPassword, setJoiningWithPassword] = useState(false);
  const [files, setFiles] = useState([]);
  const [userCount, setUserCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const wsRef = useRef(null);

  // Step 1: fetch room metadata to know if a password is required
  useEffect(() => {
    getRoom(roomId)
      .then((data) => {
        setRoom(data);
        setUserCount(data.active_users);
        // No password → join automatically
        if (!data.has_password) setJoined(true);
        else setJoined(false); // show password gate
      })
      .catch((err) => {
        if (err.response?.status === 410) setExpired(true);
        else setError("Room not found");
      });
  }, [roomId]);

  // Step 2: load files + open WebSocket only after successfully joined
  useEffect(() => {
    if (!joined) return;
    listFiles(roomId)
      .then(setFiles)
      .catch(() => {});

    const ws = connectWebSocket(roomId);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "user_count":
          setUserCount(msg.count);
          break;
        case "file_uploaded":
          setFiles((prev) => {
            if (prev.some((f) => f.id === msg.file.id)) return prev;
            return [msg.file, ...prev];
          });
          break;
        case "room_expired":
          setExpired(true);
          break;
        default:
          break;
      }
    };

    ws.onclose = () => {};
    ws.onerror = () => {};

    return () => ws.close();
  }, [joined, roomId]);

  const handleJoinWithPassword = async (e) => {
    e.preventDefault();
    setJoiningWithPassword(true);
    setPasswordError(null);
    try {
      await joinRoom(roomId, passwordInput);
      setJoined(true);
    } catch (err) {
      if (err.response?.status === 403)
        setPasswordError("Incorrect password. Please try again.");
      else setPasswordError("Failed to join room.");
    } finally {
      setJoiningWithPassword(false);
    }
  };

  const handleUpload = useCallback(
    async (acceptedFiles) => {
      if (expired || !acceptedFiles.length) return;
      setUploading(true);
      setUploadProgress(0);
      try {
        const newFiles = await uploadFiles(roomId, acceptedFiles, (e) => {
          if (e.total)
            setUploadProgress(Math.round((e.loaded / e.total) * 100));
        });
        // Files will arrive via WebSocket too, but add immediately for UX
        setFiles((prev) => {
          const ids = new Set(prev.map((f) => f.id));
          const unique = newFiles.filter((f) => !ids.has(f.id));
          return [...unique, ...prev];
        });
      } catch (err) {
        alert("Upload failed: " + (err.response?.data?.detail || err.message));
      } finally {
        setUploading(false);
        setUploadProgress(0);
      }
    },
    [roomId, expired],
  );

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEndRoom = async () => {
    if (!confirm("End this room? All files will be deleted.")) return;
    try {
      await endRoom(roomId);
      navigate("/");
    } catch (err) {
      alert(
        "Failed to end room: " + (err.response?.data?.detail || err.message),
      );
    }
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  if (error) {
    return (
      <div className="max-w-lg mx-auto px-4 py-24 text-center">
        <div className="card">
          <h2 className="text-2xl font-bold mb-2">Room Not Found</h2>
          <p className="text-gray-400 mb-6">{error}</p>
          <button onClick={() => navigate("/")} className="btn-primary">
            Go Home
          </button>
        </div>
      </div>
    );
  }

  // Still fetching room metadata
  if (joined === null && !error) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  // Password gate
  if (joined === false) {
    return (
      <div className="flex items-center justify-center py-24 px-4">
        <div className="card w-full max-w-sm">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 bg-brand-600/15 rounded-xl">
              <Lock className="text-brand-400" size={22} />
            </div>
            <h2 className="text-xl font-bold">Password Required</h2>
          </div>
          <p className="text-gray-400 text-sm mb-5">
            This room is protected. Enter the password to continue.
          </p>
          <form onSubmit={handleJoinWithPassword} className="space-y-4">
            <input
              type="password"
              placeholder="Enter room password…"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="input-field"
              autoFocus
            />
            {passwordError && (
              <p className="text-red-400 text-sm">{passwordError}</p>
            )}
            <button
              type="submit"
              disabled={!passwordInput || joiningWithPassword}
              className="btn-primary w-full"
            >
              {joiningWithPassword ? "Joining…" : "Enter Room"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex items-center justify-center py-32">
        <div className="animate-spin rounded-full h-8 w-8 border-2 border-brand-500 border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-1">Room</h1>
          <p className="text-sm text-gray-500 font-mono break-all">{roomId}</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <Users size={16} className="text-brand-400" />
            <span>{userCount} online</span>
          </div>
          <div className="flex items-center gap-1.5 text-sm text-gray-400">
            <Clock size={16} className="text-amber-400" />
            <CountdownTimer
              expiresAt={room.expires_at}
              onExpire={() => setExpired(true)}
            />
          </div>
          <button
            onClick={copyLink}
            className="btn-secondary text-sm py-2 px-4 flex items-center gap-1.5"
          >
            {copied ? (
              <CheckCircle2 size={14} className="text-green-400" />
            ) : (
              <Copy size={14} />
            )}
            {copied ? "Copied" : "Copy Link"}
          </button>
          <button
            onClick={handleEndRoom}
            className="text-sm py-2 px-4 flex items-center gap-1.5 rounded-xl bg-red-900/40 hover:bg-red-800/60 text-red-400 hover:text-red-300 transition-colors"
          >
            <X size={14} /> End Room
          </button>
        </div>
      </div>

      {expired && (
        <div className="bg-red-900/30 border border-red-800 rounded-xl p-4 mb-6 text-center text-red-300">
          This room has expired. Downloads and uploads are disabled.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: QR + Upload */}
        <div className="lg:col-span-1 space-y-6">
          <QRDisplay roomId={roomId} />

          {!expired && (
            <div className="card">
              <h3 className="font-semibold mb-3">Upload Files</h3>
              <FileDropzone
                onDrop={handleUpload}
                uploading={uploading}
                progress={uploadProgress}
              />
            </div>
          )}
        </div>

        {/* Right: File List */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold">
                Files <span className="text-gray-500">({files.length})</span>
              </h3>
              {files.length > 1 && !expired && (
                <a
                  href={getDownloadAllUrl(roomId)}
                  className="btn-secondary text-sm py-1.5 px-4 flex items-center gap-1.5"
                >
                  <Archive size={14} /> Download All (ZIP)
                </a>
              )}
            </div>

            {files.length === 0 ? (
              <div className="text-center py-16 text-gray-600">
                <FileIcon className="mx-auto mb-3" size={40} />
                <p>No files yet. Upload something!</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
                {files.map((file) => (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 bg-gray-800/60 rounded-xl px-4 py-3 animate-fade-in"
                  >
                    <FileIcon size={18} className="text-brand-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">
                        {file.original_filename}
                      </p>
                      <p className="text-xs text-gray-500">
                        {formatSize(file.size)}
                      </p>
                    </div>
                    {!expired && (
                      <a
                        href={getDownloadUrl(roomId, file.id)}
                        className="p-2 hover:bg-gray-700 rounded-lg transition-colors"
                        title="Download"
                      >
                        <Download size={16} className="text-brand-400" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
