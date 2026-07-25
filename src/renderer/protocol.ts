import type { PackedMidiProject } from '../core/midi/types';
import type {
  VisualizationId,
  VisualizationSettings,
} from '../core/state/visualizationState';
import type { RenderAppearance } from '../core/state/visualConfiguration';

export interface RenderClock {
  midiTime: number;
  performanceTime: number;
  playing: boolean;
  playbackRate: number;
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
  | { type: 'appearance'; appearance: RenderAppearance }
  | { type: 'background-image'; bitmap: ImageBitmap | null }
  | { type: 'clock'; clock: RenderClock }
  | { type: 'visibility'; visible: boolean }
  | { type: 'refresh' }
  | { type: 'clear' };

export type RendererOutboundMessage =
  | { type: 'ready' }
  | { type: 'telemetry'; telemetry: RenderTelemetry }
  | { type: 'error'; message: string };
