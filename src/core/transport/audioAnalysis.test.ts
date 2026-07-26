import { describe, expect, it } from 'vitest';
import { detectInitialSilence } from './audioAnalysis';

describe('detectInitialSilence', () => {
  it('encuentra el primer contenido audible después del silencio inicial', () => {
    const sampleRate = 1_000;
    const channel = new Float32Array(1_000);
    channel.fill(0.2, 500);

    expect(detectInitialSilence([channel], sampleRate)).toBeCloseTo(0.5, 3);
  });

  it('considera todos los canales al detectar el inicio', () => {
    const sampleRate = 1_000;
    const left = new Float32Array(1_000);
    const right = new Float32Array(1_000);
    right.fill(0.25, 250);

    expect(detectInitialSilence([left, right], sampleRate)).toBeCloseTo(0.25, 3);
  });

  it('mantiene cero cuando el archivo completo es silencioso', () => {
    expect(
      detectInitialSilence([new Float32Array(1_000)], 1_000),
    ).toBe(0);
  });
});
