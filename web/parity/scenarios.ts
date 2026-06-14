// Numeric-parity corpus (grows each phase; >=25 real builds by Phase 7).
//
// Each scenario describes how to construct a build from scratch and a sequence of
// mutations to apply. The harness (web/parity/runner.ts) computes the resulting
// stat output two ways — directly via the headless engine and via the full web
// stack (gateway sessions) — and asserts they are numerically identical. This is
// the objective bar for "parity": prove it, don't assert it.

export interface RpcCall {
  method: string;
  params?: Record<string, unknown>;
}

export interface Scenario {
  id: string;
  name: string;
  /** Construction + mutation sequence applied after build.new. */
  steps: RpcCall[];
}

// Stats sampled for comparison. getOutput returns only the numeric ones present.
export const TRACKED_STATS = [
  'Life',
  'Mana',
  'EnergyShield',
  'TotalEHP',
  'Armour',
  'Evasion',
  'WardArmour',
  'Str',
  'Dex',
  'Int',
  'FireResist',
  'ColdResist',
  'LightningResist',
  'ChaosResist',
  'FullDPS',
  'TotalDPS',
  'AverageHit',
  'CritChance',
  'BlockChance',
  'MovementSpeedMod',
  // Minion actor (dotted paths resolve against output.Minion).
  'Minion.TotalDPS',
  'Minion.Life',
  'Minion.CombinedDPS',
];

// Phase 1 corpus: every class at a few levels, plus config-toggle matrices.
// classId is the passive tree's class id (not an alphabetical index).
const CLASSES = [
  { classId: 11, name: 'Druid' },
  { classId: 2, name: 'Ranger' },
  { classId: 1, name: 'Witch' },
];

const CONFIG_MATRIX: RpcCall[][] = [
  [],
  [{ method: 'config.set', params: { var: 'enemyIsBoss', value: 'Boss' } }],
  [
    { method: 'config.set', params: { var: 'enemyIsBoss', value: 'Pinnacle' } },
    { method: 'config.set', params: { var: 'resistancePenalty', value: -60 } },
  ],
  [
    { method: 'config.set', params: { var: 'conditionStationary', value: 1 } },
    { method: 'config.set', params: { var: 'multiplierNearbyEnemies', value: 5 } },
  ],
];

export const SCENARIOS: Scenario[] = [];
for (const cls of CLASSES) {
  for (const level of [1, 45, 90]) {
    for (let ci = 0; ci < CONFIG_MATRIX.length; ci++) {
      SCENARIOS.push({
        id: `${cls.name.toLowerCase()}-l${level}-cfg${ci}`,
        name: `${cls.name} lvl ${level} cfg#${ci}`,
        steps: [
          { method: 'character.setClass', params: { classId: cls.classId } },
          { method: 'character.setLevel', params: { level } },
          ...CONFIG_MATRIX[ci],
        ],
      });
    }
  }
}

// Skill scenarios: a real socket group (active + support) driven through the
// skills RPCs, in Full DPS, against varied enemies. Exercises gem add/level/
// quality/enable/main-skill end-to-end and pins skill DPS parity.
const SKILL_SETUPS: { id: string; name?: string; steps: RpcCall[] }[] = [
  {
    id: 'fireball-basic',
    steps: [
      { method: 'character.setClass', params: { classId: 7 } }, // Sorceress
      { method: 'character.setLevel', params: { level: 70 } },
      { method: 'skills.pasteGroup', params: { text: 'Fireball 20/20 1' } },
      { method: 'skills.setGroupFullDPS', params: { index: 1, include: true } },
      { method: 'skills.setMainGroup', params: { index: 1 } },
    ],
  },
  {
    id: 'fireball-support-boss',
    steps: [
      { method: 'character.setClass', params: { classId: 7 } },
      { method: 'character.setLevel', params: { level: 90 } },
      { method: 'skills.pasteGroup', params: { text: 'Fireball 20/20 1\nFire Penetration II 20/0 1' } },
      { method: 'skills.setGroupFullDPS', params: { index: 1, include: true } },
      { method: 'skills.setMainGroup', params: { index: 1 } },
      { method: 'config.set', params: { var: 'enemyIsBoss', value: 'Boss' } },
      { method: 'skills.setGem', params: { group: 1, index: 1, quality: 0 } },
      { method: 'skills.setGem', params: { group: 1, index: 1, level: 19 } },
    ],
  },
];
// Minion scenario — Raise Zombie as the main skill produces a minion actor;
// proves minion stat output (Minion.*) computes identically through the stack.
SKILL_SETUPS.push({
  id: 'minion-raise-zombie',
  steps: [
    { method: 'character.setClass', params: { classId: 1 } }, // Witch
    { method: 'character.setLevel', params: { level: 80 } },
    { method: 'skills.pasteGroup', params: { text: 'Raise Zombie 20/0 1' } },
    { method: 'skills.setMainGroup', params: { index: 1 } },
    { method: 'skills.setGroupFullDPS', params: { index: 1, include: true } },
  ],
});

// Item scenarios — equip uniques + paste a rare, in Full DPS, to pin item stats.
SKILL_SETUPS.push({
  id: 'items-unique-belly',
  steps: [
    { method: 'character.setClass', params: { classId: 6 } }, // Warrior
    { method: 'character.setLevel', params: { level: 75 } },
    { method: 'items.equipUnique', params: { name: 'Belly of the Beast, Explorer Armour' } },
    {
      method: 'items.pasteItem',
      params: {
        text: 'Rarity: RARE\nDread Coil\nRawhide Belt\n--------\n+45 to maximum Life\n+30% to Cold Resistance\n',
      },
    },
  ],
});

// Tree scenario — allocate a notable several hops from the class start (the
// engine auto-fills the path), proving passive-tree allocation stat parity.
SKILL_SETUPS.push({
  id: 'tree-witch-rawpower',
  steps: [
    { method: 'character.setClass', params: { classId: 7 } },
    { method: 'character.setLevel', params: { level: 90 } },
    { method: 'tree.allocNode', params: { id: 4739 } }, // Spell Damage (adjacent)
    { method: 'tree.allocNode', params: { id: 51184 } }, // Raw Power notable (path auto-filled)
  ],
});

// Integrated builds — combine class + tree + skills + items + config in one
// build, the closest the synthetic corpus gets to "real" builds. Every subsystem
// participates, so a regression anywhere shows up as a parity diff.
const INTEGRATED: Scenario[] = [
  {
    id: 'integrated-sorc-fireball',
    name: 'Sorceress Fireball (tree+gem+item+boss)',
    steps: [
      { method: 'character.setClass', params: { classId: 7 } },
      { method: 'character.setLevel', params: { level: 88 } },
      { method: 'tree.allocNode', params: { id: 4739 } },
      { method: 'tree.allocNode', params: { id: 51184 } },
      { method: 'skills.pasteGroup', params: { text: 'Fireball 20/20 1\nFire Penetration II 20/0 1' } },
      { method: 'skills.setGroupFullDPS', params: { index: 1, include: true } },
      { method: 'skills.setMainGroup', params: { index: 1 } },
      { method: 'items.equipUnique', params: { name: 'Belly of the Beast, Explorer Armour' } },
      { method: 'config.set', params: { var: 'enemyIsBoss', value: 'Boss' } },
    ],
  },
  {
    id: 'integrated-witch-minion',
    name: 'Witch Raise Zombie (minion+item+config)',
    steps: [
      { method: 'character.setClass', params: { classId: 1 } },
      { method: 'character.setLevel', params: { level: 82 } },
      { method: 'skills.pasteGroup', params: { text: 'Raise Zombie 20/0 1' } },
      { method: 'skills.setMainGroup', params: { index: 1 } },
      { method: 'skills.setGroupFullDPS', params: { index: 1, include: true } },
      { method: 'items.equipUnique', params: { name: 'Belly of the Beast, Explorer Armour' } },
      { method: 'config.set', params: { var: 'multiplierNearbyEnemies', value: 3 } },
    ],
  },
  {
    id: 'integrated-warrior-armour',
    name: 'Warrior armour stack (item+belt+config)',
    steps: [
      { method: 'character.setClass', params: { classId: 6 } },
      { method: 'character.setLevel', params: { level: 92 } },
      { method: 'items.equipUnique', params: { name: 'Belly of the Beast, Explorer Armour' } },
      {
        method: 'items.pasteItem',
        params: { text: 'Rarity: RARE\nGirded Coil\nRawhide Belt\n--------\n+55 to maximum Life\n+25% to all Elemental Resistances\n' },
      },
      { method: 'config.set', params: { var: 'enemyIsBoss', value: 'Pinnacle' } },
      { method: 'config.set', params: { var: 'resistancePenalty', value: -60 } },
    ],
  },
  {
    id: 'integrated-ranger-undo',
    name: 'Ranger build with undo/redo (mutation journal)',
    steps: [
      { method: 'character.setClass', params: { classId: 2 } },
      { method: 'character.setLevel', params: { level: 70 } },
      { method: 'skills.addGroup', params: { label: 'A' } },
      { method: 'skills.addGem', params: { group: 1, nameSpec: 'Fireball', level: 10, quality: 0 } },
      { method: 'skills.setGem', params: { group: 1, index: 1, level: 18 } },
      { method: 'build.undo' }, // revert level 18 -> 10
      { method: 'build.redo' }, // back to 18
      { method: 'skills.setMainGroup', params: { index: 1 } },
      { method: 'skills.setGroupFullDPS', params: { index: 1, include: true } },
    ],
  },
];
for (const s of INTEGRATED) SKILL_SETUPS.push(s);

for (const s of SKILL_SETUPS) {
  SCENARIOS.push({ id: s.id, name: s.name || s.id, steps: s.steps });
}
