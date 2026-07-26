import type { FamilyId, MidiTrackInfo } from '../midi/types';

export const SHAPE_IDS = [
  'circle',
  'circleDouble',
  'square',
  'squareDouble',
  'roundedSquare',
  'roundedSquareDouble',
  'diamond',
  'diamondDouble',
  'hexagon',
  'hexagonDouble',
  'fourPointStar',
  'fourPointStarDouble',
  'sixPointStar',
  'sixPointStarDouble',
  'triangle',
  'triangleDouble',
] as const;

export type ShapeId = (typeof SHAPE_IDS)[number];
export type OutlineMode = 'full' | 'pre' | 'post';
export type AspectRatioMode = 'responsive' | '16:9' | '9:16';

export interface OutlineStyle {
  enabled: boolean;
  mode: OutlineMode;
  width: number;
  color: string;
  useShapeColor: boolean;
  opacity: number;
}

export interface LineStyle {
  enabled: boolean;
  opacity: number;
  width: number;
}

export interface TravelStyle {
  enabled: boolean;
  intensity: number;
  magnetZone: number;
}

export interface FamilyVisualStyle {
  color: string;
  secondaryColor: string;
  shape: ShapeId;
  heightScale: number;
  glowStrength: number;
  bumpStrength: number;
  extension: boolean;
  stretch: boolean;
  outline: OutlineStyle;
  line: LineStyle;
  travel: TravelStyle;
}

export interface InstrumentVisualStyle {
  enabled?: boolean;
  family?: string;
  color?: string;
  secondaryColor?: string;
  shape?: ShapeId;
  heightScale?: number;
  glowStrength?: number;
  bumpStrength?: number;
  extension?: boolean;
  stretch?: boolean;
  outline?: Partial<OutlineStyle>;
  line?: Partial<LineStyle>;
  travel?: Partial<TravelStyle>;
}

export interface NoteLabelSettings {
  enabled: boolean;
  color: string;
  size: number;
  font: string;
}

export interface GlobalVisualConfiguration {
  velocityBase: number;
  colorToneShift: number;
  opacityEdge: number;
  opacityCenter: number;
  heightScale: number;
  glowStrength: number;
  bumpStrength: number;
  audioOffsetMs: number;
  supersampling: number;
  aspectRatio: AspectRatioMode;
  noteLabels: NoteLabelSettings;
  outline: OutlineStyle;
  line: LineStyle;
  travel: TravelStyle;
}

export interface VisualConfiguration {
  global: GlobalVisualConfiguration;
  families: Record<string, FamilyVisualStyle>;
  instruments: Record<string, InstrumentVisualStyle>;
  shapeExtensions: Record<ShapeId, boolean>;
  shapeStretch: Record<ShapeId, boolean>;
}

export interface ResolvedTrackVisualStyle extends FamilyVisualStyle {
  enabled: boolean;
  family: string;
}

export interface RenderAppearance {
  global: GlobalVisualConfiguration;
  tracks: ResolvedTrackVisualStyle[];
}

export const SHAPE_LABELS: Record<ShapeId, string> = {
  circle: 'Círculo clásico',
  circleDouble: 'Círculo doble',
  square: 'Cuadrado sólido',
  squareDouble: 'Cuadrado doble',
  roundedSquare: 'Cuadrado redondeado',
  roundedSquareDouble: 'Cuadrado redondeado doble',
  diamond: 'Diamante facetado',
  diamondDouble: 'Diamante doble',
  hexagon: 'Hexágono',
  hexagonDouble: 'Hexágono doble',
  fourPointStar: 'Estrella de 4 puntas',
  fourPointStarDouble: 'Estrella de 4 puntas doble',
  sixPointStar: 'Estrella de 6 puntas',
  sixPointStarDouble: 'Estrella de 6 puntas doble',
  triangle: 'Triángulo',
  triangleDouble: 'Triángulo doble',
};

export const FAMILY_NAMES = [
  'Maderas de timbre "redondo"',
  'Dobles cañas',
  'Saxofones',
  'Metales',
  'Cornos',
  'Percusión menor',
  'Tambores',
  'Platillos',
  'Placas',
  'Auxiliares',
  'Cuerdas frotadas',
  'Cuerdas pulsadas',
  'Voces',
  'Custom 1',
  'Custom 2',
  'Custom 3',
  'Custom 4',
  'Custom 5',
] as const;

const DEFAULT_OUTLINE: OutlineStyle = {
  enabled: true,
  mode: 'full',
  width: 2.5,
  color: '#ffffff',
  useShapeColor: false,
  opacity: 1,
};

const DEFAULT_LINE: LineStyle = {
  enabled: true,
  opacity: 0.3,
  width: 4.2,
};

const DEFAULT_TRAVEL: TravelStyle = {
  enabled: true,
  intensity: 1,
  magnetZone: 1,
};

const style = (
  shape: ShapeId,
  color: string,
  secondaryColor = '#ffffff',
): FamilyVisualStyle => ({
  color,
  secondaryColor,
  shape,
  heightScale: 1,
  glowStrength: 0.1,
  bumpStrength: 1.1,
  extension: true,
  stretch: true,
  outline: { ...DEFAULT_OUTLINE },
  line: { ...DEFAULT_LINE },
  travel: { ...DEFAULT_TRAVEL },
});

export const DEFAULT_FAMILY_STYLES: Record<string, FamilyVisualStyle> = {
  'Maderas de timbre "redondo"': style('roundedSquare', '#769df3'),
  'Dobles cañas': style('sixPointStar', '#c23afd'),
  Saxofones: style('fourPointStar', '#ce8767'),
  Metales: style('roundedSquare', '#edd113'),
  Cornos: style('roundedSquareDouble', '#edbe13'),
  'Percusión menor': style('square', '#a78269'),
  Tambores: style('circle', '#8f9aa0'),
  Platillos: style('circleDouble', '#c4ccd0'),
  Placas: style('diamondDouble', '#ed6b62'),
  Auxiliares: style('roundedSquareDouble', '#347875'),
  'Cuerdas frotadas': style('diamond', '#41e342'),
  'Cuerdas pulsadas': style('triangle', '#1abeb4'),
  Voces: style('squareDouble', '#bebebe'),
  'Custom 1': style('square', '#d52b2b'),
  'Custom 2': style('circle', '#e99c53'),
  'Custom 3': style('hexagon', '#77b8dd'),
  'Custom 4': style('fourPointStar', '#b991e6'),
  'Custom 5': style('triangleDouble', '#72d1c4'),
};

export const DEFAULT_VISUAL_CONFIGURATION: VisualConfiguration = {
  global: {
    velocityBase: 67,
    colorToneShift: 0,
    opacityEdge: 0,
    opacityCenter: 1,
    heightScale: 1.8,
    glowStrength: 0.1,
    bumpStrength: 1.1,
    audioOffsetMs: 0,
    supersampling: 2.5,
    aspectRatio: 'responsive',
    noteLabels: {
      enabled: false,
      color: '#ffffff',
      size: 16,
      font: 'Arial',
    },
    outline: { ...DEFAULT_OUTLINE },
    line: { ...DEFAULT_LINE },
    travel: { ...DEFAULT_TRAVEL },
  },
  families: Object.fromEntries(
    Object.entries(DEFAULT_FAMILY_STYLES).map(([name, value]) => [
      name,
      structuredClone(value),
    ]),
  ),
  instruments: {},
  shapeExtensions: Object.fromEntries(
    SHAPE_IDS.map((shapeId) => [shapeId, true]),
  ) as Record<ShapeId, boolean>,
  shapeStretch: Object.fromEntries(
    SHAPE_IDS.map((shapeId) => [shapeId, true]),
  ) as Record<ShapeId, boolean>,
};

const FAMILY_FROM_ID: Record<FamilyId, string> = {
  strings: 'Cuerdas frotadas',
  brass: 'Metales',
  horns: 'Cornos',
  woodwinds: 'Maderas de timbre "redondo"',
  reeds: 'Dobles cañas',
  keyboards: 'Auxiliares',
  plucked: 'Cuerdas pulsadas',
  percussion: 'Percusión menor',
  voices: 'Voces',
  synth: 'Auxiliares',
  other: 'Auxiliares',
};

const validColor = (value: unknown, fallback: string): string =>
  typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
    ? value.toLowerCase()
    : fallback;

const clamp = (
  value: unknown,
  minimum: number,
  maximum: number,
  fallback: number,
): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Math.min(maximum, Math.max(minimum, value))
    : fallback;

const sanitizeOutline = (
  incoming: Partial<OutlineStyle> | undefined,
  fallback: OutlineStyle,
): OutlineStyle => ({
  enabled:
    typeof incoming?.enabled === 'boolean' ? incoming.enabled : fallback.enabled,
  mode:
    incoming?.mode === 'pre' ||
    incoming?.mode === 'post' ||
    incoming?.mode === 'full'
      ? incoming.mode
      : fallback.mode,
  width: clamp(incoming?.width, 0.25, 20, fallback.width),
  color: validColor(incoming?.color, fallback.color),
  useShapeColor:
    typeof incoming?.useShapeColor === 'boolean'
      ? incoming.useShapeColor
      : fallback.useShapeColor,
  opacity: clamp(incoming?.opacity, 0, 1, fallback.opacity),
});

const sanitizeLine = (
  incoming: Partial<LineStyle> | undefined,
  fallback: LineStyle,
): LineStyle => ({
  enabled:
    typeof incoming?.enabled === 'boolean' ? incoming.enabled : fallback.enabled,
  opacity: clamp(incoming?.opacity, 0, 1, fallback.opacity),
  width: clamp(incoming?.width, 0.25, 24, fallback.width),
});

const sanitizeTravel = (
  incoming: Partial<TravelStyle> | undefined,
  fallback: TravelStyle,
): TravelStyle => ({
  enabled:
    typeof incoming?.enabled === 'boolean' ? incoming.enabled : fallback.enabled,
  intensity: clamp(incoming?.intensity, 0, 2, fallback.intensity),
  magnetZone: clamp(incoming?.magnetZone, 0.5, 2, fallback.magnetZone),
});

const sanitizeFamilyStyle = (
  incoming: Partial<FamilyVisualStyle> | undefined,
  fallback: FamilyVisualStyle,
): FamilyVisualStyle => ({
  color: validColor(incoming?.color, fallback.color),
  secondaryColor: validColor(
    incoming?.secondaryColor,
    fallback.secondaryColor,
  ),
  shape: SHAPE_IDS.includes(incoming?.shape as ShapeId)
    ? (incoming?.shape as ShapeId)
    : fallback.shape,
  heightScale: clamp(incoming?.heightScale, 0.2, 5, fallback.heightScale),
  glowStrength: clamp(incoming?.glowStrength, 0, 3, fallback.glowStrength),
  bumpStrength: clamp(incoming?.bumpStrength, 0, 3, fallback.bumpStrength),
  extension:
    typeof incoming?.extension === 'boolean'
      ? incoming.extension
      : fallback.extension,
  stretch:
    typeof incoming?.stretch === 'boolean'
      ? incoming.stretch
      : fallback.stretch,
  outline: sanitizeOutline(incoming?.outline, fallback.outline),
  line: sanitizeLine(incoming?.line, fallback.line),
  travel: sanitizeTravel(incoming?.travel, fallback.travel),
});

export const cloneDefaultVisualConfiguration = (): VisualConfiguration =>
  structuredClone(DEFAULT_VISUAL_CONFIGURATION);

export const sanitizeVisualConfiguration = (
  incoming: Partial<VisualConfiguration> | undefined,
): VisualConfiguration => {
  const defaults = cloneDefaultVisualConfiguration();
  if (!incoming || typeof incoming !== 'object') return defaults;

  const global = incoming.global;
  defaults.global = {
    velocityBase: clamp(global?.velocityBase, 1, 127, 67),
    colorToneShift: clamp(global?.colorToneShift, -180, 180, 0),
    opacityEdge: clamp(global?.opacityEdge, 0, 1, 0),
    opacityCenter: clamp(global?.opacityCenter, 0, 1, 1),
    heightScale: clamp(global?.heightScale, 0.2, 5, 1.8),
    glowStrength: clamp(global?.glowStrength, 0, 3, 0.1),
    bumpStrength: clamp(global?.bumpStrength, 0, 3, 1.1),
    audioOffsetMs: clamp(global?.audioOffsetMs, -60_000, 60_000, 0),
    supersampling: clamp(global?.supersampling, 1, 3, 2.5),
    aspectRatio:
      global?.aspectRatio === '16:9' || global?.aspectRatio === '9:16'
        ? global.aspectRatio
        : 'responsive',
    noteLabels: {
      enabled:
        typeof global?.noteLabels?.enabled === 'boolean'
          ? global.noteLabels.enabled
          : false,
      color: validColor(global?.noteLabels?.color, '#ffffff'),
      size: Math.round(clamp(global?.noteLabels?.size, 8, 64, 16)),
      font:
        typeof global?.noteLabels?.font === 'string'
          ? global.noteLabels.font.slice(0, 80)
          : 'Arial',
    },
    outline: sanitizeOutline(global?.outline, DEFAULT_OUTLINE),
    line: sanitizeLine(global?.line, DEFAULT_LINE),
    travel: sanitizeTravel(global?.travel, DEFAULT_TRAVEL),
  };

  if (incoming.families && typeof incoming.families === 'object') {
    Object.entries(incoming.families).forEach(([name, value]) => {
      if (!name || !value || typeof value !== 'object') return;
      const fallback =
        defaults.families[name] ?? style('circle', '#e99c53');
      defaults.families[name] = sanitizeFamilyStyle(value, fallback);
    });
  }

  if (incoming.instruments && typeof incoming.instruments === 'object') {
    Object.entries(incoming.instruments).forEach(([name, value]) => {
      if (!name || !value || typeof value !== 'object') return;
      const item = value as InstrumentVisualStyle;
      defaults.instruments[name] = {
        ...(typeof item.enabled === 'boolean'
          ? { enabled: item.enabled }
          : {}),
        ...(typeof item.family === 'string' ? { family: item.family } : {}),
        ...(typeof item.color === 'string'
          ? { color: validColor(item.color, '#e99c53') }
          : {}),
        ...(typeof item.secondaryColor === 'string'
          ? { secondaryColor: validColor(item.secondaryColor, '#ffffff') }
          : {}),
        ...(SHAPE_IDS.includes(item.shape as ShapeId)
          ? { shape: item.shape as ShapeId }
          : {}),
        ...(typeof item.heightScale === 'number'
          ? { heightScale: clamp(item.heightScale, 0.2, 5, 1) }
          : {}),
        ...(typeof item.glowStrength === 'number'
          ? { glowStrength: clamp(item.glowStrength, 0, 3, 0.1) }
          : {}),
        ...(typeof item.bumpStrength === 'number'
          ? { bumpStrength: clamp(item.bumpStrength, 0, 3, 1.1) }
          : {}),
        ...(typeof item.extension === 'boolean'
          ? { extension: item.extension }
          : {}),
        ...(typeof item.stretch === 'boolean'
          ? { stretch: item.stretch }
          : {}),
        ...(item.outline
          ? { outline: sanitizeOutline(item.outline, defaults.global.outline) }
          : {}),
        ...(item.line
          ? { line: sanitizeLine(item.line, defaults.global.line) }
          : {}),
        ...(item.travel
          ? { travel: sanitizeTravel(item.travel, defaults.global.travel) }
          : {}),
      };
    });
  }

  if (incoming.shapeExtensions && typeof incoming.shapeExtensions === 'object') {
    SHAPE_IDS.forEach((shapeId) => {
      const value = incoming.shapeExtensions?.[shapeId];
      if (typeof value === 'boolean') defaults.shapeExtensions[shapeId] = value;
    });
  }
  if (incoming.shapeStretch && typeof incoming.shapeStretch === 'object') {
    SHAPE_IDS.forEach((shapeId) => {
      const value = incoming.shapeStretch?.[shapeId];
      if (typeof value === 'boolean') defaults.shapeStretch[shapeId] = value;
    });
  }

  return defaults;
};

export const migrateV1VisualConfiguration = (
  value: Record<string, unknown>,
): VisualConfiguration => {
  const migrated = cloneDefaultVisualConfiguration();
  const familyCustomizations =
    value.familyCustomizations &&
    typeof value.familyCustomizations === 'object'
      ? (value.familyCustomizations as Record<
          string,
          Partial<FamilyVisualStyle>
        >)
      : {};
  Object.entries(familyCustomizations).forEach(([family, customization]) => {
    const fallback =
      migrated.families[family] ?? structuredClone(migrated.families['Custom 1']);
    migrated.families[family] = sanitizeFamilyStyle(
      customization,
      fallback,
    );
  });

  const assignedFamilies =
    value.assignedFamilies && typeof value.assignedFamilies === 'object'
      ? (value.assignedFamilies as Record<string, unknown>)
      : {};
  Object.entries(assignedFamilies).forEach(([instrument, family]) => {
    if (typeof family !== 'string') return;
    migrated.instruments[instrument] = {
      ...migrated.instruments[instrument],
      family,
    };
  });

  const enabledInstruments =
    value.enabledInstruments && typeof value.enabledInstruments === 'object'
      ? (value.enabledInstruments as Record<string, unknown>)
      : {};
  Object.entries(enabledInstruments).forEach(([instrument, enabled]) => {
    if (typeof enabled !== 'boolean') return;
    migrated.instruments[instrument] = {
      ...migrated.instruments[instrument],
      enabled,
    };
  });

  const instrumentCustomizations =
    value.instrumentCustomizations &&
    typeof value.instrumentCustomizations === 'object'
      ? (value.instrumentCustomizations as Record<
          string,
          InstrumentVisualStyle
        >)
      : {};
  Object.entries(instrumentCustomizations).forEach(
    ([instrument, customization]) => {
      migrated.instruments[instrument] = {
        ...migrated.instruments[instrument],
        ...customization,
      };
    },
  );

  const global = migrated.global;
  if (typeof value.velocityBase === 'number') {
    global.velocityBase = value.velocityBase;
  }
  if (typeof value.colorToneShift === 'number') {
    global.colorToneShift = value.colorToneShift;
  }
  if (typeof value.visibleSeconds === 'number') {
    // visibleSeconds belongs to VisualizationSettings and is migrated by the
    // state parser; it is intentionally not duplicated here.
  }
  if (value.opacityScale && typeof value.opacityScale === 'object') {
    const opacity = value.opacityScale as Record<string, unknown>;
    if (typeof opacity.edge === 'number') global.opacityEdge = opacity.edge;
    if (typeof opacity.mid === 'number') global.opacityCenter = opacity.mid;
  }
  const applyGlobalAndFamilies = (
    raw: unknown,
    globalKey: 'glowStrength' | 'bumpStrength' | 'heightScale',
  ) => {
    if (typeof raw === 'number') {
      global[globalKey] = raw;
      return;
    }
    if (!raw || typeof raw !== 'object') return;
    const config = raw as {
      global?: unknown;
      families?: Record<string, unknown>;
    };
    if (typeof config.global === 'number') global[globalKey] = config.global;
    Object.entries(config.families ?? {}).forEach(([family, amount]) => {
      if (typeof amount !== 'number') return;
      const fallback =
        migrated.families[family] ??
        structuredClone(migrated.families['Custom 1']);
      migrated.families[family] = {
        ...fallback,
        [globalKey]: amount,
      };
    });
  };
  applyGlobalAndFamilies(value.glowStrength, 'glowStrength');
  applyGlobalAndFamilies(value.bumpControl, 'bumpStrength');
  applyGlobalAndFamilies(value.heightScale, 'heightScale');

  const familyExtensions =
    value.familyExtensions && typeof value.familyExtensions === 'object'
      ? (value.familyExtensions as Record<string, unknown>)
      : {};
  Object.entries(familyExtensions).forEach(([family, enabled]) => {
    if (typeof enabled !== 'boolean') return;
    const fallback =
      migrated.families[family] ??
      structuredClone(migrated.families['Custom 1']);
    migrated.families[family] = { ...fallback, extension: enabled };
  });
  const familyStretch =
    value.familyStretch && typeof value.familyStretch === 'object'
      ? (value.familyStretch as Record<string, unknown>)
      : {};
  Object.entries(familyStretch).forEach(([family, enabled]) => {
    if (typeof enabled !== 'boolean') return;
    const fallback =
      migrated.families[family] ??
      structuredClone(migrated.families['Custom 1']);
    migrated.families[family] = { ...fallback, stretch: enabled };
  });

  const familyLineSettings =
    value.familyLineSettings && typeof value.familyLineSettings === 'object'
      ? (value.familyLineSettings as Record<string, Partial<LineStyle>>)
      : {};
  Object.entries(familyLineSettings).forEach(([family, line]) => {
    const fallback =
      migrated.families[family] ??
      structuredClone(migrated.families['Custom 1']);
    migrated.families[family] = {
      ...fallback,
      line: sanitizeLine(line, fallback.line),
    };
  });

  const travelSettings =
    value.familyTravelSettings && typeof value.familyTravelSettings === 'object'
      ? (value.familyTravelSettings as {
          global?: Partial<TravelStyle>;
          families?: Record<string, Partial<TravelStyle>>;
        })
      : {};
  global.travel = sanitizeTravel(travelSettings.global, global.travel);
  Object.entries(travelSettings.families ?? {}).forEach(([family, travel]) => {
    const fallback =
      migrated.families[family] ??
      structuredClone(migrated.families['Custom 1']);
    migrated.families[family] = {
      ...fallback,
      travel: sanitizeTravel(travel, fallback.travel),
    };
  });

  const outlineSettings =
    value.outlineSettings && typeof value.outlineSettings === 'object'
      ? (value.outlineSettings as {
          global?: Partial<OutlineStyle>;
          families?: Record<string, Partial<OutlineStyle>>;
        })
      : {};
  global.outline = sanitizeOutline(outlineSettings.global, global.outline);
  Object.entries(outlineSettings.families ?? {}).forEach(
    ([family, outline]) => {
      const fallback =
        migrated.families[family] ??
        structuredClone(migrated.families['Custom 1']);
      migrated.families[family] = {
        ...fallback,
        outline: sanitizeOutline(outline, fallback.outline),
      };
    },
  );

  if (value.shapeExtensions && typeof value.shapeExtensions === 'object') {
    Object.entries(value.shapeExtensions as Record<string, unknown>).forEach(
      ([shapeId, enabled]) => {
        if (
          SHAPE_IDS.includes(shapeId as ShapeId) &&
          typeof enabled === 'boolean'
        ) {
          migrated.shapeExtensions[shapeId as ShapeId] = enabled;
        }
      },
    );
  }
  if (value.shapeStretch && typeof value.shapeStretch === 'object') {
    Object.entries(value.shapeStretch as Record<string, unknown>).forEach(
      ([shapeId, enabled]) => {
        if (
          SHAPE_IDS.includes(shapeId as ShapeId) &&
          typeof enabled === 'boolean'
        ) {
          migrated.shapeStretch[shapeId as ShapeId] = enabled;
        }
      },
    );
  }

  return sanitizeVisualConfiguration(migrated);
};

const detectedFamilyName = (track: MidiTrackInfo): string => {
  const normalized = `${track.name} ${track.instrument}`
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (normalized.includes('sax')) return 'Saxofones';
  if (normalized.includes('timbal') || normalized.includes('timpani')) {
    return 'Tambores';
  }
  if (
    normalized.includes('platillo') ||
    normalized.includes('cymbal') ||
    normalized.includes('gong')
  ) {
    return 'Platillos';
  }
  if (
    normalized.includes('xilof') ||
    normalized.includes('marimba') ||
    normalized.includes('vibraf') ||
    normalized.includes('glock')
  ) {
    return 'Placas';
  }
  return FAMILY_FROM_ID[track.family];
};

export const resolveTrackVisualStyle = (
  track: MidiTrackInfo,
  configuration: VisualConfiguration,
): ResolvedTrackVisualStyle => {
  const instrument = configuration.instruments[track.name] ?? {};
  const family = instrument.family || detectedFamilyName(track);
  const familyStyle =
    configuration.families[family] ??
    style('circle', '#e99c53', '#ffffff');

  const resolved: ResolvedTrackVisualStyle = {
    ...structuredClone(familyStyle),
    enabled: instrument.enabled !== false,
    family,
    ...(instrument.color ? { color: instrument.color } : {}),
    ...(instrument.secondaryColor
      ? { secondaryColor: instrument.secondaryColor }
      : {}),
    ...(instrument.shape ? { shape: instrument.shape } : {}),
    ...(typeof instrument.heightScale === 'number'
      ? { heightScale: instrument.heightScale }
      : {}),
    ...(typeof instrument.glowStrength === 'number'
      ? { glowStrength: instrument.glowStrength }
      : {}),
    ...(typeof instrument.bumpStrength === 'number'
      ? { bumpStrength: instrument.bumpStrength }
      : {}),
    ...(typeof instrument.extension === 'boolean'
      ? { extension: instrument.extension }
      : {}),
    ...(typeof instrument.stretch === 'boolean'
      ? { stretch: instrument.stretch }
      : {}),
    outline: { ...familyStyle.outline, ...instrument.outline },
    line: { ...familyStyle.line, ...instrument.line },
    travel: { ...familyStyle.travel, ...instrument.travel },
  };
  resolved.extension =
    resolved.extension && configuration.shapeExtensions[resolved.shape] !== false;
  resolved.stretch =
    resolved.stretch && configuration.shapeStretch[resolved.shape] !== false;
  return resolved;
};

const shiftHexHue = (hex: string, degrees: number): string => {
  if (!degrees || !/^#[0-9a-f]{6}$/i.test(hex)) return hex;
  const numeric = Number.parseInt(hex.slice(1), 16);
  const red = ((numeric >> 16) & 255) / 255;
  const green = ((numeric >> 8) & 255) / 255;
  const blue = (numeric & 255) / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;
  let hue = 0;
  let saturation = 0;
  if (delta > 0) {
    saturation =
      delta / (1 - Math.abs(2 * lightness - 1));
    if (maximum === red) hue = 60 * (((green - blue) / delta) % 6);
    else if (maximum === green) hue = 60 * ((blue - red) / delta + 2);
    else hue = 60 * ((red - green) / delta + 4);
  }
  hue = ((hue + degrees) % 360 + 360) % 360;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const x = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const offset = lightness - chroma / 2;
  const [r1, g1, b1] =
    hue < 60
      ? [chroma, x, 0]
      : hue < 120
        ? [x, chroma, 0]
        : hue < 180
          ? [0, chroma, x]
          : hue < 240
            ? [0, x, chroma]
            : hue < 300
              ? [x, 0, chroma]
              : [chroma, 0, x];
  return `#${[r1, g1, b1]
    .map((channel) =>
      Math.round((channel + offset) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
};

export const createRenderAppearance = (
  tracks: MidiTrackInfo[],
  configuration: VisualConfiguration,
): RenderAppearance => {
  const tone = configuration.global.colorToneShift;
  return {
    global: structuredClone(configuration.global),
    tracks: tracks.map((track) => {
      const resolved = resolveTrackVisualStyle(track, configuration);
      return {
        ...resolved,
        color: shiftHexHue(resolved.color, tone),
        secondaryColor: shiftHexHue(resolved.secondaryColor, tone),
      };
    }),
  };
};
