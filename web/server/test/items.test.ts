// Items engine contract — slots, equip, paste, unique DB, tooltip, item sets.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { Engine } from '../src/engine.js';
import type { BuildState, ItemDetail } from '../../shared/dto.js';

const engine = new Engine();
const life = async () =>
  ((await engine.call('calcs.getStat', { stat: 'Life' })) as { value: number }).value;

beforeAll(async () => {
  await new Promise<void>((r) => {
    engine.on('status', (s: string) => s === 'up' && r());
    engine.start();
  });
  await engine.call('build.new', { id: 'i', name: 'I' });
  await engine.call('character.setClass', { classId: 6 }); // Warrior
  await engine.call('character.setLevel', { level: 75 });
});
afterAll(async () => {
  await engine.stop();
});

describe('items', () => {
  it('searches the unique DB and filters by slot', async () => {
    const res = (await engine.call('items.searchUniques', { slot: 'Belt', limit: 5 })) as {
      uniques: Array<{ name: string; slot: string }>;
    };
    expect(res.uniques.length).toBeGreaterThan(0);
    expect(res.uniques.every((u) => u.slot === 'Belt')).toBe(true);
  });

  it('equips a unique and recomputes', async () => {
    const before = await life();
    const st = (await engine.call('items.equipUnique', {
      name: 'Belly of the Beast, Explorer Armour',
    })) as BuildState;
    const body = st.items.slots.find((s) => s.name === 'Body Armour');
    expect(body?.item?.name).toContain('Belly of the Beast');
    expect(await life()).toBeGreaterThan(before); // % increased life body armour
  });

  it('pastes a rare item and applies its mods', async () => {
    const before = await life();
    const st = (await engine.call('items.pasteItem', {
      text: 'Rarity: RARE\nDread Coil\nRawhide Belt\n--------\n+45 to maximum Life\n',
    })) as BuildState & { equippedSlot?: string };
    expect(st.equippedSlot).toBe('Belt');
    expect(await life()).toBeGreaterThan(before);
  });

  it('produces a coloured item tooltip', async () => {
    const belt = ((await engine.call('items.getSlots')) as BuildState['items']).slots.find(
      (s) => s.name === 'Belt',
    );
    const detail = (await engine.call('items.getItem', { id: belt!.itemId })) as ItemDetail;
    expect(detail.tooltip.length).toBeGreaterThan(2);
    expect(detail.tooltip.some((l) => l.text.includes('maximum Life'))).toBe(true);
    expect(detail.tooltip.some((l) => l.text.includes('^x'))).toBe(true); // colour codes
  });

  it('switches item sets (removes equipped items)', async () => {
    const withItems = await life();
    await engine.call('items.newSet', { title: 'Empty' });
    const sets = (await engine.call('items.listSets')) as { sets: Array<{ id: number }> };
    const emptyId = sets.sets[sets.sets.length - 1].id;
    await engine.call('items.setActiveSet', { id: emptyId });
    expect(await life()).toBeLessThan(withItems);
  });

  it('unequips a slot', async () => {
    await engine.call('items.setActiveSet', { id: 1 });
    const before = await life();
    await engine.call('items.unequip', { slot: 'Body Armour' });
    expect(await life()).toBeLessThan(before);
  });
});
