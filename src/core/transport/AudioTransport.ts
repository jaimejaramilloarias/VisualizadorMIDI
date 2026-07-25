export interface TransportSnapshot {
  position: number;
  duration: number;
  playing: boolean;
  hasAudio: boolean;
}

export type TransportListener = (snapshot: TransportSnapshot) => void;

export class AudioTransport {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private position = 0;
  private midiDuration = 0;
  private startedAtContext = 0;
  private startedAtPerformance = 0;
  private playing = false;
  private generation = 0;
  private listeners = new Set<TransportListener>();

  getSnapshot(now = performance.now()): TransportSnapshot {
    const duration = this.getDuration();
    const rawPosition = this.playing
      ? this.buffer && this.context
        ? this.position + Math.max(0, this.context.currentTime - this.startedAtContext)
        : this.position + Math.max(0, now - this.startedAtPerformance) / 1000
      : this.position;
    const nextPosition = Math.min(duration, Math.max(0, rawPosition));

    if (this.playing && duration > 0 && nextPosition >= duration) {
      this.position = duration;
      this.playing = false;
      this.stopSource();
      queueMicrotask(() => this.emit());
    }

    return {
      position: nextPosition,
      duration,
      playing: this.playing,
      hasAudio: this.buffer !== null,
    };
  }

  subscribe(listener: TransportListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => this.listeners.delete(listener);
  }

  setMidiDuration(duration: number): void {
    this.midiDuration = Number.isFinite(duration) ? Math.max(0, duration) : 0;
    this.position = Math.min(this.position, this.getDuration());
    this.emit();
  }

  async loadAudio(file: File): Promise<number> {
    this.pause();
    this.buffer = null;
    this.position = 0;

    const context = this.getContext();
    const bytes = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(bytes.slice(0));
    this.buffer = decoded;
    this.emit();
    return decoded.duration;
  }

  unloadAudio(): void {
    this.pause();
    this.buffer = null;
    this.position = 0;
    this.emit();
  }

  async play(): Promise<void> {
    const duration = this.getDuration();
    if (this.playing || duration <= 0) return;
    if (this.position >= duration) this.position = 0;

    this.playing = true;
    this.startedAtPerformance = performance.now();

    if (this.buffer) {
      const context = this.getContext();
      await context.resume();
      const source = context.createBufferSource();
      source.buffer = this.buffer;
      source.connect(context.destination);
      const generation = ++this.generation;
      const startAt = context.currentTime + 0.025;
      this.startedAtContext = startAt;
      source.onended = () => {
        if (generation !== this.generation || !this.playing) return;
        this.position = this.getDuration();
        this.playing = false;
        this.source = null;
        this.emit();
      };
      source.start(startAt, Math.min(this.position, Math.max(0, this.buffer.duration - 0.001)));
      this.source = source;
    }

    this.emit();
  }

  pause(): void {
    if (!this.playing) return;
    this.position = this.getSnapshot().position;
    this.playing = false;
    this.stopSource();
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.playing) {
      this.pause();
    } else {
      await this.play();
    }
  }

  seek(nextPosition: number): void {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.position = Math.min(
      this.getDuration(),
      Math.max(0, Number.isFinite(nextPosition) ? nextPosition : 0),
    );
    this.emit();
    if (wasPlaying) void this.play();
  }

  restart(): void {
    const wasPlaying = this.playing;
    if (wasPlaying) this.pause();
    this.position = 0;
    this.emit();
    if (wasPlaying) void this.play();
  }

  async destroy(): Promise<void> {
    this.pause();
    this.listeners.clear();
    if (this.context && this.context.state !== 'closed') {
      await this.context.close();
    }
    this.context = null;
    this.buffer = null;
  }

  private getDuration(): number {
    return this.buffer?.duration ?? this.midiDuration;
  }

  private getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext({ latencyHint: 'playback' });
    }
    return this.context;
  }

  private stopSource(): void {
    this.generation += 1;
    if (!this.source) return;
    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      // A source that already ended is harmless.
    }
    this.source.disconnect();
    this.source = null;
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
