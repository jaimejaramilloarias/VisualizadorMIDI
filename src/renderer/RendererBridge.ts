import type { PackedMidiProject } from '../core/midi/types';
import type {
  VisualizationId,
  VisualizationSettings,
} from '../core/state/visualizationState';
import type { RenderAppearance } from '../core/state/visualConfiguration';
import type {
  RenderClock,
  RendererInboundMessage,
  RendererOutboundMessage,
  RenderTelemetry,
} from './protocol';

export interface RendererBridgeOptions {
  onTelemetry?: (telemetry: RenderTelemetry) => void;
  onError?: (message: string) => void;
}

export class RendererBridge {
  private worker: Worker;
  private observer: ResizeObserver;
  private disposed = false;
  private lastWidth = 0;
  private lastHeight = 0;
  private lastDevicePixelRatio = 0;
  private settingsFrame = 0;
  private appearanceFrame = 0;
  private pendingSettings: {
    visualization: VisualizationId;
    settings: VisualizationSettings;
  } | null = null;
  private pendingAppearance: RenderAppearance | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    options: RendererBridgeOptions = {},
  ) {
    if (!canvas.transferControlToOffscreen) {
      throw new Error(
        'Este navegador no permite renderizado de alto rendimiento en un Worker.',
      );
    }

    this.worker = new Worker(
      new URL('../workers/renderer.worker.ts', import.meta.url),
      { type: 'module' },
    );
    this.worker.onmessage = (
      event: MessageEvent<RendererOutboundMessage>,
    ): void => {
      if (event.data.type === 'telemetry') {
        options.onTelemetry?.(event.data.telemetry);
      } else if (event.data.type === 'error') {
        options.onError?.(event.data.message);
      }
    };
    this.worker.onerror = (event) => {
      options.onError?.(event.message || 'El motor visual se detuvo.');
    };

    const bounds = canvas.getBoundingClientRect();
    const offscreen = canvas.transferControlToOffscreen();
    this.lastWidth = Math.max(1, bounds.width);
    this.lastHeight = Math.max(1, bounds.height);
    this.lastDevicePixelRatio = window.devicePixelRatio || 1;
    this.post(
      {
        type: 'init',
        canvas: offscreen,
        width: this.lastWidth,
        height: this.lastHeight,
        devicePixelRatio: this.lastDevicePixelRatio,
      },
      [offscreen],
    );

    this.observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || this.disposed) return;
      const { width, height } = entry.contentRect;
      const nextWidth = Math.max(1, width);
      const nextHeight = Math.max(1, height);
      const nextDevicePixelRatio = window.devicePixelRatio || 1;
      if (
        Math.abs(nextWidth - this.lastWidth) < 0.25 &&
        Math.abs(nextHeight - this.lastHeight) < 0.25 &&
        nextDevicePixelRatio === this.lastDevicePixelRatio
      ) {
        return;
      }
      this.lastWidth = nextWidth;
      this.lastHeight = nextHeight;
      this.lastDevicePixelRatio = nextDevicePixelRatio;
      this.post({
        type: 'resize',
        width: nextWidth,
        height: nextHeight,
        devicePixelRatio: nextDevicePixelRatio,
      });
    });
    this.observer.observe(canvas);
  }

  setProject(project: PackedMidiProject): void {
    const buffers: Transferable[] = [
      project.notes.starts.buffer,
      project.notes.ends.buffer,
      project.notes.pitches.buffer,
      project.notes.velocities.buffer,
      project.notes.channels.buffer,
      project.notes.tracks.buffer,
      project.notes.families.buffer,
    ];
    this.post({ type: 'project', project }, buffers);
  }

  setSettings(
    visualization: VisualizationId,
    settings: VisualizationSettings,
  ): void {
    this.pendingSettings = { visualization, settings };
    if (this.settingsFrame) return;
    this.settingsFrame = requestAnimationFrame(() => {
      this.settingsFrame = 0;
      const pending = this.pendingSettings;
      this.pendingSettings = null;
      if (pending) {
        this.post({
          type: 'settings',
          visualization: pending.visualization,
          settings: pending.settings,
        });
      }
    });
  }

  setAppearance(appearance: RenderAppearance): void {
    this.pendingAppearance = appearance;
    if (this.appearanceFrame) return;
    this.appearanceFrame = requestAnimationFrame(() => {
      this.appearanceFrame = 0;
      const pending = this.pendingAppearance;
      this.pendingAppearance = null;
      if (pending) this.post({ type: 'appearance', appearance: pending });
    });
  }

  setBackgroundImage(bitmap: ImageBitmap | null): void {
    this.post(
      { type: 'background-image', bitmap },
      bitmap ? [bitmap] : [],
    );
  }

  setClock(clock: RenderClock): void {
    this.post({ type: 'clock', clock });
  }

  setVisibility(visible: boolean): void {
    this.post({ type: 'visibility', visible });
  }

  refresh(): void {
    this.post({ type: 'refresh' });
  }

  clear(): void {
    this.post({ type: 'clear' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.settingsFrame) cancelAnimationFrame(this.settingsFrame);
    if (this.appearanceFrame) cancelAnimationFrame(this.appearanceFrame);
    this.observer.disconnect();
    this.worker.terminate();
  }

  private post(
    message: RendererInboundMessage,
    transfer: Transferable[] = [],
  ): void {
    if (!this.disposed) this.worker.postMessage(message, transfer);
  }
}
