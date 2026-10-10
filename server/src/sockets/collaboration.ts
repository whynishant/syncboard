import type { Server, Socket } from 'socket.io';
import { prisma } from '../services/prisma.js';
import { z } from 'zod';
import { cursorSchema, displayNameSchema, operationSchema, roomCodeSchema } from '../types/board.js';

type User = { id: string; name: string; color: string; room: string; lastSeen: number };
type ClientSocket = Socket & { data: { user?: User; activeStroke?: string } };
const users = new Map<string, User>();
const roomChannel = (code: string) => `board:${code}`;
const colors = ['#2563eb', '#db2777', '#059669', '#d97706', '#7c3aed', '#0891b2', '#dc2626'];
const objectVersions = new Map<string, number>();

export function registerCollaboration(io: Server) {
  io.on('connection', (rawSocket) => {
    const socket = rawSocket as ClientSocket;
    socket.on('room:join', async (raw, ack?: (v: unknown) => void) => {
      try {
        const schema = z.object({ code: roomCodeSchema, name: displayNameSchema });
        const parsed = schema.safeParse(raw);
        if (!parsed.success) return ack?.({ ok: false, error: 'Invalid room code or display name' });
        const code = parsed.data.code.toUpperCase();
        const room = await prisma.room.findUnique({ where: { code } });
        if (!room) return ack?.({ ok: false, error: 'Room not found' });
        const storedSnapshot = (room.snapshot && typeof room.snapshot === 'object' ? room.snapshot : {}) as Record<string, unknown>;
        const storedObjects = storedSnapshot.objects && typeof storedSnapshot.objects === 'object' ? storedSnapshot.objects as Record<string, { version?: number }> : {};
        for (const [objectId, object] of Object.entries(storedObjects)) objectVersions.set(`${code}:${objectId}`, Math.max(objectVersions.get(`${code}:${objectId}`) ?? 0, Number(object.version ?? 1)));
        if (socket.data.user?.room) {
          socket.to(roomChannel(socket.data.user.room)).emit('presence:leave', { socketId: socket.id });
          socket.leave(roomChannel(socket.data.user.room)); users.delete(socket.id);
        }
        const user: User = { id: socket.id, name: parsed.data.name, color: colors[Math.floor(Math.random() * colors.length)]!, room: code, lastSeen: Date.now() };
        socket.data.user = user; users.set(socket.id, user); await socket.join(roomChannel(code));
        const peers = [...users.values()].filter(u => u.room === code && u.id !== socket.id).map(({ id, name, color }) => ({ id, name, color }));
        ack?.({ ok: true, room: { id: room.code, name: room.name, readOnly: room.readOnly, revision: room.revision, snapshot: room.snapshot }, self: { id: user.id, name: user.name, color: user.color }, peers });
        socket.to(roomChannel(code)).emit('presence:join', { id: user.id, name: user.name, color: user.color });
      } catch (err) { console.error('room:join failed', err instanceof Error ? err.message : 'unknown error'); ack?.({ ok: false, error: 'Unable to join room. Please retry.' }); }
    });

    socket.on('room:leave', (raw) => {
      const user = socket.data.user; if (!user) return;
      const parsed = roomCodeSchema.safeParse((raw as { code?: unknown } | null)?.code);
      if (!parsed.success || parsed.data.toUpperCase() !== user.room) return;
      socket.to(roomChannel(user.room)).emit('presence:leave', { socketId: socket.id });
      socket.leave(roomChannel(user.room)); users.delete(socket.id);
      delete socket.data.user;
    });

    socket.on('stroke:start', async (raw) => {
      const user = socket.data.user; if (!user) return;
      const schema = z.object({ strokeId: z.string().uuid(), x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000), color: z.string().regex(/^#[0-9a-fA-F]{6}$/) });
      const parsed = schema.safeParse(raw); if (!parsed.success) return;
      socket.data.activeStroke = parsed.data.strokeId;
      socket.to(roomChannel(user.room)).volatile.emit('stroke:start', { ...parsed.data, userId: user.id });
    });
    socket.on('stroke:points', async (raw) => {
      const user = socket.data.user; if (!user || !socket.data.activeStroke) return;
      const schema = z.object({ points: z.array(z.tuple([z.number().finite().min(-1_000_000).max(1_000_000), z.number().finite().min(-1_000_000).max(1_000_000)])).min(1).max(2000) });
      const parsed = schema.safeParse(raw); if (!parsed.success) return;
      socket.to(roomChannel(user.room)).volatile.emit('stroke:points', { strokeId: socket.data.activeStroke, points: parsed.data.points });
    });
    socket.on('stroke:end', () => {
      const user = socket.data.user; if (!user || !socket.data.activeStroke) return;
      const strokeId = socket.data.activeStroke; delete socket.data.activeStroke;
      socket.to(roomChannel(user.room)).emit('stroke:end', { strokeId });
    });

    socket.on('cursor:move', (raw) => {
      const user = socket.data.user; if (!user) return;
      const parsed = cursorSchema.safeParse(raw); if (!parsed.success) return;
      user.lastSeen = Date.now(); socket.to(roomChannel(user.room)).volatile.emit('cursor:move', { id: user.id, name: user.name, color: user.color, ...parsed.data });
    });

    socket.on('shape:operation', async (raw, ack?: (v: unknown) => void) => {
      const user = socket.data.user; if (!user) return ack?.({ ok: false, error: 'Join a room first' });
      const parsed = operationSchema.safeParse(raw); if (!parsed.success) return ack?.({ ok: false, error: 'Malformed operation' });
      try {
        const room = await prisma.room.findUnique({ where: { code: user.room } });
        if (!room) return ack?.({ ok: false, error: 'Room no longer exists' });
        if (room.readOnly) return ack?.({ ok: false, error: 'This board is read-only' });
        const key = `${user.room}:${parsed.data.objectId}`;
        const currentVersion = objectVersions.get(key) ?? 0;
        if (parsed.data.version <= currentVersion) return ack?.({ ok: false, conflict: true, error: 'A newer edit already exists' });
        objectVersions.set(key, parsed.data.version);
        const op = parsed.data;
        const prior = await prisma.boardOperation.findUnique({ where: { roomId_id: { roomId: room.id, id: op.id } } });
        if (prior) return ack?.({ ok: true, duplicate: true });
        await prisma.boardOperation.create({ data: { id: op.id, roomId: room.id, objectId: op.objectId, kind: op.kind, version: op.version, payload: op.payload as object | undefined } });
        // Keep a compact, recoverable object map in the snapshot. Operations are serialized by their IDs.
        const snapshot = (room.snapshot && typeof room.snapshot === 'object' ? room.snapshot : {}) as Record<string, unknown>;
        const objects = { ...((snapshot.objects && typeof snapshot.objects === 'object') ? snapshot.objects as Record<string, unknown> : {}) };
        if (op.kind === 'delete') delete objects[op.objectId]; else objects[op.objectId] = { ...op.payload, id: op.objectId, version: op.version };
        await prisma.room.update({ where: { id: room.id }, data: { snapshot: { ...snapshot, objects }, updatedAt: new Date(), revision: { increment: 1 } } });
        socket.to(roomChannel(user.room)).emit('shape:operation', { ...op, userId: user.id });
        ack?.({ ok: true, revision: room.revision + 1 });
      } catch (err) { console.error('shape operation failed', err instanceof Error ? err.message : 'unknown error'); ack?.({ ok: false, error: 'Could not save this change' }); }
    });

    socket.on('board:settings', async (raw, ack?: (v: unknown) => void) => {
      const user = socket.data.user; if (!user) return ack?.({ ok: false, error: 'Join a room first' });
      const schema = z.object({ background: z.string().regex(/^#[0-9a-fA-F]{6}$/), grid: z.boolean() });
      const parsed = schema.safeParse(raw); if (!parsed.success) return ack?.({ ok: false, error: 'Invalid board settings' });
      try {
        const room = await prisma.room.findUnique({ where: { code: user.room } }); if (!room) return ack?.({ ok: false, error: 'Room not found' });
        if (room.readOnly) return ack?.({ ok: false, error: 'This board is read-only' });
        const snapshot = (room.snapshot && typeof room.snapshot === 'object' ? room.snapshot : {}) as Record<string, unknown>;
        await prisma.room.update({ where: { id: room.id }, data: { snapshot: { ...snapshot, settings: parsed.data } } });
        socket.to(roomChannel(user.room)).emit('board:settings', parsed.data); ack?.({ ok: true });
      } catch { ack?.({ ok: false, error: 'Could not save board settings' }); }
    });

    socket.on('disconnect', () => {
      const user = socket.data.user; if (!user) return;
      users.delete(socket.id); socket.to(roomChannel(user.room)).emit('presence:leave', { socketId: socket.id });
    });
  });
  return { users };
}
