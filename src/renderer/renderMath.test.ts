import { describe, expect, it } from 'vitest';
import { curveTravelOffset, computeRenderScale } from './renderMath';

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
