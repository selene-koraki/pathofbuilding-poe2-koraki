// Numeric-parity harness (§8) — for every corpus scenario, the full web stack
// must compute stat output numerically identical to the headless engine.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { SCENARIOS } from '../../parity/scenarios.js';
import { computeDirect, computeViaGateway, diffStats } from '../../parity/runner.js';

let tmpDir: string;
let server: http.Server;
let webEngine: import('../src/engine.js').Engine;
let refEngine: import('../src/engine.js').Engine;
let sessions: import('../src/sessions.js').SessionManager;
let library: import('../src/library.js').Library;

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'pob-parity-'));
  // Must be set BEFORE the first import of config.ts (via engine.ts).
  process.env.POB_BUILD_DIR = tmpDir;
  process.env.POB_AUTOSAVE_MS = '50';

  const { engine, Engine } = await import('../src/engine.js');
  const { Library } = await import('../src/library.js');
  const { attachWebSocket } = await import('../src/ws.js');
  webEngine = engine;
  await new Promise<void>((r) => {
    engine.on('status', (s: string) => s === 'up' && r());
    engine.start();
  });
  library = new Library(engine);
  await library.init();
  server = http.createServer();
  sessions = attachWebSocket(server, engine, library);

  // Independent reference engine (a second kernel process).
  refEngine = new Engine();
  await new Promise<void>((r) => {
    refEngine.on('status', (s: string) => s === 'up' && r());
    refEngine.start();
  });
}, 90000);

afterAll(async () => {
  await webEngine?.stop();
  await refEngine?.stop();
  server?.close();
  await fs.rm(tmpDir, { recursive: true, force: true });
});

describe('numeric parity: web stack == headless engine', () => {
  for (const scenario of SCENARIOS) {
    it(`computes identically — ${scenario.name}`, async () => {
      const reference = await computeDirect(refEngine, scenario);
      const web = await computeViaGateway(sessions, library, scenario, tmpDir);
      // Both paths must surface the same stat keys and exact values.
      expect(Object.keys(web).length).toBeGreaterThan(0);
      const diffs = diffStats(reference, web);
      expect(diffs, diffs.join('\n')).toEqual([]);
    });
  }
});
