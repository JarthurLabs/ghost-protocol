export interface GameTransport { type: string; controllerAvailable?: boolean }

/** A reload waits for its old socket to release ownership before opening a new one. */
export async function discoverTransport(signal: AbortSignal, request: typeof fetch = fetch): Promise<GameTransport> {
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let waitingForController = false;
  const timeout = setTimeout(() => controller.abort(Error(waitingForController
    ? 'Another game connection is still active. Close other game tabs and reconnect.'
    : 'The game connection timed out. Reconnect to try again.')), 4000);
  try {
    for (;;) {
      controller.signal.throwIfAborted();
      const response = await request('/api/transport', { credentials: 'same-origin', cache: 'no-store', signal: controller.signal });
      if (!response.ok && response.status !== 404) throw Error('The game connection is unavailable. Reconnect to try again.');
      const transport: GameTransport = response.ok ? await response.json() : { type: 'http' };
      if (transport.type !== 'websocket' || transport.controllerAvailable !== false) return transport;
      waitingForController = true;
      await new Promise<void>((resolve, reject) => {
        const cancelled = () => { clearTimeout(timer); reject(controller.signal.reason); };
        const timer = setTimeout(() => { controller.signal.removeEventListener('abort', cancelled); resolve(); }, 150);
        controller.signal.addEventListener('abort', cancelled, { once: true });
        if (controller.signal.aborted) cancelled();
      });
    }
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener('abort', abort);
  }
}
