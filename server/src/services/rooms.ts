import { randomBytes } from 'node:crypto';
import { prisma } from './prisma.js';

export function newRoomCode(): string {
  return randomBytes(6).toString('base64url').replace(/[-_]/g, '').slice(0, 10).toUpperCase();
}

export async function createRoom(name = 'Untitled board') {
  for (let attempt = 0; attempt < 4; attempt++) {
    try { return await prisma.room.create({ data: { code: newRoomCode(), name: name.trim().slice(0, 120) || 'Untitled board' } }); }
    catch (error) { if (attempt === 3) throw error; }
  }
  throw new Error('Could not create room');
}

export async function getRoom(code: string) {
  return prisma.room.findUnique({ where: { code: code.toUpperCase() } });
}
