// Engine supervisor — spawns and supervises the LuaJIT kernel, brokers
// newline-delimited JSON-RPC over its stdio, and auto-restarts it on crash.
//
// All commands run through a single serialized queue so the engine processes a
// total order (last-write-wins for one user on several devices), and so a
// build-scoped command can guarantee the right build is resident first.

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { EventEmitter } from 'node:events';
import readline from 'node:readline';
import { config, engineEnv } from './config.js';

interface Pending {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

export type EngineEvent = { event: string; data: unknown };

export class Engine extends EventEmitter {
  private proc: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, Pending>();
  private nextId = 1;
  private ready = false;
  private readyWaiters: Array<() => void> = [];
  private queue: Promise<unknown> = Promise.resolve();
  private restartDelay = 250;
  private stopping = false;

  /** Which build id is currently resident in the engine (gateway-tracked). */
  loadedBuildId: string | null = null;

  /** PID of the engine subprocess (for supervision/tests). */
  get pid(): number | undefined {
    return this.proc?.pid;
  }

  start(): void {
    this.spawnProc();
  }

  private spawnProc(): void {
    this.ready = false;
    const proc = spawn(config.luajit, [config.engineScript], {
      cwd: config.engineCwd,
      env: engineEnv(),
    });
    this.proc = proc;
    this.emit('status', 'restarting');

    const rl = readline.createInterface({ input: proc.stdout });
    rl.on('line', (line) => this.onLine(line));
    proc.stderr.on('data', (d) => {
      // Engine diagnostics — surface at debug level, never on stdout.
      process.stderr.write(`[engine] ${d}`);
    });

    proc.on('exit', (code) => {
      this.ready = false;
      this.loadedBuildId = null;
      for (const [, p] of this.pending) p.reject(new Error('engine exited'));
      this.pending.clear();
      this.emit('status', 'down');
      if (this.stopping) return;
      process.stderr.write(`[engine] exited (code ${code}); restarting in ${this.restartDelay}ms\n`);
      setTimeout(() => this.spawnProc(), this.restartDelay);
      this.restartDelay = Math.min(this.restartDelay * 2, 5000);
    });
  }

  private onLine(line: string): void {
    let msg: any;
    try {
      msg = JSON.parse(line);
    } catch {
      return; // ignore non-JSON noise
    }
    if (msg.event === 'ready') {
      this.ready = true;
      this.restartDelay = 250;
      this.emit('status', 'up');
      for (const w of this.readyWaiters) w();
      this.readyWaiters = [];
      return;
    }
    if (msg.event) {
      this.emit('engine-event', { event: msg.event, data: msg.data } as EngineEvent);
      return;
    }
    if (typeof msg.id === 'number') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error || 'engine error'));
    }
  }

  private whenReady(): Promise<void> {
    if (this.ready) return Promise.resolve();
    return new Promise((res) => this.readyWaiters.push(res));
  }

  /** Low-level single call (no queueing). Prefer enqueue() for ordering. */
  private rawCall(method: string, params?: Record<string, unknown>): Promise<unknown> {
    return new Promise((resolve, reject) => {
      if (!this.proc || !this.ready) {
        reject(new Error('engine not ready'));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });
      this.proc.stdout; // noop to keep TS happy about access order
      this.proc.stdin.write(JSON.stringify({ id, method, params: params || {} }) + '\n');
      // Safety timeout so a hung calc can't wedge the queue forever.
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`engine call timed out: ${method}`));
        }
      }, 30000);
    });
  }

  /** Serialized call: waits for readiness and preserves total command order. */
  call(method: string, params?: Record<string, unknown>): Promise<unknown> {
    const run = async () => {
      await this.whenReady();
      return this.rawCall(method, params);
    };
    const result = this.queue.then(run, run);
    // Keep the chain alive even if a call rejects.
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  async stop(): Promise<void> {
    this.stopping = true;
    this.proc?.stdin.end();
    this.proc?.kill('SIGTERM');
  }
}

export const engine = new Engine();
