import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Hash, KeyRound } from "lucide-react";
import { joinByOtpCode } from "../api";

export default function JoinRoomModal({ onClose }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("otp"); // default to OTP since that's the new flow

  // Room-ID tab
  const [roomId, setRoomId] = useState("");

  // OTP tab
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(null);
  const [joining, setJoining] = useState(false);

  const switchTab = (t) => {
    setTab(t);
    setOtpError(null);
  };

  const handleJoinById = (e) => {
    e.preventDefault();
    const id = roomId.trim();
    if (!id) return;
    navigate(`/room/${id}`);
    onClose();
  };

  const handleJoinByOtp = async (e) => {
    e.preventDefault();
    if (otp.length !== 6) return;
    setJoining(true);
    setOtpError(null);
    try {
      const room = await joinByOtpCode(otp);
      navigate(`/room/${room.id}`);
      onClose();
    } catch (err) {
      if (err.response?.status === 403)
        setOtpError(
          "Invalid or expired code. Ask the room owner for a new one.",
        );
      else if (err.response?.status === 410)
        setOtpError("This room has expired.");
      else setOtpError("Failed to join. Please try again.");
      setOtp("");
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="card w-full max-w-md mx-4 relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1 hover:bg-gray-800 rounded-lg transition-colors"
        >
          <X size={18} />
        </button>

        <h2 className="text-xl font-bold mb-4">Join a Room</h2>

        {/* Tabs */}
        <div className="flex rounded-lg bg-gray-800 p-1 mb-5 gap-1">
          <button
            type="button"
            onClick={() => switchTab("otp")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-1.5 rounded-md font-medium transition-colors ${
              tab === "otp"
                ? "bg-brand-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <KeyRound size={13} /> One-Time Code
          </button>
          <button
            type="button"
            onClick={() => switchTab("id")}
            className={`flex-1 flex items-center justify-center gap-1.5 text-sm py-1.5 rounded-md font-medium transition-colors ${
              tab === "id"
                ? "bg-brand-600 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            <Hash size={13} /> Room ID
          </button>
        </div>

        {tab === "otp" ? (
          <form onSubmit={handleJoinByOtp} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                6-digit one-time code
              </label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="• • • • • •"
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                }
                className="input-field tracking-[0.5em] text-center text-2xl font-mono"
                autoFocus
              />
              <p className="text-xs text-gray-600 mt-1.5">
                Ask the room owner to generate a code from inside the room.
              </p>
            </div>
            {otpError && <p className="text-red-400 text-sm">{otpError}</p>}
            <button
              type="submit"
              disabled={otp.length !== 6 || joining}
              className="btn-primary w-full"
            >
              {joining ? "Verifying…" : "Enter Room"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoinById} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Room ID
              </label>
              <input
                type="text"
                placeholder="Paste the room UUID…"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="input-field font-mono text-sm"
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!roomId.trim()}
              className="btn-primary w-full"
            >
              Join Room
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
