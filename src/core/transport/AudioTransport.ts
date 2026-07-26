import { detectInitialSilence } from './audioAnalysis';

export interface TransportSnapshot {
  position: number;
  duration: number;
  playing: boolean;
  starting: boolean;
  hasAudio: boolean;
  trimOffset: number;
  volume: number;
  muted: boolean;
  signalLevel: number;
  audioState: AudioContextState | 'unavailable';
  outputMode: 'native' | 'webaudio';
}

export type TransportListener = (snapshot: TransportSnapshot) => void;

export class AudioTransport {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private outputGain: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private signalSamples: Uint8Array<ArrayBuffer> | null = null;
  private position = 0;
  private midiDuration = 0;
  private trimOffset = 0;
  private startedAtPerformance = 0;
  private startedAtAudioContext = 0;
  private playing = false;
  private starting = false;
  private volume = 1;
  private muted = false;
  private generation = 0;
  private audioLoadGeneration = 0;
  private listeners = new Set<TransportListener>();

  getSnapshot(now = performance.now()): TransportSnapshot {
    const duration = this.getDuration();
    const rawPosition = this.playing
      ? this.buffer && this.context
        ? this.position +
          Math.max(0, this.context.currentTime - this.startedAtAudioContext)
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
      trimOffset: this.buffer ? this.trimOffset : 0,
      volume: this.volume,
      muted: this.muted,
      signalLevel: this.getSignalLevel(),
      audioState: this.context?.state ?? 'unavailable',
      outputMode: this.outputGain ? 'webaudio' : 'native',
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
    this.trimOffset = 0;
    this.position = 0;
    this.emit();

    const context = this.getContext();

    try {
      const bytes = await file.arrayBuffer();
      const decoded = await context.decodeAudioData(bytes.slice(0));
      if (loadGeneration !== this.audioLoadGeneration) {
        throw new DOMException(
          'La carga de audio fue reemplazada.',
          'AbortError',
        );
      }
      const channels = Array.from(
        { length: decoded.numberOfChannels },
        (_, channel) => decoded.getChannelData(channel),
      );
      this.trimOffset = detectInitialSilence(channels, decoded.sampleRate);
      this.buffer = decoded;
      this.applyOutputLevel();
      this.emit();
      return this.getDuration();
    } catch (error) {
      if (loadGeneration === this.audioLoadGeneration) {
        this.buffer = null;
        this.trimOffset = 0;
      }
      throw error;
    }
  }

  unloadAudio(): void {
    this.audioLoadGeneration += 1;
    this.pause();
    this.buffer = null;
    this.trimOffset = 0;
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
    const firstFrame = Math.min(
      this.buffer.length,
      Math.max(0, Math.floor(this.trimOffset * this.buffer.sampleRate)),
    );
    const availableFrames = Math.max(0, this.buffer.length - firstFrame);
    const samplesPerPeak = Math.max(
      1,
      Math.floor(availableFrames / count),
    );
    for (let peak = 0; peak < count; peak += 1) {
      const start = firstFrame + peak * samplesPerPeak;
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

  getWaveformRms(sampleCount = 900): Float32Array | null {
    if (!this.buffer || sampleCount <= 0) return null;
    const count = Math.max(32, Math.floor(sampleCount));
    const result = new Float32Array(count);
    const channels = Array.from(
      { length: this.buffer.numberOfChannels },
      (_, channel) => this.buffer!.getChannelData(channel),
    );
    const firstFrame = Math.min(
      this.buffer.length,
      Math.max(0, Math.floor(this.trimOffset * this.buffer.sampleRate)),
    );
    const availableFrames = Math.max(0, this.buffer.length - firstFrame);

    for (let windowIndex = 0; windowIndex < count; windowIndex += 1) {
      const start =
        firstFrame +
        Math.floor((windowIndex * availableFrames) / Math.max(1, count));
      const end = Math.min(
        this.buffer.length,
        firstFrame +
          Math.ceil(
            ((windowIndex + 1) * availableFrames) / Math.max(1, count),
          ),
      );
      const stride = Math.max(1, Math.floor((end - start) / 192));
      let squaredEnergy = 0;
      let measuredSamples = 0;
      for (let frame = start; frame < end; frame += stride) {
        channels.forEach((channel) => {
          const value = channel[frame] ?? 0;
          squaredEnergy += value * value;
          measuredSamples += 1;
        });
      }
      result[windowIndex] =
        measuredSamples > 0
          ? Math.sqrt(squaredEnergy / measuredSamples)
          : 0;
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
      this.applyOutputLevel();
      try {
        if (context.state !== 'running') await context.resume();
        if (context.state !== 'running') {
          throw new Error(
            'El navegador mantuvo suspendida la salida de audio. Pulsa Play de nuevo.',
          );
        }
        if (!this.starting || generation !== this.generation) return;
        this.startedAtAudioContext = context.currentTime;
        this.startBufferSource(generation);
      } catch (error) {
        if (generation !== this.generation || !this.starting) return;
        this.starting = false;
        this.playing = false;
        this.stopSource();
        this.emit();
        throw error;
      }
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
    this.generation += 1;
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
    this.position = Math.min(
      this.getDuration(),
      Math.max(0, Number.isFinite(nextPosition) ? nextPosition : 0),
    );
    if (this.buffer && this.playing && this.context) {
      const generation = ++this.generation;
      this.stopSource();
      if (this.position >= this.getDuration()) {
        this.playing = false;
      } else {
        this.startedAtAudioContext = this.context.currentTime;
        this.startBufferSource(generation);
      }
    } else if (this.playing) {
      this.startedAtPerformance = performance.now();
    }
    this.emit();
  }

  restart(): void {
    this.seek(0);
  }

  setVolume(nextVolume: number): void {
    this.volume = Math.min(
      1,
      Math.max(0, Number.isFinite(nextVolume) ? nextVolume : 1),
    );
    if (this.volume > 0) this.muted = false;
    this.applyOutputLevel();
    this.emit();
  }

  toggleMuted(): void {
    this.muted = !this.muted;
    this.applyOutputLevel();
    this.emit();
  }

  async destroy(): Promise<void> {
    this.audioLoadGeneration += 1;
    this.pause();
    this.listeners.clear();
    this.stopSource();
    this.outputGain?.disconnect();
    this.outputAnalyser?.disconnect();
    this.outputGain = null;
    this.outputAnalyser = null;
    this.signalSamples = null;
    if (this.context && this.context.state !== 'closed') {
      await this.context.close();
    }
    this.context = null;
    this.buffer = null;
    this.trimOffset = 0;
  }

  private getDuration(): number {
    return this.buffer
      ? Math.max(0, this.buffer.duration - this.trimOffset)
      : this.midiDuration;
  }

  private getContext(): AudioContext {
    if (!this.context) {
      const AudioContextConstructor =
        globalThis.AudioContext ??
        (
          globalThis as typeof globalThis & {
            webkitAudioContext?: typeof AudioContext;
          }
        ).webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error(
          'Este navegador no ofrece una salida Web Audio compatible.',
        );
      }
      this.context = new AudioContextConstructor({ latencyHint: 'playback' });
      const gain = this.context.createGain();
      const analyser = this.context.createAnalyser();
      analyser.fftSize = 256;
      gain.connect(analyser);
      analyser.connect(this.context.destination);
      this.outputGain = gain;
      this.outputAnalyser = analyser;
      this.signalSamples = new Uint8Array(analyser.fftSize);
      this.applyOutputLevel();
    }
    return this.context;
  }

  private startBufferSource(generation: number): void {
    if (!this.context || !this.buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = this.buffer;
    source.connect(this.outputGain ?? this.context.destination);
    source.onended = () => {
      if (
        source !== this.source ||
        generation !== this.generation ||
        !this.playing
      ) {
        return;
      }
      source.disconnect();
      this.source = null;
      this.position = this.getDuration();
      this.playing = false;
      this.starting = false;
      this.emit();
    };
    this.source = source;
    source.start(
      0,
      Math.min(
        this.trimOffset + this.position,
        Math.max(0, this.buffer.duration - 0.001),
      ),
    );
  }

  private applyOutputLevel(): void {
    const outputLevel = this.muted ? 0 : this.volume;
    if (this.outputGain) this.outputGain.gain.value = outputLevel;
  }

  private getSignalLevel(): number {
    if (
      !this.playing ||
      !this.outputAnalyser ||
      !this.signalSamples ||
      this.muted
    ) {
      return 0;
    }
    this.outputAnalyser.getByteTimeDomainData(this.signalSamples);
    let peak = 0;
    for (let index = 0; index < this.signalSamples.length; index += 1) {
      peak = Math.max(peak, Math.abs(this.signalSamples[index] - 128));
    }
    return Math.min(1, peak / 128);
  }

  private stopSource(): void {
    const source = this.source;
    this.source = null;
    if (!source) return;
    source.onended = null;
    try {
      source.stop();
    } catch {
      // El nodo puede haber terminado entre dos cuadros.
    }
    source.disconnect();
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
