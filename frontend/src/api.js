import axios from "axios";

const api = axios.create({
  baseURL: "/rooms",
  timeout: 30000,
});

// ---------------------------------------------------------------------------
// Room helpers
// ---------------------------------------------------------------------------

export async function createRoom(expiryMinutes = 30, password = null) {
  const { data } = await api.post("/create", {
    expiry_minutes: expiryMinutes,
    password,
  });
  return data;
}

export async function getRoom(roomId) {
  const { data } = await api.get(`/${roomId}`);
  return data;
}

export async function joinRoom(roomId, password = null) {
  const { data } = await api.post(`/${roomId}/join`, { password });
  return data;
}

/** Generate a single-use 6-digit OTP for the room (room owner calls this). */
export async function generateOtp(roomId) {
  const { data } = await api.post(`/${roomId}/otp/generate`);
  return data; // { otp_code, expires_in_seconds, expires_at }
}

/** Join a room by consuming a one-time password (requires knowing room_id). */
export async function joinRoomWithOtp(roomId, otp) {
  const { data } = await api.post(`/${roomId}/join/otp`, { otp });
  return data;
}

/**
 * Join any room with just a 6-digit OTP — no room ID required.
 * Returns the RoomResponse including the room id to navigate to.
 */
export async function joinByOtpCode(otp) {
  const { data } = await api.post("/join/otp", { otp });
  return data; // { id, ... }
}

export async function endRoom(roomId) {
  await api.delete(`/${roomId}`);
}

export async function listFiles(roomId) {
  const { data } = await api.get(`/${roomId}/files`);
  return data;
}

export function getDownloadUrl(roomId, fileId) {
  return `/rooms/${roomId}/download/${fileId}`;
}

export function getDownloadAllUrl(roomId) {
  return `/rooms/${roomId}/download-all`;
}

export function getQrImageUrl(roomId) {
  return `/rooms/${roomId}/qr`;
}

export function connectWebSocket(roomId) {
  const protocol = window.location.protocol === "https:" ? "wss" : "ws";
  const host = window.location.host;
  return new WebSocket(`${protocol}://${host}/ws/${roomId}`);
}

// ---------------------------------------------------------------------------
// Integrity helpers
// ---------------------------------------------------------------------------

/** CRC-32 lookup table (IEEE polynomial) — used for per-chunk parity checks */
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0; // unsigned 32-bit
}

/** SHA-256 of an ArrayBuffer via the Web Crypto API */
async function sha256Hex(arrayBuffer) {
  const digest = await crypto.subtle.digest("SHA-256", arrayBuffer);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ---------------------------------------------------------------------------
// Chunked upload
// ─ Splits each file into 256 KB chunks
// ─ Computes CRC-32 per chunk (parity check on the server)
// ─ Computes SHA-256 of the whole file (integrity check at completion)
// ─ Retries each chunk up to 3 times before giving up
// ---------------------------------------------------------------------------

const CHUNK_SIZE = 256 * 1024; // 256 KB — matches backend CHUNK_SIZE
const MAX_RETRIES = 3;

async function uploadOneFile(roomId, file, onProgress) {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);

  // Compute full-file SHA-256 before anything is sent
  const fileSha256 = await sha256Hex(buffer);

  const totalChunks = Math.ceil(bytes.length / CHUNK_SIZE) || 1;

  // Step 1 — init
  const initRes = await axios.post(`/rooms/${roomId}/upload/init`, null, {
    params: {
      filename: file.name,
      content_type: file.type || "application/octet-stream",
      total_chunks: totalChunks,
    },
  });
  const { upload_id } = initRes.data;

  // Step 2 — PUT each chunk with CRC-32 parity value
  for (let i = 0; i < totalChunks; i++) {
    const chunkBytes = bytes.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const chunkCrc = crc32(chunkBytes);

    let attempt = 0;
    while (attempt < MAX_RETRIES) {
      try {
        await axios.put(
          `/rooms/${roomId}/upload/${upload_id}/chunk/${i}`,
          chunkBytes.buffer,
          {
            params: { crc32: chunkCrc },
            headers: { "Content-Type": "application/octet-stream" },
            // No timeout per chunk — slow links need time
            timeout: 0,
          },
        );
        break; // success
      } catch (err) {
        attempt++;
        if (attempt >= MAX_RETRIES) throw err;
        // Exponential back-off: 500 ms, 1 s, 2 s …
        await new Promise((r) => setTimeout(r, 500 * 2 ** (attempt - 1)));
      }
    }

    onProgress(Math.round(((i + 1) / totalChunks) * 95)); // up to 95 % during chunks
  }

  // Step 3 — complete (server assembles + verifies SHA-256)
  const completeRes = await axios.post(
    `/rooms/${roomId}/upload/${upload_id}/complete`,
    null,
    { params: { sha256: fileSha256 } },
  );

  onProgress(100);
  return completeRes.data;
}

/**
 * Upload multiple files using chunked streaming.
 * `onProgress(percent)` is called with 0-100 across all files combined.
 */
export async function uploadFiles(roomId, files, onProgress = () => {}) {
  const results = [];
  for (let i = 0; i < files.length; i++) {
    const fileResults = await uploadOneFile(roomId, files[i], (pct) => {
      // Map this file's 0-100 into the overall progress
      const overall = Math.round(((i + pct / 100) / files.length) * 100);
      onProgress(overall);
    });
    results.push(fileResults);
  }
  return results;
}

// ---------------------------------------------------------------------------
// Verified download
// Downloads the file, verifies its SHA-256 against the X-Checksum-SHA256
// response header, then returns a blob: URL ready for <a download>.
// ---------------------------------------------------------------------------

export async function downloadFileVerified(roomId, fileId) {
  const response = await fetch(getDownloadUrl(roomId, fileId));
  if (!response.ok) throw new Error(`Download failed: ${response.status}`);

  const serverChecksum = response.headers.get("X-Checksum-SHA256");
  const buffer = await response.arrayBuffer();

  if (serverChecksum) {
    const actualChecksum = await sha256Hex(buffer);
    if (actualChecksum.toLowerCase() !== serverChecksum.toLowerCase()) {
      throw new Error(
        `Integrity check failed!\nExpected: ${serverChecksum}\nGot:      ${actualChecksum}`,
      );
    }
  }

  const contentDisposition = response.headers.get("Content-Disposition") || "";
  const nameMatch = contentDisposition.match(/filename="?([^"]+)"?/);
  const filename = nameMatch ? nameMatch[1] : `file_${fileId}`;

  const blob = new Blob([buffer], {
    type: response.headers.get("Content-Type") || "application/octet-stream",
  });
  return { url: URL.createObjectURL(blob), filename };
}

export default api;
