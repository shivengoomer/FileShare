import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { X } from "lucide-react";

export default function JoinRoomModal({ onClose }) {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState("");

  const handleJoin = (e) => {
    e.preventDefault();
    const id = roomId.trim();
    if (!id) return;
    navigate(`/room/${id}`);
    onClose();
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
        <form onSubmit={handleJoin} className="space-y-4">
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
      </div>
    </div>
  );
}
