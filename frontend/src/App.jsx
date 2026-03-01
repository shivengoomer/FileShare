import { Routes, Route } from "react-router-dom";
import HomePage from "./pages/HomePage";
import RoomPage from "./pages/RoomPage";

export default function App() {
  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b border-gray-800 bg-gray-950/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center gap-3">
          <span className="text-2xl">📁</span>
          <a
            href="/"
            className="text-xl font-bold bg-gradient-to-r from-brand-400 to-brand-600 bg-clip-text text-transparent"
          >
            FileShare
          </a>
          <span className="text-xs text-gray-500 ml-2 hidden sm:inline">
            QR-based file sharing
          </span>
        </div>
      </header>
      <main className="flex-1">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/room/:roomId" element={<RoomPage />} />
        </Routes>
      </main>
      <footer className="border-t border-gray-800 py-4 text-center text-sm text-gray-600">
        FileShare &mdash; Temporary, anonymous file sharing
      </footer>
    </div>
  );
}
