import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import { AudioTransport } from './AudioTransport';

class FakeAudioContext {
  static instance: FakeAudioContext | null = null;
  static decodedChannel = new Float32Array(48_000);

  state: AudioContextState = 'running';

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
}

class FakeAudioElement {
  static instance: FakeAudioElement | null = null;

  currentTime = 0;
  error: MediaError | null = null;
  onended: (() => void) | null = null;
  preload = '';
  readyState = 1;
  src = '';
  volume = 0;
  playPromise: Promise<void> = Promise.resolve();
  load = vi.fn();
  pause = vi.fn();
  play = vi.fn(() => this.playPromise);
  removeAttribute = vi.fn((name: string) => {
    if (name === 'src') this.src = '';
  });
  addEventListener = vi.fn();
  removeEventListener = vi.fn();

  constructor() {
    FakeAudioElement.instance = this;
  }
}

describe('AudioTransport', () => {
  beforeEach(() => {
    FakeAudioContext.instance = null;
    FakeAudioContext.decodedChannel = new Float32Array(48_000);
    FakeAudioElement.instance = null;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('Audio', FakeAudioElement);
    vi.stubGlobal('HTMLMediaElement', { HAVE_METADATA: 1 });
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:audio-test'),
      revokeObjectURL: vi.fn(),
    });
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

    let releasePlay = (): void => undefined;
    const playGate = new Promise<void>((resolve) => {
      releasePlay = resolve;
    });
    const media = FakeAudioElement.instance!;
    media.playPromise = playGate;

    const playPromise = transport.play();
    expect(transport.getSnapshot()).toMatchObject({
      playing: false,
      starting: true,
    });
    transport.pause();
    releasePlay();
    await playPromise;

    expect(media.play).toHaveBeenCalledTimes(1);
    expect(media.pause).toHaveBeenCalled();
    expect(transport.getSnapshot()).toMatchObject({
      playing: false,
      starting: false,
      position: 0,
    });
    await transport.destroy();
  });

  it('usa la salida de audio nativa a volumen completo como reloj maestro', async () => {
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;
    await transport.loadAudio(file);
    const media = FakeAudioElement.instance!;

    await transport.play();
    media.currentTime = 1.25;

    expect(media.volume).toBe(1);
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot()).toMatchObject({
      position: 1.25,
      playing: true,
      starting: false,
    });
    await transport.destroy();
  });

  it('omite el silencio inicial y busca sin reiniciar la salida audible', async () => {
    FakeAudioContext.decodedChannel.fill(0.2, 2_400);
    const transport = new AudioTransport();
    const file = {
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(16)),
    } as File;

    const duration = await transport.loadAudio(file);
    await transport.play();
    const media = FakeAudioElement.instance!;

    expect(transport.getSnapshot().trimOffset).toBeCloseTo(0.5, 3);
    expect(duration).toBeCloseTo(9.5, 3);
    expect(media.currentTime).toBeCloseTo(0.5, 3);

    transport.seek(4);

    expect(media.currentTime).toBeCloseTo(4.5, 3);
    expect(media.play).toHaveBeenCalledTimes(1);
    expect(transport.getSnapshot().playing).toBe(true);
    await transport.destroy();
  });
});
