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
} from '../../../shared/dto';

export type TabId = 'build' | 'config' | 'notes';

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
}));
