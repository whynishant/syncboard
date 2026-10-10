import { z } from 'zod';

export const roomCodeSchema = z.string().trim().min(6).max(16).regex(/^[A-Za-z0-9_-]+$/);
export const displayNameSchema = z.string().trim().min(1).max(32).regex(/^[^<>\u0000-\u001f]+$/);
export const objectSchema = z.record(z.unknown()).refine(v => JSON.stringify(v).length <= 250_000, 'Object is too large');
export const operationSchema = z.object({
  id: z.string().uuid(), objectId: z.string().min(1).max(128),
  kind: z.enum(['create', 'update', 'delete']), version: z.number().int().positive(),
  payload: objectSchema.optional(), clientOpId: z.string().uuid()
}).superRefine((v, ctx) => {
  if (v.kind !== 'delete' && !v.payload) ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Payload required for create/update' });
});
export const cursorSchema = z.object({ x: z.number().finite().min(-1_000_000).max(1_000_000), y: z.number().finite().min(-1_000_000).max(1_000_000) });
export type BoardOperationInput = z.infer<typeof operationSchema>;
export type BoardObject = Record<string, unknown> & { id: string; version?: number };
