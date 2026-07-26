import type { QualityPreset } from '../core/state/visualizationState';
import type { FpsMode } from '../core/state/visualConfiguration';

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

export const noteOnGlowEnvelope = (
  time: number,
  noteStart: number,
  decaySeconds = 0.28,
): number => {
  const elapsed = time - noteStart;
  if (elapsed < 0) return 0;
  return Math.max(0, 1 - elapsed / Math.max(0.001, decaySeconds));
};

export interface CurveTravelInput {
  offset: number;
  canvasWidth: number;
  intensity: number;
  magnetZone: number;
  enabled: boolean;
  released: boolean;
}

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
  if (!enabled || released || offset === 0) return offset;
  const maximum = canvasWidth * 0.62 + Math.max(80, canvasWidth * 0.1);
  if (Math.abs(offset) >= maximum) return offset;
  const normalized = Math.min(1, Math.abs(offset) / maximum);
  const safeMagnetZone = Math.max(0, Math.min(2, magnetZone));
  const curved =
    offset > 0
      ? 1 - (1 - normalized) ** (1 + safeMagnetZone * 2.2)
      : 1 - (1 - normalized) ** (1 + safeMagnetZone * 0.45);
  const safeIntensity = Math.min(2, Math.max(0, intensity));
  let mixed =
    normalized + (curved - normalized) * Math.min(1, safeIntensity);
  if (safeIntensity > 1) {
    mixed += (curved - mixed) * (safeIntensity - 1);
  }
  return Math.sign(offset) * Math.max(0, Math.min(1, mixed)) * maximum;
};
