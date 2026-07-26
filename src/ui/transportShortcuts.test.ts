import { describe, expect, it } from 'vitest';
import { resolveTransportShortcut } from './transportShortcuts';

const shortcut = (
  overrides: Partial<Parameters<typeof resolveTransportShortcut>[0]> = {},
) =>
  resolveTransportShortcut({
    code: '',
    key: '',
    repeat: false,
    modified: false,
    editing: false,
    tapActive: false,
    ...overrides,
  });

describe('transportShortcuts', () => {
  it('vincula espacio y flechas al transporte', () => {
    expect(shortcut({ code: 'Space', key: ' ' })).toBe('toggle-playback');
    expect(shortcut({ key: 'ArrowLeft' })).toBe('seek-backward');
    expect(shortcut({ key: 'ArrowRight' })).toBe('seek-forward');
  });

  it('no interfiere con controles editables ni modificadores', () => {
    expect(shortcut({ code: 'Space', editing: true })).toBeNull();
    expect(shortcut({ key: 'ArrowLeft', modified: true })).toBeNull();
    expect(shortcut({ key: 'ArrowRight', repeat: true })).toBeNull();
  });

  it('reserva la barra espaciadora para tap tempo mientras está activo', () => {
    expect(shortcut({ code: 'Space', tapActive: true })).toBeNull();
    expect(shortcut({ key: 'ArrowLeft', tapActive: true })).toBe(
      'seek-backward',
    );
  });
});
