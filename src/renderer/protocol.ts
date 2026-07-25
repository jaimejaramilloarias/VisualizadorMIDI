import type { PackedMidiProject } from '../core/midi/types';
import type {
  VisualizationId,
  VisualizationSettings,
} from '../core/state/visualizationState';

export interface RenderClock {
  midiTime: number;
  performanceTime: number;
  playing: boolean;
}

export interface RenderTelemetry {
  fps: number;
  frameP95: number;
  visibleNotes: number;
  renderWidth: number;
  renderHeight: number;
  scale: number;
}

export type RendererInboundMessage =
  | {
      type: 'init';
      canvas: OffscreenCanvas;
      width: number;
      height: number;
      devicePixelRatio: number;
    }
  | {
      type: 'resize';
      width: number;
      height: number;
      devicePixelRatio: number;
    }
  | { type: 'project'; project: PackedMidiProject }
  | {
      type: 'settings';
      visualization: VisualizationId;
      settings: VisualizationSettings;
    }
  | { type: 'clock'; clock: RenderClock }
  | { type: 'clear' };

export type RendererOutboundMessage =
  | { type: 'ready' }
  | { type: 'telemetry'; telemetry: RenderTelemetry }
  | { type: 'error'; message: string };
