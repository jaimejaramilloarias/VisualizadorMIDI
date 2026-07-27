import { describe, expect, it } from 'vitest';
import type { AutomaticAlignmentResult } from './types';
import { validateAutomaticAlignment } from './validateAutomaticAlignment';

const result = (
  anchors: AutomaticAlignmentResult['anchors'],
): AutomaticAlignmentResult =>
  ({
    anchors,
    confidence: 0.8,
    diagnostics: {},
  }) as AutomaticAlignmentResult;

describe('validación antes de aplicar una alineación automática', () => {
  it('acepta una curva ascendente con cierre exacto', () => {
    const validation = validateAutomaticAlignment({
      result: result([
        { audioTime: 0, midiTime: 0, confidence: 0.8 },
        { audioTime: 5, midiTime: 4.5, confidence: 0.8 },
        { audioTime: 10, midiTime: 9, confidence: 0.8 },
      ]),
      audioDuration: 10,
      midiDuration: 9,
      idPrefix: 'auto',
    });

    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.anchors.at(-1)).toEqual({
        id: 'auto-2',
        audioTime: 10,
        midiTime: 9,
      });
    }
  });

  it('corrige al extremo exacto una diferencia subcuadro del análisis', () => {
    const validation = validateAutomaticAlignment({
      result: result([
        { audioTime: 0, midiTime: 0, confidence: 0.8 },
        { audioTime: 5, midiTime: 4.5, confidence: 0.8 },
        { audioTime: 9.996, midiTime: 8.996, confidence: 0.8 },
      ]),
      audioDuration: 10,
      midiDuration: 9,
      idPrefix: 'auto',
    });

    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.anchors.at(-1)).toEqual({
        id: 'auto-2',
        audioTime: 10,
        midiTime: 9,
      });
    }
  });

  it('rechaza un cierre que no coincide con el último note off', () => {
    const validation = validateAutomaticAlignment({
      result: result([
        { audioTime: 0, midiTime: 0, confidence: 0.8 },
        { audioTime: 10, midiTime: 8.5, confidence: 0.8 },
      ]),
      audioDuration: 10,
      midiDuration: 9,
      idPrefix: 'auto',
    });

    expect(validation).toEqual({
      ok: false,
      message:
        'La propuesta no pudo cerrar el audio en el último note off del MIDI.',
    });
  });

  it('rechaza curvas que harían retroceder el MIDI', () => {
    const validation = validateAutomaticAlignment({
      result: result([
        { audioTime: 0, midiTime: 0, confidence: 0.8 },
        { audioTime: 4, midiTime: 5, confidence: 0.8 },
        { audioTime: 7, midiTime: 4, confidence: 0.8 },
        { audioTime: 10, midiTime: 6, confidence: 0.8 },
      ]),
      audioDuration: 10,
      midiDuration: 6,
      idPrefix: 'auto',
    });

    expect(validation).toEqual({
      ok: false,
      message: 'La propuesta automática no conserva el orden del MIDI.',
    });
  });
});
