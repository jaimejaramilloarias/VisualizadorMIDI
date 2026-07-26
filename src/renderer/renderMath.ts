import type { QualityPreset } from '../core/state/visualizationState';
import type {
  FpsMode,
  TravelStyle,
} from '../core/state/visualConfiguration';

const MEGAPIXEL_BUDGETS: Record<QualityPreset, number> = {
  auto: 10_000_000,
  high: 16_000_000,
  ultra: 24_000_000,
};

const RATIO_CAPS: Record<QualityPreset, number> = {
  auto: 2.5,
  high: 3,
  ultra: 4,
};

export interface HorizontalViewport {
  playheadX: number;
  pastSeconds: number;
  futureSeconds: number;
  pixelsPerSecond: number;
}

export const computeHorizontalViewport = (
  canvasWidth: number,
  secondsVisible: number,
): HorizontalViewport => {
  const safeWidth = Math.max(1, canvasWidth);
  const safeSeconds = Math.max(0.001, secondsVisible);
  return {
    playheadX: safeWidth / 2,
    pastSeconds: safeSeconds / 2,
    futureSeconds: safeSeconds / 2,
    pixelsPerSecond: safeWidth / safeSeconds,
  };
};

export interface RenderScaleInput {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  quality: QualityPreset;
  adaptiveRatio: number;
  supersampling: number;
}

export const computeRenderScale = ({
  cssWidth,
  cssHeight,
  devicePixelRatio,
  quality,
  adaptiveRatio,
  supersampling,
}: RenderScaleInput): number => {
  const safeWidth = Math.max(1, cssWidth);
  const safeHeight = Math.max(1, cssHeight);
  const desiredRatio =
    Math.min(Math.max(0.5, devicePixelRatio), RATIO_CAPS[quality]) *
    (quality === 'auto' ? Math.max(0.5, adaptiveRatio) : 1) *
    (Math.max(0.5, supersampling) / 2);
  const maximumRatio = Math.sqrt(
    MEGAPIXEL_BUDGETS[quality] / (safeWidth * safeHeight),
  );
  return Math.max(0.25, Math.min(desiredRatio, maximumRatio));
};

export const resolveTargetFps = (
  mode: FpsMode,
  displayRefreshRate: number,
): number => {
  const displayFps = Math.min(
    240,
    Math.max(30, Number.isFinite(displayRefreshRate) ? displayRefreshRate : 60),
  );
  if (mode === '30') return Math.min(30, displayFps);
  if (mode === '60') return Math.min(60, displayFps);
  return displayFps;
};

export const familyDepthPriority = (family: string): number => {
  const normalized = family
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  if (
    normalized.includes('percusion') ||
    normalized.includes('tambor') ||
    normalized.includes('platill') ||
    normalized.includes('placa')
  ) {
    return 0;
  }
  if (
    normalized.includes('madera') ||
    normalized.includes('doble') ||
    normalized.includes('cana') ||
    normalized.includes('saxof')
  ) {
    return 2;
  }
  if (normalized.includes('cuerda')) return 3;
  if (normalized.includes('metal') || normalized.includes('corno')) return 4;
  return 1;
};

export interface FrameCadenceInput {
  accumulator: number;
  delta: number;
  targetFps: number;
}

export interface FrameCadenceResult {
  accumulator: number;
  present: boolean;
}

export const advanceFrameCadence = ({
  accumulator,
  delta,
  targetFps,
}: FrameCadenceInput): FrameCadenceResult => {
  const interval = 1000 / Math.max(1, targetFps);
  let nextAccumulator =
    Math.max(0, accumulator) + Math.min(250, Math.max(0, delta));
  const tolerance = Math.min(1.5, interval * 0.08);
  if (nextAccumulator + tolerance < interval) {
    return { accumulator: nextAccumulator, present: false };
  }
  nextAccumulator = Math.max(0, nextAccumulator - interval);
  if (nextAccumulator > interval) nextAccumulator %= interval;
  return { accumulator: nextAccumulator, present: true };
};

export interface MidiTimeExtrapolationInput {
  midiTime: number;
  anchorEpochTime: number;
  nowEpochTime: number;
  playing: boolean;
  playbackRate: number;
}

export const extrapolateMidiTime = ({
  midiTime,
  anchorEpochTime,
  nowEpochTime,
  playing,
  playbackRate,
}: MidiTimeExtrapolationInput): number =>
  Math.max(
    0,
    midiTime +
      (playing
        ? (Math.max(0, nowEpochTime - anchorEpochTime) / 1000) * playbackRate
        : 0),
  );

const smoothstep = (value: number): number => {
  const clamped = Math.max(0, Math.min(1, value));
  return clamped * clamped * (3 - 2 * clamped);
};

const noteOnPulseEnvelope = (
  time: number,
  noteStart: number,
  attackSeconds: number,
  decaySeconds: number,
): number => {
  const elapsed = time - noteStart;
  const safeAttack = Math.max(0.001, attackSeconds);
  const safeDecay = Math.max(0.001, decaySeconds);
  if (elapsed <= 0 || elapsed >= safeAttack + safeDecay) return 0;
  if (elapsed < safeAttack) {
    return smoothstep(elapsed / safeAttack);
  }
  return 1 - smoothstep((elapsed - safeAttack) / safeDecay);
};

export const noteOnGlowEnvelope = (
  time: number,
  noteStart: number,
  attackSeconds = 0.035,
  decaySeconds = 0.2,
): number =>
  noteOnPulseEnvelope(time, noteStart, attackSeconds, decaySeconds);

export const noteOnBumpEnvelope = (
  time: number,
  noteStart: number,
  attackSeconds = 0.028,
  decaySeconds = 0.14,
): number =>
  noteOnPulseEnvelope(time, noteStart, attackSeconds, decaySeconds);

export const computeNoteOnGlowStrength = ({
  pulse,
  sceneGlow,
  globalGlow,
  familyGlow,
}: {
  pulse: number;
  sceneGlow: number;
  globalGlow: number;
  familyGlow: number;
}): number =>
  Math.max(0, pulse) *
  (Math.max(0, sceneGlow) * 1.1 +
    Math.max(0, globalGlow) * 0.45 +
    Math.max(0, familyGlow) * 0.45);

export const computeNoteOnGlowPresentation = ({
  strength,
  velocity,
  noteHeight,
}: {
  strength: number;
  velocity: number;
  noteHeight: number;
}): { alpha: number; radius: number } => {
  const safeStrength = Math.max(0, strength);
  const rootStrength = Math.sqrt(safeStrength);
  const energy = 1 - Math.exp(-safeStrength * 0.38);
  return {
    alpha:
      Math.min(0.92, 0.24 + energy * 0.68) *
      (0.55 + Math.max(0, Math.min(1, velocity)) * 0.45),
    radius:
      Math.max(1, noteHeight) * (1.2 + rootStrength * 0.55) +
      rootStrength * 20,
  };
};

export const computeNoteOnBumpScale = ({
  pulse,
  globalBump,
  familyBump,
}: {
  pulse: number;
  globalBump: number;
  familyBump: number;
}): number =>
  1 +
  Math.max(0, pulse) *
    Math.min(
      3,
      (Math.max(0, globalBump) + Math.max(0, familyBump)) * 0.22,
    );

export interface CurveTravelInput {
  offset: number;
  canvasWidth: number;
  intensity: number;
  magnetZone: number;
  enabled: boolean;
  released: boolean;
}

export const composeTravelStyle = (
  global: TravelStyle,
  local: TravelStyle,
): TravelStyle => ({
  enabled: global.enabled && local.enabled,
  intensity: Math.max(
    0,
    Math.min(2, global.intensity * local.intensity),
  ),
  magnetZone: Math.max(
    0.5,
    Math.min(2, global.magnetZone * local.magnetZone),
  ),
});

export const lockNoteOnArrivalOffset = (
  offset: number,
  linearOffset: number,
): number => {
  if (linearOffset > 0) {
    return Number.isFinite(offset) && offset > 0 ? offset : linearOffset;
  }
  if (linearOffset < 0) {
    return Number.isFinite(offset) && offset < 0 ? offset : linearOffset;
  }
  return 0;
};

export interface PastExtensionBoundsInput {
  playheadX: number;
  baseWidth: number;
  finalWidth: number;
  progress: number;
}

export interface HorizontalBounds {
  x: number;
  width: number;
}

export const computePastExtensionBounds = ({
  playheadX,
  baseWidth,
  finalWidth,
  progress,
}: PastExtensionBoundsInput): HorizontalBounds => {
  const safeBaseWidth = Math.max(0.5, baseWidth);
  const safeFinalWidth = Math.max(safeBaseWidth, finalWidth);
  const safeProgress = Math.max(0, Math.min(1, progress));
  const width =
    safeBaseWidth + safeProgress * (safeFinalWidth - safeBaseWidth);
  return {
    x: playheadX - width,
    width,
  };
};

export const curveTravelOffset = ({
  offset,
  canvasWidth,
  intensity,
  magnetZone,
  enabled,
  released,
}: CurveTravelInput): number => {
  if (!enabled || released || offset <= 0) return offset;
  const safeMagnetZone = Math.max(0.5, Math.min(2, magnetZone));
  const zoneProgress = (safeMagnetZone - 0.5) / 1.5;
  const maximum = Math.max(
    160,
    canvasWidth * (0.35 + zoneProgress * 0.6),
  );
  if (Math.abs(offset) >= maximum) return offset;
  const normalized = Math.min(1, Math.abs(offset) / maximum);
  const safeIntensity = Math.min(2, Math.max(0, intensity));
  const exponent = 1 + safeIntensity * 2.8;
  const curved = 1 - (1 - normalized) ** exponent;
  return Math.max(0, Math.min(1, curved)) * maximum;
};
