import { describe, expect, it } from 'vitest';
import {
  advanceFrameCadence,
  curveTravelOffset,
  computeRenderScale,
  extrapolateMidiTime,
  noteOnGlowEnvelope,
  resolveTargetFps,
} from './renderMath';

describe('computeRenderScale', () => {
  it('respeta el presupuesto de píxeles incluso en un canvas 8K', () => {
    const scale = computeRenderScale({
      cssWidth: 7680,
      cssHeight: 4320,
      devicePixelRatio: 2,
      quality: 'auto',
      adaptiveRatio: 1,
      supersampling: 2,
    });

    expect(scale).toBeLessThan(1);
    expect(7680 * 4320 * scale ** 2).toBeLessThanOrEqual(10_000_001);
  });

  it('conserva densidad retina cuando cabe en el presupuesto', () => {
    expect(
      computeRenderScale({
        cssWidth: 1024,
        cssHeight: 768,
        devicePixelRatio: 2,
        quality: 'auto',
        adaptiveRatio: 1,
        supersampling: 2,
      }),
    ).toBe(2);
  });
});

describe('reloj y cadencia', () => {
  it('extrapola el tiempo MIDI continuamente usando una época compartida', () => {
    expect(
      extrapolateMidiTime({
        midiTime: 12,
        anchorEpochTime: 1_000_000,
        nowEpochTime: 1_000_250,
        playing: true,
        playbackRate: 1,
      }),
    ).toBe(12.25);
  });

  it('resuelve Auto, 60 y 30 contra la frecuencia física', () => {
    expect(resolveTargetFps('auto', 120)).toBe(120);
    expect(resolveTargetFps('60', 120)).toBe(60);
    expect(resolveTargetFps('30', 120)).toBe(30);
    expect(resolveTargetFps('60', 50)).toBe(50);
  });

  it('presenta uno de cada dos cuadros para 60 FPS en una pantalla de 120 Hz', () => {
    let accumulator = 0;
    const presented = Array.from({ length: 8 }, () => {
      const result = advanceFrameCadence({
        accumulator,
        delta: 1000 / 120,
        targetFps: 60,
      });
      accumulator = result.accumulator;
      return result.present;
    });

    expect(presented).toEqual([
      false,
      true,
      false,
      true,
      false,
      true,
      false,
      true,
    ]);
  });

  it('no calcula glow para notas que todavía no han comenzado', () => {
    expect(noteOnGlowEnvelope(9.5, 10)).toBe(0);
    expect(noteOnGlowEnvelope(10, 10)).toBe(1);
    expect(noteOnGlowEnvelope(10.28, 10)).toBeCloseTo(0);
  });
});

describe('curveTravelOffset', () => {
  it('mantiene el desplazamiento lineal cuando la curva está desactivada', () => {
    expect(
      curveTravelOffset({
        offset: 240,
        canvasWidth: 1200,
        intensity: 1,
        magnetZone: 0.5,
        enabled: false,
        released: false,
      }),
    ).toBe(240);
  });

  it('produce desplazamientos finitos y conserva el sentido', () => {
    const result = curveTravelOffset({
      offset: -240,
      canvasWidth: 1200,
      intensity: 1.7,
      magnetZone: 0.8,
      enabled: true,
      released: false,
    });

    expect(Number.isFinite(result)).toBe(true);
    expect(result).toBeLessThan(0);
  });
});
