// Engine contract test — spawns the real LuaJIT kernel and asserts the JSON-RPC
// surface drives the engine correctly (the headless boundary works end-to-end).
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Engine } from '../src/engine.js';
import type { BuildState } from '../../shared/dto.js';

const engine = new Engine();

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    engine.on('status', (s: string) => s === 'up' && resolve());
    engine.start();
  });
});
afterAll(async () => {
  await engine.stop();
});

describe('engine kernel contract', () => {
  it('creates a default build with sensible meta', async () => {
    const state = (await engine.call('build.new', { id: 't', name: 'T' })) as BuildState;
    expect(state.meta.level).toBe(1);
    expect(state.meta.className).toBeTruthy();
    expect(Array.isArray(state.sidebar)).toBe(true);
    expect(state.sidebar.length).toBeGreaterThan(5);
  });

  it('recomputes stats when level changes', async () => {
    const l1 = (await engine.call('calcs.getStat', { stat: 'Life' })) as { value: number };
    await engine.call('character.setLevel', { level: 90 });
    const l90 = (await engine.call('calcs.getStat', { stat: 'Life' })) as { value: number };
    expect(l90.value).toBeGreaterThan(l1.value);
  });

  it('round-trips a build code through zlib', async () => {
    const exp = (await engine.call('build.exportCode')) as { code: string };
    expect(exp.code.length).toBeGreaterThan(100);
    const re = (await engine.call('build.importCode', { id: 't', code: exp.code })) as BuildState;
    expect(re.meta.className).toBeTruthy();
  });

  it('saves to XML the gateway can persist', async () => {
    const res = (await engine.call('build.save', { name: 'T' })) as { xml: string };
    expect(res.xml).toContain('<PathOfBuilding2>');
    expect(res.xml).toContain('<Build');
  });
});
