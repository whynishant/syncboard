import dotenv from 'dotenv';
dotenv.config({ path: process.env.ENV_FILE ?? '../.env' });
import http from 'node:http';
import { Server } from 'socket.io';
import { createApp } from './app.js';
import { registerCollaboration } from './sockets/collaboration.js';
import { prisma } from './services/prisma.js';

const port = Number(process.env.PORT ?? 4000);
const origins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173').split(',').map(v => v.trim());
const app = createApp();
const httpServer = http.createServer(app);
const io = new Server(httpServer, { cors: { origin: origins, methods: ['GET', 'POST'], credentials: true }, maxHttpBufferSize: 300_000, pingInterval: 25_000, pingTimeout: 20_000 });
registerCollaboration(io);

httpServer.listen(port, () => console.log(`SyncBoard server listening on port ${port}`));
const shutdown = async () => { io.close(); httpServer.close(); await prisma.$disconnect(); process.exit(0); };
process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
