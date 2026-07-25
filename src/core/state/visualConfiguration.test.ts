import { describe, expect, it } from 'vitest';
import {
  SHAPE_IDS,
  cloneDefaultVisualConfiguration,
  createRenderAppearance,
  resolveTrackVisualStyle,
  sanitizeVisualConfiguration,
} from './visualConfiguration';

describe('visualConfiguration', () => {
  it('conserva las 16 figuras del prototipo original', () => {
    expect(SHAPE_IDS).toHaveLength(16);
    expect(SHAPE_IDS).toContain('sixPointStarDouble');
    expect(SHAPE_IDS).toContain('roundedSquareDouble');
  });

  it('sanea configuraciones heredadas sin perder familias personalizadas', () => {
    const result = sanitizeVisualConfiguration({
      global: {
        ...cloneDefaultVisualConfiguration().global,
        fixedFps: 900,
      },
      families: {
        'Mi familia': {
          ...cloneDefaultVisualConfiguration().families['Custom 1'],
          color: '#ABCDEF',
          shape: 'hexagonDouble',
        },
      },
      instruments: {},
    });

    expect(result.global.fixedFps).toBe(240);
    expect(result.families['Mi familia'].color).toBe('#abcdef');
    expect(result.families['Mi familia'].shape).toBe('hexagonDouble');
  });

  it('permite sobreescritura por instrumento sin alterar su familia', () => {
    const configuration = cloneDefaultVisualConfiguration();
    configuration.instruments.Flauta = {
      family: 'Custom 2',
      color: '#123456',
      enabled: false,
    };

    const style = resolveTrackVisualStyle(
      {
        id: 0,
        name: 'Flauta',
        instrument: 'Flauta',
        family: 'woodwinds',
        noteCount: 12,
      },
      configuration,
    );

    expect(style.family).toBe('Custom 2');
    expect(style.color).toBe('#123456');
    expect(style.enabled).toBe(false);
    expect(style.shape).toBe('circle');
  });

  it('respeta reglas globales de figura y el desplazamiento de tono', () => {
    const configuration = cloneDefaultVisualConfiguration();
    configuration.instruments.Flauta = {
      family: 'Custom 2',
      color: '#ff0000',
      extension: true,
    };
    configuration.shapeExtensions.circle = false;
    configuration.global.colorToneShift = 120;
    const track = {
      id: 0,
      name: 'Flauta',
      instrument: 'Flauta',
      family: 'woodwinds' as const,
      noteCount: 12,
    };

    expect(resolveTrackVisualStyle(track, configuration).extension).toBe(false);
    expect(createRenderAppearance([track], configuration).tracks[0].color).toBe(
      '#00ff00',
    );
  });
});
