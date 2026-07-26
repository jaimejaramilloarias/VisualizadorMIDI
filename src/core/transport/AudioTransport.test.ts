import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AudioTransport } from './AudioTransport';

class FakeAudioNode {
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeBufferSourceNode extends FakeAudioNode {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
}

class FakeGainNode extends FakeAudioNode {
  gain = { value: 1 };
}

class FakeAnalyserNode extends FakeAudioNode {
  fftSize = 256;
  getByteTimeDomainData = vi.fn((samples: Uint8Array) => {
    samples.fill(128);
    samples[0] = 192;
  });
}

class FakeAudioContext {
  static instance: FakeAudioContext | null = null;
  static decodedChannel = new Float32Array(48_000);

  destination = {} as AudioDestinationNode;
  sourceNodes: FakeBufferSourceNode[] = [];
  gainNode = new FakeGainNode();
  analyserNode = new FakeAnalyserNode();
  state: AudioContextState = 'running';
  currentTime = 0;
  resumePromise: Promise<void> = Promise.resolve();
  resume = vi.fn(async () => {
    await this.resumePromise;
    this.state = 'running';
  });

  constructor() {
    FakeAudioContext.instance = this;
  }

  close(): Promise<void> {
    this.state = 'closed';
    return Promise.resolve();
  }

  decodeAudioData(): Promise<AudioBuffer> {
    return Promise.resolve({
      duration: 10,
      length: 48_000,
      numberOfChannels: 1,
      sampleRate: 4_800,
      getChannelData: () => FakeAudioContext.decodedChannel,
    } as unknown as AudioBuffer);
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeBufferSourceNode();
    this.sourceNodes.push(source);
    return source as unknown as AudioBufferSourceNode;
  }

  createGain(): GainNode {
    return this.gainNode as unknown as GainNode;
  }

  createAnalyser(): AnalyserNode {
    return this.analyserNode as unknown as AnalyserNode;
  }
}

describe('AudioTransport', () => {
  beforeEach(() => {
    FakeAudioContext.instance = null;
    FakeAudioContext.decodedChannel = new Float32Array(48_000);
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no inicia una reproducción obsoleta si se pausa mientras el audio despierta', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);

    const context = FakeAudioContext.instance!;
    context.state = 'suspended';
    let releaseResume = (): void => undefined;
    context.resumePromise = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });

    const playPromise = transport.play();
    expect(transport.getSnapshot()).toMatchObject({
      playing: false,
      starting: true,
    });
    transport.pause();
    releaseResume();
    await playPromise;

    expect(context.resume).toHaveBeenCalledTimes(1);
    expect(context.sourceNodes).toHaveLength(0);
    expect(transport.getSnapshot()).toMatchObject({
      playing: false,
      starting: false,
      position: 0,
    });
    await transport.destroy();
  });

  it('usa una salida Web Audio medible a volumen completo como reloj maestro', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;

    await transport.play();
    context.currentTime = 1.25;
    const source = context.sourceNodes[0];

    expect(source.buffer).not.toBeNull();
    expect(source.connect).toHaveBeenCalledWith(context.gainNode);
    expect(source.start).toHaveBeenCalledWith(0, 0);
    expect(transport.getSnapshot()).toMatchObject({
      position: 1.25,
      playing: true,
      starting: false,
      outputMode: 'webaudio',
      audioState: 'running',
      signalLevel: 0.5,
    });

    transport.toggleMuted();
    expect(transport.getSnapshot().muted).toBe(true);
    expect(context.gainNode.gain.value).toBe(0);

    transport.setVolume(0.35);
    expect(transport.getSnapshot()).toMatchObject({
      volume: 0.35,
      muted: false,
    });
    expect(context.gainNode.gain.value).toBe(0.35);
    await transport.destroy();
  });

  it('informa el bloqueo si el navegador no permite activar la salida', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;
    context.state = 'suspended';
    context.resume = vi.fn(async () => undefined);

    await expect(transport.play()).rejects.toThrow(
      'mantuvo suspendida la salida de audio',
    );
    expect(transport.getSnapshot()).toMatchObject({
      playing: false,
      starting: false,
      audioState: 'suspended',
    });
    expect(context.sourceNodes).toHaveLength(0);
    await transport.destroy();
  });

  it('omite el silencio inicial y recrea el nodo en la posición buscada', async () => {
    FakeAudioContext.decodedChannel.fill(0.2, 2_400);
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;

    const duration = await transport.loadAudio(file);
    await transport.play();
    const context = FakeAudioContext.instance!;
    const firstSource = context.sourceNodes[0];

    expect(transport.getSnapshot().trimOffset).toBeCloseTo(0.5, 3);
    expect(duration).toBeCloseTo(9.5, 3);
    expect(firstSource.start).toHaveBeenCalledWith(0, 0.5);

    transport.seek(4);
    const secondSource = context.sourceNodes[1];

    expect(firstSource.stop).toHaveBeenCalledTimes(1);
    expect(secondSource.start).toHaveBeenCalledWith(0, 4.5);
    expect(transport.getSnapshot().playing).toBe(true);
    await transport.destroy();
  });

  it('calcula una envolvente RMS independiente de los picos de forma de onda', async () => {
    FakeAudioContext.decodedChannel.fill(0.5);
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;

    await transport.loadAudio(file);
    const rms = transport.getWaveformRms(32);

    expect(rms).toHaveLength(32);
    expect(rms?.every((value) => Math.abs(value - 0.5) < 0.0001)).toBe(true);
    await transport.destroy();
  });

  it('conecta una sola cadena de salida al destino y la libera al cerrar', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;

    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;

    expect(context.gainNode.connect).toHaveBeenCalledWith(context.analyserNode);
    expect(context.analyserNode.connect).toHaveBeenCalledWith(
      context.destination,
    );
    await transport.destroy();
    expect(context.gainNode.disconnect).toHaveBeenCalledTimes(1);
    expect(context.analyserNode.disconnect).toHaveBeenCalledTimes(1);
  });
});
