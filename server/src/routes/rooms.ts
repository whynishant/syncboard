import { Router } from 'express';
import { z } from 'zod';
import { createRoom, getRoom } from '../services/rooms.js';
import { roomCodeSchema } from '../types/board.js';

export const roomsRouter = Router();
const createSchema = z.object({ name: z.string().trim().max(120).optional() });

roomsRouter.post('/', async (req, res, next) => {
  try {
    const parsed = createSchema.safeParse(req.body ?? {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid room details', details: parsed.error.flatten() });
    const room = await createRoom(parsed.data.name);
    return res.status(201).json({ id: room.code, name: room.name, readOnly: room.readOnly, revision: room.revision });
  } catch (e) { next(e); }
});

roomsRouter.get('/:code', async (req, res, next) => {
  try {
    const parsed = roomCodeSchema.safeParse(req.params.code);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid room code' });
    const room = await getRoom(parsed.data);
    if (!room) return res.status(404).json({ error: 'Room not found. Check the invitation link or create a new board.' });
    return res.json({ id: room.code, name: room.name, readOnly: room.readOnly, revision: room.revision, snapshot: room.snapshot });
  } catch (e) { next(e); }
});
