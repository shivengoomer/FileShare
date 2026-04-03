import { useEffect, useState, useRef, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useDropzone } from "react-dropzone";
import {
  getRoom,
  joinRoom,
  endRoom,
  connectWebSocket,
  generateOtp,
  joinRoomWithOtp,
  listFiles,
  uploadFiles,
  downloadFileVerified,
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
  Upload,
} from "lucide-react";

import FileDropzone from "../components/FileDropzone";
import CountdownTimer from "../components/CountdownTimer";
import QRDisplay from "../components/QRDisplay";

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  /* ---------------- State ---------------- */

  const [room, setRoom] = useState(null);
  const [joined, setJoined] = useState(null);

  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState(null);
  const [joiningWithPassword, setJoiningWithPassword] = useState(false);

  const [files, setFiles] = useState([]);
  const [userCount, setUserCount] = useState(0);

  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

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

  const [uploadError, setUploadError] = useState(null);
  const [downloadError, setDownloadError] = useState(null);
  const [copiedOtp, setCopiedOtp] = useState(false);

  const wsRef = useRef(null);
  const myPeerIdRef = useRef(null);
  const localFilesRef = useRef(new Map());
  const p2pRef = useRef(null);

  /* ---------------- Utilities ---------------- */

  const formatOtpTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }, []);

  const formatSize = useCallback((bytes) => {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
  }, []);

  const sanitizeOtp = useCallback((value) => {
    return value
      .split("")
      .filter((char) => char >= "0" && char <= "9")
      .join("")
      .slice(0, 6);
  }, []);

  /* ---------------- Handlers ---------------- */

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

  const handleUpload = useCallback(
    async (acceptedFiles) => {
      if (expired || !acceptedFiles.length) return;
      setIsUploading(true);
      setUploadProgress(0);
      setUploadError(null);
      try {
        const serverResults = await uploadFiles(roomId, acceptedFiles, (pct) =>
          setUploadProgress(pct),
        );
        const ws = wsRef.current;
        const canP2P = ws && ws.readyState === WebSocket.OPEN;
        acceptedFiles.forEach((file, index) => {
          const serverFile = serverResults[index];
          if (!serverFile) return;
          localFilesRef.current.set(serverFile.id, file);
          setFiles((prev) => {
            if (prev.some((f) => f.id === serverFile.id)) return prev;
            return [
              { ...serverFile, isLocal: true, isServer: true, available: true },
              ...prev,
            ];
          });
          if (canP2P) {
            ws.send(
              JSON.stringify({
                type: "file_available",
                file: {
                  id: serverFile.id,
                  original_filename: serverFile.original_filename,
                  size: serverFile.size,
                  content_type: serverFile.content_type,
                },
              }),
            );
          }
        });
      } catch (err) {
        console.error("Upload failed:", err);
        setUploadError(err.message || "Upload failed. Please try again.");
      } finally {
        setIsUploading(false);
        setUploadProgress(0);
      }
    },
    [expired, roomId],
  );

  const handleDownload = async (file) => {
    setDownloadError(null);
    if (file.isLocal) {
      const localFile = localFilesRef.current.get(file.id);
      if (!localFile) return;
      const url = URL.createObjectURL(localFile);
      const a = document.createElement("a");
      a.href = url;
      a.download = localFile.name || file.original_filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      return;
    }
    if (file.isServer) {
      try {
        setDownloadProgress((p) => ({ ...p, [file.id]: 0 }));
        const { url, filename } = await downloadFileVerified(roomId, file.id);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10000);
        setDownloadProgress((p) => ({ ...p, [file.id]: 100 }));
      } catch (err) {
        console.error("[Download] Server download failed:", err);
        setDownloadError(`Server download failed: ${err.message}`);
      } finally {
        setTimeout(() => {
          setDownloadProgress((p) => {
            const next = { ...p };
            delete next[file.id];
            return next;
          });
        }, 1000);
      }
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
      setDownloadError("P2P transfer failed. Peer might have disconnected.");
    } finally {
      setDownloadProgress((p) => {
        const next = { ...p };
        delete next[file.id];
        return next;
      });
    }
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const copyOtp = () => {
    if (generatedOtp) {
      navigator.clipboard.writeText(generatedOtp.otp_code);
      setCopiedOtp(true);
      setTimeout(() => setCopiedOtp(false), 2000);
    }
  };

  const handleEndRoom = async () => {
    if (!confirm("End this room? All shared files will become unavailable."))
      return;
    await endRoom(roomId);
    navigate("/");
  };

  /* ---------------- Hooks ---------------- */

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop: handleUpload,
    multiple: true,
    disabled: expired || !joined,
    noClick: true,
    noKeyboard: true,
  });

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

  useEffect(() => {
    if (!joined) return;
    listFiles(roomId).then((data) => {
      setFiles((prev) => {
        const existingIds = new Set(prev.map((f) => f.id));
        const serverFiles = data.map((f) => ({
          ...f,
          isServer: true,
          available: true,
        }));
        const merged = [...prev];
        serverFiles.forEach((sf) => {
          if (!existingIds.has(sf.id)) {
            merged.push(sf);
          }
        });
        return merged;
      });
    });
  }, [joined, roomId]);

  useEffect(() => {
    if (!joined) return;
    const ws = connectWebSocket(roomId);
    wsRef.current = ws;
    ws.onopen = () => {
      p2pRef.current = new P2PManager(ws, localFilesRef.current);
    };
    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "hello":
          myPeerIdRef.current = msg.peer_id;
          break;
        case "user_count":
          setUserCount(msg.count);
          break;
        case "user_joined":
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
          if (f.peer_id === myPeerIdRef.current) break;
          setFiles((prev) => {
            if (prev.some((x) => x.id === f.id)) return prev;
            return [
              { ...f, available: true, isLocal: false, isServer: false },
              ...prev,
            ];
          });
          break;
        }
        case "file_uploaded": {
          const f = msg.file;
          setFiles((prev) => {
            const existingIndex = prev.findIndex((x) => x.id === f.id);
            if (existingIndex >= 0) {
              const next = [...prev];
              next[existingIndex] = {
                ...next[existingIndex],
                ...f,
                isServer: true,
              };
              return next;
            }
            return [{ ...f, isServer: true, available: true }, ...prev];
          });
          break;
        }
        case "user_left":
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

  useEffect(() => {
    if (!generatedOtp) return;
    if (otpSecondsLeft <= 0) {
      setGeneratedOtp(null);
      return;
    }
    const t = setTimeout(() => setOtpSecondsLeft((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [generatedOtp, otpSecondsLeft]);

  /* ---------------- Returns ---------------- */

  const availableFiles = files.filter(
    (file) => file.available !== false,
  ).length;
  const storedFiles = files.filter((file) => file.isServer).length;
  const livePeerFiles = files.filter(
    (file) => !file.isServer && file.available !== false,
  ).length;

  if (error) {
    return (
      <div className="mx-auto flex max-w-6xl px-4 py-20 sm:px-6 lg:px-8">
        <div className="panel mx-auto w-full max-w-lg p-8 text-center">
          <p className="text-lg font-medium text-[#F9FAFB]">Room unavailable</p>
          <p className="mt-3 text-sm leading-7 text-[#9CA3AF]">{error}</p>
        </div>
      </div>
    );
  }

  if (joined === null)
    return (
      <div className="mx-auto flex max-w-6xl justify-center px-4 py-24 sm:px-6 lg:px-8">
        <div className="panel flex w-full max-w-md flex-col items-center gap-4 p-8 text-center">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#22C55E] border-t-transparent" />
          <div>
            <p className="text-sm font-medium text-[#F9FAFB]">Opening room</p>
            <p className="mt-2 text-sm text-[#9CA3AF]">
              Syncing live presence, files, and access state.
            </p>
          </div>
        </div>
      </div>
    );

  if (joined === false) {
    return (
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_420px] lg:items-start">
          <div className="panel-subtle p-6 sm:p-8">
            <div className="eyebrow">
              <Lock size={14} /> Protected room
            </div>
            <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-tight text-[#F9FAFB]">
              Join this room with a password or a one-time code.
            </h1>
            <p className="mt-4 max-w-xl text-base leading-8 text-[#9CA3AF]">
              The room is already live. Enter the shared password or use a fresh
              six-digit OTP from the room owner to step straight into the
              transfer space.
            </p>

            <div className="mt-8 grid gap-4 sm:grid-cols-3">
              {[
                { label: "Room ID", value: roomId.slice(0, 8) + "..." },
                { label: "Active people", value: String(userCount) },
                { label: "Access options", value: "Password or OTP" },
              ].map((item) => (
                <div key={item.label} className="stat-card">
                  <p className="text-sm text-[#6B7280]">{item.label}</p>
                  <p className="mt-3 text-lg font-medium text-[#F9FAFB]">
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="panel p-6 sm:p-7">
            <div className="mb-6">
              <p className="text-sm font-medium text-[#F9FAFB]">Room access</p>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                Use whichever credential was shared with you.
              </p>
            </div>

            <div className="space-y-6">
              <form onSubmit={handleJoinWithPassword} className="space-y-4">
                <div>
                  <label className="label">Room password</label>
                  <input
                    type="password"
                    placeholder="Enter room password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    className="input-field"
                  />
                </div>
                {passwordError && (
                  <p className="text-sm text-amber-400">{passwordError}</p>
                )}
                <button
                  className="btn-primary w-full"
                  disabled={joiningWithPassword}
                >
                  {joiningWithPassword ? "Joining..." : "Enter with Password"}
                </button>
              </form>

              <div className="h-px bg-[#1F2937]" />

              <form onSubmit={handleJoinWithOtp} className="space-y-4">
                <div>
                  <label className="label">One-time code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={otpInput}
                    onChange={(e) => setOtpInput(sanitizeOtp(e.target.value))}
                    className="input-field text-center font-mono text-2xl tracking-[0.45em]"
                  />
                  <p className="mt-2 text-xs text-[#6B7280]">
                    Ask the room owner to generate a new OTP if the code
                    expires.
                  </p>
                </div>
                {otpError && (
                  <p className="text-sm text-amber-400">{otpError}</p>
                )}
                <button
                  className="btn-secondary w-full"
                  disabled={joiningWithOtp || otpInput.length !== 6}
                >
                  {joiningWithOtp ? "Verifying..." : "Enter with OTP"}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ONLY layout structure refactored for clarity + premium UI
  // logic unchanged

  return (
    <div {...getRootProps()} className="min-h-screen bg-[#0B0F14]">
      <input {...getInputProps()} />

      {/* ERROR MESSAGES */}
      {uploadError && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-red-900 border border-red-700 rounded-lg p-4 flex items-start gap-3">
          <X size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-200">{uploadError}</p>
          </div>
          <button
            onClick={() => setUploadError(null)}
            className="flex-shrink-0 text-red-400 hover:text-red-300"
          >
            <X size={18} />
          </button>
        </div>
      )}
      {downloadError && (
        <div className="fixed top-4 left-4 right-4 z-50 bg-red-900 border border-red-700 rounded-lg p-4 flex items-start gap-3">
          <X size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-red-200">{downloadError}</p>
          </div>
          <button
            onClick={() => setDownloadError(null)}
            className="flex-shrink-0 text-red-400 hover:text-red-300"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* HEADER */}
      <div className="mx-auto max-w-6xl px-6 py-6 border-b border-[#1F2937]">
        <div className="flex items-center justify-between">
          <div style={{ flex: 1 }}>
            <div className="flex items-center gap-3">
              <span className="h-2 w-2 rounded-full bg-[#22C55E] animate-pulse" />
              <div>
                <p className="text-xs text-[#6B7280]">Room ID</p>
                <span className="font-mono text-[#F9FAFB] text-sm">
                  {roomId}
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={copyLink}
              className="px-4 py-2 rounded-lg border border-[#1F2937] text-[#F9FAFB] hover:bg-[#111827] transition flex items-center gap-2 text-sm"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={16} className="text-green-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy size={16} />
                  Copy Link
                </>
              )}
            </button>
            <button
              onClick={handleEndRoom}
              className="px-4 py-2 rounded-lg bg-red-900 border border-red-700 text-red-200 hover:bg-red-800 transition text-sm font-medium"
            >
              End Room
            </button>
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="mx-auto max-w-6xl px-6 py-8 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8">
        {/* LEFT: FILE SYSTEM */}
        <div className="space-y-6">
          {/* UPLOAD SECTION */}
          {!expired && (
            <div className="panel overflow-hidden">
              <div className="p-6">
                <FileDropzone
                  onDrop={handleUpload}
                  uploading={isUploading}
                  progress={uploadProgress}
                />
              </div>
            </div>
          )}

          {/* FILE LIST */}
          <div className="panel overflow-hidden">
            <div className="border-b border-[#1F2937] px-6 py-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-[#F9FAFB]">
                Files ({availableFiles})
              </h2>
              <span className="text-xs text-[#6B7280]">
                {storedFiles} stored • {livePeerFiles} live
              </span>
            </div>

            <div className="p-6 space-y-3">
              {files.length === 0 ? (
                <div className="text-center py-16 text-[#6B7280]">
                  <Upload size={40} className="mx-auto mb-3 opacity-50" />
                  <p className="text-sm">No files yet</p>
                  {!expired && (
                    <p className="text-xs mt-1">
                      Drop files above or wait for others to share
                    </p>
                  )}
                </div>
              ) : (
                files.map((file) => {
                  const pct = downloadProgress[file.id];
                  const isDownloading = pct !== undefined;
                  const isUnavailable = file.available === false;

                  return (
                    <div
                      key={file.id}
                      className={`flex flex-col gap-2 p-4 rounded-[12px] border transition ${
                        isUnavailable
                          ? "border-[#2D3748] bg-[#0F1419] opacity-60"
                          : "border-[#1F2937] hover:bg-[#111827]"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <FileIcon
                              size={16}
                              className="text-[#9CA3AF] flex-shrink-0"
                            />
                            <p className="text-sm font-medium text-[#F9FAFB] truncate">
                              {file.original_filename}
                            </p>
                            {isUnavailable && (
                              <span className="text-xs px-2 py-1 rounded bg-[#374151] text-[#9CA3AF] flex-shrink-0">
                                <WifiOff size={12} className="inline mr-1" />
                                Offline
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-[#6B7280] mt-1">
                            {formatSize(file.size)} •{" "}
                            {file.isServer ? (
                              <span className="text-green-400">Server</span>
                            ) : (
                              <span className="text-blue-400">Peer</span>
                            )}
                          </p>
                        </div>

                        <button
                          onClick={() => handleDownload(file)}
                          disabled={isDownloading || isUnavailable}
                          className={`px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition flex-shrink-0 ${
                            isDownloading
                              ? "bg-[#1F2937] text-[#6B7280] cursor-wait"
                              : isUnavailable
                                ? "bg-[#1F2937] text-[#6B7280] cursor-not-allowed"
                                : "bg-[#22C55E] text-[#0B0F14] hover:bg-[#16A34A]"
                          }`}
                        >
                          {isDownloading ? (
                            <>
                              <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#6B7280] border-t-transparent" />
                              {pct}%
                            </>
                          ) : (
                            <>
                              <Download size={14} />
                              Get
                            </>
                          )}
                        </button>
                      </div>

                      {isDownloading && (
                        <div className="w-full bg-[#1F2937] rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full bg-[#22C55E] transition-all duration-300"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT: SIDEBAR */}
        <div className="space-y-6">
          {/* QR CODE */}
          <div className="panel p-6">
            <p className="text-sm font-medium text-[#F9FAFB] mb-4">
              Share this room
            </p>
            <div className="bg-[#F9FAFB] p-4 rounded-[12px]">
              <QRDisplay roomId={roomId} />
            </div>
            <p className="text-xs text-[#6B7280] mt-3 text-center">
              Scan to join instantly
            </p>
          </div>

          {/* OTP */}
          {!expired && (
            <div className="panel p-6">
              <p className="text-sm font-medium text-[#F9FAFB] mb-3">
                One-Time Code
              </p>
              {!generatedOtp ? (
                <button
                  onClick={handleGenerateOtp}
                  disabled={generatingOtp}
                  className="w-full px-4 py-2 rounded-lg bg-[#22C55E] text-[#0B0F14] hover:bg-[#16A34A] font-medium text-sm transition disabled:opacity-50"
                >
                  {generatingOtp ? "Generating..." : "Generate OTP"}
                </button>
              ) : (
                <div className="space-y-3">
                  <div
                    onClick={copyOtp}
                    className="text-center bg-gradient-to-br from-[#22C55E]/20 to-[#16A34A]/20 border border-[#22C55E]/30 p-4 rounded-[12px] cursor-pointer hover:border-[#22C55E]/50 transition"
                  >
                    <p className="text-3xl font-mono font-bold text-[#22C55E] tracking-widest">
                      {generatedOtp.otp_code}
                    </p>
                    <p className="text-xs text-[#6B7280] mt-2">Click to copy</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-[#6B7280]">Expires in</p>
                    <p
                      className={`text-lg font-mono font-bold mt-1 ${
                        otpSecondsLeft < 60
                          ? "text-amber-400"
                          : "text-[#22C55E]"
                      }`}
                    >
                      {formatOtpTime(otpSecondsLeft)}
                    </p>
                  </div>
                  {copiedOtp && (
                    <p className="text-xs text-center text-green-400">
                      ✓ Copied to clipboard
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ROOM INFO */}
          <div className="panel p-6 space-y-4">
            <h3 className="text-sm font-medium text-[#F9FAFB]">Room Info</h3>

            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6B7280] flex items-center gap-2">
                  <Users size={14} />
                  Active Users
                </span>
                <span className="text-[#F9FAFB] font-medium">{userCount}</span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6B7280] flex items-center gap-2">
                  <FileIcon size={14} />
                  Total Files
                </span>
                <span className="text-[#F9FAFB] font-medium">
                  {files.length}
                </span>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-[#6B7280] flex items-center gap-2">
                  <Clock size={14} />
                  Time Left
                </span>
                <span
                  className={`font-medium ${
                    expired ? "text-red-400" : "text-[#22C55E]"
                  }`}
                >
                  {expired ? (
                    "Expired"
                  ) : (
                    <CountdownTimer
                      expiresAt={room?.expires_at}
                      onExpire={() => setExpired(true)}
                    />
                  )}
                </span>
              </div>
            </div>

            {expired && (
              <div className="mt-4 p-3 bg-red-900/30 border border-red-700/50 rounded-lg">
                <p className="text-xs text-red-300">
                  This room has expired and no new files can be shared.
                </p>
              </div>
            )}
          </div>

          {/* STATS */}
          {files.length > 0 && (
            <div className="panel p-6">
              <h3 className="text-sm font-medium text-[#F9FAFB] mb-3">
                Storage
              </h3>
              <div className="space-y-2 text-xs text-[#6B7280]">
                <p>
                  From server:{" "}
                  <span className="text-green-400">{storedFiles}</span>
                </p>
                <p>
                  From peers:{" "}
                  <span className="text-blue-400">{livePeerFiles}</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
