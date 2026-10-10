import { test, expect } from '@playwright/test';

test('two browser clients see the same room and a remote shape', async ({ browser, request }) => {
  const response = await request.post('http://127.0.0.1:4000/api/rooms', { data: { name: 'E2E board' } });
  test.skip(!response.ok(), 'Requires a configured PostgreSQL database and running API');
  const room = await response.json();
  const contextA = await browser.newContext(); const contextB = await browser.newContext();
  const pageA = await contextA.newPage(); const pageB = await contextB.newPage();
  await pageA.goto(`/board/${room.id}`); await pageB.goto(`/board/${room.id}`);
  await expect(pageA.getByText('All changes synced')).toBeVisible({ timeout: 15_000 });
  await expect(pageB.getByText('All changes synced')).toBeVisible({ timeout: 15_000 });
  const canvasA = pageA.locator('.canvas-container .lower-canvas');
  const canvasB = pageB.locator('.canvas-container .lower-canvas');
  const before = await canvasB.evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await pageA.getByRole('button', { name: 'Rectangle (R)' }).click();
  const box = await canvasA.boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  await pageA.mouse.move(box.x + 100, box.y + 90);
  await pageA.mouse.down(); await pageA.mouse.move(box.x + 230, box.y + 180, { steps: 8 }); await pageA.mouse.up();
  await expect.poll(() => canvasB.evaluate((el: HTMLCanvasElement) => el.toDataURL()), { timeout: 10_000 }).not.toBe(before);
  await contextA.close(); await contextB.close();
});

test('different rooms do not share canvas updates', async ({ browser, request }) => {
  const first = await request.post('http://127.0.0.1:4000/api/rooms', { data: { name: 'Room A' } });
  const second = await request.post('http://127.0.0.1:4000/api/rooms', { data: { name: 'Room B' } });
  test.skip(!first.ok() || !second.ok(), 'Requires a configured PostgreSQL database and running API');
  const a = await first.json(); const b = await second.json();
  const context = await browser.newContext(); const pageA = await context.newPage(); const pageB = await context.newPage();
  await pageA.goto(`/board/${a.id}`); await pageB.goto(`/board/${b.id}`);
  await expect(pageA.getByText('All changes synced')).toBeVisible({ timeout: 15_000 }); await expect(pageB.getByText('All changes synced')).toBeVisible({ timeout: 15_000 });
  const canvasA = pageA.locator('.canvas-container .lower-canvas'); const canvasB = pageB.locator('.canvas-container .lower-canvas');
  const before = await canvasB.evaluate((el: HTMLCanvasElement) => el.toDataURL());
  await pageA.getByRole('button', { name: 'Rectangle (R)' }).click(); const box = await canvasA.boundingBox(); if (!box) throw new Error('Canvas is not visible');
  await pageA.mouse.move(box.x + 100, box.y + 90); await pageA.mouse.down(); await pageA.mouse.move(box.x + 230, box.y + 180); await pageA.mouse.up();
  await pageA.waitForTimeout(700);
  expect(await canvasB.evaluate((el: HTMLCanvasElement) => el.toDataURL())).toBe(before);
  await context.close();
});
