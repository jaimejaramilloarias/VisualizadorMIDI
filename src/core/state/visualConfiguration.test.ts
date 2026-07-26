import { describe, expect, it } from 'vitest';
import {
  SHAPE_IDS,
  cloneDefaultVisualConfiguration,
  createRenderAppearance,
  resolveTrackVisualStyle,
  sanitizeVisualConfiguration,
} from './visualConfiguration';

describe('visualConfiguration', () => {
  it('ofrece únicamente las ocho figuras simples', () => {
    expect(SHAPE_IDS).toHaveLength(8);
    expect(SHAPE_IDS.every((shape) => !shape.endsWith('Double'))).toBe(true);
  });

  it('convierte figuras dobles heredadas a su figura simple equivalente', () => {
    const result = sanitizeVisualConfiguration({
      global: {
        ...cloneDefaultVisualConfiguration().global,
        fpsMode: 'incorrecto' as 'auto',
        supersampling: 900,
      },
      families: {
        'Mi familia': {
          ...cloneDefaultVisualConfiguration().families['Custom 1'],
          color: '#ABCDEF',
          shape: 'hexagonDouble' as never,
        },
      },
      instruments: {},
    });

    expect(result.global.supersampling).toBe(3);
    expect(result.global.fpsMode).toBe('auto');
    expect(result.families['Mi familia'].color).toBe('#abcdef');
    expect(result.families['Mi familia'].shape).toBe('hexagon');
  });

  it('fija como iniciales los valores de animación leídos en la aplicación', () => {
    const result = cloneDefaultVisualConfiguration();

    expect(result.global).toMatchObject({
      velocityBase: 67,
      opacityEdge: 0,
      opacityCenter: 1,
      heightScale: 1.8,
      glowStrength: 0.1,
      bumpStrength: 1.1,
      travel: {
        enabled: true,
        intensity: 1,
        magnetZone: 1,
      },
    });
    expect(
      Object.values(result.families).every(
        (family) =>
          family.travel.enabled &&
          family.travel.intensity === 1 &&
          family.travel.magnetZone === 1,
      ),
    ).toBe(true);
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
