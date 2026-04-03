import { Routes, Route } from "react-router-dom";
import { Share2 } from "lucide-react";
import HomePage from "./pages/HomePage";
import RoomPage from "./pages/RoomPage";

export default function App() {
  return (
    <div className="app-shell flex min-h-screen flex-col">
      <header className="sticky top-0 z-50 border-b border-[#1F2937] bg-[#0B0F14]/88 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <a href="/" className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-[12px] border border-green-900/30 bg-[#052E1B] text-green-400 shadow-[0_1px_2px_rgba(0,0,0,0.4)]">
              <Share2 size={18} />
            </div>
            <div>
              <p className="text-[15px] font-semibold tracking-[0.2px] text-[#F9FAFB]">
                FileShare
              </p>
              <p className="hidden text-xs text-[#9CA3AF] sm:block">
                Private rooms for a calmer transfer experience
              </p>
            </div>
          </a>

          <div className="hidden items-center gap-3 sm:flex">
            <span className="badge-neutral">Temporary rooms</span>
            <span className="badge-success">QR and OTP access</span>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
        </Routes>
      </main>

      <footer className="border-t border-[#1F2937] py-5 text-center text-sm text-[#6B7280]">
        FileShare · Minimal, temporary file sharing with a premium dark interface
      </footer>
    </div>
  );
}
