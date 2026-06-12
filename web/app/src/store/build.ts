// Global app store (Zustand). Holds connection status, the build library, the
// open build's live state, and presence. The engine is authoritative: every
// mutation echoes back as build.updated and reconciles here, so multiple devices
// converge. Optimistic UI is layered per-tab on top of this.
import { create } from 'zustand';
import { client } from '../api/client';
import type { BuildState, BuildSummary, PresenceInfo } from '../../../shared/dto';

interface AppState {
  connected: boolean;
  builds: BuildSummary[];
  activeId: string | null;
  build: BuildState | null;
  presence: PresenceInfo | null;
  loading: boolean;
  error: string | null;

  init: () => void;
  refreshLibrary: () => Promise<void>;
  openBuild: (id: string) => Promise<void>;
  newBuild: (name: string) => Promise<void>;
  command: (method: string, params?: Record<string, unknown>) => Promise<unknown>;
}

export const useStore = create<AppState>((set, get) => ({
  connected: false,
  builds: [],
  activeId: null,
  build: null,
  presence: null,
  loading: false,
  error: null,

  init: () => {
    client.onStatus = (connected) => set({ connected });
    client.on('build.updated', (data) => {
      const s = data as BuildState;
      if (s.id === get().activeId) set({ build: s });
    });
    client.on('library.changed', (data) => {
      set({ builds: (data as { builds: BuildSummary[] }).builds });
    });
    client.on('presence', (data) => {
      const p = data as PresenceInfo;
      if (p.buildId === get().activeId) set({ presence: p });
    });
    // On (re)connect: refresh library and re-open the active build to reconcile.
    client.on('reconnect', () => {
      void get().refreshLibrary();
      const id = get().activeId;
      if (id) void get().openBuild(id);
    });
    client.connect();
  },

  refreshLibrary: async () => {
    try {
      const res = await client.request<{ builds: BuildSummary[] }>('library.list');
      set({ builds: res.builds });
    } catch (e) {
      set({ error: (e as Error).message });
    }
  },

  openBuild: async (id) => {
    set({ loading: true, error: null, activeId: id });
    try {
      const state = await client.request<BuildState>('library.open', { id });
      set({ build: state, loading: false });
      void client.request<PresenceInfo>('library.list'); // warm
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  newBuild: async (name) => {
    const res = await client.request<{ id: string }>('library.new', { name });
    await get().refreshLibrary();
    await get().openBuild(res.id);
  },

  command: async (method, params) => {
    const id = get().activeId;
    const result = await client.request(method, { buildId: id, ...params });
    // Mutations echo build.updated; readonly results are returned to the caller.
    return result;
  },
}));
