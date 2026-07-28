import { describe, expect, it } from 'vitest';
import {
  MAX_SYNC_ZOOM,
  detectRmsLandmarks,
  generateAdaptiveMidiGrid,
  insertFineTuneAnchor,
  resolveGridAnchorDrop,
  resolveSyncViewport,
  resolveTapAnchorTime,
  snapToAudioLandmark,
} from './syncEditorMath';

describe('syncEditorMath', () => {
  it('detecta máximos locales de energía RMS para el magnetismo', () => {
    const rms = new Float32Array([0.02, 0.08, 0.92, 0.12, 0.05, 0.76, 0.08]);
    const landmarks = detectRmsLandmarks(rms, 6);

    expect(landmarks.map((landmark) => landmark.time)).toEqual([2, 5]);
  });

  it('atrae una ancla solo cuando está dentro del umbral', () => {
    const landmarks = [
      { time: 2, strength: 0.9 },
      { time: 5, strength: 0.8 },
    ];

    expect(snapToAudioLandmark(2.08, landmarks, 0.1, true)).toBe(2);
    expect(snapToAudioLandmark(2.12, landmarks, 0.1, true)).toBe(2.12);
    expect(snapToAudioLandmark(2.02, landmarks, 0.1, false)).toBe(2.02);
    expect(resolveTapAnchorTime(4.82, landmarks, true)).toBe(5);
    expect(resolveTapAnchorTime(4.82, landmarks, false)).toBe(4.82);
  });

  it('mantiene el viewport dentro del audio al hacer zoom y desplazar', () => {
    expect(resolveSyncViewport(120, 4, 200)).toEqual({
      start: 90,
      duration: 30,
      zoom: 4,
      maximumStart: 90,
    });
    expect(resolveSyncViewport(120, 0.1, -20)).toEqual({
      start: 0,
      duration: 120,
      zoom: 1,
      maximumStart: 0,
    });
    expect(resolveSyncViewport(120, MAX_SYNC_ZOOM * 2, 20)).toEqual({
      start: 20,
      duration: 120 / MAX_SYNC_ZOOM,
      zoom: MAX_SYNC_ZOOM,
      maximumStart: 120 - 120 / MAX_SYNC_ZOOM,
    });
  });

  it('genera un grid musical adaptativo con compases y pulsos', () => {
    const lines = generateAdaptiveMidiGrid({
      tempoMap: [
        {
          tick: 0,
          seconds: 0,
          microsecondsPerBeat: 500_000,
        },
      ],
      ticksPerBeat: 480,
      timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
      visibleMidiStart: 0,
      visibleMidiEnd: 8,
      viewportWidth: 800,
      targetSpacingPixels: 50,
    });

    expect(lines.length).toBeLessThanOrEqual(600);
    expect(lines[0]).toMatchObject({
      tick: 0,
      midiTime: 0,
      hierarchy: 'major',
      kind: 'bar',
      label: '1',
    });
    expect(
      lines.some(
        (line) =>
          line.hierarchy === 'major' &&
          line.kind === 'bar' &&
          line.midiTime === 2,
      ),
    ).toBe(true);
    expect(lines.some((line) => line.kind === 'beat')).toBe(true);
  });

  it('respeta cambios de tempo al convertir el grid a segundos MIDI', () => {
    const lines = generateAdaptiveMidiGrid({
      tempoMap: [
        { tick: 0, seconds: 0, microsecondsPerBeat: 500_000 },
        { tick: 960, seconds: 1, microsecondsPerBeat: 1_000_000 },
      ],
      ticksPerBeat: 480,
      visibleMidiStart: 0,
      visibleMidiEnd: 5,
      viewportWidth: 1_200,
      targetSpacingPixels: 40,
    });

    expect(lines.some((line) => line.tick === 960 && line.midiTime === 1)).toBe(
      true,
    );
    expect(
      lines.some((line) => line.tick === 1_440 && line.midiTime === 2),
    ).toBe(true);
  });

  it('aplica magnetismo RMS al drop y conserva el orden de anclas', () => {
    const resolved = resolveGridAnchorDrop({
      requestedAudioTime: 10.16,
      midiTime: 5,
      anchors: [
        { id: 'previous', audioTime: 3, midiTime: 2 },
        { id: 'next', audioTime: 12, midiTime: 8 },
      ],
      audioDuration: 20,
      landmarks: [{ time: 10, strength: 0.9 }],
      magnetEnabled: true,
      snapWindowSeconds: 0.2,
    });

    expect(resolved).toMatchObject({
      audioTime: 10,
      midiTime: 5,
      snapped: true,
      snapLandmarkTime: 10,
      lowerBound: 3.001,
      upperBound: 11.999,
    });
  });

  it('limita un drop para que no cruce las anclas vecinas', () => {
    const resolved = resolveGridAnchorDrop({
      requestedAudioTime: 14,
      midiTime: 5,
      anchors: [
        { id: 'previous', audioTime: 3, midiTime: 2 },
        { id: 'next', audioTime: 12, midiTime: 8 },
      ],
      audioDuration: 20,
      landmarks: [{ time: 14, strength: 1 }],
      magnetEnabled: true,
    });

    expect(resolved.audioTime).toBeCloseTo(11.999, 3);
    expect(resolved.snapped).toBe(false);
  });

  it('inserta una corrección fina sin eliminar las anclas existentes', () => {
    const original = [
      { id: 'automatic-a', audioTime: 0, midiTime: 0 },
      { id: 'automatic-b', audioTime: 10, midiTime: 10 },
      { id: 'automatic-c', audioTime: 20, midiTime: 20 },
    ];
    const result = insertFineTuneAnchor({
      anchors: original,
      anchor: { id: 'manual', audioTime: 7, midiTime: 5 },
      audioDuration: 20,
    });

    expect(result).toHaveLength(4);
    expect(result.map((anchor) => anchor.id)).toEqual([
      'automatic-a',
      'manual',
      'automatic-b',
      'automatic-c',
    ]);
    expect(result.find((anchor) => anchor.id === 'manual')).toEqual({
      id: 'manual',
      audioTime: 7,
      midiTime: 5,
    });
  });

  it('rechaza pulsos duplicados para conservar una línea temporal estricta', () => {
    const original = [
      { id: 'automatic-a', audioTime: 0, midiTime: 0 },
      { id: 'automatic-b', audioTime: 10, midiTime: 10 },
    ];
    const result = insertFineTuneAnchor({
      anchors: original,
      anchor: { id: 'manual', audioTime: 8, midiTime: 10 },
      audioDuration: 20,
    });

    expect(result).toEqual(original);
  });
});
