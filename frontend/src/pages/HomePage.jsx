import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom } from "../api";
import {
  Clock3,
  QrCode,
  Shield,
  Share2,
  Upload,
  Users,
  Zap,
  KeyRound,
  CheckCircle2,
} from "lucide-react";
import JoinRoomModal from "../components/JoinRoomModal";

const features = [
  {
    icon: QrCode,
    title: "Join with QR or OTP",
    desc: "Invite someone by camera scan, room link, or a short one-time code.",
  },
  {
    icon: Upload,
    title: "Fast multi-file transfer",
    desc: "Drag files in once and keep the room in sync for everyone connected.",
  },
  {
    icon: Clock3,
    title: "Auto-expiring rooms",
    desc: "Temporary sessions reduce clutter and keep the experience lightweight.",
  },
  {
    icon: Shield,
    title: "Optional password gate",
    desc: "Add a simple access layer whenever the room needs tighter control.",
  },
];

const showcase = [
  "No account required",
  "Clean room code sharing",
  "Secure short-lived sessions",
  "Upload progress and live presence",
];

const durations = [
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 1440, label: "24 hours" },
];

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
      navigate("/room/" + room.id);
    } catch (err) {
      alert(
        "Failed to create room: " + (err.response?.data?.detail || err.message),
      );
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
      <section className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-start">
        <div className="space-y-8">
          <div className="eyebrow">
            <Zap size={14} /> Calm, private file sharing
          </div>

          <div className="max-w-3xl space-y-6">
            <h1 className="text-4xl font-semibold leading-[1.05] tracking-[0.2px] text-[#F9FAFB] sm:text-5xl lg:text-6xl">
              A quieter way to share files with anyone in the room.
            </h1>
            <p className="max-w-2xl text-base leading-8 text-[#9CA3AF] sm:text-lg">
              Create a temporary space, invite people with a QR code or one-time
              code, and keep the workflow clear from setup to transfer.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {showcase.map((item) => (
              <div key={item} className="stat-card flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#052E1B] text-green-400">
                  <CheckCircle2 size={16} />
                </div>
                <span className="text-sm text-[#F9FAFB]">{item}</span>
              </div>
            ))}
          </div>

          <div className="grid gap-4 pt-2 sm:grid-cols-3">
            {[
              { label: "Access", value: "QR, link, OTP" },
              { label: "Storage", value: "Room-lifetime only" },
              { label: "Interface", value: "Minimal by design" },
            ].map((item) => (
              <div key={item.label} className="panel-subtle p-5">
                <p className="text-sm text-[#6B7280]">{item.label}</p>
                <p className="mt-3 text-lg font-medium text-[#F9FAFB]">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel p-6 sm:p-7">
          <div className="mb-6 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#F9FAFB]">Session setup</p>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                Configure a temporary room with a clean expiration window and optional protection.
              </p>
            </div>
            <span className="badge-success">Ready in seconds</span>
          </div>

          <div className="space-y-6">
            <div>
              <label className="label">Room duration</label>
              <div className="grid grid-cols-2 gap-2">
                {durations.map((option) => {
                  const active = expiry === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setExpiry(option.value)}
                      className={[
                        "rounded-[12px] border px-4 py-3 text-left text-sm transition-all duration-200 ease-in-out",
                        active
                          ? "border-green-500 bg-[#052E1B] text-[#F9FAFB] shadow-[0_0_0_2px_rgba(34,197,94,0.15)]"
                          : "border-[#1F2937] bg-[#0B0F14] text-[#9CA3AF] hover:border-[#374151] hover:text-[#F9FAFB]",
                      ].join(" ")}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="label">Password</label>
              <input
                type="password"
                placeholder="Optional room protection"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input-field"
              />
              <div className="mt-4 flex items-center justify-between rounded-[12px] border border-[#1F2937] bg-[#0B0F14] px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[#F9FAFB]">Optional room lock</p>
                  <p className="mt-1 text-sm text-[#6B7280]">
                    Leave blank for an open room, or add a password for extra control.
                  </p>
                </div>
                <div className="toggle-track" data-on={password.trim().length > 0}>
                  <div className="toggle-thumb" />
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <button
                onClick={handleCreate}
                disabled={creating}
                className="btn-primary flex-1"
              >
                <Share2 size={16} />
                {creating ? "Creating room..." : "Create Room"}
              </button>
              <button onClick={() => setShowJoin(true)} className="btn-secondary flex-1">
                <KeyRound size={16} /> Join Room
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="panel-subtle p-5 md:col-span-2 sm:p-6">
          <div className="mb-6 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-[#F9FAFB]">Feature showcase</p>
              <p className="mt-1 text-sm text-[#9CA3AF]">
                The entire interface is arranged around a single steady flow: create, invite, transfer.
              </p>
            </div>
            <span className="badge-neutral">Minimal system</span>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-[12px] border border-[#1F2937] bg-[#111827] p-5 shadow-[0_1px_2px_rgba(0,0,0,0.35)]">
                <div className="flex h-11 w-11 items-center justify-center rounded-[12px] bg-[#052E1B] text-green-400">
                  <Icon size={18} />
                </div>
                <h3 className="mt-5 text-lg font-medium text-[#F9FAFB]">{title}</h3>
                <p className="mt-2 text-sm leading-7 text-[#9CA3AF]">{desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="panel-subtle p-5 sm:p-6">
          <p className="text-sm font-medium text-[#F9FAFB]">Why it feels better</p>
          <div className="mt-5 space-y-4">
            {[
              { icon: Users, label: "Live presence", value: "See who is connected in real time" },
              { icon: QrCode, label: "Frictionless join", value: "QR, link, room ID, or OTP" },
              { icon: Clock3, label: "Temporary by design", value: "Rooms disappear when the session ends" },
            ].map(({ icon: Icon, label, value }) => (
              <div key={label} className="rounded-[12px] border border-[#1F2937] bg-[#111827] p-4">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-[12px] bg-[#0B0F14] text-green-400">
                    <Icon size={16} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-[#F9FAFB]">{label}</p>
                    <p className="mt-1 text-sm leading-6 text-[#9CA3AF]">{value}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {showJoin && <JoinRoomModal onClose={() => setShowJoin(false)} />}
    </div>
  );
}
