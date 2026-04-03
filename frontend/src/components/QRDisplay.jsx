import { useState, useEffect } from "react";
import { QRCodeSVG } from "qrcode.react";
import { QrCode } from "lucide-react";

export default function QRDisplay({ roomId }) {
  const [serverInfo, setServerInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchServerInfo = async () => {
      try {
        const response = await fetch("/server-info");
        const data = await response.json();
        setServerInfo(data);
      } catch (error) {
        console.error("Failed to fetch server info:", error);
        // Fallback to current origin
        setServerInfo({
          network_ip: window.location.hostname,
          port:
            window.location.port ||
            (window.location.protocol === "https:" ? 443 : 80),
          protocol: window.location.protocol.replace(":", ""),
        });
      } finally {
        setLoading(false);
      }
    };

    fetchServerInfo();
  }, []);

  if (loading) {
    return (
      <div className="rounded-[12px] border border-[#1F2937] bg-[#0B0F14] p-5 text-center">
        <div className="mb-4 flex items-center justify-center gap-2">
          <QrCode size={18} className="text-green-400" />
          <h3 className="font-medium text-[#F9FAFB]">Room QR</h3>
        </div>
        <div className="mx-auto mb-4 inline-block rounded-[12px] bg-white p-4">
          <div className="h-[180px] w-[180px] animate-pulse rounded bg-gray-100"></div>
        </div>
        <p className="text-xs text-[#6B7280]">Loading...</p>
      </div>
    );
  }

  const joinUrl = serverInfo
    ? `${serverInfo.protocol}://${serverInfo.network_ip}:${serverInfo.port}/room/${roomId}`
    : `${window.location.origin}/room/${roomId}`;

  return (
    <div className="rounded-[12px] border border-[#1F2937] bg-[#0B0F14] p-5 text-center">
      <div className="mb-4 flex items-center justify-center gap-2">
        <QrCode size={18} className="text-green-400" />
        <h3 className="font-medium text-[#F9FAFB]">Room QR</h3>
      </div>
      <div className="mx-auto mb-4 inline-block rounded-[12px] bg-white p-4">
        <QRCodeSVG value={joinUrl} size={180} level="M" />
      </div>
      <p className="mb-2 break-all font-mono text-xs text-[#9CA3AF]">
        {joinUrl}
      </p>
      <p className="text-xs text-[#6B7280]">Scan with any camera app to join</p>
    </div>
  );
}
