import { describe, expect, it } from 'vitest';
import {
  createEmptyMediaReadiness,
  decideAutomaticAlignmentForPair,
  getReadyMediaPairKey,
  updateMediaReadiness,
} from './mediaReadiness';

describe('coordinación de carga MIDI + audio', () => {
  it('solo declara lista una pareja cuando ambos medios terminaron', () => {
    const empty = createEmptyMediaReadiness();
    const midiReady = updateMediaReadiness(empty, 'midi', 'ready', 3);
    const pairReady = updateMediaReadiness(
      midiReady,
      'audio',
      'ready',
      7,
    );

    expect(getReadyMediaPairKey(empty)).toBeNull();
    expect(getReadyMediaPairKey(midiReady)).toBeNull();
    expect(getReadyMediaPairKey(pairReady)).toBe('3:7');
  });

  it('invalida la pareja anterior apenas comienza una carga nueva', () => {
    const ready = {
      midi: { revision: 2, status: 'ready' as const },
      audio: { revision: 4, status: 'ready' as const },
    };
    const replacingAudio = updateMediaReadiness(
      ready,
      'audio',
      'loading',
      5,
    );

    expect(getReadyMediaPairKey(ready)).toBe('2:4');
    expect(getReadyMediaPairKey(replacingAudio)).toBeNull();
  });

  it('crea una identidad nueva aunque se recarguen archivos con igual nombre', () => {
    const firstPair = {
      midi: { revision: 1, status: 'ready' as const },
      audio: { revision: 1, status: 'ready' as const },
    };
    const secondPair = {
      midi: { revision: 2, status: 'ready' as const },
      audio: { revision: 2, status: 'ready' as const },
    };

    expect(getReadyMediaPairKey(firstPair)).toBe('1:1');
    expect(getReadyMediaPairKey(secondPair)).toBe('2:2');
  });

  it('dispara una sola autoaplicación por pareja y respeta un JSON importado', () => {
    const ready = {
      midi: { revision: 5, status: 'ready' as const },
      audio: { revision: 8, status: 'ready' as const },
    };

    expect(
      decideAutomaticAlignmentForPair(ready, null, false),
    ).toEqual({
      action: 'run-and-apply',
      pairKey: '5:8',
    });
    expect(
      decideAutomaticAlignmentForPair(ready, '5:8', false),
    ).toEqual({
      action: 'none',
      pairKey: null,
    });
    expect(
      decideAutomaticAlignmentForPair(ready, null, true),
    ).toEqual({
      action: 'preserve-imported',
      pairKey: '5:8',
    });
  });
});
