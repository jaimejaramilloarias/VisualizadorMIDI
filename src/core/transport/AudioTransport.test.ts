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
  baseLatency = 0;
  outputLatency = 0;
  outputTimestampContextTime: number | null = null;
  getOutputTimestamp = vi.fn(() => ({
    contextTime: this.outputTimestampContextTime ?? this.currentTime,
    performanceTime: performance.now(),
  }));
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
    vi.restoreAllMocks();
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
      clockAdvancing: true,
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

  it('mantiene un post-roll visual silencioso sin ampliar la duración del audio', async () => {
    let performanceTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(
      () => performanceTime,
    );
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    transport.setVisualPostRollDuration(4.1);
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;

    await transport.play();
    const source = context.sourceNodes[0];
    context.currentTime = 10;
    source.onended?.();

    expect(transport.getSnapshot()).toMatchObject({
      duration: 10,
      position: 10,
      visualPosition: 10,
      playing: true,
      signalLevel: 0,
    });
    expect(context.sourceNodes).toHaveLength(1);

    performanceTime = 2_000;
    expect(transport.getSnapshot()).toMatchObject({
      duration: 10,
      position: 10,
      visualPosition: 12,
      playing: true,
    });
    expect(context.sourceNodes).toHaveLength(1);

    performanceTime = 4_100;
    expect(transport.getSnapshot()).toMatchObject({
      duration: 10,
      position: 10,
      visualPosition: 14.1,
      playing: false,
    });
    expect(context.sourceNodes).toHaveLength(1);

    transport.setVisualPostRollDuration(6);
    expect(transport.getSnapshot()).toMatchObject({
      duration: 10,
      visualPosition: 16,
      playing: false,
    });
    await transport.play();
    expect(context.sourceNodes).toHaveLength(2);
    expect(context.sourceNodes[1].start).toHaveBeenCalledWith(0, 0);
    await transport.destroy();
  });

  it('espera la cola física de salida antes de llegar al note off final', async () => {
    let performanceTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(
      () => performanceTime,
    );
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    transport.setVisualPostRollDuration(4);
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;

    context.getOutputTimestamp = undefined as never;
    context.outputLatency = 0.1;
    await transport.play();
    context.currentTime = 0.05;
    expect(transport.getSnapshot()).toMatchObject({
      position: 0,
      visualPosition: 0,
      playing: true,
      clockAdvancing: false,
    });

    context.currentTime = 0.2;
    expect(transport.getSnapshot()).toMatchObject({
      position: 0.1,
      visualPosition: 0.1,
      playing: true,
      clockAdvancing: true,
    });

    context.currentTime = 10;
    context.sourceNodes[0].onended?.();

    expect(transport.getSnapshot()).toMatchObject({
      duration: 10,
      position: 9.9,
      visualPosition: 9.9,
      playing: true,
    });

    performanceTime = 100;
    expect(transport.getSnapshot()).toMatchObject({
      duration: 10,
      position: 10,
      visualPosition: 10,
      playing: true,
    });

    performanceTime = 200;
    expect(transport.getSnapshot()).toMatchObject({
      duration: 10,
      position: 10,
      visualPosition: 10.1,
      playing: true,
    });
    await transport.destroy();
  });

  it('usa el timestamp físico cuando está disponible', async () => {
    let performanceTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(
      () => performanceTime,
    );
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;
    context.outputTimestampContextTime = 9.88;

    await transport.play();
    context.currentTime = 10;
    context.sourceNodes[0].onended?.();

    expect(transport.getSnapshot()).toMatchObject({
      position: 9.88,
      visualPosition: 9.88,
      playing: true,
    });
    await transport.destroy();
  });

  it('reanuda desde el cursor procesado sin repetir la cola de salida', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;

    context.getOutputTimestamp = undefined as never;
    context.outputLatency = 0.1;
    await transport.play();
    context.currentTime = 5;
    expect(transport.getSnapshot().position).toBeCloseTo(4.9);
    transport.pause();

    expect(transport.getSnapshot()).toMatchObject({
      position: 5,
      visualPosition: 5,
      playing: false,
      clockAdvancing: false,
    });

    await transport.play();
    expect(context.sourceNodes).toHaveLength(2);
    expect(context.sourceNodes[1].start).toHaveBeenCalledWith(0, 5);
    await transport.destroy();
  });

  it('detiene el reloj visual si el contexto se suspende durante la reproducción', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;

    await transport.play();
    context.currentTime = 1;
    expect(transport.getSnapshot()).toMatchObject({
      visualPosition: 1,
      clockAdvancing: true,
    });

    context.state = 'suspended';
    expect(transport.getSnapshot()).toMatchObject({
      visualPosition: 1,
      playing: true,
      clockAdvancing: false,
    });
    await transport.destroy();
  });

  it('incorpora una latencia alternativa tardía sin congelar el reloj', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;
    context.getOutputTimestamp = undefined as never;

    await transport.play();
    context.currentTime = 0.05;
    expect(transport.getSnapshot().visualPosition).toBeCloseTo(0.05);

    context.outputLatency = 0.1;
    context.currentTime = 0.1;
    const corrected = transport.getSnapshot();
    expect(corrected.visualPosition).toBeCloseTo(0.075);
    expect(corrected.visualPosition).toBeGreaterThan(0.05);
    expect(corrected.clockAdvancing).toBe(true);

    context.currentTime = 0.3;
    expect(transport.getSnapshot().visualPosition).toBeCloseTo(0.2);
    await transport.destroy();
  });

  it('usa la latencia declarada si el timestamp físico aún devuelve cero', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;
    context.outputLatency = 0.1;
    context.getOutputTimestamp = vi.fn(() => ({
      contextTime: 0,
      performanceTime: 0,
    }));

    await transport.play();
    context.currentTime = 0.2;
    expect(transport.getSnapshot()).toMatchObject({
      visualPosition: 0.1,
      clockAdvancing: true,
    });
    await transport.destroy();
  });

  it('no vuelve a crear audio al pausar durante el drenaje físico final', async () => {
    let performanceTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(
      () => performanceTime,
    );
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    transport.setVisualPostRollDuration(4);
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;
    context.getOutputTimestamp = undefined as never;
    context.outputLatency = 0.1;

    await transport.play();
    context.currentTime = 10;
    context.sourceNodes[0].onended?.();
    transport.pause();

    expect(transport.getSnapshot()).toMatchObject({
      position: 9.9,
      visualPosition: 9.9,
      playing: false,
    });

    await transport.play();
    performanceTime = 100;
    expect(transport.getSnapshot()).toMatchObject({
      position: 10,
      visualPosition: 10,
      playing: true,
    });
    expect(context.sourceNodes).toHaveLength(1);
    await transport.destroy();
  });

  it('pausa y reanuda el post-roll sin crear otro nodo de audio', async () => {
    let performanceTime = 0;
    vi.spyOn(performance, 'now').mockImplementation(
      () => performanceTime,
    );
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    transport.setVisualPostRollDuration(4);
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;

    await transport.play();
    context.currentTime = 10;
    context.sourceNodes[0].onended?.();
    performanceTime = 1_000;
    transport.pause();

    expect(transport.getSnapshot()).toMatchObject({
      position: 10,
      visualPosition: 11,
      playing: false,
    });

    context.state = 'suspended';
    await transport.play();
    performanceTime = 2_000;
    expect(transport.getSnapshot()).toMatchObject({
      position: 10,
      visualPosition: 12,
      playing: true,
    });
    expect(context.sourceNodes).toHaveLength(1);
    expect(context.resume).not.toHaveBeenCalled();
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

  it('crea para el alineador una copia recortada sin desprender el audio', async () => {
    FakeAudioContext.decodedChannel.fill(0.25, 2_400);
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;

    await transport.loadAudio(file);
    const source = await transport.createAlignmentAudioSource();

    expect(source).not.toBeNull();
    expect(source?.sampleRate).toBe(4_800);
    expect(source?.duration).toBeCloseTo(9.5, 3);
    expect(source?.channels[0]).toHaveLength(45_600);
    expect(source?.channels[0][0]).toBeCloseTo(0.25);
    source!.channels[0][0] = 0.9;
    expect(FakeAudioContext.decodedChannel[2_400]).toBeCloseTo(0.25);

    await transport.play();
    expect(FakeAudioContext.instance?.sourceNodes[0].buffer).not.toBeNull();
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
