/** Original score, composed for Ghost Protocol. MIDI notes; no samples or services. */
const BPM = 92;
const EIGHTH = 60 / BPM / 2;
const LOOP_STEPS = 16 * 8;
const CHORDS = [
  { bass: 33, notes: [55, 60, 64, 71] }, // Am9
  { bass: 29, notes: [57, 60, 64, 69] }, // Fmaj7, root in the bass
  { bass: 36, notes: [55, 59, 62, 64] }, // Cmaj9
  { bass: 31, notes: [55, 59, 62, 64] }, // G6
] as const;

// Two deliberately phrased eight-bar melodies. Empty eighths leave room for play.
const MELODY: readonly (readonly (number | null)[])[] = [
  [null, null, 76, null, null, 71, 72, null],
  [null, 69, null, null, 71, null, null, null],
  [null, null, 72, null, null, 76, null, 74],
  [null, 72, null, null, 69, null, null, null],
  [null, null, 71, null, 74, null, null, 76],
  [null, null, 79, null, 76, null, 74, null],
  [null, 71, null, 69, null, null, 67, null],
  [null, null, 69, null, 71, null, null, null],
  [null, null, 76, null, 79, null, 76, null],
  [null, 72, null, null, 71, null, 69, null],
  [null, null, 72, null, null, 76, 77, null],
  [null, 76, null, null, 72, null, null, null],
  [null, null, 74, null, 76, null, 79, null],
  [null, null, 76, null, null, 74, 71, null],
  [null, 74, null, null, 71, null, 69, null],
  [null, null, 67, null, 71, null, null, null],
];

const hz = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
type Source = AudioScheduledSourceNode;
type Session = {
  bus: GainNode;
  echo: GainNode;
  room: GainNode;
  nodes: AudioNode[];
  sources: Set<Source>;
};

/** A single audio-clock transport. UI events never trigger or advance the score. */
export class HeistMusic {
  private scheduler: ReturnType<typeof setInterval> | null = null;
  private session: Session | null = null;
  private origin = 0;
  private position = 0;
  private nextStep = 0;
  private volume = 0.55;
  private tension = false;
  private scheduledSteps = 0;
  private readonly noise: AudioBuffer;
  private readonly impulse: AudioBuffer;

  constructor(private readonly context: AudioContext, private readonly output: AudioNode) {
    // Seeded, original synthesis noise: reproducible hats, brush hits, and room tail.
    let seed = 81737;
    const random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296 * 2 - 1; };
    this.noise = context.createBuffer(1, context.sampleRate, context.sampleRate);
    const noise = this.noise.getChannelData(0);
    for (let i = 0; i < noise.length; i++) noise[i] = random();
    this.impulse = context.createBuffer(2, Math.ceil(context.sampleRate * 1.2), context.sampleRate);
    for (let channel = 0; channel < 2; channel++) {
      const data = this.impulse.getChannelData(channel);
      for (let i = 0; i < data.length; i++) data[i] = random() * Math.exp(-i / context.sampleRate * 6) * Math.min(1, i / 160);
    }
  }

  setVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.volume = Math.max(0, Math.min(1, volume));
    this.session?.bus.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.04);
  }

  setTension(tension: boolean) { this.tension = tension; }

  getDiagnostics() {
    return { activeSchedulers: this.scheduler === null ? 0 : 1, activeSources: this.session?.sources.size ?? 0,
      scheduledSteps: this.scheduledSteps, loopSeconds: LOOP_STEPS * EIGHTH,
      positionSeconds: this.session ? Math.max(0, this.context.currentTime - this.origin) % (LOOP_STEPS * EIGHTH) : this.position };
  }

  start() {
    if (this.scheduler !== null || this.context.state !== 'running') return;
    const context = this.context;
    const bus = context.createGain();
    bus.gain.value = 0;
    bus.gain.setTargetAtTime(this.volume, context.currentTime, 0.09);
    bus.connect(this.output);

    const echo = context.createGain();
    echo.gain.value = 0.2;
    const delay = context.createDelay(1);
    delay.delayTime.value = EIGHTH * 1.5;
    const feedback = context.createGain();
    feedback.gain.value = 0.25;
    const echoFilter = context.createBiquadFilter();
    echoFilter.type = 'lowpass';
    echoFilter.frequency.value = 1800;
    echo.connect(delay).connect(echoFilter).connect(bus);
    echoFilter.connect(feedback).connect(delay);
    const room = context.createGain();
    room.gain.value = 0.13;
    const convolver = context.createConvolver();
    convolver.buffer = this.impulse;
    room.connect(convolver).connect(bus);
    this.session = { bus, echo, room, sources: new Set(), nodes: [bus, echo, delay, feedback, echoFilter, room, convolver] };
    const start = context.currentTime + 0.035;
    this.origin = start - this.position;
    this.nextStep = Math.ceil(this.position / EIGHTH - 0.00001);
    // Restore the sustained harmony when resuming partway through a two-bar chord.
    if (this.nextStep % 16 !== 0) {
      const chord = CHORDS[Math.floor(this.position / EIGHTH / 16) % CHORDS.length];
      this.pad(chord.notes, start, (16 - this.position / EIGHTH % 16) * EIGHTH);
    }
    this.schedule();
    this.scheduler = setInterval(() => this.schedule(), 25);
  }

  stop() {
    if (this.scheduler !== null) clearInterval(this.scheduler);
    this.scheduler = null;
    const session = this.session;
    if (!session) return;
    this.position = Math.max(0, this.context.currentTime - this.origin) % (LOOP_STEPS * EIGHTH);
    this.session = null;
    const now = this.context.currentTime;
    session.bus.gain.cancelScheduledValues(now);
    session.bus.gain.setTargetAtTime(0, now, 0.018);
    for (const source of session.sources) source.stop(now + 0.12);
    // Disconnect the feedback path as well as the voices; repeated pause cannot leak a graph.
    setTimeout(() => { for (const node of session.nodes) node.disconnect(); }, 200);
  }

  private schedule() {
    if (!this.session) return;
    const now = this.context.currentTime;
    // A delayed timer skips missed beats instead of emitting a burst of late notes.
    if (this.origin + this.nextStep * EIGHTH < now - 0.06) this.nextStep = Math.ceil((now - this.origin) / EIGHTH);
    while (this.origin + this.nextStep * EIGHTH < now + 0.16) {
      this.step(this.nextStep % LOOP_STEPS, this.origin + this.nextStep * EIGHTH);
      this.nextStep++;
      this.scheduledSteps++;
    }
  }

  private step(index: number, at: number) {
    const bar = Math.floor(index / 8);
    const eighth = index % 8;
    const chord = CHORDS[Math.floor(bar / 2) % CHORDS.length];
    if (index % 16 === 0) this.pad(chord.notes, at, EIGHTH * 16);
    const note = MELODY[bar][eighth];
    if (note !== null) this.tone(note, at + 0.008, EIGHTH * 1.6, 0.16, 'triangle', 1900, 0.2 * (bar % 2 ? 1 : -1), true);
    if (eighth === 0 || eighth === 4) this.tone(chord.bass, at, EIGHTH * 2.3, 0.22, 'sine', 400, 0);
    if (eighth === 7 && bar % 2 === 1) this.tone(chord.bass + 7, at, EIGHTH * 0.7, 0.12, 'sine', 400, 0);
    if (eighth === 0 || eighth === 4 || (this.tension && eighth === 7 && bar % 2 === 1)) this.kick(at, eighth === 0 ? 0.26 : 0.2);
    if (eighth === 2 || eighth === 6) this.percussion(at + 0.011, 'bandpass', 1450, 0.045, 0.12, -0.12);
    // Low, swung brushed hats. Pursuit adds quiet offbeats without changing tempo.
    if (eighth % 2 === 0 || this.tension) this.percussion(at + (eighth % 2 ? 0.021 : 0), 'highpass', 6500,
      eighth % 2 ? 0.018 : 0.027, 0.035, 0.23);
  }

  private finish(source: Source, nodes: AudioNode[], session: Session, end: number) {
    session.sources.add(source);
    source.onended = () => { session.sources.delete(source); source.disconnect(); for (const node of nodes) node.disconnect(); };
    source.stop(end);
  }

  private tone(midi: number, at: number, duration: number, level: number, type: OscillatorType, cutoff: number, pan: number, echo = false) {
    const session = this.session;
    if (!session) return;
    const oscillator = this.context.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = hz(midi);
    const filter = this.context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoff, at);
    filter.frequency.exponentialRampToValueAtTime(cutoff * 0.38, at + duration);
    filter.Q.value = 0.5;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + 0.012);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const stereo = this.context.createStereoPanner();
    stereo.pan.value = pan;
    oscillator.connect(filter).connect(envelope).connect(stereo).connect(session.bus);
    if (echo) { stereo.connect(session.echo); stereo.connect(session.room); }
    oscillator.start(at);
    this.finish(oscillator, [filter, envelope, stereo], session, at + duration + 0.02);
  }

  private pad(notes: readonly number[], at: number, duration: number) {
    const session = this.session;
    if (!session) return;
    notes.forEach((midi, index) => {
      const oscillator = this.context.createOscillator();
      oscillator.type = 'triangle';
      oscillator.frequency.value = hz(midi);
      oscillator.detune.value = [-4, 4, -2, 2][index];
      const filter = this.context.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 900;
      filter.Q.value = 0.45;
      const envelope = this.context.createGain();
      envelope.gain.setValueAtTime(0, at);
      envelope.gain.linearRampToValueAtTime(0.075, at + Math.min(0.55, duration * 0.4));
      envelope.gain.setValueAtTime(0.075, at + duration);
      envelope.gain.linearRampToValueAtTime(0, at + duration + 0.7);
      const stereo = this.context.createStereoPanner();
      stereo.pan.value = [-0.55, 0.3, -0.25, 0.55][index];
      oscillator.connect(filter).connect(envelope).connect(stereo).connect(session.bus);
      stereo.connect(session.room);
      oscillator.start(at);
      this.finish(oscillator, [filter, envelope, stereo], session, at + duration + 0.72);
    });
  }

  private kick(at: number, level: number) {
    const session = this.session;
    if (!session) return;
    const oscillator = this.context.createOscillator();
    oscillator.frequency.setValueAtTime(105, at);
    oscillator.frequency.exponentialRampToValueAtTime(46, at + 0.13);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + 0.005);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + 0.23);
    oscillator.connect(envelope).connect(session.bus);
    oscillator.start(at);
    this.finish(oscillator, [envelope], session, at + 0.25);
  }

  private percussion(at: number, type: BiquadFilterType, frequency: number, level: number, duration: number, pan: number) {
    const session = this.session;
    if (!session) return;
    const source = this.context.createBufferSource();
    source.buffer = this.noise;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = type === 'bandpass' ? 0.8 : 0.5;
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, at);
    envelope.gain.linearRampToValueAtTime(level, at + 0.003);
    envelope.gain.exponentialRampToValueAtTime(0.0001, at + duration);
    const stereo = this.context.createStereoPanner();
    stereo.pan.value = pan;
    source.connect(filter).connect(envelope).connect(stereo).connect(session.bus);
    source.start(at, 0.17);
    this.finish(source, [filter, envelope, stereo], session, at + duration + 0.01);
  }
}
