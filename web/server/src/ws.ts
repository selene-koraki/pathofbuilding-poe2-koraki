// WebSocket router — the browser-facing boundary. Wraps each connection as a
// Client, routes library.* to the gateway-owned Library and everything else to
// the build session, and fans out events (build.updated, library.changed,
// presence) to subscribers.

import { WebSocketServer, WebSocket } from 'ws';
import type { Server } from 'node:http';
import type { Engine } from './engine.js';
import type { Library } from './library.js';
import { SessionManager, type Client } from './sessions.js';

interface WsClient extends Client {
  ws: WebSocket;
  activeBuildId: string | null;
}

let clientSeq = 1;

export function attachWebSocket(server: Server, engine: Engine, library: Library): SessionManager {
  const clients = new Set<WsClient>();

  const broadcastLibraryChanged = () => {
    void library.list().then((builds) => {
      const msg = JSON.stringify({ type: 'event', event: 'library.changed', data: { builds } });
      for (const c of clients) if (c.ws.readyState === WebSocket.OPEN) c.ws.send(msg);
    });
  };

  const sessions = new SessionManager(engine, library, broadcastLibraryChanged);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws) => {
    const client: WsClient = {
      id: `c${clientSeq++}`,
      label: 'device',
      ws,
      subscriptions: new Set(),
      activeBuildId: null,
      send: (msg: unknown) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
      },
    };
    clients.add(client);

    ws.on('message', (raw) => void handleMessage(client, raw.toString()));
    ws.on('close', () => {
      sessions.closeClient(client);
      clients.delete(client);
    });
    ws.on('error', () => undefined);
  });

  async function handleMessage(client: WsClient, raw: string): Promise<void> {
    let msg: any;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === 'hello') {
      client.label = msg.device?.label || client.label;
      if (msg.device?.id) client.id = msg.device.id;
      return;
    }
    const { id, method, params } = msg as { id: number; method: string; params?: any };
    try {
      const result = await route(client, method, params);
      client.send({ type: 'response', id, ok: true, result });
    } catch (e) {
      client.send({ type: 'response', id, ok: false, error: (e as Error).message });
    }
  }

  async function route(client: WsClient, method: string, params: any): Promise<unknown> {
    // ----- Library (gateway-owned) -----
    switch (method) {
      case 'library.list':
        return { builds: await library.list() };
      case 'library.listFolders':
        return { folders: await library.listFolders() };
      case 'library.open': {
        const state = await sessions.open(client, params.id);
        client.activeBuildId = params.id;
        return state;
      }
      case 'library.close':
        sessions.close(client, params.id);
        if (client.activeBuildId === params.id) client.activeBuildId = null;
        return { ok: true };
      case 'library.new': {
        const newId = await library.create(params.name || 'Unnamed', params.folder || '');
        broadcastLibraryChanged();
        return { id: newId, builds: await library.list() };
      }
      case 'library.importCode': {
        const newId = await library.importCode(params.code, params.name || 'Imported', params.folder || '');
        broadcastLibraryChanged();
        return { id: newId };
      }
      case 'library.duplicate': {
        const newId = await library.duplicate(params.id, params.name);
        broadcastLibraryChanged();
        return { id: newId };
      }
      case 'library.rename': {
        const newId = await library.rename(params.id, params.name);
        broadcastLibraryChanged();
        return { id: newId };
      }
      case 'library.move': {
        const newId = await library.move(params.id, params.folder || '');
        broadcastLibraryChanged();
        return { id: newId };
      }
      case 'library.delete':
        await library.remove(params.id);
        broadcastLibraryChanged();
        return { ok: true };
      case 'library.favorite':
        await library.setFavorite(params.id, !!params.favorite);
        broadcastLibraryChanged();
        return { ok: true };
    }

    // ----- Build-scoped (engine-owned, routed through the session) -----
    const buildId = params?.buildId || client.activeBuildId;
    if (!buildId) throw new Error(`no open build for ${method}`);
    return sessions.command(buildId, method, params);
  }

  return sessions;
}
