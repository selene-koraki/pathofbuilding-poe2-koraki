// Cross-device continuity test (§7B guard) — the browserless equivalent of the
// Playwright two-context test. Boots the full stack against a temp Builds folder,
// connects two WebSocket "devices" to the SAME build, and proves:
//   - a mutation on device A appears on device B within ~200 ms,
//   - the change autosaves to the shared XML,
//   - a late joiner (after session eviction) loads the latest saved state.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { WebSocket } from 'ws';

let tmpDir: string;
let server: http.Server;
let port: number;
let engine: import('../src/engine.js').Engine;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-xdev-'));
  process.env.POB_BUILD_DIR = tmpDir;
  process.env.POB_AUTOSAVE_MS = '150';
  process.env.POB_SESSION_IDLE_MS = '200';

  const { engine: eng } = await import('../src/engine.js');
  const { Library } = await import('../src/library.js');
  const { attachWebSocket } = await import('../src/ws.js');
  engine = eng;
  await new Promise<void>((resolve) => {
    eng.on('status', (s: string) => s === 'up' && resolve());
    eng.start();
  });
  const library = new Library(eng);
  await library.init();
  server = http.createServer();
  attachWebSocket(server, eng, library);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as { port: number }).port;
});

afterAll(async () => {
  await engine?.stop();
  server?.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// Minimal promise-based WS device.
class Device {
  ws: WebSocket;
  private id = 1;
  private pending = new Map<number, (v: any) => void>();
  events: Array<{ event: string; data: any }> = [];
  waiters: Array<(e: any) => void> = [];

  constructor(port: number, label: string) {
    this.ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    this.ws.on('message', (raw) => {
      const m = JSON.parse(raw.toString());
      if (m.type === 'response') this.pending.get(m.id)?.(m);
      else if (m.type === 'event') {
        this.events.push(m);
        for (const w of this.waiters.splice(0)) w(m);
      }
    });
    this.ws.on('open', () =>
      this.ws.send(JSON.stringify({ type: 'hello', device: { id: label, label } })),
    );
  }
  ready() {
    return new Promise<void>((r) => this.ws.on('open', () => r()));
  }
  call(method: string, params?: any): Promise<any> {
    const id = this.id++;
    return new Promise((resolve) => {
      this.pending.set(id, (m) => (m.ok ? resolve(m.result) : Promise.reject(m.error)));
      this.ws.send(JSON.stringify({ type: 'request', id, method, params }));
    });
  }
  nextEvent(name: string, timeoutMs: number): Promise<any> {
    const existing = this.events.find((e) => e.event === name);
    if (existing) return Promise.resolve(existing);
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`timeout waiting for ${name}`)), timeoutMs);
      this.waiters.push((e) => {
        if (e.event === name) {
          clearTimeout(t);
          resolve(e);
        }
      });
    });
  }
  close() {
    this.ws.close();
  }
}

describe('cross-device build sessions', () => {
  it('broadcasts a mutation from A to B within ~200ms and autosaves', async () => {
    const a = new Device(port, 'laptop');
    const b = new Device(port, 'phone');
    await Promise.all([a.ready(), b.ready()]);

    const stateA = await a.call('library.open', { id: 'Sample' });
    const stateB = await b.call('library.open', { id: 'Sample' });
    expect(stateA.meta.level).toBe(stateB.meta.level);

    // B starts listening; A mutates.
    const t0 = Date.now();
    const updatedOnB = b.nextEvent('build.updated', 1000);
    await a.call('character.setLevel', { buildId: 'Sample', level: 77 });
    const evt = await updatedOnB;
    const dt = Date.now() - t0;
    expect(evt.data.meta.level).toBe(77);
    expect(dt).toBeLessThan(500); // generous CI budget; design target ~200ms

    // Autosave lands in the shared XML.
    await new Promise((r) => setTimeout(r, 400));
    const xml = await fs.readFile(path.join(tmpDir, 'Sample.xml'), 'utf8');
    expect(xml).toMatch(/level="77"/);

    a.close();
    b.close();
  });

  it('late joiner loads the latest saved state after eviction', async () => {
    // Both gone -> session evicts after idle (200ms). New device re-hydrates.
    await new Promise((r) => setTimeout(r, 500));
    const c = new Device(port, 'desktop');
    await c.ready();
    const state = await c.call('library.open', { id: 'Sample' });
    expect(state.meta.level).toBe(77);
    c.close();
  });
});
