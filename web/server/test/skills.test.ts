// Skills engine contract — socket groups, gems, supports, level edits, Full DPS.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Engine } from '../src/engine.js';
import type { BuildState } from '../../shared/dto.js';

const engine = new Engine();
const fullDPS = async () =>
  ((await engine.call('calcs.getStat', { stat: 'FullDPS' })) as { value: number }).value || 0;

beforeAll(async () => {
  await new Promise<void>((r) => {
    engine.on('status', (s: string) => s === 'up' && r());
    engine.start();
  });
  await engine.call('build.new', { id: 's', name: 'S' });
  await engine.call('character.setClass', { classId: 7 }); // Sorceress
  await engine.call('character.setLevel', { level: 70 });
});
afterAll(async () => {
  await engine.stop();
});

describe('skills', () => {
  it('adds a socket group + gem and resolves it', async () => {
    const st = (await engine.call('skills.addGroup', { label: 'Main' })) as BuildState;
    expect(st.skills.groups.length).toBe(1);
    const st2 = (await engine.call('skills.addGem', {
      group: 1,
      nameSpec: 'Fireball',
      level: 1,
      quality: 0,
    })) as BuildState;
    const gem = st2.skills.groups[0].gems[0];
    expect(gem.displayName).toBe('Fireball');
    expect(gem.error).toBeFalsy();
  });

  it('main skill in Full DPS produces nonzero DPS, and gem level raises it', async () => {
    await engine.call('skills.setGroupFullDPS', { index: 1, include: true });
    await engine.call('skills.setMainGroup', { index: 1 });
    const low = await fullDPS();
    expect(low).toBeGreaterThan(0);
    await engine.call('skills.setGem', { group: 1, index: 1, level: 20, quality: 20 });
    const high = await fullDPS();
    expect(high).toBeGreaterThan(low); // higher gem level -> more DPS
  });

  it('disabling a gem changes the computed output', async () => {
    const before = await fullDPS();
    await engine.call('skills.setGem', { group: 1, index: 1, enabled: false });
    const after = await fullDPS();
    expect(after).not.toBe(before);
    await engine.call('skills.setGem', { group: 1, index: 1, enabled: true });
  });

  it('pastes a socket group with a support gem (both resolve)', async () => {
    const st = (await engine.call('skills.pasteGroup', {
      text: 'Fireball 20/0 1\nFire Penetration II 20/0 1',
    })) as BuildState;
    const pasted = st.skills.groups[st.skills.groups.length - 1];
    expect(pasted.gems.length).toBe(2);
    expect(pasted.gems[1].support).toBe(true);
    expect(pasted.gems.every((g) => !g.error)).toBe(true);
  });

  it('searches the gem database (actives and supports)', async () => {
    const res = (await engine.call('skills.searchGems', { q: 'fireball' })) as {
      gems: Array<{ name: string; support: boolean }>;
    };
    expect(res.gems.some((g) => g.name === 'Fireball')).toBe(true);
    const sup = (await engine.call('skills.searchGems', { q: '', limit: 300 })) as {
      gems: Array<{ support: boolean }>;
    };
    expect(sup.gems.some((g) => g.support)).toBe(true);
  });

  it('removes a socket group', async () => {
    const before = (await engine.call('skills.listGroups')) as BuildState['skills'];
    const n = before.groups.length;
    await engine.call('skills.removeGroup', { index: n });
    const after = (await engine.call('skills.listGroups')) as BuildState['skills'];
    expect(after.groups.length).toBe(n - 1);
  });
});
