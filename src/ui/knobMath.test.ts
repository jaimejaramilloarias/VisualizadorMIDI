import { describe, expect, it } from 'vitest';
import {
  knobValueFromDrag,
  knobValueFromKey,
  normalizeKnobValue,
} from './knobMath';

describe('knobMath', () => {
  it('ajusta el valor al paso y a los límites', () => {
    expect(normalizeKnobValue(1.27, 0, 2, 0.1)).toBe(1.3);
    expect(normalizeKnobValue(-20, 0, 2, 0.1)).toBe(0);
    expect(normalizeKnobValue(20, 0, 2, 0.1)).toBe(2);
  });

  it('recorre el rango completo en 150 píxeles de arrastre', () => {
    expect(
      knobValueFromDrag({
        startValue: 0,
        deltaPixels: 75,
        minimum: 0,
        maximum: 10,
        step: 0.1,
      }),
    ).toBe(5);
  });

  it('admite flechas, saltos grandes y extremos desde teclado', () => {
    expect(
      knobValueFromKey({
        value: 1,
        key: 'ArrowUp',
        minimum: 0,
        maximum: 10,
        step: 0.1,
      }),
    ).toBe(1.1);
    expect(
      knobValueFromKey({
        value: 1,
        key: 'PageDown',
        minimum: 0,
        maximum: 10,
        step: 0.1,
      }),
    ).toBe(0);
    expect(
      knobValueFromKey({
        value: 1,
        key: 'End',
        minimum: 0,
        maximum: 10,
        step: 0.1,
      }),
    ).toBe(10);
  });
});
