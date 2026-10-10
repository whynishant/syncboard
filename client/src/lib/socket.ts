import { io } from 'socket.io-client';
export const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:4000';
export const socket = io(serverUrl, { autoConnect: false, reconnection: true, reconnectionAttempts: Infinity, reconnectionDelay: 700, reconnectionDelayMax: 5000, timeout: 10_000, transports: ['websocket', 'polling'] });
