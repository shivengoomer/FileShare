import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "../api";
import {
  Share2,
  QrCode,
  Clock,
  Shield,
  Upload,
  Users,
  Zap,
} from "lucide-react";
import JoinRoomModal from "../components/JoinRoomModal";

export default function HomePage() {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [expiry, setExpiry] = useState(30);
  const [password, setPassword] = useState("");
  const [showJoin, setShowJoin] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const room = await createRoom(expiry, password || null);
      navigate(`/room/${room.id}`);
    } catch (err) {
      alert(
        "Failed to create room: " + (err.response?.data?.detail || err.message),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-12">
      {/* Hero */}
      <div className="text-center mb-16 animate-fade-in">
        <div className="inline-flex items-center gap-2 bg-brand-600/10 border border-brand-500/20 rounded-full px-4 py-1.5 text-brand-400 text-sm mb-6">
          <Zap size={14} /> Instant, anonymous file sharing
        </div>
        <h1 className="text-4xl sm:text-5xl font-extrabold mb-4 leading-tight">
          Share files with a{" "}
          <span className="bg-gradient-to-r from-brand-400 to-purple-400 bg-clip-text text-transparent">
            QR code
          </span>
        </h1>
        <p className="text-gray-400 text-lg max-w-xl mx-auto">
          Create a temporary room, share the QR code, and transfer files in
          real-time. No sign-up required. Files auto-delete when the room
          expires.
        </p>
      </div>

      {/* Create & Join Cards */}
      <div className="grid md:grid-cols-2 gap-6 mb-16">
        {/* Create Room */}
        <div className="card animate-slide-up">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 bg-brand-600/15 rounded-xl">
              <Share2 className="text-brand-400" size={22} />
            </div>
            <h2 className="text-xl font-bold">Create Room</h2>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Room duration
              </label>
              <select
                value={expiry}
                onChange={(e) => setExpiry(Number(e.target.value))}
                className="input-field"
              >
                <option value={5}>5 minutes</option>
                <option value={15}>15 minutes</option>
                <option value={30}>30 minutes</option>
                <option value={60}>1 hour</option>
                <option value={120}>2 hours</option>
                <option value={1440}>24 hours</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">
                Password <span className="text-gray-600">(optional)</span>
              </label>
              <input
                type="password"
                placeholder="Leave empty for open access"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
              />
            </div>
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary w-full"
            >
              {creating ? "Creating…" : "Create Room"}
            </button>
          </div>
        </div>

        {/* Join Room */}
        <div
          className="card animate-slide-up"
          style={{ animationDelay: "80ms" }}
        >
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2.5 bg-purple-600/15 rounded-xl">
              <QrCode className="text-purple-400" size={25} />
            </div>
            <h2 className="text-xl font-bold">Join Room</h2>
          </div>
          <div className="mb-10 mt-12 justify-center align-middle space-y-5 text-sm text-gray-400">
            <div className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-purple-400"></span>
              <p>Scan a QR code shared by the room owner</p>
            </div>

            <div className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-purple-400"></span>
              <p>
                Enter the unique{" "}
                <span className="text-white font-medium">Room ID</span>
              </p>
            </div>

            <div className="flex items-start gap-2">
              <span className="mt-1 h-2 w-2 rounded-full bg-purple-400"></span>
              <p>
                Use the secure{" "}
                <span className="text-purple-400 font-semibold">
                  6-digit one-time code (OTP)
                </span>
              </p>
            </div>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => setShowJoin(true)}
              className="btn-primary w-full"
            >
              Join Room
            </button>
          </div>
        </div>
      </div>

      {/* Features */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { icon: QrCode, title: "QR Sharing", desc: "Scan to join instantly" },
          { icon: Upload, title: "Multi-File", desc: "Drag & drop uploads" },
          { icon: Users, title: "Real-Time", desc: "Live sync via WebSockets" },
          { icon: Clock, title: "Temporary", desc: "Auto-deleting rooms" },
        ].map(({ icon: Icon, title, desc }) => (
          <div
            key={title}
            className="bg-gray-900/60 border border-gray-800 rounded-xl p-4 text-center"
          >
            <Icon className="mx-auto mb-2 text-brand-400" size={24} />
            <h3 className="font-semibold text-sm">{title}</h3>
            <p className="text-xs text-gray-500">{desc}</p>
          </div>
        ))}
      </div>

      {showJoin && <JoinRoomModal onClose={() => setShowJoin(false)} />}
    </div>
  );
}
