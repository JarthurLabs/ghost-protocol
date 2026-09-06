import { NEON_RUN } from './musicTrack';

type LoadState = 'loading' | 'ready' | 'unavailable';
type Session = { source: AudioBufferSourceNode; bus: GainNode; origin: number };

// Loading starts only when GhostAudio constructs its player on an audio gesture.
// Reuse the download across instances and the decoded buffer within each context.
let assetBytes: Promise<ArrayBuffer> | null = null;
const decodedTracks = new WeakMap<AudioContext, Promise<AudioBuffer>>();
function loadTrack(context: AudioContext) {
  let decoded = decodedTracks.get(context);
  if (!decoded) {
    assetBytes ??= fetch(NEON_RUN.url).then(response => {
      if (!response.ok) throw new Error('Background music is unavailable');
      return response.arrayBuffer();
    });
    decoded = assetBytes.then(bytes => context.decodeAudioData(bytes.slice(0))).then(buffer => {
      if (!Number.isFinite(buffer.duration) || buffer.duration <= 0) throw new Error('Background music is empty');
      return buffer;
    });
    decodedTracks.set(context, decoded);
  }
  return decoded;
}

/** The approved Neon Run score, rendered once and looped by the audio clock. */
export class HeistMusic {
  private session: Session | null = null;
  private buffer: AudioBuffer | null = null;
  private loadState: LoadState = 'loading';
  private requested = false;
  private position = 0;
  private volume = 0.55;

  constructor(private readonly context: AudioContext, private readonly output: AudioNode) {
    void loadTrack(context).then(buffer => {
      this.buffer = buffer;
      this.loadState = 'ready';
      // Read current intent after loading. A pause or mute must win this race.
      this.playIfReady();
    }).catch(() => {
      this.loadState = 'unavailable';
      // Music loading cannot interrupt movement, menus, or the separate effects.
    });
  }

  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    this.session?.bus.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.04);
  }

  // Preserve the game audio API; the approved arrangement stays the same in pursuit.
  setTension(_tension: boolean) {}

  getDiagnostics() {
    return { track: NEON_RUN.title, loadState: this.loadState, activeSchedulers: 0,
      activeSources: this.session ? 1 : 0, scheduledSteps: 0, loopSeconds: this.loopSeconds,
      positionSeconds: this.session ? this.currentPosition(this.session) : this.position };
  }

  start() {
    this.requested = true;
    this.playIfReady();
  }

  stop() {
    this.requested = false;
    const session = this.session;
    if (!session) return;
    this.position = this.currentPosition(session);
    this.session = null;
    const now = this.context.currentTime;
    // Let the audio clock finish a short fade instead of cutting a waveform.
    // Its ended callback releases this graph without touching a resumed session.
    session.bus.gain.cancelAndHoldAtTime(now);
    session.bus.gain.linearRampToValueAtTime(0, now + 0.02);
    session.source.stop(now + 0.02);
  }

  private get loopSeconds() { return Math.min(NEON_RUN.loopSeconds, this.buffer?.duration ?? NEON_RUN.loopSeconds); }

  private currentPosition(session: Session) {
    return Math.max(0, this.context.currentTime - session.origin) % this.loopSeconds;
  }

  private playIfReady() {
    if (!this.requested || this.session || !this.buffer || this.context.state !== 'running') return;
    const source = this.context.createBufferSource();
    const bus = this.context.createGain();
    source.buffer = this.buffer;
    source.loop = true;
    source.loopStart = 0;
    source.loopEnd = this.loopSeconds;
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.04);
    source.connect(bus).connect(this.output);
    const session = { source, bus, origin: this.context.currentTime - this.position };
    this.session = session;
    source.onended = () => {
      if (this.session === session) this.session = null;
      source.disconnect();
      bus.disconnect();
    };
    source.start(this.context.currentTime, this.position);
  }
}
