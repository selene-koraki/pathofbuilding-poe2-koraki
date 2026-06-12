// Engine supervision test — killing the engine subprocess must auto-restart it
// and recover service (Phase 0 DoD: "killing the engine subprocess auto-restarts").
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Engine } from '../src/engine.js';

const engine = new Engine();
const waitUp = () => new Promise<void>((r) => engine.on('status', (s: string) => s === 'up' && r()));

beforeAll(async () => {
  const up = waitUp();
  engine.start();
  await up;
});
afterAll(async () => {
  await engine.stop();
});

describe('engine auto-restart', () => {
  it('respawns after the subprocess is killed and serves again', async () => {
    await engine.call('build.new', { id: 'r', name: 'R' });
    const oldPid = engine.pid;
    expect(oldPid).toBeGreaterThan(0);

    const backUp = waitUp();
    process.kill(oldPid!, 'SIGKILL');
    await backUp; // supervisor restarts on exit

    const state = (await engine.call('build.new', { id: 'r', name: 'R' })) as { meta: { level: number } };
    expect(state.meta.level).toBe(1);
    expect(engine.pid).not.toBe(oldPid);
  });
});
