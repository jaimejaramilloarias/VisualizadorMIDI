export type MediaKind = 'midi' | 'audio';
export type MediaLoadStatus = 'empty' | 'loading' | 'ready' | 'error';

export interface MediaLoadSlot {
  revision: number;
  status: MediaLoadStatus;
}

export interface MediaReadiness {
  midi: MediaLoadSlot;
  audio: MediaLoadSlot;
}

export const createEmptyMediaReadiness = (): MediaReadiness => ({
  midi: { revision: 0, status: 'empty' },
  audio: { revision: 0, status: 'empty' },
});

export const updateMediaReadiness = (
  current: MediaReadiness,
  kind: MediaKind,
  status: MediaLoadStatus,
  revision: number,
): MediaReadiness => ({
  ...current,
  [kind]: {
    revision: Math.max(0, Math.floor(revision)),
    status,
  },
});

export const getReadyMediaPairKey = (
  readiness: MediaReadiness,
): string | null => {
  if (
    readiness.midi.status !== 'ready' ||
    readiness.audio.status !== 'ready'
  ) {
    return null;
  }
  return `${readiness.midi.revision}:${readiness.audio.revision}`;
};

export type AutomaticAlignmentPairDecision =
  | { action: 'none'; pairKey: null }
  | { action: 'preserve-imported'; pairKey: string }
  | { action: 'run-and-apply'; pairKey: string };

export const decideAutomaticAlignmentForPair = (
  readiness: MediaReadiness,
  lastAttemptedPairKey: string | null,
  preserveImportedSync: boolean,
): AutomaticAlignmentPairDecision => {
  const pairKey = getReadyMediaPairKey(readiness);
  if (pairKey === null || pairKey === lastAttemptedPairKey) {
    return { action: 'none', pairKey: null };
  }
  return {
    action: preserveImportedSync
      ? 'preserve-imported'
      : 'run-and-apply',
    pairKey,
  };
};
