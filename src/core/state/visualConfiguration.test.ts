import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIGURE_COLOR,
  SHAPE_IDS,
  cloneDefaultVisualConfiguration,
  createDistinctFamilyColors,
  createRenderAppearance,
  migrateV1VisualConfiguration,
  resolveTrackVisualStyle,
  resolveTrackVisualStyleAtTime,
  sanitizeVisualConfiguration,
} from './visualConfiguration';

describe('visualConfiguration', () => {
  it('ofrece únicamente las ocho figuras simples', () => {
    expect(SHAPE_IDS).toHaveLength(8);
    expect(SHAPE_IDS.every((shape) => !shape.endsWith('Double'))).toBe(true);
  });

  it('conserva el amarillo de acento y la paleta familiar capturada', () => {
    const configuration = cloneDefaultVisualConfiguration();
    expect(DEFAULT_FIGURE_COLOR).toBe('#ffd500');
    expect(
      Object.fromEntries(
        Object.entries(configuration.families).map(([name, family]) => [
          name,
          family.color,
        ]),
      ),
    ).toMatchObject({
      'Maderas de timbre "redondo"': '#0394fc',
      'Dobles cañas': '#ba1af4',
      Saxofones: '#ffd500',
      Metales: '#fff700',
      Cornos: '#ffce1f',
      'Percusión menor': '#a3a3a3',
      Tambores: '#d9d9d9',
      Platillos: '#ffffff',
      Placas: '#ffd500',
      Auxiliares: '#ffd500',
      'Cuerdas frotadas': '#a97832',
      'Cuerdas pulsadas': '#028317',
    });
  });

  it('genera colores distintos por familia con un origen aleatorio', () => {
    const colors = createDistinctFamilyColors(
      ['Metales', 'Cuerdas', 'Maderas', 'Metales'],
      (() => {
        const values = [0.25, 0.75];
        return () => values.shift() ?? 0;
      })(),
    );

    expect(Object.keys(colors)).toEqual(['Metales', 'Cuerdas', 'Maderas']);
    expect(new Set(Object.values(colors))).toHaveLength(3);
    expect(Object.values(colors).every((color) => /^#[0-9a-f]{6}$/.test(color))).toBe(
      true,
    );
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

  it('respeta un mapa de instrumentos explícitamente vacío al importar', () => {
    const incoming = cloneDefaultVisualConfiguration();
    incoming.instruments = {};

    expect(sanitizeVisualConfiguration(incoming).instruments).toEqual({});
  });

  it('fija de forma exhaustiva los valores leídos en la aplicación como preset inicial', () => {
    const result = cloneDefaultVisualConfiguration();

    expect(result.global).toEqual({
      velocityBase: 67,
      colorToneShift: -6,
      opacityEdge: 0.5,
      opacityCenter: 1,
      heightScale: 1.4,
      glowStrength: 0.8,
      bumpStrength: 4.8,
      extension: false,
      stretch: true,
      audioOffsetMs: 0,
      fpsMode: 'auto',
      supersampling: 3,
      aspectRatio: 'responsive',
      noteLabels: {
        enabled: false,
        color: '#ffffff',
        size: 16,
        font: 'Arial',
        backgroundColor: '#000000',
        backgroundOpacity: 0.72,
        padding: 5,
        borderRadius: 5,
      },
      travel: {
        enabled: true,
        intensity: 0.3,
        magnetZone: 0.7,
      },
    });
    expect(result.instruments).toEqual({
      BANDOLA: {
        color: '#368128',
        shape: 'hexagon',
      },
    });
    expect(result.shapeExtensions).toEqual(
      Object.fromEntries(
        SHAPE_IDS.map((shape) => [shape, shape !== 'diamond']),
      ),
    );
    expect(result.shapeStretch).toEqual(
      Object.fromEntries(
        SHAPE_IDS.map((shape) => [shape, shape !== 'diamond']),
      ),
    );
    expect(
      Object.values(result.families).every(
        (family) =>
          family.secondaryColor === '#ffffff' &&
          family.heightScale === 1 &&
          family.glowStrength === 0.1 &&
          family.bumpStrength === 1.1 &&
          family.extension &&
          family.stretch &&
          family.travel.enabled &&
          family.travel.intensity === 1 &&
          family.travel.magnetZone === 1,
      ),
    ).toBe(true);
    expect(
      Object.fromEntries(
        Object.entries(result.families).map(([name, family]) => [
          name,
          family.shape,
        ]),
      ),
    ).toMatchObject({
      'Maderas de timbre "redondo"': 'circle',
      'Dobles cañas': 'fourPointStar',
      Saxofones: 'fourPointStar',
      Metales: 'square',
      Cornos: 'roundedSquare',
      'Percusión menor': 'square',
      Tambores: 'square',
      Platillos: 'square',
      Placas: 'diamond',
      Auxiliares: 'roundedSquare',
      'Cuerdas frotadas': 'diamond',
      'Cuerdas pulsadas': 'sixPointStar',
    });
  });

  it('completa configuraciones parciales con el preset inicial capturado', () => {
    const result = sanitizeVisualConfiguration({
      global: {
        colorToneShift: 12,
      } as never,
    });

    expect(result.global).toEqual({
      ...cloneDefaultVisualConfiguration().global,
      colorToneShift: 12,
    });
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

  it('conserva las subfamilias instrumentales del prototipo original', () => {
    const configuration = cloneDefaultVisualConfiguration();
    const track = (name: string, family: 'reeds' | 'percussion') => ({
      id: 0,
      name,
      instrument: name,
      family,
      noteCount: 1,
    });

    expect(
      resolveTrackVisualStyle(
        track('Saxofón tenor', 'reeds'),
        configuration,
      ).family,
    ).toBe('Saxofones');
    expect(
      resolveTrackVisualStyle(
        track('Timbal de concierto', 'percussion'),
        configuration,
      ).family,
    ).toBe('Tambores');
    expect(
      resolveTrackVisualStyle(
        track('Platillo de orquesta', 'percussion'),
        configuration,
      ).family,
    ).toBe('Platillos');
    expect(
      resolveTrackVisualStyle(
        track('Marimba', 'percussion'),
        configuration,
      ).family,
    ).toBe('Placas');
  });

  it('migra los controles visuales útiles del prototipo original', () => {
    const configuration = migrateV1VisualConfiguration({
      familyCustomizations: {
        Metales: {
          colorBright: '#ffffff',
          colorDark: '#000000',
          secondaryColor: '#123456',
          shape: 'diamondDouble',
        },
      },
      instrumentCustomizations: {
        Trompeta: {
          heightScale: 1.4,
          glowStrength: 2.2,
          bumpStrength: 1.8,
          extension: false,
          stretch: true,
          travel: { enabled: false, intensity: 1.25, magnetZone: 0.8 },
        },
      },
      familyTravelSettings: {
        global: { enabled: true, intensity: 0.75, magnetZone: 1.2 },
        families: {
          Metales: { intensity: 1.5 },
        },
      },
      familyExtensions: { Metales: false },
      familyStretch: { Metales: true },
      shapeExtensions: { circleDouble: false },
    });

    expect(configuration.families.Metales).toMatchObject({
      color: '#808080',
      secondaryColor: '#123456',
      shape: 'diamond',
      extension: false,
      stretch: true,
      travel: { enabled: true, intensity: 1.5, magnetZone: 1.2 },
    });
    expect(configuration.families['Cuerdas frotadas'].travel).toEqual({
      enabled: true,
      intensity: 0.75,
      magnetZone: 1.2,
    });
    expect(configuration.instruments.Trompeta).toMatchObject({
      heightScale: 1.4,
      glowStrength: 2.2,
      bumpStrength: 1.8,
      extension: false,
      stretch: true,
      travel: { enabled: false, intensity: 1.25, magnetZone: 0.8 },
    });
    expect(configuration.shapeExtensions.circle).toBe(false);
  });
});
