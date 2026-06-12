// Global app store (Zustand). Holds connection status, the build library, the
// open build's live state, config schema, class catalogue, and presence. The
// engine is authoritative: mutations echo back as build.updated and reconcile
// here, so multiple devices converge.
import { create } from 'zustand';
import { client } from '../api/client';
import type {
  BuildState,
  BuildSummary,
  PresenceInfo,
  ConfigSchema,
  ClassCatalogue,
  UniqueSummary,
  ItemDetail,
  ItemSetInfo,
  TreeData,
} from '../../../shared/dto';

export type TabId = 'build' | 'tree' | 'skills' | 'items' | 'calcs' | 'config' | 'notes';

interface AppState {
  connected: boolean;
  builds: BuildSummary[];
  activeId: string | null;
  build: BuildState | null;
  presence: PresenceInfo | null;
  loading: boolean;
  error: string | null;
  tab: TabId;
  configSchema: ConfigSchema | null;
  classes: ClassCatalogue | null;
  notes: string;

  init: () => void;
  setTab: (t: TabId) => void;
  refreshLibrary: () => Promise<void>;
  openBuild: (id: string) => Promise<void>;
  newBuild: (name: string) => Promise<void>;
  importCode: (code: string, name: string) => Promise<void>;
  duplicate: (id: string, name?: string) => Promise<void>;
  rename: (id: string, name: string) => Promise<void>;
  del: (id: string) => Promise<void>;
  favorite: (id: string, fav: boolean) => Promise<void>;
  command: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
  setConfig: (varName: string, value: unknown) => Promise<void>;
  setClass: (classId: number) => Promise<void>;
  setAscendancy: (ascendClassId: number) => Promise<void>;
  setLevel: (level: number) => Promise<void>;
  setMainGroup: (index: number) => Promise<void>;
  setMainSkill: (group: number, skillIndex: number) => Promise<void>;
  saveNotes: (text: string) => Promise<void>;
  // Skills
  addGroup: (label?: string) => Promise<void>;
  removeGroup: (index: number) => Promise<void>;
  renameGroup: (index: number, label: string) => Promise<void>;
  setGroupEnabled: (index: number, enabled: boolean) => Promise<void>;
  setGroupFullDPS: (index: number, include: boolean) => Promise<void>;
  addGem: (group: number, nameSpec: string) => Promise<void>;
  setGem: (group: number, index: number, patch: Record<string, unknown>) => Promise<void>;
  removeGem: (group: number, index: number) => Promise<void>;
  pasteGroup: (text: string) => Promise<void>;
  searchGems: (q: string) => Promise<Array<{ name: string; support: boolean }>>;
  // Items
  pasteItem: (text: string, slot?: string) => Promise<void>;
  unequip: (slot: string) => Promise<void>;
  setSlotActive: (slot: string, active: boolean) => Promise<void>;
  searchUniques: (q: string, slot?: string) => Promise<UniqueSummary[]>;
  equipUnique: (name: string, slot?: string) => Promise<void>;
  getItemDetail: (id: number) => Promise<ItemDetail>;
  itemSets: () => Promise<{ sets: ItemSetInfo[]; activeId: number }>;
  setActiveSet: (id: number) => Promise<void>;
  newItemSet: (title: string) => Promise<void>;
  // Calcs
  getFullOutput: () => Promise<Record<string, number>>;
  getBreakdown: (stat: string) => Promise<BreakdownDetail>;
  compare: (
    steps: Array<{ method: string; params?: Record<string, unknown> }>,
    stats?: string[],
  ) => Promise<Array<{ stat: string; before: number; after: number; delta: number }>>;
  // Tree
  getTreeData: () => Promise<TreeData>;
  allocNode: (id: number) => Promise<void>;
  deallocNode: (id: number) => Promise<void>;
  previewPath: (id: number) => Promise<{ path: number[]; cost: number }>;
  getTreeNode: (id: number) => Promise<{ id: number; name: string; type: string; stats: string[]; alloc: boolean }>;
  searchTree: (q: string) => Promise<number[]>;
  treePower: () => Promise<{ power: Record<string, { offence: number; defence: number }>; maxOffence: number; maxDefence: number }>;
  listSpecs: () => Promise<{ specs: Array<{ index: number; title: string; version: string }>; active: number }>;
  selectSpec: (index: number) => Promise<void>;
  setAllocMode: (mode: number) => Promise<void>;
}

export interface BreakdownDetail {
  stat: string;
  lines: string[];
  columns: string[];
  rows: string[][];
}

export const useStore = create<AppState>((set, get) => ({
  connected: false,
  builds: [],
  activeId: null,
  build: null,
  presence: null,
  loading: false,
  error: null,
  tab: 'build',
  configSchema: null,
  classes: null,
  notes: '',

  init: () => {
    client.onStatus = (connected) => set({ connected });
    client.on('build.updated', (data) => {
      const s = data as BuildState;
      if (s.id === get().activeId) set({ build: s });
    });
    client.on('library.changed', (data) =>
      set({ builds: (data as { builds: BuildSummary[] }).builds }),
    );
    client.on('presence', (data) => {
      const p = data as PresenceInfo;
      if (p.buildId === get().activeId) set({ presence: p });
    });
    client.on('reconnect', () => {
      void get().refreshLibrary();
      const id = get().activeId;
      if (id) void get().openBuild(id);
    });
    client.connect();
    // Config schema is static — fetch once.
    void client
      .request<ConfigSchema>('config.getSchema')
      .then((schema) => set({ configSchema: schema }))
      .catch(() => undefined);
  },

  setTab: (t) => set({ tab: t }),

  refreshLibrary: async () => {
    try {
      const res = await client.request<{ builds: BuildSummary[] }>('library.list');
      set({ builds: res.builds });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  openBuild: async (id) => {
    set({ loading: true, error: null, activeId: id, tab: 'build' });
    try {
      const state = await client.request<BuildState>('library.open', { id });
      set({ build: state, loading: false });
      const [classes, notes] = await Promise.all([
        client.request<ClassCatalogue>('character.getClasses', { buildId: id }),
        client.request<{ text: string }>('notes.get', { buildId: id }),
      ]);
      set({ classes, notes: notes.text });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  newBuild: async (name) => {
    const res = await client.request<{ id: string }>('library.new', { name });
    await get().refreshLibrary();
    await get().openBuild(res.id);
  },

  importCode: async (code, name) => {
    const res = await client.request<{ id: string }>('library.importCode', { code, name });
    await get().refreshLibrary();
    await get().openBuild(res.id);
  },

  duplicate: async (id, name) => {
    await client.request('library.duplicate', { id, name });
    await get().refreshLibrary();
  },
  rename: async (id, name) => {
    const res = await client.request<{ id: string }>('library.rename', { id, name });
    if (get().activeId === id) set({ activeId: res.id });
    await get().refreshLibrary();
  },
  del: async (id) => {
    await client.request('library.delete', { id });
    if (get().activeId === id) set({ activeId: null, build: null });
    await get().refreshLibrary();
  },
  favorite: async (id, fav) => {
    await client.request('library.favorite', { id, favorite: fav });
    await get().refreshLibrary();
  },

  command: async (method, params) => {
    const id = get().activeId;
    const result = await client.request(method, { buildId: id, ...params });
    // Mutations return the new state; apply immediately (build.updated also echoes).
    if (result && typeof result === 'object' && 'sidebar' in (result as object)) {
      set({ build: result as BuildState });
    }
    return result;
  },

  setConfig: async (varName, value) => {
    await get().command('config.set', { var: varName, value });
  },
  setClass: async (classId) => {
    await get().command('character.setClass', { classId });
    const cat = await client.request<ClassCatalogue>('character.getClasses', {
      buildId: get().activeId,
    });
    set({ classes: cat });
  },
  setAscendancy: async (ascendClassId) => {
    await get().command('character.setAscendancy', { ascendClassId });
    const cat = await client.request<ClassCatalogue>('character.getClasses', {
      buildId: get().activeId,
    });
    set({ classes: cat });
  },
  setLevel: async (level) => {
    await get().command('character.setLevel', { level });
  },
  setMainGroup: async (index) => {
    await get().command('skills.setMainGroup', { index });
  },
  setMainSkill: async (group, skillIndex) => {
    await get().command('skills.setMainSkill', { group, skillIndex });
  },
  saveNotes: async (text) => {
    set({ notes: text });
    await client.request('notes.set', { buildId: get().activeId, text });
  },

  addGroup: async (label) => {
    await get().command('skills.addGroup', { label });
  },
  removeGroup: async (index) => {
    await get().command('skills.removeGroup', { index });
  },
  renameGroup: async (index, label) => {
    await get().command('skills.renameGroup', { index, label });
  },
  setGroupEnabled: async (index, enabled) => {
    await get().command('skills.setGroupEnabled', { index, enabled });
  },
  setGroupFullDPS: async (index, include) => {
    await get().command('skills.setGroupFullDPS', { index, include });
  },
  addGem: async (group, nameSpec) => {
    await get().command('skills.addGem', { group, nameSpec });
  },
  setGem: async (group, index, patch) => {
    await get().command('skills.setGem', { group, index, ...patch });
  },
  removeGem: async (group, index) => {
    await get().command('skills.removeGem', { group, index });
  },
  pasteGroup: async (text) => {
    await get().command('skills.pasteGroup', { text });
  },
  searchGems: async (q) => {
    const res = await client.request<{ gems: Array<{ name: string; support: boolean }> }>(
      'skills.searchGems',
      { buildId: get().activeId, q },
    );
    return res.gems;
  },

  pasteItem: async (text, slot) => {
    await get().command('items.pasteItem', { text, slot });
  },
  unequip: async (slot) => {
    await get().command('items.unequip', { slot });
  },
  setSlotActive: async (slot, active) => {
    await get().command('items.setSlotActive', { slot, active });
  },
  searchUniques: async (q, slot) => {
    const res = await client.request<{ uniques: UniqueSummary[] }>('items.searchUniques', {
      buildId: get().activeId,
      q,
      slot,
    });
    return res.uniques;
  },
  equipUnique: async (name, slot) => {
    await get().command('items.equipUnique', { name, slot });
  },
  getItemDetail: async (id) => {
    return client.request<ItemDetail>('items.getItem', { buildId: get().activeId, id });
  },
  itemSets: async () => {
    return client.request<{ sets: ItemSetInfo[]; activeId: number }>('items.listSets', {
      buildId: get().activeId,
    });
  },
  setActiveSet: async (id) => {
    await get().command('items.setActiveSet', { id });
  },
  newItemSet: async (title) => {
    await client.request('items.newSet', { buildId: get().activeId, title });
  },

  getFullOutput: async () => {
    return client.request<Record<string, number>>('calcs.getOutput', { buildId: get().activeId });
  },
  getBreakdown: async (stat) => {
    return client.request<BreakdownDetail>('calcs.getBreakdown', { buildId: get().activeId, stat });
  },
  compare: async (steps, stats) => {
    const res = await client.request<{
      deltas: Array<{ stat: string; before: number; after: number; delta: number }>;
    }>('calcs.compare', { buildId: get().activeId, steps, stats });
    return res.deltas;
  },

  getTreeData: async () => {
    return client.request<TreeData>('tree.getData', { buildId: get().activeId });
  },
  allocNode: async (id) => {
    await get().command('tree.allocNode', { id });
  },
  deallocNode: async (id) => {
    await get().command('tree.deallocNode', { id });
  },
  previewPath: async (id) => {
    return client.request<{ path: number[]; cost: number }>('tree.previewPath', {
      buildId: get().activeId,
      id,
    });
  },
  getTreeNode: async (id) => {
    return client.request('tree.getNode', { buildId: get().activeId, id });
  },
  searchTree: async (q) => {
    const res = await client.request<{ ids: number[] }>('tree.search', {
      buildId: get().activeId,
      q,
    });
    return res.ids;
  },
  treePower: async () => {
    return client.request('tree.power', { buildId: get().activeId });
  },
  listSpecs: async () => {
    return client.request('tree.listSpecs', { buildId: get().activeId });
  },
  selectSpec: async (index) => {
    await get().command('tree.selectSpec', { index });
  },
  setAllocMode: async (mode) => {
    await get().command('tree.setAllocMode', { mode });
  },
}));
