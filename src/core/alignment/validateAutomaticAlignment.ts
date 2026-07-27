import {
  createSyncTimeline,
  normalizeAnchors,
  type SyncAnchor,
} from '../state/visualizationState';
import type { AutomaticAlignmentResult } from './types';

export type AutomaticAlignmentValidation =
  | {
      ok: true;
      anchors: SyncAnchor[];
    }
  | {
      ok: false;
      message: string;
    };

export const validateAutomaticAlignment = ({
  result,
  audioDuration,
  midiDuration,
  idPrefix,
  endpointTolerance = 0.01,
  sourceTolerance = 0.05,
}: {
  result: AutomaticAlignmentResult;
  audioDuration: number;
  midiDuration: number;
  idPrefix: string;
  endpointTolerance?: number;
  sourceTolerance?: number;
}): AutomaticAlignmentValidation => {
  const anchors = normalizeAnchors(
    result.anchors.map((anchor, index) => ({
      id: `${idPrefix}-${index}`,
      audioTime: anchor.audioTime,
      midiTime: anchor.midiTime,
    })),
  );

  if (anchors.length < 2) {
    return {
      ok: false,
      message:
        'El análisis no encontró suficientes puntos de sincronía fiables.',
    };
  }

  if (
    anchors.some(
      (anchor) =>
        anchor.audioTime > audioDuration + sourceTolerance ||
        anchor.midiTime > midiDuration + sourceTolerance,
    )
  ) {
    return {
      ok: false,
      message: 'La propuesta contiene anclas fuera del MIDI o del audio.',
    };
  }

  const terminalAnchor = anchors.at(-1);
  if (
    !terminalAnchor ||
    Math.abs(terminalAnchor.audioTime - audioDuration) >
      endpointTolerance ||
    Math.abs(terminalAnchor.midiTime - midiDuration) > endpointTolerance
  ) {
    return {
      ok: false,
      message:
        'La propuesta no pudo cerrar el audio en el último note off del MIDI.',
    };
  }

  const exactAnchors = normalizeAnchors([
    ...anchors.slice(0, -1),
    {
      ...terminalAnchor,
      audioTime: audioDuration,
      midiTime: midiDuration,
    },
  ]);

  if (
    exactAnchors.length < 2 ||
    !createSyncTimeline(exactAnchors).forward
  ) {
    return {
      ok: false,
      message: 'La propuesta automática no conserva el orden del MIDI.',
    };
  }

  return { ok: true, anchors: exactAnchors };
};
