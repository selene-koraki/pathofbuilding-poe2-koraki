// Sessions — build-keyed shared sessions (this is what enables cross-device).
//
// A Session exists per *open build id*, not per connection. Every device that
// opens build X subscribes to the same Session: it gets the current state, and
// every later mutation from any device is broadcast as build.updated to all
// subscribers, so laptop/phone/desktop stay in lockstep. The engine processes
// commands in one serialized queue (last-write-wins). Mutations debounce an
// autosave to the shared XML, so a late joiner — even after eviction — loads the
// latest state.

import { config } from './config.js';
import type { Engine } from './engine.js';
import type { Library } from './library.js';
import type { BuildState, PresenceInfo } from '../../shared/dto.js';

export interface Client {
  id: string;
  label: string;
  send(msg: unknown): void;
  subscriptions: Set<string>;
}

const READONLY = new Set([
  'build.getState',
  'build.exportCode',
  'build.save',
  'calcs.getSidebar',
  'calcs.getStat',
  'calcs.getOutput',
  'config.get',
  'config.getSchema',
  'config.getQuestRewards',
  'notes.get',
  'character.getMeta',
]);

function isBuildState(v: unknown): v is BuildState {
  return !!v && typeof v === 'object' && Array.isArray((v as BuildState).sidebar);
}

class Session {
  state: BuildState | null = null;
  subscribers = new Set<Client>();
  dirty = false;
  private autosaveTimer: NodeJS.Timeout | null = null;
  private idleTimer: NodeJS.Timeout | null = null;
  constructor(public id: string) {}

  clearIdle(): void {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }
  armIdle(fn: () => void): void {
    this.clearIdle();
    this.idleTimer = setTimeout(fn, config.sessionIdleMs);
  }
  armAutosave(fn: () => void): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    this.autosaveTimer = setTimeout(fn, config.autosaveMs);
  }
  flushAutosave(): void {
    if (this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
  }
}

export class SessionManager {
  private sessions = new Map<string, Session>();

  constructor(
    private engine: Engine,
    private library: Library,
    private onLibraryChanged: () => void,
  ) {}

  /** Make the engine's resident build == buildId, loading its XML if needed. */
  private async ensureLoaded(buildId: string): Promise<BuildState | null> {
    if (this.engine.loadedBuildId === buildId) return null;
    const xml = await this.library.read(buildId);
    const name = buildId.slice(buildId.lastIndexOf('/') + 1);
    const state = (await this.engine.call('build.load', { id: buildId, xml, name })) as BuildState;
    this.engine.loadedBuildId = buildId;
    return state;
  }

  private get(buildId: string): Session {
    let s = this.sessions.get(buildId);
    if (!s) {
      s = new Session(buildId);
      this.sessions.set(buildId, s);
    }
    return s;
  }

  /** Subscribe a device to a build's session; returns current live state. */
  async open(client: Client, buildId: string): Promise<BuildState> {
    const session = this.get(buildId);
    session.clearIdle();
    const loaded = await this.ensureLoaded(buildId);
    if (loaded) session.state = loaded;
    if (!session.state) {
      session.state = (await this.engine.call('build.getState')) as BuildState;
    }
    session.subscribers.add(client);
    client.subscriptions.add(buildId);
    this.broadcastPresence(buildId);
    return session.state;
  }

  /** Unsubscribe a device; evict the session after an idle grace period. */
  close(client: Client, buildId: string): void {
    const session = this.sessions.get(buildId);
    if (!session) return;
    session.subscribers.delete(client);
    client.subscriptions.delete(buildId);
    this.broadcastPresence(buildId);
    if (session.subscribers.size === 0) {
      // Flush pending autosave immediately, then arm idle eviction.
      void this.autosaveNow(buildId);
      session.armIdle(() => {
        this.sessions.delete(buildId);
      });
    }
  }

  closeClient(client: Client): void {
    for (const id of [...client.subscriptions]) this.close(client, id);
  }

  /** Run a build-scoped command; broadcast + autosave if it mutated state. */
  async command(
    buildId: string,
    method: string,
    params: Record<string, unknown> | undefined,
  ): Promise<unknown> {
    await this.ensureLoaded(buildId);
    const result = await this.engine.call(method, params);
    if (!READONLY.has(method) && isBuildState(result)) {
      const session = this.get(buildId);
      session.state = result;
      session.dirty = true;
      this.broadcast(buildId, { type: 'event', event: 'build.updated', data: result });
      session.armAutosave(() => void this.autosaveNow(buildId));
    }
    return result;
  }

  private async autosaveNow(buildId: string): Promise<void> {
    const session = this.sessions.get(buildId);
    if (!session || !session.dirty) return;
    session.flushAutosave();
    session.dirty = false;
    try {
      await this.ensureLoaded(buildId);
      const name = buildId.slice(buildId.lastIndexOf('/') + 1);
      const res = (await this.engine.call('build.save', { name })) as { xml: string };
      await this.library.write(buildId, res.xml);
      if (session.state) await this.library.cacheMeta(buildId, session.state);
      this.onLibraryChanged();
    } catch (e) {
      process.stderr.write(`[session] autosave failed for ${buildId}: ${(e as Error).message}\n`);
      session.dirty = true; // retry on next change
    }
  }

  broadcast(buildId: string, msg: unknown): void {
    const session = this.sessions.get(buildId);
    if (!session) return;
    for (const c of session.subscribers) c.send(msg);
  }

  presence(buildId: string): PresenceInfo {
    const session = this.sessions.get(buildId);
    const devices = session
      ? [...session.subscribers].map((c) => ({ id: c.id, label: c.label }))
      : [];
    return { buildId, devices };
  }

  private broadcastPresence(buildId: string): void {
    this.broadcast(buildId, { type: 'event', event: 'presence', data: this.presence(buildId) });
  }

  /** Flush every dirty session (used on shutdown). */
  async flushAll(): Promise<void> {
    await Promise.all([...this.sessions.keys()].map((id) => this.autosaveNow(id)));
  }
}
