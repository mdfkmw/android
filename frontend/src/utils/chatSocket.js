// frontend/src/utils/chatSocket.js
import { io } from "socket.io-client";

let socket = null;

export function initChatSocket() {
  if (socket) return socket;

  const API_BASE = import.meta.env.VITE_API_URL ?? "";
  // important: folosim cookies (access_token), deci withCredentials trebuie true
  socket = io((API_BASE || window.location.origin) + '/chat', {
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
  });


  socket.on("connect", () => {
    console.log("[chat socket] connected", socket.id);
  });

  socket.on("disconnect", (reason) => {
    console.log("[chat socket] disconnected:", reason);
  });

  socket.on("connect_error", (err) => {
    console.log("[chat socket] connect_error:", err?.message || err);
  });

  return socket;
}

export function getChatSocket() {
  return socket;
}

export function stopChatSocket() {
  if (!socket) return;
  try {
    socket.removeAllListeners();
    socket.disconnect();
  } catch (e) { }
  socket = null;
}
