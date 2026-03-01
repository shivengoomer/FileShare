import { QRCodeSVG } from "qrcode.react";
import { QrCode, ExternalLink } from "lucide-react";

export default function QRDisplay({ roomId }) {
  const joinUrl = `${window.location.origin}/room/${roomId}`;

  return (
    <div className="card text-center">
      <div className="flex items-center justify-center gap-2 mb-4">
        <QrCode size={18} className="text-brand-400" />
        <h3 className="font-semibold">Share QR Code</h3>
      </div>
      <div className="bg-white rounded-xl p-4 inline-block mx-auto mb-4">
        <QRCodeSVG value={joinUrl} size={180} level="M" />
      </div>
      <p className="text-xs text-gray-500 break-all mb-2 font-mono">
        {joinUrl}
      </p>
      <p className="text-xs text-gray-600">Scan with any camera app to join</p>
    </div>
  );
}
