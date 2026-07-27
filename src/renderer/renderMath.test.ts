import { describe, expect, it } from 'vitest';
import {
  advanceFrameCadence,
  computeNoteOnBumpScale,
  computeNoteOnGlowPresentation,
  computeNoteOnGlowStrength,
  computeHorizontalViewport,
  computePastExtensionBounds,
  composeTravelStyle,
  computeRenderScale,
  computeVisualPostRollDuration,
  curveTravelOffset,
  extrapolateMidiTime,
  familyDepthPriority,
  lockNoteOnArrivalOffset,
  noteOnBumpEnvelope,
  noteOnGlowEnvelope,
  resolveTargetFps,
} from './renderMath';

describe('computeHorizontalViewport', () => {
  it('centra NOW y reparte la ventana temporal por mitades exactas', () => {
    expect(computeHorizontalViewport(1200, 8)).toEqual({
      playheadX: 600,
      pastSeconds: 4,
      futureSeconds: 4,
      pixelsPerSecond: 150,
    });
  });

  it('reserva el recorrido de NOW al borde izquierdo más un margen', () => {
    expect(computeVisualPostRollDuration(8)).toBeCloseTo(4.1);
    expect(computeVisualPostRollDuration(12)).toBeCloseTo(6.1);
  });
});

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

describe('familyDepthPriority', () => {
  it('ordena las familias desde el fondo hasta el frente solicitado', () => {
    const families = [
      'Metales',
      'Cuerdas frotadas',
      'Maderas de timbre "redondo"',
      'Auxiliares',
      'Percusión menor',
    ];

    expect(
      families.sort(
        (left, right) =>
          familyDepthPriority(left) - familyDepthPriority(right),
      ),
    ).toEqual([
      'Percusión menor',
      'Auxiliares',
      'Maderas de timbre "redondo"',
      'Cuerdas frotadas',
      'Metales',
    ]);
  });

  it('incluye las subfamilias instrumentales en su plano correcto', () => {
    expect(familyDepthPriority('Platillos')).toBe(0);
    expect(familyDepthPriority('Saxofones')).toBe(2);
    expect(familyDepthPriority('Cornos')).toBe(4);
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

  it('inicia glow y bump únicamente después del note on', () => {
    expect(noteOnGlowEnvelope(9.5, 10)).toBe(0);
    expect(noteOnGlowEnvelope(9.999, 10)).toBe(0);
    expect(noteOnGlowEnvelope(10, 10)).toBe(0);
    expect(noteOnBumpEnvelope(9.999, 10)).toBe(0);
    expect(noteOnBumpEnvelope(10, 10)).toBe(0);
    expect(noteOnGlowEnvelope(10.02, 10)).toBeGreaterThan(0);
    expect(noteOnBumpEnvelope(10.02, 10)).toBeGreaterThan(0);
  });

  it('produce pulsos rápidos con entrada y salida progresivas', () => {
    const glowAttack = noteOnGlowEnvelope(10.0175, 10);
    const glowPeak = noteOnGlowEnvelope(10.035, 10);
    const glowRelease = noteOnGlowEnvelope(10.135, 10);
    const bumpPeak = noteOnBumpEnvelope(10.028, 10);

    expect(glowAttack).toBeGreaterThan(0);
    expect(glowAttack).toBeLessThan(glowPeak);
    expect(glowPeak).toBeCloseTo(1);
    expect(glowRelease).toBeGreaterThan(0);
    expect(glowRelease).toBeLessThan(glowPeak);
    expect(bumpPeak).toBeCloseTo(1);
    expect(noteOnGlowEnvelope(10.28, 10)).toBeCloseTo(0);
    expect(noteOnBumpEnvelope(10.2, 10)).toBe(0);
  });

  it('hace que los controles globales modifiquen claramente cada pulso', () => {
    const baseGlow = computeNoteOnGlowStrength({
      pulse: 1,
      sceneGlow: 0.8,
      globalGlow: 0,
      familyGlow: 0.1,
    });
    const boostedGlow = computeNoteOnGlowStrength({
      pulse: 1,
      sceneGlow: 0.8,
      globalGlow: 2,
      familyGlow: 0.1,
    });

    expect(
      computeNoteOnGlowStrength({
        pulse: 1,
        sceneGlow: 0,
        globalGlow: 0,
        familyGlow: 0,
      }),
    ).toBe(0);
    expect(boostedGlow).toBeGreaterThan(baseGlow * 1.8);
    expect(
      computeNoteOnGlowStrength({
        pulse: 1,
        sceneGlow: 6,
        globalGlow: 0,
        familyGlow: 0,
      }),
    ).toBe(
      computeNoteOnGlowStrength({
        pulse: 1,
        sceneGlow: 0.5,
        globalGlow: 0,
        familyGlow: 0,
      }) * 12,
    );
    expect(
      computeNoteOnBumpScale({
        pulse: 0,
        globalBump: 3,
        familyBump: 3,
      }),
    ).toBe(1);
    expect(
      computeNoteOnBumpScale({
        pulse: 1,
        globalBump: 6,
        familyBump: 6,
      }),
    ).toBeGreaterThan(3);
  });

  it('calcula un halo propio sin depender de la opacidad de la figura', () => {
    const subtle = computeNoteOnGlowPresentation({
      strength: 0.5,
      velocity: 0.8,
      noteHeight: 20,
    });
    const intense = computeNoteOnGlowPresentation({
      strength: 6,
      velocity: 0.8,
      noteHeight: 20,
    });

    expect(subtle.alpha).toBeGreaterThan(0);
    expect(intense.alpha).toBeGreaterThan(subtle.alpha);
    expect(intense.radius).toBeGreaterThan(subtle.radius * 1.5);
  });
});

describe('curveTravelOffset', () => {
  it('combina el control global con la familia o instrumento', () => {
    const composed = composeTravelStyle(
      { enabled: true, intensity: 1.5, magnetZone: 1.4 },
      { enabled: true, intensity: 0.8, magnetZone: 0.75 },
    );

    expect(composed.enabled).toBe(true);
    expect(composed.intensity).toBeCloseTo(1.2);
    expect(composed.magnetZone).toBeCloseTo(1.05);
    expect(
      composeTravelStyle(
        { enabled: false, intensity: 2, magnetZone: 2 },
        { enabled: true, intensity: 2, magnetZone: 2 },
      ),
    ).toEqual({
      enabled: false,
      intensity: 2,
      magnetZone: 2,
    });
  });

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

  it('mantiene completamente lineal el movimiento a la izquierda de NOW', () => {
    const result = curveTravelOffset({
      offset: -240,
      canvasWidth: 1200,
      intensity: 1.7,
      magnetZone: 0.8,
      enabled: true,
      released: false,
    });

    expect(result).toBe(-240);
  });

  it('mantiene las notas futuras lejos de NOW durante la aproximación inicial', () => {
    const curvedOffset = curveTravelOffset({
      offset: 240,
      canvasWidth: 1200,
      intensity: 1,
      magnetZone: 1,
      enabled: true,
      released: false,
    });

    expect(curvedOffset).toBeGreaterThan(240);
  });

  it('acelera la llegada magnética al entrar en el tramo cercano a NOW', () => {
    const offsetAt = (offset: number) =>
      curveTravelOffset({
        offset,
        canvasWidth: 1200,
        intensity: 1,
        magnetZone: 1,
        enabled: true,
        released: false,
      });
    const farTravel = offsetAt(500) - offsetAt(460);
    const nearTravel = offsetAt(120) - offsetAt(80);

    expect(nearTravel).toBeGreaterThan(farTravel);
  });

  it('hace perceptible todo el rango de intensidad, incluso por encima de 1×', () => {
    const positionAtIntensity = (intensity: number) =>
      curveTravelOffset({
        offset: 180,
        canvasWidth: 1200,
        intensity,
        magnetZone: 1,
        enabled: true,
        released: false,
      });

    expect(positionAtIntensity(0)).toBeCloseTo(180);
    expect(positionAtIntensity(1)).toBeGreaterThan(
      positionAtIntensity(0.5),
    );
    expect(positionAtIntensity(2)).toBeGreaterThan(
      positionAtIntensity(1),
    );
  });

  it('amplía claramente la zona afectada al aumentar la zona de aceleración', () => {
    const offset = 600;
    const narrowZone = curveTravelOffset({
      offset,
      canvasWidth: 1200,
      intensity: 1,
      magnetZone: 0.5,
      enabled: true,
      released: false,
    });
    const wideZone = curveTravelOffset({
      offset,
      canvasWidth: 1200,
      intensity: 1,
      magnetZone: 2,
      enabled: true,
      released: false,
    });

    expect(narrowZone).toBe(offset);
    expect(wideZone).toBeGreaterThan(offset);
  });
});

describe('lockNoteOnArrivalOffset', () => {
  it('nunca estaciona una nota futura en NOW y fija el impacto en cero', () => {
    expect(lockNoteOnArrivalOffset(-12, 5)).toBe(5);
    expect(lockNoteOnArrivalOffset(Number.NaN, 5)).toBe(5);
    expect(lockNoteOnArrivalOffset(0.001, 0)).toBe(0);
    expect(lockNoteOnArrivalOffset(12, -5)).toBe(-5);
  });

  it('solo alcanza NOW cuando el tiempo restante al note on es cero', () => {
    const canvasWidth = 1200;
    const pixelsPerSecond = 100;
    const positionAt = (secondsUntilNoteOn: number) => {
      const linearOffset = secondsUntilNoteOn * pixelsPerSecond;
      return lockNoteOnArrivalOffset(
        curveTravelOffset({
          offset: linearOffset,
          canvasWidth,
          intensity: 1,
          magnetZone: 1,
          enabled: true,
          released: false,
        }),
        linearOffset,
      );
    };

    expect([2, 1, 0.1, 0.001].every((time) => positionAt(time) > 0)).toBe(
      true,
    );
    expect(positionAt(0)).toBe(0);
    expect(positionAt(-0.001)).toBeLessThan(0);
  });
});

describe('computePastExtensionBounds', () => {
  it('mantiene el borde derecho en NOW y extiende solo hacia PAST', () => {
    const start = computePastExtensionBounds({
      playheadX: 400,
      baseWidth: 12,
      finalWidth: 120,
      progress: 0,
    });
    const middle = computePastExtensionBounds({
      playheadX: 400,
      baseWidth: 12,
      finalWidth: 120,
      progress: 0.5,
    });
    const end = computePastExtensionBounds({
      playheadX: 400,
      baseWidth: 12,
      finalWidth: 120,
      progress: 1,
    });

    expect(start.x + start.width).toBe(400);
    expect(middle.x + middle.width).toBe(400);
    expect(end.x + end.width).toBe(400);
    expect(middle.x).toBeLessThan(start.x);
    expect(end.x).toBeLessThan(middle.x);
  });
});
