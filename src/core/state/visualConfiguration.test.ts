import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIGURE_COLOR,
  SHAPE_IDS,
  cloneDefaultVisualConfiguration,
  createRenderAppearance,
  resolveTrackVisualStyle,
  resolveTrackVisualStyleAtTime,
  sanitizeVisualConfiguration,
} from './visualConfiguration';

describe('visualConfiguration', () => {
  it('ofrece únicamente las ocho figuras simples', () => {
    expect(SHAPE_IDS).toHaveLength(8);
    expect(SHAPE_IDS.every((shape) => !shape.endsWith('Double'))).toBe(true);
  });

  it('usa RGB 255, 213, 0 como color inicial de todas las familias', () => {
    const configuration = cloneDefaultVisualConfiguration();
    expect(
      Object.values(configuration.families).every(
        (family) => family.color === DEFAULT_FIGURE_COLOR,
      ),
    ).toBe(true);
    expect(DEFAULT_FIGURE_COLOR).toBe('#ffd500');
  });

  it('convierte figuras dobles heredadas a su figura simple equivalente', () => {
    const result = sanitizeVisualConfiguration({
      global: {
        ...cloneDefaultVisualConfiguration().global,
        fpsMode: 'incorrecto' as 'auto',
        supersampling: 900,
        glowStrength: 900,
        bumpStrength: 900,
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
    expect(result.global.glowStrength).toBe(6);
    expect(result.global.bumpStrength).toBe(6);
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

  it('aplica cambios de figura y color desde un punto MIDI persistible', () => {
    const configuration = cloneDefaultVisualConfiguration();
    configuration.instruments.Flauta = {
      color: '#112233',
      shape: 'circle',
      cues: [
        { at: 12.5, color: '#abcdef' },
        { at: 18, shape: 'triangle' },
      ],
    };
    const track = {
      id: 0,
      name: 'Flauta',
      instrument: 'Flauta',
      family: 'woodwinds' as const,
      noteCount: 12,
    };

    expect(resolveTrackVisualStyleAtTime(track, configuration, 12).color).toBe(
      '#112233',
    );
    expect(
      resolveTrackVisualStyleAtTime(track, configuration, 12.5).color,
    ).toBe('#abcdef');
    expect(resolveTrackVisualStyleAtTime(track, configuration, 20)).toMatchObject(
      {
        color: '#abcdef',
        shape: 'triangle',
      },
    );
    expect(createRenderAppearance([track], configuration).trackCues).toHaveLength(
      1,
    );
    expect(createRenderAppearance([track], configuration).trackCues[0]).toHaveLength(
      2,
    );
  });

  it('permite activar etiquetas solo en instrumentos elegidos', () => {
    const configuration = cloneDefaultVisualConfiguration();
    configuration.instruments.Flauta = { noteLabelsEnabled: true };
    const track = {
      id: 0,
      name: 'Flauta',
      instrument: 'Flauta',
      family: 'woodwinds' as const,
      noteCount: 12,
    };

    expect(
      resolveTrackVisualStyle(track, configuration).noteLabelsEnabled,
    ).toBe(true);
    expect(configuration.global.noteLabels.enabled).toBe(false);
  });
});
