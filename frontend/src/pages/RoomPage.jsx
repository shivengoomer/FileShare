import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  getRoom,
  joinRoom,
  endRoom,
  connectWebSocket,
  generateOtp,
  joinRoomWithOtp,
} from "../api";
import { P2PManager } from "../p2p";

import {
  Users,
  Clock,
  Download,
  FileIcon,
  Copy,
  CheckCircle2,
  Lock,
  KeyRound,
  RefreshCw,
  X,
  WifiOff,
} from "lucide-react";

import FileDropzone from "../components/FileDropzone";
import CountdownTimer from "../components/CountdownTimer";
import QRDisplay from "../components/QRDisplay";

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [joined, setJoined] = useState(null);

  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(null);
  const [joiningWithPassword, setJoiningWithPassword] = useState(false);

  // files[].peer_id, files[].available, files[].isLocal
  const [files, setFiles] = useState([]);
  const [userCount, setUserCount] = useState(0);

  // Per-file download progress (0-100), keyed by file.id
  const [downloadProgress, setDownloadProgress] = useState({});

  const [expired, setExpired] = useState(false);
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);

  const [otpInput, setOtpInput] = useState("");
  const [otpError, setOtpError] = useState(null);
  const [joiningWithOtp, setJoiningWithOtp] = useState(false);

  const [generatedOtp, setGeneratedOtp] = useState(null);
  const [otpSecondsLeft, setOtpSecondsLeft] = useState(0);
  const [generatingOtp, setGeneratingOtp] = useState(false);

  const wsRef = useRef(null);
  const myPeerIdRef = useRef(null); // our peer_id from the server
  const localFilesRef = useRef(new Map()); // Map<fileId, File> — files we own
  const p2pRef = useRef(null); // P2PManager instance

  /* ---------------- Utilities ---------------- */

  const formatOtpTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  };

  const formatSize = (bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  };

  /* ---------------- Fetch Room ---------------- */

  useEffect(() => {
    getRoom(roomId)
      .then((data) => {
        setRoom(data);
        setUserCount(data.active_users);
        if (!data.has_password) setJoined(true);
        else setJoined(false);
      })
      .catch((err) => {
        if (err.response?.status === 410) setExpired(true);
        else setError("Room not found");
      });
  }, [roomId]);

  /* ---------------- After Join — WebSocket + P2P setup ---------------- */

  useEffect(() => {
    if (!joined) return;

    const ws = connectWebSocket(roomId);
    wsRef.current = ws;

    ws.onopen = () => {
      // P2PManager is created once the WS is open
      p2pRef.current = new P2PManager(ws, localFilesRef.current);
    };

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);

      switch (msg.type) {
        case "hello":
          // Server assigns us a peer_id
          myPeerIdRef.current = msg.peer_id;
          break;

        case "user_count":
          setUserCount(msg.count);
          break;

        case "user_joined":
          // Re-announce all files we own so the newcomer can see them
          for (const [fileId, file] of localFilesRef.current) {
            ws.send(
              JSON.stringify({
                type: "file_available",
                file: {
                  id: fileId,
                  original_filename: file.name,
                  size: file.size,
                  content_type: file.type,
                },
              }),
            );
          }
          break;

        case "file_available": {
          const f = msg.file;
          // Ignore our own announcements (already in state as isLocal)
          if (f.peer_id === myPeerIdRef.current) break;
          setFiles((prev) => {
            if (prev.some((x) => x.id === f.id)) return prev;
            return [{ ...f, available: true, isLocal: false }, ...prev];
          });
          break;
        }

        case "user_left":
          // Mark files whose owner left as unavailable
          if (msg.peer_id) {
            setFiles((prev) =>
              prev.map((f) =>
                f.peer_id === msg.peer_id ? { ...f, available: false } : f,
              ),
            );
          }
          break;

        case "file_request":
          p2pRef.current?.handleFileRequest(msg.from, msg.file_id, msg.conn_id);
          break;

        case "webrtc_offer":
          p2pRef.current?.handleOffer(msg.from, msg.conn_id, msg.sdp);
          break;

        case "webrtc_answer":
          p2pRef.current?.handleAnswer(msg.conn_id, msg.sdp);
          break;

        case "webrtc_ice":
          p2pRef.current?.handleIce(msg.conn_id, msg.candidate);
          break;

        case "room_expired":
          setExpired(true);
          break;
      }
    };

    return () => ws.close();
  }, [joined, roomId]);

  /* ---------------- Join Handlers ---------------- */

  const handleJoinWithPassword = async (e) => {
    e.preventDefault();
    setJoiningWithPassword(true);
    setPasswordError(null);

    try {
      await joinRoom(roomId, passwordInput);
      setJoined(true);
    } catch {
      setPasswordError("Incorrect password.");
    } finally {
      setJoiningWithPassword(false);
    }
  };

  const handleJoinWithOtp = async (e) => {
    e.preventDefault();
    if (otpInput.length !== 6) return;

    setJoiningWithOtp(true);
    setOtpError(null);

    try {
      await joinRoomWithOtp(roomId, otpInput);
      setJoined(true);
    } catch {
      setOtpError("Invalid or expired OTP.");
      setOtpInput("");
    } finally {
      setJoiningWithOtp(false);
    }
  };

  /* ---------------- OTP Generation ---------------- */

  const handleGenerateOtp = async () => {
    setGeneratingOtp(true);
    try {
      const data = await generateOtp(roomId);
      setGeneratedOtp(data);
      setOtpSecondsLeft(data.expires_in_seconds);
    } finally {
      setGeneratingOtp(false);
    }
  };

  useEffect(() => {
    if (!generatedOtp) return;
    if (otpSecondsLeft <= 0) {
      setGeneratedOtp(null);
      return;
    }
    const t = setTimeout(() => setOtpSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [generatedOtp, otpSecondsLeft]);

  /* ---------------- Share (P2P upload) ---------------- */

  const handleUpload = useCallback(
    (acceptedFiles) => {
      if (expired || !acceptedFiles.length) return;

      const ws = wsRef.current;
      if (!ws || ws.readyState !== WebSocket.OPEN) return;

      for (const file of acceptedFiles) {
        const fileId = crypto.randomUUID();

        // Keep the File object in memory so we can stream it to requesters
        localFilesRef.current.set(fileId, file);

        // Add to local file list immediately
        const meta = {
          id: fileId,
          original_filename: file.name,
          size: file.size,
          content_type: file.type,
          peer_id: myPeerIdRef.current,
          available: true,
          isLocal: true,
        };
        setFiles((prev) => [meta, ...prev]);

        // Announce to everyone in the room
        ws.send(
          JSON.stringify({
            type: "file_available",
            file: {
              id: fileId,
              original_filename: file.name,
              size: file.size,
              content_type: file.type,
            },
          }),
        );
      }
    },
    [expired],
  );

  /* ---------------- Download (P2P) ---------------- */

  const handleDownload = async (file) => {
    // Own file: just create a local object URL
    if (file.isLocal) {
      const localFile = localFilesRef.current.get(file.id);
      if (!localFile) return;
      const url = URL.createObjectURL(localFile);
      const a = document.createElement("a");
      a.href = url;
      a.download = localFile.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }

    setDownloadProgress((p) => ({ ...p, [file.id]: 0 }));

    try {
      const { blob, filename } = await p2pRef.current.requestFile(
        file.peer_id,
        file.id,
        (pct) => setDownloadProgress((p) => ({ ...p, [file.id]: pct })),
      );

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || file.original_filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (err) {
      console.error("[Download] P2P transfer failed:", err);
    } finally {
      setDownloadProgress((p) => {
        const next = { ...p };
        delete next[file.id];
        return next;
      });
    }
  };

  /* ---------------- Misc ---------------- */

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleEndRoom = async () => {
    if (!confirm("End this room? All shared files will become unavailable."))
      return;
    await endRoom(roomId);
    navigate("/");
  };

  /* ================= UI ================= */

  if (error) return <div className="text-center py-32">{error}</div>;

  if (joined === null)
    return (
      <div className="flex justify-center py-32">
        <div className="animate-spin h-8 w-8 border-2 border-brand-500 border-t-transparent rounded-full" />
      </div>
    );

  if (joined === false) {
    return (
      <div className="flex justify-center py-24 px-4">
        <div className="card w-full max-w-sm">
          <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
            <Lock size={18} /> Room Access
          </h2>

          <form onSubmit={handleJoinWithPassword} className="space-y-4">
            <input
              type="password"
              placeholder="Room password"
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              className="input-field"
            />
            {passwordError && (
              <p className="text-red-400 text-sm">{passwordError}</p>
            )}
            <button className="btn-primary w-full">
              {joiningWithPassword ? "Joining..." : "Enter Room"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-6 mb-8">
        <div>
          <h1 className="text-2xl font-bold mb-2">Room</h1>
          <p className="text-xs text-gray-500 font-mono bg-gray-800 px-3 py-1 rounded-lg inline-block">
            {roomId}
          </p>
        </div>

        <div className="flex items-center gap-5">
          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Users size={16} className="text-brand-400" />
            {userCount} online
          </div>

          <div className="flex items-center gap-1 text-sm text-gray-400">
            <Clock size={16} className="text-amber-400" />
            <CountdownTimer
              expiresAt={room.expires_at}
              onExpire={() => setExpired(true)}
            />
          </div>

          <button
            onClick={copyLink}
            className="btn-secondary text-sm flex items-center gap-1"
          >
            {copied ? <CheckCircle2 size={14} /> : <Copy size={14} />}
          </button>

          <button
            onClick={handleEndRoom}
            className="bg-red-900/40 hover:bg-red-800/60 px-4 py-2 rounded-xl text-red-400 flex items-center gap-1"
          >
            <X size={14} /> End
          </button>
        </div>
      </div>

      {expired && (
        <div className="bg-red-900/30 border border-red-700 rounded-2xl p-4 text-center text-red-300 mb-6">
          This room has expired.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN */}
        <div className="lg:col-span-1 space-y-6">
          {/* QR + OTP */}
          <div className="card space-y-5 border border-brand-500/20">
            <h3 className="font-semibold text-lg flex items-center gap-2">
              <KeyRound size={16} className="text-brand-400" />
              Share Room Access
            </h3>

            <QRDisplay roomId={roomId} />

            {!expired && (
              <>
                <button
                  onClick={handleGenerateOtp}
                  disabled={generatingOtp}
                  className="btn-secondary text-sm flex items-center gap-1"
                >
                  <RefreshCw size={14} />
                  {generatedOtp ? "Regenerate OTP" : "Generate OTP"}
                </button>

                {generatedOtp && (
                  <div className="bg-gray-900 rounded-2xl px-5 py-4 text-center border border-brand-500/20">
                    <p className="text-3xl font-mono tracking-[0.35em] text-brand-400 font-bold">
                      {generatedOtp.otp_code}
                    </p>
                    <p className="mt-2 text-sm text-amber-400">
                      Expires in {formatOtpTime(otpSecondsLeft)}
                    </p>
                  </div>
                )}
              </>
            )}
          </div>

          {/* Share Files (P2P) */}
          {!expired && (
            <div className="rounded-2xl p-6 bg-gradient-to-br from-brand-600/15 to-brand-500/5 border border-brand-500/30 shadow-lg">
              <h3 className="font-semibold text-lg mb-1 flex items-center gap-2">
                <FileIcon size={16} className="text-brand-400" />
                Share Files
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                Files transfer peer-to-peer — nothing is stored on the server.
              </p>

              <FileDropzone
                onDrop={handleUpload}
                uploading={false}
                progress={0}
              />
            </div>
          )}
        </div>

        {/* RIGHT COLUMN */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Files ({files.length})</h3>
            </div>

            {files.length === 0 ? (
              <div className="text-center py-16 text-gray-600">
                <FileIcon className="mx-auto mb-3" size={40} />
                No files yet. Drop files on the left to share them.
              </div>
            ) : (
              <div className="space-y-2 max-h-[60vh] overflow-y-auto">
                {files.map((file) => {
                  const pct = downloadProgress[file.id];
                  const isDownloading = pct !== undefined;

                  return (
                    <div
                      key={file.id}
                      className="group flex items-center gap-3 bg-gray-800/60 hover:bg-gray-700/70 transition-all rounded-2xl px-4 py-3"
                    >
                      <FileIcon
                        size={18}
                        className={
                          file.available === false
                            ? "text-gray-600"
                            : "text-brand-400"
                        }
                      />

                      <div className="flex-1 min-w-0">
                        <p
                          className={`text-sm truncate ${
                            file.available === false ? "text-gray-500" : ""
                          }`}
                        >
                          {file.original_filename}
                        </p>
                        <p className="text-xs text-gray-500">
                          {formatSize(file.size)}
                          {file.isLocal && (
                            <span className="ml-2 text-brand-500">yours</span>
                          )}
                          {file.available === false && (
                            <span className="ml-2 text-red-500">
                              owner offline
                            </span>
                          )}
                        </p>

                        {/* Download progress bar */}
                        {isDownloading && (
                          <div className="mt-1 w-full bg-gray-700 rounded-full h-1">
                            <div
                              className="bg-brand-500 h-1 rounded-full transition-all"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        )}
                      </div>

                      {/* Download button */}
                      {!expired &&
                        file.available !== false &&
                        !isDownloading && (
                          <button
                            onClick={() => handleDownload(file)}
                            className="opacity-0 group-hover:opacity-100 transition"
                            title="Download"
                          >
                            <Download size={16} className="text-brand-400" />
                          </button>
                        )}

                      {/* Offline indicator */}
                      {file.available === false && (
                        <WifiOff size={14} className="text-gray-600" />
                      )}

                      {/* In-progress indicator */}
                      {isDownloading && (
                        <span className="text-xs text-brand-400">{pct}%</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
