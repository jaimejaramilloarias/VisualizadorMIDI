import type { PackedMidiProject } from '../core/midi/types';
import type {
  VisualizationId,
  VisualizationSettings,
} from '../core/state/visualizationState';
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
    this.post(
      {
        type: 'init',
        canvas: offscreen,
        width: Math.max(1, bounds.width),
        height: Math.max(1, bounds.height),
        devicePixelRatio: window.devicePixelRatio || 1,
      },
      [offscreen],
    );

    this.observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry || this.disposed) return;
      const { width, height } = entry.contentRect;
      this.post({
        type: 'resize',
        width: Math.max(1, width),
        height: Math.max(1, height),
        devicePixelRatio: window.devicePixelRatio || 1,
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
    this.post({ type: 'settings', visualization, settings });
  }

  setClock(clock: RenderClock): void {
    this.post({ type: 'clock', clock });
  }

  clear(): void {
    this.post({ type: 'clear' });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
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
