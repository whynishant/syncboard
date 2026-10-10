import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

describe('HTTP API surface', () => {
  it('exposes a health check', async () => {
    const response = await request(createApp()).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
  it('rejects invalid room codes before database lookup', async () => {
    const response = await request(createApp()).get('/api/rooms/no');
    expect(response.status).toBe(400);
    expect(response.body.error).toMatch(/room code/i);
  });
});
