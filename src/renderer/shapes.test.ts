import { describe, expect, it, vi } from 'vitest';
import { drawNoteShape } from './shapes';

describe('drawNoteShape', () => {
  it('traza la estrella de cuatro puntas con ocho lados suavemente cóncavos', () => {
    const context = {
      beginPath: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      fillStyle: '',
      moveTo: vi.fn(),
      quadraticCurveTo: vi.fn(),
    } as unknown as OffscreenCanvasRenderingContext2D;

    drawNoteShape(
      context,
      'fourPointStar',
      10,
      20,
      100,
      80,
      '#ffd500',
      '#ffd500',
    );

    expect(context.moveTo).toHaveBeenCalledWith(60, 20);
    expect(context.quadraticCurveTo).toHaveBeenCalledTimes(8);
    expect(context.quadraticCurveTo).toHaveBeenNthCalledWith(
      1,
      63,
      37.6,
      72,
      50.4,
    );
    expect(context.quadraticCurveTo).toHaveBeenNthCalledWith(
      8,
      57,
      37.6,
      60,
      20,
    );
    expect(context.closePath).toHaveBeenCalledOnce();
    expect(context.fill).toHaveBeenCalledOnce();
  });
});
