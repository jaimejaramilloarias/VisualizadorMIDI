import type { PackedMidiProject } from '../core/midi/types';
import type { VisualizationSettings } from '../core/state/visualizationState';
import type { RenderAppearance } from '../core/state/visualConfiguration';

export interface RenderClock {
  midiTime: number;
  epochTime: number;
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
  displayFps: number;
  targetFps: number;
}

export interface RenderNoteSelection {
  noteIndex: number;
  trackIndex: number;
  midiTime: number;
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
      settings: VisualizationSettings;
    }
  | { type: 'appearance'; appearance: RenderAppearance }
  | { type: 'display-refresh-rate'; fps: number }
  | { type: 'clock'; clock: RenderClock }
  | { type: 'end-card-timeline'; startMidiTime: number | null }
  | { type: 'visibility'; visible: boolean }
  | { type: 'hit-test'; x: number; y: number }
  | { type: 'refresh' }
  | { type: 'clear' };

export type RendererOutboundMessage =
  | { type: 'ready' }
  | { type: 'telemetry'; telemetry: RenderTelemetry }
  | { type: 'note-selected'; selection: RenderNoteSelection }
  | { type: 'error'; message: string };
