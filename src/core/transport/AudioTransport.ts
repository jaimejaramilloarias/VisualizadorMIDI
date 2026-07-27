import type { AlignmentAudioSource } from '../alignment/types';
import { detectInitialSilence } from './audioAnalysis';

export interface TransportSnapshot {
  position: number;
  visualPosition: number;
  duration: number;
  playing: boolean;
  clockAdvancing: boolean;
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

const MAX_OUTPUT_LATENCY_SECONDS = 1;
const OUTPUT_LATENCY_SLEW_RATIO = 0.5;

export class AudioTransport {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private source: AudioBufferSourceNode | null = null;
  private outputGain: GainNode | null = null;
  private outputAnalyser: AnalyserNode | null = null;
  private signalSamples: Uint8Array<ArrayBuffer> | null = null;
  private position = 0;
  private midiDuration = 0;
  private visualPostRollDuration = 0;
  private trimOffset = 0;
  private startedAtPerformance = 0;
  private startedAtAudioContext = 0;
  private playing = false;
  private starting = false;
  private volume = 1;
  private muted = false;
  private generation = 0;
  private audioLoadGeneration = 0;
  private lastReportedVisualPosition = 0;
  private audioExhausted = false;
  private useOutputTimestamp = false;
  private sourceOutputLatency = 0;
  private lastLatencyContextTime = 0;
  private lastOutputContextTime = 0;
  private listeners = new Set<TransportListener>();

  getSnapshot(now = performance.now()): TransportSnapshot {
    const duration = this.getDuration();
    const playbackDuration = this.getPlaybackDuration();
    const audibleContextElapsed =
      this.playing && this.source && this.context
        ? this.getAudibleContextElapsed()
        : null;
    const rawVisualPosition = this.playing
      ? this.source && this.context
        ? this.position + (audibleContextElapsed ?? 0)
        : this.position + Math.max(0, now - this.startedAtPerformance) / 1000
      : this.position;
    const nextVisualPosition = Math.max(
      this.playing ? this.lastReportedVisualPosition : 0,
      Math.min(
        playbackDuration,
        Math.max(0, rawVisualPosition),
      ),
    );
    const nextPosition = Math.min(duration, nextVisualPosition);

    if (
      this.playing &&
      duration > 0 &&
      nextVisualPosition >= playbackDuration
    ) {
      this.position = playbackDuration;
      this.playing = false;
      this.stopSource();
      queueMicrotask(() => this.emit());
    }
    this.lastReportedVisualPosition = nextVisualPosition;

    return {
      position: nextPosition,
      visualPosition: nextVisualPosition,
      duration,
      playing: this.playing,
      clockAdvancing:
        this.playing &&
        (!this.source ||
          !this.context ||
          this.context.state === 'running') &&
        (audibleContextElapsed === null || audibleContextElapsed > 0),
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
    this.position = Math.min(this.position, this.getPlaybackDuration());
    this.lastReportedVisualPosition = Math.min(
      this.lastReportedVisualPosition,
      this.getPlaybackDuration(),
    );
    this.emit();
  }

  setVisualPostRollDuration(duration: number): void {
    const previousPlaybackDuration = this.getPlaybackDuration();
    const wasComplete =
      !this.playing &&
      previousPlaybackDuration > 0 &&
      this.position >= previousPlaybackDuration - 0.001;
    this.visualPostRollDuration = Number.isFinite(duration)
      ? Math.max(0, duration)
      : 0;
    this.position = wasComplete
      ? this.getPlaybackDuration()
      : Math.min(this.position, this.getPlaybackDuration());
    this.lastReportedVisualPosition = this.position;
    this.emit();
  }

  async loadAudio(file: File): Promise<number> {
    const loadGeneration = ++this.audioLoadGeneration;
    this.pause();
    this.buffer = null;
    this.trimOffset = 0;
    this.position = 0;
    this.lastReportedVisualPosition = 0;
    this.audioExhausted = false;
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
      this.audioExhausted = false;
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
    this.lastReportedVisualPosition = 0;
    this.audioExhausted = false;
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

  async createAlignmentAudioSource(
    signal?: AbortSignal,
    onProgress?: (progress: number) => void,
  ): Promise<AlignmentAudioSource | null> {
    const buffer = this.buffer;
    if (!buffer) return null;
    const loadGeneration = this.audioLoadGeneration;
    const firstFrame = Math.min(
      buffer.length,
      Math.max(0, Math.floor(this.trimOffset * buffer.sampleRate)),
    );
    const frameCount = Math.max(0, buffer.length - firstFrame);
    if (frameCount === 0) return null;
    const targetSampleRate = Math.min(11_025, buffer.sampleRate);
    const sourceFramesPerOutput = buffer.sampleRate / targetSampleRate;
    const outputLength = Math.max(
      1,
      Math.floor(frameCount / sourceFramesPerOutput),
    );
    const mono = new Float32Array(outputLength);
    const channelCount = Math.max(1, buffer.numberOfChannels);
    const channels = Array.from(
      { length: channelCount },
      (_, channelIndex) => buffer.getChannelData(channelIndex),
    );
    const chunkSize = 65_536;

    for (
      let chunkStart = 0;
      chunkStart < outputLength;
      chunkStart += chunkSize
    ) {
      if (
        signal?.aborted ||
        loadGeneration !== this.audioLoadGeneration ||
        buffer !== this.buffer
      ) {
        throw new DOMException(
          'El análisis de audio fue cancelado.',
          'AbortError',
        );
      }
      const chunkEnd = Math.min(outputLength, chunkStart + chunkSize);
      for (let outputFrame = chunkStart; outputFrame < chunkEnd; outputFrame += 1) {
        const sourceStart =
          firstFrame + Math.floor(outputFrame * sourceFramesPerOutput);
        const sourceEnd = Math.min(
          buffer.length,
          Math.max(
            sourceStart + 1,
            firstFrame +
              Math.floor((outputFrame + 1) * sourceFramesPerOutput),
          ),
        );
        let sum = 0;
        let measured = 0;
        for (
          let sourceFrame = sourceStart;
          sourceFrame < sourceEnd;
          sourceFrame += 1
        ) {
          for (let channelIndex = 0; channelIndex < channelCount; channelIndex += 1) {
            sum += channels[channelIndex][sourceFrame] ?? 0;
            measured += 1;
          }
        }
        mono[outputFrame] = measured > 0 ? sum / measured : 0;
      }
      onProgress?.(chunkEnd / outputLength);
      if (chunkEnd < outputLength) {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
      }
    }
    return {
      channels: [mono],
      sampleRate: targetSampleRate,
      duration: outputLength / targetSampleRate,
    };
  }

  async play(): Promise<void> {
    const duration = this.getDuration();
    if (this.playing || this.starting || duration <= 0) return;
    if (this.position >= this.getPlaybackDuration()) {
      this.position = 0;
      this.audioExhausted = false;
    }
    this.lastReportedVisualPosition = this.position;

    const generation = ++this.generation;
    this.starting = true;
    this.emit();

    if (
      this.buffer &&
      this.position < duration &&
      !this.audioExhausted
    ) {
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
    if (this.playing) {
      this.position =
        this.source && this.context
          ? Math.min(
              this.getDuration(),
              this.position +
                Math.max(
                  0,
                  this.context.currentTime - this.startedAtAudioContext,
                ),
            )
          : this.getSnapshot().visualPosition;
      this.lastReportedVisualPosition = this.position;
    }
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
    const duration = this.getDuration();
    this.position = Math.min(
      duration,
      Math.max(0, Number.isFinite(nextPosition) ? nextPosition : 0),
    );
    this.audioExhausted = this.position >= duration;
    this.lastReportedVisualPosition = this.position;
    if (this.playing && this.position >= duration) {
      this.playing = false;
      this.starting = false;
      this.generation += 1;
      this.stopSource();
    } else if (this.buffer && this.playing && this.context) {
      const generation = ++this.generation;
      this.stopSource();
      this.startedAtAudioContext = this.context.currentTime;
      this.startBufferSource(generation);
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

  private getPlaybackDuration(): number {
    const duration = this.getDuration();
    return duration > 0 ? duration + this.visualPostRollDuration : 0;
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
    this.audioExhausted = false;
    this.sourceOutputLatency = this.getDeclaredOutputLatencySeconds();
    this.lastLatencyContextTime = this.context.currentTime;
    const initialOutputContextTime = this.readOutputContextTime();
    this.useOutputTimestamp = initialOutputContextTime !== null;
    this.lastOutputContextTime =
      initialOutputContextTime ??
      Math.max(0, this.context.currentTime - this.sourceOutputLatency);
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
      const audiblePositionAtEnd = this.context
        ? this.position + this.getAudibleContextElapsed()
        : this.getDuration();
      source.disconnect();
      this.source = null;
      this.audioExhausted = true;
      this.position = Math.min(
        this.getDuration(),
        Math.max(
          this.position,
          audiblePositionAtEnd,
          this.lastReportedVisualPosition,
        ),
      );
      this.lastReportedVisualPosition = this.position;
      this.startedAtPerformance = performance.now();
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

  private getAudibleContextElapsed(): number {
    if (!this.context) return 0;
    return Math.max(
      0,
      this.getOutputContextTime() - this.startedAtAudioContext,
    );
  }

  private getOutputContextTime(): number {
    const context = this.context;
    if (!context) return 0;
    const timestampContextTime = this.useOutputTimestamp
      ? this.readOutputContextTime()
      : null;
    if (timestampContextTime === null) {
      const elapsed = Math.max(
        0,
        context.currentTime - this.lastLatencyContextTime,
      );
      const targetLatency = this.getDeclaredOutputLatencySeconds();
      const maximumCorrection =
        elapsed * OUTPUT_LATENCY_SLEW_RATIO;
      if (targetLatency > this.sourceOutputLatency) {
        this.sourceOutputLatency = Math.min(
          targetLatency,
          this.sourceOutputLatency + maximumCorrection,
        );
      } else {
        this.sourceOutputLatency = Math.max(
          targetLatency,
          this.sourceOutputLatency - maximumCorrection,
        );
      }
      this.lastLatencyContextTime = context.currentTime;
    }
    const nextOutputContextTime =
      timestampContextTime ??
      Math.max(0, context.currentTime - this.sourceOutputLatency);
    this.lastOutputContextTime = Math.min(
      context.currentTime,
      Math.max(this.lastOutputContextTime, nextOutputContextTime),
    );
    return this.lastOutputContextTime;
  }

  private readOutputContextTime(): number | null {
    const context = this.context;
    if (!context || typeof context.getOutputTimestamp !== 'function') {
      return null;
    }
    try {
      const timestamp = context.getOutputTimestamp();
      const timestampContextTime = timestamp.contextTime;
      const timestampPerformanceTime = timestamp.performanceTime;
      if (
        typeof timestampContextTime !== 'number' ||
        !Number.isFinite(timestampContextTime) ||
        timestampContextTime < 0 ||
        (timestampContextTime === 0 &&
          (!Number.isFinite(timestampPerformanceTime) ||
            (timestampPerformanceTime ?? 0) <= 0))
      ) {
        return null;
      }
      const timestampAge =
        context.state === 'running' &&
        typeof timestampPerformanceTime === 'number' &&
        Number.isFinite(timestampPerformanceTime) &&
        timestampPerformanceTime > 0
          ? Math.max(0, performance.now() - timestampPerformanceTime) /
            1000
          : 0;
      return Math.min(
        context.currentTime,
        timestampContextTime + timestampAge,
      );
    } catch {
      // Algunos navegadores exponen el método antes de tener una salida activa.
      return null;
    }
  }

  private getDeclaredOutputLatencySeconds(): number {
    const context = this.context;
    if (!context) return 0;
    return Math.min(
      MAX_OUTPUT_LATENCY_SECONDS,
      Math.max(
        Number.isFinite(context.outputLatency) ? context.outputLatency : 0,
        Number.isFinite(context.baseLatency) ? context.baseLatency : 0,
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
      !this.source ||
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
    this.useOutputTimestamp = false;
    this.sourceOutputLatency = 0;
    this.lastLatencyContextTime = 0;
    this.lastOutputContextTime = 0;
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
