import type { QualityPreset } from '../core/state/visualizationState';

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

export interface CurveTravelInput {
  offset: number;
  canvasWidth: number;
  intensity: number;
  magnetZone: number;
  enabled: boolean;
  released: boolean;
}

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
      ? normalized ** (1 + safeMagnetZone * 1.7)
      : 1 - (1 - normalized) ** (1 + safeMagnetZone * 0.45);
  const safeIntensity = Math.min(2, Math.max(0, intensity));
  let mixed =
    normalized + (curved - normalized) * Math.min(1, safeIntensity);
  if (safeIntensity > 1) {
    mixed += (curved - mixed) * (safeIntensity - 1);
  }
  return Math.sign(offset) * Math.max(0, Math.min(1, mixed)) * maximum;
};
