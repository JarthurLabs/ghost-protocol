import { HeistMusic } from './music';
import { NEON_RUN } from './musicTrack';

export type Cue = 'start' | 'move' | 'grant' | 'pickup' | 'revoke' | 'deny' | 'win' | 'lose' | 'tap';

/** Original synthesized effects and the original rendered Neon Run score. */
class GhostAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private effects: GainNode | null = null;
  private music: HeistMusic | null = null;
  private enabled = true;
  private musicEnabled = true;
  private effectsEnabled = true;
  private musicVolume = 0.55;
  private tension = false;
  private playing = false;

  async unlock() {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.enabled ? 0.5 : 0;
        this.master.connect(this.context.destination);
        const capture = this.context.createMediaStreamDestination();
        this.master.connect(capture);
        const audioWindow = window as Window & { ghostProtocolAudioStream?: MediaStream; ghostProtocolAudioDiagnostics?: () => ReturnType<GhostAudio['getDiagnostics']> };
        audioWindow.ghostProtocolAudioStream = capture.stream;
        audioWindow.ghostProtocolAudioDiagnostics = () => this.getDiagnostics();
        this.effects = this.context.createGain();
        this.effects.gain.value = this.effectsEnabled ? 0.44 : 0;
        this.effects.connect(this.master);
        this.music = new HeistMusic(this.context, this.master);
        this.music.setVolume(this.musicVolume);
        this.music.setTension(this.tension);
        document.addEventListener('visibilitychange', () => this.syncMusic());
        this.context.addEventListener('statechange', () => this.syncMusic());
      }
      if (this.context.state === 'suspended') await this.context.resume();
      this.syncMusic();
    } catch {
      // Muted or unavailable browser audio never interrupts the heist.
    }
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (this.context && this.master) {
      this.master.gain.setTargetAtTime(enabled ? 0.5 : 0, this.context.currentTime, 0.035);
    }
    this.syncMusic();
  }

  setPlaying(playing: boolean) {
    this.playing = playing;
    this.syncMusic();
  }

  setMusicEnabled(enabled: boolean) {
    this.musicEnabled = enabled;
    this.syncMusic();
  }

  setEffectsEnabled(enabled: boolean) {
    this.effectsEnabled = enabled;
    if (this.context && this.effects) this.effects.gain.setTargetAtTime(enabled ? 0.44 : 0, this.context.currentTime, 0.02);
  }

  setMusicVolume(volume: number) {
    if (!Number.isFinite(volume)) return;
    this.musicVolume = Math.max(0, Math.min(1, volume));
    this.music?.setVolume(this.musicVolume);
    this.syncMusic();
  }

  setTension(tension: boolean) {
    this.tension = tension;
    this.music?.setTension(tension);
  }

  getDiagnostics() {
    return { enabled: this.enabled, musicEnabled: this.musicEnabled, effectsEnabled: this.effectsEnabled,
      volume: this.musicVolume, playing: this.playing, tension: this.tension, contextState: this.context?.state ?? 'locked',
      ...(this.music?.getDiagnostics() ?? { track: NEON_RUN.title, loadState: 'locked', activeSchedulers: 0,
        activeSources: 0, scheduledSteps: 0, loopSeconds: NEON_RUN.loopSeconds, positionSeconds: 0 }) };
  }

  private syncMusic() {
    if (this.enabled && this.musicEnabled && this.musicVolume > 0 && this.playing && this.context?.state === 'running' && !document.hidden) this.music?.start();
    else this.music?.stop();
  }

  cue(cue: Cue) {
    const context = this.context;
    const effects = this.effects;
    if (!this.enabled || !this.effectsEnabled || !context || !effects || context.state !== 'running') return;
    const patterns: Record<Cue, { notes: number[]; duration: number; type: OscillatorType; volume: number }> = {
      start: { notes: [220, 329.63, 440], duration: 0.17, type: 'sine', volume: 0.3 },
      move: { notes: [145, 195], duration: 0.045, type: 'sine', volume: 0.1 },
      grant: { notes: [440, 554.37, 659.26], duration: 0.12, type: 'sine', volume: 0.3 },
      pickup: { notes: [523.25, 659.26, 783.99, 1046.5], duration: 0.12, type: 'sine', volume: 0.32 },
      revoke: { notes: [523.25, 392, 261.63], duration: 0.13, type: 'triangle', volume: 0.24 },
      deny: { notes: [155.56, 155.56], duration: 0.13, type: 'triangle', volume: 0.32 },
      win: { notes: [329.63, 440, 554.37, 659.26, 880], duration: 0.18, type: 'sine', volume: 0.32 },
      lose: { notes: [220, 164.81, 110], duration: 0.22, type: 'triangle', volume: 0.2 },
      tap: { notes: [340], duration: 0.055, type: 'sine', volume: 0.13 },
    };
    const pattern = patterns[cue];
    pattern.notes.forEach((frequency, index) => {
      const at = context.currentTime + index * pattern.duration * 0.8;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = pattern.type;
      oscillator.frequency.setValueAtTime(frequency, at);
      oscillator.frequency.exponentialRampToValueAtTime(frequency * 0.98, at + pattern.duration);
      envelope.gain.setValueAtTime(0.0001, at);
      envelope.gain.exponentialRampToValueAtTime(pattern.volume, at + 0.012);
      envelope.gain.exponentialRampToValueAtTime(0.0001, at + pattern.duration * 2);
      oscillator.connect(envelope).connect(effects);
      oscillator.start(at);
      oscillator.stop(at + pattern.duration * 2.1);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
    });
  }
}

export const audio = new GhostAudio();
