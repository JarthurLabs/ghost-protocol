import test from 'node:test';
import assert from 'node:assert/strict';

// Web Audio is browser-owned. These doubles expose the sources the player sends
// to that boundary; the transport and all asynchronous intent remain real code.
class AudioParamStub {
  value = 1;
  heldAt: number | null = null;
  ramp: [number, number] | null = null;
  setTargetAtTime(value: number) { this.value = value; }
  setValueAtTime(value: number) { this.value = value; }
  cancelScheduledValues() {}
  cancelAndHoldAtTime(at: number) { this.heldAt = at; }
  linearRampToValueAtTime(value: number, at: number) { this.ramp = [value, at]; }
}
class NodeStub {
  connected = false;
  connect(node: unknown) { this.connected = true; return node; }
  disconnect() { this.connected = false; }
}
class SourceStub extends NodeStub {
  buffer: AudioBuffer | null = null;
  loop = false;
  loopStart = 0;
  loopEnd = 0;
  onended: (() => void) | null = null;
  started: [number, number] | null = null;
  stopped = false;
  stopAt: number | null = null;
  start(at = 0, offset = 0) { this.started = [at, offset]; }
  stop(at = 0) { this.stopped = true; this.stopAt = at; }
}
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const decodedBuffer = { duration: 31.02, sampleRate: 48000, length: 1488960 } as AudioBuffer;
class ContextStub {
  state = 'running';
  currentTime = 0;
  sampleRate = 48000;
  sources: SourceStub[] = [];
  gains: (NodeStub & { gain: AudioParamStub })[] = [];
  decode = deferred<AudioBuffer>();
  decodeCalls = 0;
  createGain() {
    const gain = Object.assign(new NodeStub(), { gain: new AudioParamStub() });
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() { const source = new SourceStub(); this.sources.push(source); return source; }
  decodeAudioData() { this.decodeCalls++; return this.decode.promise; }
}
const flush = async () => { for (let i = 0; i < 4; i++) await new Promise(resolve => setImmediate(resolve)); };
let moduleNumber = 0;
const freshMusic = () => import(`../src/music.ts?music-test=${moduleNumber++}`);

test('pausing before the music finishes loading cannot start sound later', async t => {
  const response = deferred<Response>();
  t.mock.method(globalThis, 'fetch', () => response.promise);
  const { HeistMusic } = await freshMusic();
  const context = new ContextStub();
  const music = new HeistMusic(context as unknown as AudioContext, new NodeStub() as unknown as AudioNode);
  assert.equal(music.getDiagnostics().loadState, 'loading');
  music.start();
  music.stop();
  response.resolve(new Response(new Uint8Array([1, 2, 3])));
  await flush();
  context.decode.resolve(decodedBuffer);
  await flush();
  assert.equal(music.getDiagnostics().loadState, 'ready');
  assert.equal(context.sources.length, 0, 'A completed download must respect the latest pause intent');
  assert.equal(music.getDiagnostics().activeSources, 0);
});

test('repeated start and unlock during loading create one looping source', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response(new Uint8Array([1])); });
  const { HeistMusic } = await freshMusic();
  const context = new ContextStub();
  const music = new HeistMusic(context as unknown as AudioContext, new NodeStub() as unknown as AudioNode);
  assert.equal(music.getDiagnostics().loadState, 'loading');
  for (let i = 0; i < 8; i++) music.start();
  await flush();
  assert.equal(context.sources.length, 0);
  context.decode.resolve(decodedBuffer);
  await flush();
  for (let i = 0; i < 8; i++) music.start();
  assert.equal(requests, 1);
  assert.equal(context.sources.length, 1, 'Unlocks must not layer copies of the song');
  assert.equal(context.sources[0].loop, true);
  assert.equal(context.sources[0].loopStart, 0);
  assert(Math.abs(context.sources[0].loopEnd - 30.96774) < 0.0001, 'Skip encoder padding at the sixteen-bar boundary');
  assert.equal(music.getDiagnostics().activeSchedulers, 0, 'A buffer loop needs no interval scheduler');
  assert.equal(music.getDiagnostics().activeSources, 1);
  music.stop();
});

test('pause fades out on the audio clock and resume preserves position before the old graph ends', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
  const { HeistMusic } = await freshMusic();
  const context = new ContextStub();
  context.currentTime = 10;
  const music = new HeistMusic(context as unknown as AudioContext, new NodeStub() as unknown as AudioNode);
  assert.equal(music.getDiagnostics().loadState, 'loading');
  music.start();
  context.decode.resolve(decodedBuffer);
  await flush();
  context.currentTime = 16.25;
  const oldEndedCallback = context.sources[0].onended;
  music.stop();
  const previous = context.sources[0];
  assert.equal(previous.stopped, true);
  assert.equal(music.getDiagnostics().activeSources, 0, 'Paused intent takes effect before the fade finishes');
  assert.equal(context.gains[0].gain.heldAt, 16.25);
  assert.deepEqual(context.gains[0].gain.ramp, [0, 16.27]);
  assert.equal(previous.stopAt, 16.27, 'The source must play through the twenty-millisecond fade');
  assert.equal(previous.connected, true);
  assert.equal(context.gains[0].connected, true);
  assert.equal(music.getDiagnostics().positionSeconds, 6.25);
  context.currentTime = 50;
  music.start();
  assert.deepEqual(context.sources[1].started, [50, 6.25]);
  oldEndedCallback?.();
  assert.equal(previous.connected, false, 'The ended callback releases the fading source');
  assert.equal(context.gains[0].connected, false);
  assert.equal(music.getDiagnostics().activeSources, 1, 'An old ended callback cannot clear the resumed source');
  context.currentTime = 82;
  music.stop();
  assert(Math.abs(music.getDiagnostics().positionSeconds - 7.28226) < 0.0001);
  music.stop();
  assert.equal(music.getDiagnostics().activeSources, 0);
});

test('suspended contexts stay quiet when decoding completes and resume on the next start', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
  const { HeistMusic } = await freshMusic();
  const context = new ContextStub();
  const music = new HeistMusic(context as unknown as AudioContext, new NodeStub() as unknown as AudioNode);
  assert.equal(music.getDiagnostics().loadState, 'loading');
  music.start();
  context.state = 'suspended';
  context.decode.resolve(decodedBuffer);
  await flush();
  assert.equal(context.sources.length, 0);
  context.state = 'running';
  music.start();
  assert.equal(context.sources.length, 1);
  music.stop();
});

test('stop, start, stop while decoding uses the final intent without a stale callback', async t => {
  t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1])));
  const { HeistMusic } = await freshMusic();
  const context = new ContextStub();
  const music = new HeistMusic(context as unknown as AudioContext, new NodeStub() as unknown as AudioNode);
  assert.equal(music.getDiagnostics().loadState, 'loading');
  music.start(); music.stop(); music.start(); music.stop();
  context.decode.resolve(decodedBuffer);
  await flush();
  assert.equal(context.sources.length, 0);
  music.start();
  assert.equal(context.sources.length, 1);
  music.stop();
});

test('missing or undecodable music remains silent without interrupting play', async t => {
  for (const failure of ['http', 'decode'] as const) {
    t.mock.method(globalThis, 'fetch', async () => new Response(new Uint8Array([1]), { status: failure === 'http' ? 404 : 200 }));
    const { HeistMusic } = await freshMusic();
    const context = new ContextStub();
    const music = new HeistMusic(context as unknown as AudioContext, new NodeStub() as unknown as AudioNode);
    assert.equal(music.getDiagnostics().loadState, 'loading');
    music.start();
    await flush();
    if (failure === 'decode') context.decode.reject(new Error('Unsupported audio'));
    await flush();
    assert.equal(music.getDiagnostics().loadState, 'unavailable');
    assert.doesNotThrow(() => { music.start(); music.stop(); music.setVolume(0.4); });
    assert.equal(context.sources.length, 0);
    t.mock.restoreAll();
  }
});

test('instances share one asset request and decode only once per audio context', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async () => { requests++; return new Response(new Uint8Array([1])); });
  const { HeistMusic } = await freshMusic();
  const context = new ContextStub();
  const first = new HeistMusic(context as unknown as AudioContext, new NodeStub() as unknown as AudioNode);
  assert.equal(first.getDiagnostics().loadState, 'loading');
  const second = new HeistMusic(context as unknown as AudioContext, new NodeStub() as unknown as AudioNode);
  const anotherContext = new ContextStub();
  const third = new HeistMusic(anotherContext as unknown as AudioContext, new NodeStub() as unknown as AudioNode);
  await flush();
  context.decode.resolve(decodedBuffer);
  anotherContext.decode.resolve(decodedBuffer);
  await flush();
  assert.equal(requests, 1, 'The song is downloaded once per page');
  assert.equal(context.decodeCalls, 1);
  assert.equal(anotherContext.decodeCalls, 1);
  first.start(); first.stop(); second.start(); second.stop(); third.start(); third.stop();
});
