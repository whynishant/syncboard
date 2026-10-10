import { describe, expect, it } from 'vitest';
import { cursorSchema, displayNameSchema, operationSchema, roomCodeSchema } from '../src/types/board.js';

describe('collaboration payload validation', () => {
  it('accepts generated room codes and rejects malformed ones', () => {
    expect(roomCodeSchema.safeParse('AB12CD34').success).toBe(true);
    expect(roomCodeSchema.safeParse('abc').success).toBe(false);
    expect(roomCodeSchema.safeParse('<script>bad</script>').success).toBe(false);
  });
  it('validates guest display names', () => {
    expect(displayNameSchema.safeParse('Maya').success).toBe(true);
    expect(displayNameSchema.safeParse('  ').success).toBe(false);
    expect(displayNameSchema.safeParse('<b>admin</b>').success).toBe(false);
  });
  it('rejects malformed or oversized operations', () => {
    expect(operationSchema.safeParse({ id: 'bad', objectId: 'x', kind: 'create', version: 1, clientOpId: 'bad', payload: {} }).success).toBe(false);
    expect(operationSchema.safeParse({ id: '7f29e4b5-3b87-47f4-a6f5-66e850fae4d2', clientOpId: '7f29e4b5-3b87-47f4-a6f5-66e850fae4d2', objectId: 'shape-1', kind: 'delete', version: 2 }).success).toBe(true);
    expect(cursorSchema.safeParse({ x: Infinity, y: 1 }).success).toBe(false);
  });
});
