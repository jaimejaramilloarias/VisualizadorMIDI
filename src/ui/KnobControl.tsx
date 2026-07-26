import {
  useRef,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent,
  type WheelEvent,
} from 'react';
import {
  knobValueFromDrag,
  knobValueFromKey,
  normalizeKnobValue,
} from './knobMath';

interface KnobControlProps {
  compact?: boolean;
  disabled?: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: number) => void;
  step: number;
  suffix: string;
  value: number;
}

interface DragState {
  pointerId: number;
  startValue: number;
  startX: number;
  startY: number;
}

export function KnobControl({
  compact = false,
  disabled = false,
  label,
  max,
  min,
  onChange,
  step,
  suffix,
  value,
}: KnobControlProps) {
  const dragRef = useRef<DragState | null>(null);
  const safeValue = normalizeKnobValue(value, min, max, step);
  const normalized =
    (safeValue - min) / Math.max(Number.EPSILON, Math.abs(max - min));
  const angle = -135 + normalized * 270;
  const progress = normalized * 270;
  const decimalPlaces =
    step >= 1 ? 0 : Math.min(3, String(step).split('.')[1]?.length ?? 0);
  const formattedValue = safeValue.toFixed(decimalPlaces);
  const style = {
    '--knob-angle': `${angle}deg`,
    '--knob-progress': `${progress}deg`,
  } as CSSProperties;

  const changeByKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const nextValue = knobValueFromKey({
      value: safeValue,
      key: event.key,
      minimum: min,
      maximum: max,
      step,
    });
    if (nextValue === null) return;
    event.preventDefault();
    onChange(nextValue);
  };

  const startDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    dragRef.current = {
      pointerId: event.pointerId,
      startValue: safeValue,
      startX: event.clientX,
      startY: event.clientY,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const drag = (event: PointerEvent<HTMLButtonElement>) => {
    const state = dragRef.current;
    if (!state || state.pointerId !== event.pointerId) return;
    const deltaPixels =
      state.startY - event.clientY + (event.clientX - state.startX) * 0.45;
    onChange(
      knobValueFromDrag({
        startValue: state.startValue,
        deltaPixels,
        minimum: min,
        maximum: max,
        step,
      }),
    );
  };

  const endDrag = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const changeByWheel = (event: WheelEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.preventDefault();
    onChange(
      normalizeKnobValue(
        safeValue + (event.deltaY < 0 ? step : -step),
        min,
        max,
        step,
      ),
    );
  };

  const dial = (
    <button
      aria-label={label}
      aria-valuemax={max}
      aria-valuemin={min}
      aria-valuenow={safeValue}
      aria-valuetext={`${formattedValue}${suffix}`}
      className="knob-dial"
      disabled={disabled}
      onKeyDown={changeByKey}
      onPointerCancel={endDrag}
      onPointerDown={startDrag}
      onPointerMove={drag}
      onPointerUp={endDrag}
      onWheel={changeByWheel}
      role="slider"
      style={style}
      title={`${label}: ${formattedValue}${suffix}`}
      type="button"
    >
      <span aria-hidden="true" className="knob-indicator" />
    </button>
  );

  if (compact) {
    return (
      <span className="knob-control is-compact">
        {dial}
      </span>
    );
  }

  return (
    <div className="knob-control">
      <span className="knob-label">{label}</span>
      {dial}
      <label className="knob-value">
        <span className="visually-hidden">Valor de {label}</span>
        <input
          disabled={disabled}
          max={max}
          min={min}
          onChange={(event) =>
            onChange(
              normalizeKnobValue(
                Number(event.target.value),
                min,
                max,
                step,
              ),
            )
          }
          step={step}
          type="number"
          value={formattedValue}
        />
        <span>{suffix}</span>
      </label>
    </div>
  );
}
