export const normalizeKnobValue = (
  value: number,
  minimum: number,
  maximum: number,
  step: number,
): number => {
  const safeMinimum = Math.min(minimum, maximum);
  const safeMaximum = Math.max(minimum, maximum);
  const safeStep = Math.max(Number.EPSILON, Math.abs(step));
  const safeValue = Number.isFinite(value) ? value : safeMinimum;
  const snapped =
    safeMinimum +
    Math.round((safeValue - safeMinimum) / safeStep) * safeStep;
  const decimalPlaces =
    safeStep >= 1
      ? 0
      : Math.min(6, String(safeStep).split('.')[1]?.length ?? 0);
  return Number(
    Math.min(safeMaximum, Math.max(safeMinimum, snapped)).toFixed(
      decimalPlaces,
    ),
  );
};

export const knobValueFromDrag = ({
  startValue,
  deltaPixels,
  minimum,
  maximum,
  step,
}: {
  startValue: number;
  deltaPixels: number;
  minimum: number;
  maximum: number;
  step: number;
}): number => {
  const range = Math.max(Number.EPSILON, Math.abs(maximum - minimum));
  const rawValue = startValue + (deltaPixels / 150) * range;
  return normalizeKnobValue(rawValue, minimum, maximum, step);
};

export const knobValueFromKey = ({
  value,
  key,
  minimum,
  maximum,
  step,
}: {
  value: number;
  key: string;
  minimum: number;
  maximum: number;
  step: number;
}): number | null => {
  if (key === 'Home') return minimum;
  if (key === 'End') return maximum;
  const direction =
    key === 'ArrowUp' || key === 'ArrowRight'
      ? 1
      : key === 'ArrowDown' || key === 'ArrowLeft'
        ? -1
        : key === 'PageUp'
          ? 10
          : key === 'PageDown'
            ? -10
            : 0;
  return direction === 0
    ? null
    : normalizeKnobValue(
        value + direction * step,
        minimum,
        maximum,
        step,
      );
};
