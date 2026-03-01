import axios from "axios";

const api = axios.create({
  baseURL: "/rooms",
  timeout: 30000,
});

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

export async function endRoom(roomId) {
  await api.delete(`/${roomId}`);
}

export async function uploadFiles(roomId, files, onProgress) {
  const formData = new FormData();
  files.forEach((file) => formData.append("files", file));
  const { data } = await api.post(`/${roomId}/upload`, formData, {
    headers: { "Content-Type": "multipart/form-data" },
    onUploadProgress: onProgress,
  });
  return data;
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

export default api;
