// Gateway entry point — boots the engine, library, HTTP+WS server, and wires
// graceful shutdown (flush autosaves).
import http from 'node:http';
import { config } from './config.js';
import { engine } from './engine.js';
import { Library } from './library.js';
import { attachWebSocket } from './ws.js';
import { serveStatic } from './static.js';

async function main(): Promise<void> {
  engine.start();
  engine.on('status', (s: string) => process.stderr.write(`[gateway] engine ${s}\n`));

  const library = new Library(engine);
  await library.init();

  const server = http.createServer(serveStatic);
  const sessions = attachWebSocket(server, engine, library);

  // Relay engine-originated events (e.g. progress/error) is handled per-session;
  // engine up/down is surfaced to every client through the ws layer broadcast.
  engine.on('status', (status: string) => {
    // no global client list here; the ws layer owns clients. A future hook could
    // broadcast {event:'engine'} — for v1 the reconnect/queue handles recovery.
    void status;
  });

  server.listen(config.port, config.host, () => {
    process.stderr.write(
      `[gateway] PoB2 web on http://${config.host}:${config.port}  (builds: ${config.buildDir})\n`,
    );
  });

  const shutdown = async () => {
    process.stderr.write('[gateway] shutting down; flushing autosaves\n');
    await sessions.flushAll();
    await engine.stop();
    server.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  process.stderr.write(`[gateway] fatal: ${e?.stack || e}\n`);
  process.exit(1);
});
