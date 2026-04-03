import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X, Hash, KeyRound } from "lucide-react";
import { joinByOtpCode } from "../api";

export default function JoinRoomModal({ onClose }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState("otp");
  const [roomId, setRoomId] = useState("");
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState(null);
  const [joining, setJoining] = useState(false);

  const switchTab = (nextTab) => {
    setTab(nextTab);
    setOtpError(null);
  };

  const handleJoinById = (e) => {
    e.preventDefault();
    const id = roomId.trim();
    if (id.length === 0) return;
    navigate("/room/" + id);
    onClose();
  };

  const handleJoinByOtp = async (e) => {
    e.preventDefault();
    if (otp.length < 6 || otp.length > 6) return;
    setJoining(true);
    setOtpError(null);
    try {
      const room = await joinByOtpCode(otp);
      navigate("/room/" + room.id);
      onClose();
    } catch (err) {
      if (err.response?.status === 403) {
        setOtpError("Invalid or expired code. Ask the room owner for a new one.");
      } else if (err.response?.status === 410) {
        setOtpError("This room has expired.");
      } else {
        setOtpError("Failed to join. Please try again.");
      }
      setOtp("");
    } finally {
      setJoining(false);
    }
  };

  const sanitizeOtp = (value) => {
    return value
      .split("")
      .filter((char) => char >= "0" && char <= "9")
      .join("")
      .slice(0, 6);
  };

  const otpIncomplete = otp.length < 6 || otp.length > 6;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 px-4 backdrop-blur-sm">
      <div className="panel relative w-full max-w-md p-6 sm:p-7">
        <button onClick={onClose} className="btn-ghost absolute right-3 top-3 px-3 py-2">
          <X size={16} />
        </button>

        <div className="mb-6">
          <p className="text-sm font-medium text-[#F9FAFB]">Join a room</p>
          <p className="mt-1 text-sm text-[#9CA3AF]">
            Enter a one-time code or jump in directly with the room ID.
          </p>
        </div>

        <div className="mb-5 flex rounded-[12px] border border-[#1F2937] bg-[#0B0F14] p-1">
          <button
            type="button"
            onClick={() => switchTab("otp")}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition-all duration-200",
              tab === "otp"
                ? "bg-[#111827] text-white shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                : "text-[#9CA3AF] hover:text-white",
            ].join(" ")}
          >
            <KeyRound size={14} /> One-Time Code
          </button>
          <button
            type="button"
            onClick={() => switchTab("id")}
            className={[
              "flex flex-1 items-center justify-center gap-2 rounded-[10px] px-3 py-2 text-sm font-medium transition-all duration-200",
              tab === "id"
                ? "bg-[#111827] text-white shadow-[0_1px_2px_rgba(0,0,0,0.35)]"
                : "text-[#9CA3AF] hover:text-white",
            ].join(" ")}
          >
            <Hash size={14} /> Room ID
          </button>
        </div>

        {tab === "otp" ? (
          <form onSubmit={handleJoinByOtp} className="space-y-4">
            <div>
              <label className="label">6-digit one-time code</label>
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]{6}"
                maxLength={6}
                placeholder="000000"
                value={otp}
                onChange={(e) => setOtp(sanitizeOtp(e.target.value))}
                className="input-field text-center font-mono text-2xl tracking-[0.45em]"
                autoFocus
              />
              <p className="mt-2 text-xs text-[#6B7280]">
                Ask the room owner to generate a fresh access code inside the room.
              </p>
            </div>
            {otpError && <p className="text-sm text-amber-400">{otpError}</p>}
            <button type="submit" disabled={otpIncomplete || joining} className="btn-primary w-full">
              {joining ? "Verifying..." : "Enter Room"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoinById} className="space-y-4">
            <div>
              <label className="label">Room ID</label>
              <input
                type="text"
                placeholder="Paste the room UUID"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                className="input-field font-mono text-sm"
                autoFocus
              />
            </div>
            <button type="submit" disabled={roomId.trim().length === 0} className="btn-primary w-full">
              Join Room
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
