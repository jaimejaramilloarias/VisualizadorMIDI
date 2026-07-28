import type {
  TempoPoint,
  TimeSignaturePoint,
} from '../core/midi/types';
import {
  normalizeAnchors,
  type SyncAnchor,
} from '../core/state/visualizationState';

export interface AudioLandmark {
  time: number;
  strength: number;
}

export type MidiGridLineHierarchy = 'major' | 'minor';
export type MidiGridLineKind = 'bar' | 'beat' | 'subdivision';

export interface MidiGridLine {
  id: string;
  tick: number;
  midiTime: number;
  hierarchy: MidiGridLineHierarchy;
  kind: MidiGridLineKind;
  label?: string;
}

export interface AdaptiveMidiGridOptions {
  tempoMap: readonly TempoPoint[];
  ticksPerBeat: number;
  timeSignatures?: readonly TimeSignaturePoint[];
  visibleMidiStart: number;
  visibleMidiEnd: number;
  viewportWidth: number;
  targetSpacingPixels?: number;
  maximumLines?: number;
}

export interface GridAnchorDropOptions {
  requestedAudioTime: number;
  midiTime: number;
  anchors: readonly SyncAnchor[];
  audioDuration: number;
  landmarks: readonly AudioLandmark[];
  magnetEnabled: boolean;
  snapWindowSeconds?: number;
  minimumGapSeconds?: number;
}

export interface GridAnchorDropResult {
  audioTime: number;
  midiTime: number;
  snapped: boolean;
  snapLandmarkTime: number | null;
  lowerBound: number;
  upperBound: number;
}

export interface FineTuneAnchorOptions {
  anchors: readonly SyncAnchor[];
  anchor: SyncAnchor;
  audioDuration: number;
  minimumGapSeconds?: number;
}

export const MAX_SYNC_ZOOM = 1024;
export const TAP_MAGNET_WINDOW_SECONDS = 0.3;
export const GRID_MAGNET_WINDOW_SECONDS = 0.3;
export const DEFAULT_GRID_SPACING_PIXELS = 56;
export const DEFAULT_MAXIMUM_GRID_LINES = 600;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const finitePositive = (value: number, fallback: number): number =>
  Number.isFinite(value) && value > 0 ? value : fallback;

const normalizeTempoMap = (
  tempoMap: readonly TempoPoint[],
): TempoPoint[] => {
  const byTick = new Map<number, TempoPoint>();
  tempoMap.forEach((point) => {
    if (
      Number.isFinite(point.tick) &&
      point.tick >= 0 &&
      Number.isFinite(point.seconds) &&
      point.seconds >= 0 &&
      Number.isFinite(point.microsecondsPerBeat) &&
      point.microsecondsPerBeat > 0
    ) {
      byTick.set(point.tick, { ...point });
    }
  });
  const normalized = [...byTick.values()].sort(
    (left, right) => left.tick - right.tick,
  );
  if (normalized.length === 0 || normalized[0].tick > 0) {
    normalized.unshift({
      tick: 0,
      seconds: 0,
      microsecondsPerBeat: 500_000,
    });
  }
  return normalized;
};

const midiTickToSeconds = (
  tick: number,
  tempoMap: readonly TempoPoint[],
  ticksPerBeat: number,
): number => {
  const safeTick = Math.max(0, Number.isFinite(tick) ? tick : 0);
  let low = 0;
  let high = tempoMap.length - 1;
  let selected = tempoMap[0];
  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = tempoMap[middle];
    if (candidate.tick <= safeTick) {
      selected = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return (
    selected.seconds +
    ((safeTick - selected.tick) * selected.microsecondsPerBeat) /
      ticksPerBeat /
      1_000_000
  );
};

const midiSecondsToTick = (
  seconds: number,
  tempoMap: readonly TempoPoint[],
  ticksPerBeat: number,
): number => {
  const safeSeconds = Math.max(
    0,
    Number.isFinite(seconds) ? seconds : 0,
  );
  let low = 0;
  let high = tempoMap.length - 1;
  let selected = tempoMap[0];
  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = tempoMap[middle];
    if (candidate.seconds <= safeSeconds) {
      selected = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return (
    selected.tick +
    ((safeSeconds - selected.seconds) * ticksPerBeat * 1_000_000) /
      selected.microsecondsPerBeat
  );
};

interface NormalizedTimeSignature {
  tick: number;
  numerator: number;
  denominator: number;
}

const normalizeTimeSignatures = (
  timeSignatures: readonly TimeSignaturePoint[],
): NormalizedTimeSignature[] => {
  const byTick = new Map<number, NormalizedTimeSignature>();
  timeSignatures.forEach((signature) => {
    if (
      Number.isFinite(signature.tick) &&
      signature.tick >= 0 &&
      Number.isFinite(signature.numerator) &&
      signature.numerator > 0 &&
      Number.isFinite(signature.denominator) &&
      signature.denominator > 0
    ) {
      byTick.set(signature.tick, {
        tick: signature.tick,
        numerator: Math.max(1, Math.round(signature.numerator)),
        denominator: Math.max(1, Math.round(signature.denominator)),
      });
    }
  });
  const normalized = [...byTick.values()].sort(
    (left, right) => left.tick - right.tick,
  );
  if (normalized.length === 0 || normalized[0].tick > 0) {
    normalized.unshift({ tick: 0, numerator: 4, denominator: 4 });
  }
  return normalized;
};

const tickKey = (tick: number): string => tick.toFixed(6);

const makeGridLine = (
  tick: number,
  tempoMap: readonly TempoPoint[],
  ticksPerBeat: number,
  hierarchy: MidiGridLineHierarchy,
  kind: MidiGridLineKind,
  label?: string,
): MidiGridLine => ({
  id: `midi-grid-${tickKey(tick)}`,
  tick,
  midiTime: midiTickToSeconds(tick, tempoMap, ticksPerBeat),
  hierarchy,
  kind,
  ...(label ? { label } : {}),
});

const collectBarTicks = (
  visibleStartTick: number,
  visibleEndTick: number,
  ticksPerBeat: number,
  signatures: readonly NormalizedTimeSignature[],
): Array<{ tick: number; barNumber: number }> => {
  const segments = signatures.map((signature, index) => ({
    ...signature,
    endTick: signatures[index + 1]?.tick ?? visibleEndTick + ticksPerBeat,
  }));
  const counts = segments.map((signature) => {
    const barLength =
      ticksPerBeat *
      signature.numerator *
      (4 / signature.denominator);
    if (barLength <= 0) return 0;
    const segmentEnd = Math.min(visibleEndTick, signature.endTick);
    const segmentStart = Math.max(visibleStartTick, signature.tick);
    if (segmentEnd < segmentStart) return 0;
    const firstIndex = Math.max(
      0,
      Math.ceil((segmentStart - signature.tick) / barLength - 1e-9),
    );
    const lastIndex = Math.floor(
      (segmentEnd - signature.tick) / barLength + 1e-9,
    );
    return Math.max(0, lastIndex - firstIndex + 1);
  });

  const barsBeforeSegments: number[] = [];
  let elapsedBars = 0;
  segments.forEach((signature, index) => {
    barsBeforeSegments[index] = elapsedBars;
    const barLength =
      ticksPerBeat *
      signature.numerator *
      (4 / signature.denominator);
    const segmentLength = Math.max(0, signature.endTick - signature.tick);
    elapsedBars +=
      barLength > 0 ? Math.max(0, Math.ceil(segmentLength / barLength)) : 0;
  });

  const result: Array<{ tick: number; barNumber: number }> = [];
  segments.forEach((signature, segmentIndex) => {
    if (counts[segmentIndex] === 0) return;
    const barLength =
      ticksPerBeat *
      signature.numerator *
      (4 / signature.denominator);
    const segmentEnd = Math.min(visibleEndTick, signature.endTick);
    const segmentStart = Math.max(visibleStartTick, signature.tick);
    const firstIndex = Math.max(
      0,
      Math.ceil((segmentStart - signature.tick) / barLength - 1e-9),
    );
    const lastIndex = Math.floor(
      (segmentEnd - signature.tick) / barLength + 1e-9,
    );
    for (let index = firstIndex; index <= lastIndex; index += 1) {
      result.push({
        tick: signature.tick + index * barLength,
        barNumber: barsBeforeSegments[segmentIndex] + index + 1,
      });
    }
  });
  return result;
};

export const generateAdaptiveMidiGrid = ({
  tempoMap,
  ticksPerBeat,
  timeSignatures = [],
  visibleMidiStart,
  visibleMidiEnd,
  viewportWidth,
  targetSpacingPixels = DEFAULT_GRID_SPACING_PIXELS,
  maximumLines = DEFAULT_MAXIMUM_GRID_LINES,
}: AdaptiveMidiGridOptions): MidiGridLine[] => {
  const safeTicksPerBeat = finitePositive(ticksPerBeat, 480);
  const normalizedTempoMap = normalizeTempoMap(tempoMap);
  const safeStart = Math.max(
    0,
    Number.isFinite(visibleMidiStart) ? visibleMidiStart : 0,
  );
  const safeEnd = Math.max(
    safeStart,
    Number.isFinite(visibleMidiEnd) ? visibleMidiEnd : safeStart,
  );
  if (safeEnd <= safeStart) return [];

  const startTick = midiSecondsToTick(
    safeStart,
    normalizedTempoMap,
    safeTicksPerBeat,
  );
  const endTick = midiSecondsToTick(
    safeEnd,
    normalizedTempoMap,
    safeTicksPerBeat,
  );
  const width = finitePositive(viewportWidth, 1);
  const spacing = finitePositive(
    targetSpacingPixels,
    DEFAULT_GRID_SPACING_PIXELS,
  );
  const lineLimit = Math.max(
    2,
    Math.floor(finitePositive(maximumLines, DEFAULT_MAXIMUM_GRID_LINES)),
  );
  const targetLineCount = Math.max(
    2,
    Math.min(lineLimit, Math.floor(width / spacing)),
  );
  const idealStep = Math.max(
    safeTicksPerBeat / 16,
    (endTick - startTick) / targetLineCount,
  );
  const beatSteps = [
    1 / 16,
    1 / 8,
    1 / 4,
    1 / 2,
    1,
    2,
    4,
    8,
    16,
    32,
    64,
    128,
    256,
    512,
    1024,
  ];
  const stepInBeats =
    beatSteps.find(
      (candidate) => candidate * safeTicksPerBeat >= idealStep - 1e-9,
    ) ?? Math.ceil(idealStep / safeTicksPerBeat);
  const stepTicks = stepInBeats * safeTicksPerBeat;
  const byTick = new Map<string, MidiGridLine>();
  const firstGridIndex = Math.ceil(startTick / stepTicks - 1e-9);
  const lastGridIndex = Math.floor(endTick / stepTicks + 1e-9);

  for (
    let index = firstGridIndex;
    index <= lastGridIndex && byTick.size < lineLimit;
    index += 1
  ) {
    const tick = index * stepTicks;
    const quarterPosition = tick / safeTicksPerBeat;
    const onQuarterBeat =
      Math.abs(quarterPosition - Math.round(quarterPosition)) < 1e-7;
    const kind: MidiGridLineKind = onQuarterBeat ? 'beat' : 'subdivision';
    byTick.set(
      tickKey(tick),
      makeGridLine(
        tick,
        normalizedTempoMap,
        safeTicksPerBeat,
        'minor',
        kind,
      ),
    );
  }

  const bars = collectBarTicks(
    startTick,
    endTick,
    safeTicksPerBeat,
    normalizeTimeSignatures(timeSignatures),
  );
  const majorBudget = Math.max(1, Math.floor(lineLimit / 2));
  const barStride = Math.max(1, Math.ceil(bars.length / majorBudget));
  bars.forEach((bar, index) => {
    if (
      index !== 0 &&
      index !== bars.length - 1 &&
      (bar.barNumber - 1) % barStride !== 0
    ) {
      return;
    }
    byTick.set(
      tickKey(bar.tick),
      makeGridLine(
        bar.tick,
        normalizedTempoMap,
        safeTicksPerBeat,
        'major',
        'bar',
        `${bar.barNumber}`,
      ),
    );
  });

  const sorted = [...byTick.values()].sort(
    (left, right) => left.midiTime - right.midiTime,
  );
  if (sorted.length <= lineLimit) return sorted;
  const major = sorted.filter((line) => line.hierarchy === 'major');
  const minor = sorted.filter((line) => line.hierarchy === 'minor');
  const remaining = Math.max(0, lineLimit - major.length);
  if (remaining === 0) return major.slice(0, lineLimit);
  const minorStride = Math.max(1, Math.ceil(minor.length / remaining));
  return [
    ...major,
    ...minor.filter((_, index) => index % minorStride === 0).slice(0, remaining),
  ].sort((left, right) => left.midiTime - right.midiTime);
};

export const detectRmsLandmarks = (
  rms: Float32Array | null,
  duration: number,
  maximumCount = 2000,
): AudioLandmark[] => {
  if (!rms || rms.length < 3 || duration <= 0 || maximumCount <= 0) {
    return [];
  }
  const amplitudes = Array.from(rms, (value) =>
    Math.max(0, Number.isFinite(value) ? value : 0),
  );
  const count = amplitudes.length;
  const mean =
    amplitudes.reduce((sum, value) => sum + value, 0) /
    Math.max(1, amplitudes.length);
  const variance =
    amplitudes.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, amplitudes.length);
  const threshold = Math.max(0.055, mean + Math.sqrt(variance) * 0.62);
  const candidates: AudioLandmark[] = [];

  for (let index = 1; index < count - 1; index += 1) {
    const strength = amplitudes[index];
    if (
      strength >= threshold &&
      strength >= amplitudes[index - 1] &&
      strength > amplitudes[index + 1]
    ) {
      candidates.push({
        time: (index / Math.max(1, count - 1)) * duration,
        strength,
      });
    }
  }

  const minimumGap = Math.max(0.025, (duration / count) * 2.5);
  const selected: AudioLandmark[] = [];
  [...candidates]
    .sort((left, right) => right.strength - left.strength)
    .some((candidate) => {
      if (
        selected.every(
          (landmark) => Math.abs(landmark.time - candidate.time) >= minimumGap,
        )
      ) {
        selected.push(candidate);
      }
      return selected.length >= maximumCount;
    });

  return selected.sort((left, right) => left.time - right.time);
};

export const snapToAudioLandmark = (
  time: number,
  landmarks: readonly AudioLandmark[],
  thresholdSeconds: number,
  enabled: boolean,
): number => {
  const safeTime = Math.max(0, Number.isFinite(time) ? time : 0);
  if (!enabled || landmarks.length === 0 || thresholdSeconds <= 0) {
    return safeTime;
  }
  let nearest = safeTime;
  let distance = thresholdSeconds;
  landmarks.forEach((landmark) => {
    const nextDistance = Math.abs(landmark.time - safeTime);
    if (nextDistance <= distance) {
      distance = nextDistance;
      nearest = landmark.time;
    }
  });
  return nearest;
};

export const resolveTapAnchorTime = (
  tapTime: number,
  landmarks: readonly AudioLandmark[],
  magnetEnabled: boolean,
): number =>
  snapToAudioLandmark(
    tapTime,
    landmarks,
    TAP_MAGNET_WINDOW_SECONDS,
    magnetEnabled,
  );

export const resolveGridAnchorDrop = ({
  requestedAudioTime,
  midiTime,
  anchors,
  audioDuration,
  landmarks,
  magnetEnabled,
  snapWindowSeconds = GRID_MAGNET_WINDOW_SECONDS,
  minimumGapSeconds = 0.001,
}: GridAnchorDropOptions): GridAnchorDropResult => {
  const safeMidiTime = Math.max(
    0,
    Number.isFinite(midiTime) ? midiTime : 0,
  );
  const safeDuration = Math.max(
    0,
    Number.isFinite(audioDuration) ? audioDuration : 0,
  );
  const gap = Math.max(
    0,
    Number.isFinite(minimumGapSeconds) ? minimumGapSeconds : 0.001,
  );
  const orderedByMidi = [...anchors]
    .filter(
      (anchor) =>
        Number.isFinite(anchor.audioTime) &&
        Number.isFinite(anchor.midiTime),
    )
    .sort(
      (left, right) =>
        left.midiTime - right.midiTime ||
        left.audioTime - right.audioTime,
    );
  const previous = [...orderedByMidi]
    .reverse()
    .find((anchor) => anchor.midiTime < safeMidiTime - 1e-9);
  const next = orderedByMidi.find(
    (anchor) => anchor.midiTime > safeMidiTime + 1e-9,
  );
  const lowerBound = Math.min(
    safeDuration,
    Math.max(0, previous ? previous.audioTime + gap : 0),
  );
  const upperBound = Math.max(
    lowerBound,
    Math.min(safeDuration, next ? next.audioTime - gap : safeDuration),
  );
  const safeRequested = clamp(
    Number.isFinite(requestedAudioTime) ? requestedAudioTime : lowerBound,
    0,
    safeDuration,
  );
  const snappedTime = snapToAudioLandmark(
    safeRequested,
    landmarks,
    Math.max(
      0,
      Number.isFinite(snapWindowSeconds) ? snapWindowSeconds : 0,
    ),
    magnetEnabled,
  );
  const audioTime = clamp(snappedTime, lowerBound, upperBound);
  const snapped =
    magnetEnabled &&
    Math.abs(snappedTime - safeRequested) > Number.EPSILON &&
    Math.abs(audioTime - snappedTime) <= Number.EPSILON;

  return {
    audioTime,
    midiTime: safeMidiTime,
    snapped,
    snapLandmarkTime: snapped ? snappedTime : null,
    lowerBound,
    upperBound,
  };
};

export const insertFineTuneAnchor = ({
  anchors,
  anchor,
  audioDuration,
  minimumGapSeconds = 0.001,
}: FineTuneAnchorOptions): SyncAnchor[] => {
  if (
    !anchor.id ||
    !Number.isFinite(anchor.audioTime) ||
    !Number.isFinite(anchor.midiTime) ||
    anchor.audioTime < 0 ||
    anchor.midiTime < 0
  ) {
    return normalizeAnchors([...anchors]);
  }
  const withoutSameId = anchors.filter(
    (candidate) => candidate.id !== anchor.id,
  );
  const duplicatePulse = withoutSameId.some(
    (candidate) => Math.abs(candidate.midiTime - anchor.midiTime) <= 1e-9,
  );
  if (duplicatePulse) return normalizeAnchors([...anchors]);

  const resolved = resolveGridAnchorDrop({
    requestedAudioTime: anchor.audioTime,
    midiTime: anchor.midiTime,
    anchors: withoutSameId,
    audioDuration,
    landmarks: [],
    magnetEnabled: false,
    minimumGapSeconds,
  });
  return normalizeAnchors([
    ...withoutSameId,
    { ...anchor, audioTime: resolved.audioTime, midiTime: resolved.midiTime },
  ]);
};

export const resolveSyncViewport = (
  duration: number,
  zoom: number,
  requestedStart: number,
): { start: number; duration: number; zoom: number; maximumStart: number } => {
  const safeDuration = Math.max(0.001, Number.isFinite(duration) ? duration : 0);
  const safeZoom = clamp(
    Number.isFinite(zoom) ? zoom : 1,
    1,
    MAX_SYNC_ZOOM,
  );
  const viewportDuration = safeDuration / safeZoom;
  const maximumStart = Math.max(0, safeDuration - viewportDuration);
  return {
    start: clamp(
      Number.isFinite(requestedStart) ? requestedStart : 0,
      0,
      maximumStart,
    ),
    duration: viewportDuration,
    zoom: safeZoom,
    maximumStart,
  };
};
