export interface TransportSnapshot {
  position: number;
  duration: number;
  playing: boolean;
  starting: boolean;
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
  private starting = false;
  private generation = 0;
  private audioLoadGeneration = 0;
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
      starting: this.starting,
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
    const loadGeneration = ++this.audioLoadGeneration;
    this.pause();
    this.buffer = null;
    this.position = 0;
    this.emit();

    const context = this.getContext();
    const bytes = await file.arrayBuffer();
    const decoded = await context.decodeAudioData(bytes.slice(0));
    if (loadGeneration !== this.audioLoadGeneration) {
      throw new DOMException('La carga de audio fue reemplazada.', 'AbortError');
    }
    this.buffer = decoded;
    this.emit();
    return decoded.duration;
  }

  unloadAudio(): void {
    this.audioLoadGeneration += 1;
    this.pause();
    this.buffer = null;
    this.position = 0;
    this.emit();
  }

  getWaveformPeaks(sampleCount = 900): Float32Array | null {
    if (!this.buffer || sampleCount <= 0) return null;
    const count = Math.max(32, Math.floor(sampleCount));
    const result = new Float32Array(count * 2);
    const channels = Array.from(
      { length: this.buffer.numberOfChannels },
      (_, channel) => this.buffer!.getChannelData(channel),
    );
    const samplesPerPeak = Math.max(
      1,
      Math.floor(this.buffer.length / count),
    );
    for (let peak = 0; peak < count; peak += 1) {
      const start = peak * samplesPerPeak;
      const end = Math.min(this.buffer.length, start + samplesPerPeak);
      let minimum = 1;
      let maximum = -1;
      const stride = Math.max(1, Math.floor((end - start) / 96));
      for (let sample = start; sample < end; sample += stride) {
        let mixed = 0;
        channels.forEach((channel) => {
          mixed += channel[sample] ?? 0;
        });
        mixed /= channels.length;
        minimum = Math.min(minimum, mixed);
        maximum = Math.max(maximum, mixed);
      }
      result[peak * 2] = minimum;
      result[peak * 2 + 1] = maximum;
    }
    return result;
  }

  async play(): Promise<void> {
    const duration = this.getDuration();
    if (this.playing || this.starting || duration <= 0) return;
    if (this.position >= duration) this.position = 0;

    const generation = ++this.generation;
    this.starting = true;
    this.emit();

    if (this.buffer) {
      const context = this.getContext();
      try {
        await context.resume();
      } catch (error) {
        if (generation === this.generation) {
          this.starting = false;
          this.playing = false;
          this.emit();
        }
        throw error;
      }
      if (!this.starting || generation !== this.generation) return;
      const source = context.createBufferSource();
      source.buffer = this.buffer;
      source.connect(context.destination);
      const startAt = context.currentTime;
      source.onended = () => {
        if (generation !== this.generation || !this.playing) return;
        this.position = this.getDuration();
        this.playing = false;
        this.starting = false;
        this.source = null;
        this.emit();
      };
      try {
        source.start(
          startAt,
          Math.min(this.position, Math.max(0, this.buffer.duration - 0.001)),
        );
      } catch (error) {
        source.disconnect();
        if (generation === this.generation) {
          this.starting = false;
          this.playing = false;
          this.emit();
        }
        throw error;
      }
      this.source = source;
      this.startedAtContext = startAt;
    } else {
      this.startedAtPerformance = performance.now();
    }

    if (!this.starting || generation !== this.generation) return;
    this.starting = false;
    this.playing = true;
    this.emit();
  }

  pause(): void {
    if (!this.playing && !this.starting) return;
    if (this.playing) this.position = this.getSnapshot().position;
    this.starting = false;
    this.playing = false;
    this.stopSource();
    this.emit();
  }

  async toggle(): Promise<void> {
    if (this.playing || this.starting) {
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
    this.audioLoadGeneration += 1;
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
