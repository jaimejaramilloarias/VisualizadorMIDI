import type { PackedMidiProject } from '../core/midi/types';
import type { VisualizationSettings } from '../core/state/visualizationState';
import type { RenderAppearance } from '../core/state/visualConfiguration';
import type {
  RenderClock,
  RendererInboundMessage,
  RendererOutboundMessage,
  RenderNoteSelection,
  RenderTelemetry,
} from './protocol';

export interface RendererBridgeOptions {
  onTelemetry?: (telemetry: RenderTelemetry) => void;
  onNoteSelect?: (selection: RenderNoteSelection) => void;
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
  private refreshSampleFrame = 0;
  private refreshSampleTimer = 0;
  private detectedDisplayRefreshRate = 0;
  private lowerRefreshSamples = 0;
  private rendererPlaying = false;
  private pendingSettings: VisualizationSettings | null = null;
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
      } else if (event.data.type === 'note-selected') {
        options.onNoteSelect?.(event.data.selection);
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

    this.observer = new ResizeObserver(() => {
      if (this.disposed) return;
      const visibleBounds = this.canvas.getBoundingClientRect();
      const nextWidth = Math.max(1, visibleBounds.width);
      const nextHeight = Math.max(1, visibleBounds.height);
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
    if (canvas.parentElement) this.observer.observe(canvas.parentElement);
    this.measureDisplayRefreshRate();
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

  setSettings(settings: VisualizationSettings): void {
    this.pendingSettings = settings;
    if (this.settingsFrame) return;
    this.settingsFrame = requestAnimationFrame(() => {
      this.settingsFrame = 0;
      const pending = this.pendingSettings;
      this.pendingSettings = null;
      if (pending) {
        this.post({ type: 'settings', settings: pending });
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

  setClock(clock: RenderClock): void {
    this.rendererPlaying = clock.playing;
    this.post({ type: 'clock', clock });
  }

  setEndCardTimeline(startMidiTime: number | null): void {
    this.post({ type: 'end-card-timeline', startMidiTime });
  }

  setVisibility(visible: boolean): void {
    this.post({ type: 'visibility', visible });
  }

  hitTest(x: number, y: number): void {
    this.post({ type: 'hit-test', x, y });
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
    if (this.refreshSampleFrame) {
      cancelAnimationFrame(this.refreshSampleFrame);
    }
    if (this.refreshSampleTimer) {
      window.clearTimeout(this.refreshSampleTimer);
    }
    this.observer.disconnect();
    this.worker.terminate();
  }

  private post(
    message: RendererInboundMessage,
    transfer: Transferable[] = [],
  ): void {
    if (!this.disposed) this.worker.postMessage(message, transfer);
  }

  private measureDisplayRefreshRate(): void {
    const intervals: number[] = [];
    let previous = 0;
    const sample = (now: number): void => {
      if (this.disposed) return;
      if (previous > 0) intervals.push(now - previous);
      previous = now;
      if (intervals.length < 24) {
        this.refreshSampleFrame = requestAnimationFrame(sample);
        return;
      }
      this.refreshSampleFrame = 0;
      const sorted = [...intervals].sort((left, right) => left - right);
      const representative =
        sorted[Math.floor(sorted.length * 0.2)] || 1000 / 60;
      const measured = Math.min(
        240,
        Math.max(30, Math.round(1000 / representative)),
      );
      const commonRates = [30, 48, 50, 60, 72, 75, 90, 100, 120, 144, 165, 240];
      const nearest = commonRates.reduce((best, candidate) =>
        Math.abs(candidate - measured) < Math.abs(best - measured)
          ? candidate
          : best,
      );
      const normalized =
        Math.abs(nearest - measured) / nearest <= 0.1 ? nearest : measured;
      if (
        this.detectedDisplayRefreshRate === 0 ||
        normalized > this.detectedDisplayRefreshRate
      ) {
        this.detectedDisplayRefreshRate = normalized;
        this.lowerRefreshSamples = 0;
      } else if (
        normalized < this.detectedDisplayRefreshRate &&
        !this.rendererPlaying
      ) {
        this.lowerRefreshSamples += 1;
        if (this.lowerRefreshSamples >= 3) {
          this.detectedDisplayRefreshRate = normalized;
          this.lowerRefreshSamples = 0;
        }
      } else {
        this.lowerRefreshSamples = 0;
      }
      this.post({
        type: 'display-refresh-rate',
        fps: this.detectedDisplayRefreshRate || normalized,
      });
      this.refreshSampleTimer = window.setTimeout(() => {
        this.refreshSampleTimer = 0;
        this.measureDisplayRefreshRate();
      }, 3000);
    };
    this.refreshSampleFrame = requestAnimationFrame(sample);
  }
}
