import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AudioTransport } from './AudioTransport';

class FakeAudioSource {
  buffer: AudioBuffer | null = null;
  onended: (() => void) | null = null;
  start = vi.fn();
  stop = vi.fn();
  connect = vi.fn();
  disconnect = vi.fn();
}

class FakeAudioContext {
  static instance: FakeAudioContext | null = null;

  currentTime = 0;
  destination = {} as AudioDestinationNode;
  state: AudioContextState = 'running';
  sources: FakeAudioSource[] = [];
  resumePromise: Promise<void> = Promise.resolve();

  constructor() {
    FakeAudioContext.instance = this;
  }

  resume(): Promise<void> {
    return this.resumePromise;
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
      getChannelData: () => new Float32Array(48_000),
    } as unknown as AudioBuffer);
  }

  createBufferSource(): AudioBufferSourceNode {
    const source = new FakeAudioSource();
    this.sources.push(source);
    return source as unknown as AudioBufferSourceNode;
  }
}

describe('AudioTransport', () => {
  beforeEach(() => {
    FakeAudioContext.instance = null;
    vi.stubGlobal('AudioContext', FakeAudioContext);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('no inicia una fuente obsoleta si se pausa mientras el contexto despierta', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);

    let releaseResume = (): void => undefined;
    const resumeGate = new Promise<void>((resolve) => {
      releaseResume = resolve;
    });
    const context = FakeAudioContext.instance!;
    context.currentTime = 100;
    context.resumePromise = resumeGate;

    const playPromise = transport.play();
    expect(transport.getSnapshot()).toMatchObject({
      playing: false,
      starting: true,
    });
    transport.pause();
    releaseResume();
    await playPromise;

    expect(context.sources).toHaveLength(0);
    expect(transport.getSnapshot().playing).toBe(false);
    expect(transport.getSnapshot().starting).toBe(false);
    expect(transport.getSnapshot().position).toBe(0);
    await transport.destroy();
  });

  it('publica reproducción solo después de programar la fuente de audio', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);
    const context = FakeAudioContext.instance!;

    await transport.play();

    expect(context.sources).toHaveLength(1);
    expect(context.sources[0].start).toHaveBeenCalledWith(0, 0);
    expect(transport.getSnapshot()).toMatchObject({
      playing: true,
      starting: false,
    });
    await transport.destroy();
  });
});
