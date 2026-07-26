import { describe, expect, it } from 'vitest';
import {
  MAX_SYNC_ZOOM,
  detectRmsLandmarks,
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
});
