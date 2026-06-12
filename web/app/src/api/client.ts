// Typed WebSocket client to the gateway. Auto-reconnects with backoff, correlates
// requests to responses by id, and dispatches server events to subscribers. The
// same message schema would carry over postMessage to a WASM engine later.
import type { ServerMessage } from '../../../shared/rpc';

type EventName = Extract<ServerMessage, { type: 'event' }>['event'];
type EventHandler = (data: unknown) => void;

interface PendingCall {
  resolve: (v: unknown) => void;
  reject: (e: Error) => void;
}

function deviceIdentity(): { id: string; label: string } {
  let id = localStorage.getItem('pob-device-id');
  if (!id) {
    id = 'dev-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('pob-device-id', id);
  }
  const ua = navigator.userAgent;
  let label = 'Browser';
  if (/iPhone|iPad/.test(ua)) label = 'iPhone';
  else if (/Android/.test(ua)) label = 'Android';
  else if (/Macintosh/.test(ua)) label = 'Mac';
  else if (/Windows/.test(ua)) label = 'Windows';
  else if (/Linux/.test(ua)) label = 'Linux';
  return { id, label };
}

export class GatewayClient {
  private ws: WebSocket | null = null;
  private url: string;
  private nextId = 1;
  private pending = new Map<number, PendingCall>();
  private handlers = new Map<string, Set<EventHandler>>();
  private backoff = 300;
  private connected = false;
  private queue: string[] = [];
  device = deviceIdentity();

  onStatus: (connected: boolean) => void = () => undefined;

  constructor(url?: string) {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.url = url || `${proto}://${location.host}/ws`;
  }

  connect(): void {
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.connected = true;
      this.backoff = 300;
      ws.send(JSON.stringify({ type: 'hello', device: this.device }));
      for (const m of this.queue) ws.send(m);
      this.queue = [];
      this.onStatus(true);
      this.emit('reconnect', undefined);
    };
    ws.onmessage = (ev) => this.onMessage(JSON.parse(ev.data) as ServerMessage);
    ws.onclose = () => {
      this.connected = false;
      this.onStatus(false);
      for (const [, p] of this.pending) p.reject(new Error('disconnected'));
      this.pending.clear();
      setTimeout(() => this.connect(), this.backoff);
      this.backoff = Math.min(this.backoff * 2, 5000);
    };
    ws.onerror = () => ws.close();
  }

  private onMessage(msg: ServerMessage): void {
    if (msg.type === 'response') {
      const p = this.pending.get(msg.id);
      if (!p) return;
      this.pending.delete(msg.id);
      if (msg.ok) p.resolve(msg.result);
      else p.reject(new Error(msg.error || 'error'));
    } else if (msg.type === 'event') {
      this.emit(msg.event, msg.data);
    }
  }

  private emit(event: string, data: unknown): void {
    const set = this.handlers.get(event);
    if (set) for (const h of set) h(data);
  }

  /** Subscribe to a server event (build.updated, library.changed, presence...). */
  on(event: EventName | 'reconnect', handler: EventHandler): () => void {
    let set = this.handlers.get(event);
    if (!set) {
      set = new Set();
      this.handlers.set(event, set);
    }
    set.add(handler);
    return () => set!.delete(handler);
  }

  /** Send a request and await its response. */
  request<T = unknown>(method: string, params?: Record<string, unknown>): Promise<T> {
    const id = this.nextId++;
    const payload = JSON.stringify({ type: 'request', id, method, params });
    return new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
      if (this.connected && this.ws) this.ws.send(payload);
      else this.queue.push(payload);
    });
  }

  isConnected(): boolean {
    return this.connected;
  }
}

export const client = new GatewayClient();
