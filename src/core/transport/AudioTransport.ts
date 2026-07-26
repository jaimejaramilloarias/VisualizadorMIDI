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
}

export type TransportListener = (snapshot: TransportSnapshot) => void;

export class AudioTransport {
  private context: AudioContext | null = null;
  private buffer: AudioBuffer | null = null;
  private media: HTMLAudioElement | null = null;
  private mediaUrl: string | null = null;
  private position = 0;
  private midiDuration = 0;
  private trimOffset = 0;
  private startedAtPerformance = 0;
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
      ? this.buffer && this.media
        ? Math.max(0, this.media.currentTime - this.trimOffset)
        : this.position + Math.max(0, now - this.startedAtPerformance) / 1000
      : this.position;
    const nextPosition = Math.min(duration, Math.max(0, rawPosition));

    if (this.playing && duration > 0 && nextPosition >= duration) {
      this.position = duration;
      this.playing = false;
      this.pauseMedia();
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
    this.releaseMedia();
    this.emit();

    const context = this.getContext();
    const media = new Audio();
    media.preload = 'auto';
    media.defaultMuted = false;
    media.muted = this.muted;
    media.volume = this.volume;
    media.setAttribute('aria-hidden', 'true');
    media.setAttribute('playsinline', '');
    media.className = 'transport-audio-engine';
    if (typeof document !== 'undefined') {
      document.body.append(media);
    }
    const mediaUrl = URL.createObjectURL(file);
    this.media = media;
    this.mediaUrl = mediaUrl;
    const mediaReady = this.waitForMediaMetadata(media);
    media.src = mediaUrl;
    media.load();

    try {
      const bytes = await file.arrayBuffer();
      const [decoded] = await Promise.all([
        context.decodeAudioData(bytes.slice(0)),
        mediaReady,
      ]);
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
      media.onended = () => {
        if (!this.playing) return;
        this.position = this.getDuration();
        this.playing = false;
        this.starting = false;
        this.emit();
      };
      this.emit();
      return this.getDuration();
    } catch (error) {
      if (this.media === media) this.releaseMedia();
      throw error;
    }
  }

  unloadAudio(): void {
    this.audioLoadGeneration += 1;
    this.pause();
    this.buffer = null;
    this.trimOffset = 0;
    this.position = 0;
    this.releaseMedia();
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

  async play(): Promise<void> {
    const duration = this.getDuration();
    if (this.playing || this.starting || duration <= 0) return;
    if (this.position >= duration) this.position = 0;

    const generation = ++this.generation;
    this.starting = true;
    this.emit();

    if (this.buffer && this.media) {
      const media = this.media;
      media.defaultMuted = false;
      media.muted = this.muted;
      media.volume = this.volume;
      media.currentTime = Math.min(
        this.trimOffset + this.position,
        Math.max(0, this.buffer.duration - 0.001),
      );
      try {
        await media.play();
      } catch (error) {
        if (generation !== this.generation || !this.starting) return;
        this.starting = false;
        this.playing = false;
        this.emit();
        throw error;
      }
      if (!this.starting || generation !== this.generation) {
        media.pause();
        return;
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
    this.pauseMedia();
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
    if (this.buffer && this.media) {
      this.media.currentTime = Math.min(
        this.trimOffset + this.position,
        Math.max(0, this.buffer.duration - 0.001),
      );
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
    if (this.media) {
      this.media.volume = this.volume;
      this.media.muted = this.muted;
    }
    this.emit();
  }

  toggleMuted(): void {
    this.muted = !this.muted;
    if (this.media) this.media.muted = this.muted;
    this.emit();
  }

  async destroy(): Promise<void> {
    this.audioLoadGeneration += 1;
    this.pause();
    this.listeners.clear();
    this.releaseMedia();
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
      this.context = new AudioContext({ latencyHint: 'playback' });
    }
    return this.context;
  }

  private waitForMediaMetadata(media: HTMLAudioElement): Promise<void> {
    return new Promise((resolve, reject) => {
      const cleanup = () => {
        media.removeEventListener('loadedmetadata', onReady);
        media.removeEventListener('canplay', onReady);
        media.removeEventListener('error', onError);
      };
      const onReady = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(
          new Error(
            media.error?.message ??
              'El navegador no pudo preparar este archivo para reproducirlo.',
          ),
        );
      };
      media.addEventListener('loadedmetadata', onReady);
      media.addEventListener('canplay', onReady);
      media.addEventListener('error', onError);
      if (media.readyState >= HTMLMediaElement.HAVE_METADATA) onReady();
    });
  }

  private pauseMedia(): void {
    this.media?.pause();
  }

  private releaseMedia(): void {
    const media = this.media;
    const mediaUrl = this.mediaUrl;
    this.media = null;
    this.mediaUrl = null;
    if (media) {
      media.onended = null;
      media.pause();
      media.removeAttribute('src');
      media.load();
      media.remove();
    }
    if (mediaUrl) URL.revokeObjectURL(mediaUrl);
  }

  private emit(): void {
    const snapshot = this.getSnapshot();
    this.listeners.forEach((listener) => listener(snapshot));
  }
}
