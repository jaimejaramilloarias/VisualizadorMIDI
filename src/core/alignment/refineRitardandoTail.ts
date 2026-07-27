import type {
  AlignmentAnchorCandidate,
  MidiAlignmentReference,
} from './types';

const MAXIMUM_ANCHORS = 32;
const MAXIMUM_REFINED_ANCHORS = 10;
const MINIMUM_REFINED_ANCHORS = 4;
const MINIMUM_MATCHES = 10;
const MINIMUM_SEGMENT_RATE = 0.35;
export const MINIMUM_RITARDANDO_SEGMENT_RATE = 0.08;
// Only a confirmed last note-on may stretch its release to the exact audio end.
export const MINIMUM_FINAL_RELEASE_SEGMENT_RATE = 0.005;
const MAXIMUM_SEGMENT_RATE = 3;
const MINIMUM_ANCHOR_DELTA_SECONDS = 0.001;
const MINIMUM_REFINED_GAP_SECONDS = 0.25;
const MAXIMUM_MATCH_GAP_SECONDS = 6;
const MAXIMUM_MIDI_PULSES = 32;
const TAIL_WINDOW_SECONDS = 30;
const MINIMUM_MATCH_SPAN_SECONDS = 4;
const MINIMUM_PEAK_TEMPO_DROP_RATIO = 0.06;
const MINIMUM_DTW_TEMPO_DROP_RATIO = 0.025;
const MAXIMUM_ADJACENT_RATE_RATIO = 5;
const FINAL_RELEASE_CLUSTER_GAP_SECONDS = 0.75;

interface MidiPulse {
  strength: number;
  time: number;
}

interface RmsPeak {
  onsetStrength: number;
  prominence: number;
  strength: number;
  time: number;
}

interface TailMatch {
  baselineError: number;
  peak: RmsPeak;
  predictedAudioTime: number;
  pulse: MidiPulse;
}

interface MarkedAnchor {
  anchor: AlignmentAnchorCandidate;
  kind: 'base' | 'refined' | 'terminal';
}

export interface RitardandoTailDiagnostics {
  tailBaselineMedianErrorSeconds: number;
  tailDenseImprovementSeconds: number;
  tailDenseMedianErrorSeconds: number;
  tailDtwTempoDropRatio: number;
  tailFinalReleaseStretchApplied: boolean;
  tailImprovementSeconds: number;
  tailMeanErrorSeconds: number;
  tailPeakMatchCount: number;
  tailRefinedAnchorCount: number;
  tailRefinementApplied: boolean;
  tailRmsPeakCount: number;
  tailTempoDropRatio: number;
  tailTerminalSegmentRate: number;
  tailWindowSeconds: number;
}

export interface RitardandoTailRefinementInput {
  audioDuration: number;
  audioFeatureHopSeconds: number;
  audioOnsets: Float32Array;
  audioRms: Float32Array;
  audioRmsHopSeconds: number;
  baseAnchors: readonly AlignmentAnchorCandidate[];
  denseMidiFramesByAudioFrame: Float64Array;
  midiFeatureHopSeconds: number;
  midiReference: MidiAlignmentReference;
  midiDuration: number;
}

export interface RitardandoTailRefinementResult {
  anchors: AlignmentAnchorCandidate[];
  diagnostics: RitardandoTailDiagnostics;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const median = (values: readonly number[]): number => {
  if (values.length === 0) return 0;
  const ordered = [...values].sort((left, right) => left - right);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 === 0
    ? (ordered[middle - 1] + ordered[middle]) / 2
    : ordered[middle];
};

const mean = (values: readonly number[]): number =>
  values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;

const createEmptyDiagnostics = (
  tailWindowSeconds = 0,
): RitardandoTailDiagnostics => ({
  tailBaselineMedianErrorSeconds: 0,
  tailDenseImprovementSeconds: 0,
  tailDenseMedianErrorSeconds: 0,
  tailDtwTempoDropRatio: 0,
  tailFinalReleaseStretchApplied: false,
  tailImprovementSeconds: 0,
  tailMeanErrorSeconds: 0,
  tailPeakMatchCount: 0,
  tailRefinedAnchorCount: 0,
  tailRefinementApplied: false,
  tailRmsPeakCount: 0,
  tailTempoDropRatio: 0,
  tailTerminalSegmentRate: 0,
  tailWindowSeconds,
});

const mapAudioTimeWithAnchors = (
  audioTime: number,
  anchors: readonly AlignmentAnchorCandidate[],
): number => {
  if (anchors.length === 0) return Math.max(0, audioTime);
  if (anchors.length === 1) {
    return Math.max(
      0,
      anchors[0].midiTime + audioTime - anchors[0].audioTime,
    );
  }
  let rightIndex = anchors.findIndex(
    (anchor) => anchor.audioTime >= audioTime,
  );
  if (rightIndex < 0) rightIndex = anchors.length - 1;
  if (rightIndex === 0) rightIndex = 1;
  const left = anchors[rightIndex - 1];
  const right = anchors[rightIndex];
  const progress =
    (audioTime - left.audioTime) /
    Math.max(MINIMUM_ANCHOR_DELTA_SECONDS, right.audioTime - left.audioTime);
  return (
    left.midiTime + (right.midiTime - left.midiTime) * progress
  );
};

const isUsableSegment = (
  previous: AlignmentAnchorCandidate,
  next: AlignmentAnchorCandidate,
  minimumRate = MINIMUM_SEGMENT_RATE,
): boolean => {
  const audioDelta = next.audioTime - previous.audioTime;
  const midiDelta = next.midiTime - previous.midiTime;
  if (
    audioDelta <= MINIMUM_ANCHOR_DELTA_SECONDS ||
    midiDelta <= MINIMUM_ANCHOR_DELTA_SECONDS
  ) {
    return false;
  }
  const rate = midiDelta / audioDelta;
  return rate >= minimumRate && rate <= MAXIMUM_SEGMENT_RATE;
};

const allMarkedSegmentsAreUsable = (
  anchors: readonly MarkedAnchor[],
  relaxedTerminalAnchor: AlignmentAnchorCandidate | null,
  relaxedTerminalMinimumRate: number,
): boolean =>
  anchors.every(
    (entry, index) =>
      index === 0 ||
      isUsableSegment(
        anchors[index - 1].anchor,
        entry.anchor,
        entry.kind === 'terminal' &&
          anchors[index - 1].kind === 'refined' &&
          anchors[index - 1].anchor === relaxedTerminalAnchor
          ? relaxedTerminalMinimumRate
          : MINIMUM_SEGMENT_RATE,
      ),
  );

const collectMidiPulses = (
  midi: MidiAlignmentReference,
  midiDuration: number,
): MidiPulse[] => {
  const noteCount = Math.min(
    midi.noteCount,
    midi.starts.length,
    midi.velocities.length,
  );
  const events: MidiPulse[] = [];
  for (let note = 0; note < noteCount; note += 1) {
    const time = midi.starts[note];
    if (
      !Number.isFinite(time) ||
      time < 0 ||
      time >= midiDuration - MINIMUM_ANCHOR_DELTA_SECONDS
    ) {
      continue;
    }
    events.push({
      time,
      strength: Math.sqrt(
        clamp((midi.velocities[note] ?? 0) / 127, 0.01, 1),
      ),
    });
  }
  events.sort((left, right) => left.time - right.time);

  const grouped: MidiPulse[] = [];
  events.forEach((event) => {
    const previous = grouped.at(-1);
    if (previous && event.time - previous.time <= 0.04) {
      const combinedStrength = previous.strength + event.strength;
      previous.time =
        (previous.time * previous.strength +
          event.time * event.strength) /
        combinedStrength;
      previous.strength = combinedStrength;
      return;
    }
    grouped.push({ ...event });
  });
  let maximumStrength = 1e-6;
  grouped.forEach((pulse) => {
    maximumStrength = Math.max(
      maximumStrength,
      Math.log1p(pulse.strength),
    );
  });
  grouped.forEach((pulse) => {
    pulse.strength = Math.log1p(pulse.strength) / maximumStrength;
  });

  const timeWindowStart = Math.max(0, midiDuration - TAIL_WINDOW_SECONDS);
  let tail = grouped.filter((pulse) => pulse.time >= timeWindowStart);
  if (tail.length < 8 && grouped.length > tail.length) {
    tail = grouped.slice(-Math.min(16, grouped.length));
  }
  if (tail.length > MAXIMUM_MIDI_PULSES) {
    const firstPulse = tail[0];
    const lastPulse = tail.at(-1)!;
    const rangeStart = tail[0].time;
    const rangeDuration = Math.max(
      0.001,
      midiDuration - rangeStart,
    );
    const bins: Array<MidiPulse | undefined> = Array.from({
      length: MAXIMUM_MIDI_PULSES - 2,
    });
    tail.slice(1, -1).forEach((pulse) => {
      const bin = clamp(
        Math.floor(
          ((pulse.time - rangeStart) / rangeDuration) *
            bins.length,
        ),
        0,
        bins.length - 1,
      );
      const current = bins[bin];
      if (!current || pulse.strength > current.strength) {
        bins[bin] = pulse;
      }
    });
    tail = [
      firstPulse,
      ...bins.filter(
        (pulse): pulse is MidiPulse => pulse !== undefined,
      ),
      lastPulse,
    ].sort((left, right) => left.time - right.time);
  }
  return tail;
};

const invertDenseMapping = (
  midiTime: number,
  mapping: Float64Array,
  audioHopSeconds: number,
  midiHopSeconds: number,
): number => {
  if (mapping.length === 0) return 0;
  const targetFrame = midiTime / midiHopSeconds;
  if (targetFrame <= mapping[0]) return 0;
  if (targetFrame >= mapping.at(-1)!) {
    return (mapping.length - 1) * audioHopSeconds;
  }
  let low = 0;
  let high = mapping.length - 1;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (mapping[middle] < targetFrame) low = middle + 1;
    else high = middle;
  }
  const right = low;
  const left = Math.max(0, right - 1);
  const midiDelta = mapping[right] - mapping[left];
  const progress =
    midiDelta > 1e-6
      ? clamp((targetFrame - mapping[left]) / midiDelta, 0, 1)
      : 0;
  return (left + progress) * audioHopSeconds;
};

export const detectProminentRmsPeaks = (
  rms: Float32Array,
  rmsHopSeconds: number,
  spectralOnsets: Float32Array,
  spectralHopSeconds: number,
  startTime: number,
  endTime: number,
): RmsPeak[] => {
  if (
    rms.length < 5 ||
    rmsHopSeconds <= 0 ||
    spectralOnsets.length < 3 ||
    spectralHopSeconds <= 0 ||
    endTime <= startTime
  ) {
    return [];
  }
  const candidates: RmsPeak[] = [];
  const firstOnsetFrame = clamp(
    Math.floor(startTime / spectralHopSeconds),
    1,
    spectralOnsets.length - 2,
  );
  const lastOnsetFrame = clamp(
    Math.ceil(endTime / spectralHopSeconds),
    firstOnsetFrame,
    spectralOnsets.length - 2,
  );

  for (
    let onsetFrame = firstOnsetFrame;
    onsetFrame <= lastOnsetFrame;
    onsetFrame += 1
  ) {
    const onsetStrength = spectralOnsets[onsetFrame];
    if (
      onsetStrength < 0.14 ||
      onsetStrength < spectralOnsets[onsetFrame - 1] ||
      onsetStrength <= spectralOnsets[onsetFrame + 1]
    ) {
      continue;
    }
    const onsetTime = onsetFrame * spectralHopSeconds;
    const peakStart = clamp(
      Math.floor((onsetTime - 0.02) / rmsHopSeconds),
      0,
      rms.length - 1,
    );
    const peakEnd = clamp(
      Math.ceil((onsetTime + 0.18) / rmsHopSeconds),
      peakStart,
      rms.length - 1,
    );
    let peakFrame = peakStart;
    for (let frame = peakStart + 1; frame <= peakEnd; frame += 1) {
      if (rms[frame] > rms[peakFrame]) peakFrame = frame;
    }
    const baselineStart = clamp(
      Math.floor((onsetTime - 0.24) / rmsHopSeconds),
      0,
      peakFrame,
    );
    const baselineEnd = clamp(
      Math.floor((onsetTime - 0.035) / rmsHopSeconds),
      baselineStart,
      peakFrame,
    );
    const context: number[] = [];
    for (let frame = baselineStart; frame <= baselineEnd; frame += 1) {
      context.push(rms[frame]);
    }
    const baseline = median(context);
    const deviations = context.map((sample) =>
      Math.abs(sample - baseline),
    );
    const mad = Math.max(0.004, median(deviations));
    const prominence = rms[peakFrame] - baseline;
    const time = peakFrame * rmsHopSeconds;
    if (
      time < startTime ||
      time > endTime ||
      prominence < Math.max(0.018, mad * 1.2)
    ) {
      continue;
    }
    const prominenceScore = clamp(
      prominence / Math.max(0.045, mad * 4),
      0,
      1,
    );
    candidates.push({
      onsetStrength,
      prominence,
      strength: prominenceScore * 0.56 + onsetStrength * 0.44,
      time,
    });
  }

  const selected: RmsPeak[] = [];
  [...candidates]
    .sort((left, right) => right.strength - left.strength)
    .some((candidate) => {
      if (
        selected.every(
          (peak) => Math.abs(peak.time - candidate.time) >= 0.08,
        )
      ) {
        selected.push(candidate);
      }
      return selected.length >= 128;
    });
  return selected.sort((left, right) => left.time - right.time);
};

const matchPulsesToPeaks = (
  pulses: readonly MidiPulse[],
  peaks: readonly RmsPeak[],
  denseMapping: Float64Array,
  audioFeatureHopSeconds: number,
  midiFeatureHopSeconds: number,
  baseAnchors: readonly AlignmentAnchorCandidate[],
): TailMatch[] => {
  const predicted = pulses.map((pulse) =>
    invertDenseMapping(
      pulse.time,
      denseMapping,
      audioFeatureHopSeconds,
      midiFeatureHopSeconds,
    ),
  );
  const matches: TailMatch[] = [];
  let lastPeakIndex = -1;

  pulses.forEach((pulse, pulseIndex) => {
    const prediction = predicted[pulseIndex];
    const previousPrediction = predicted[pulseIndex - 1];
    const nextPrediction = predicted[pulseIndex + 1];
    const localInterval = Math.max(
      0.12,
      Math.min(
        previousPrediction === undefined
          ? Number.POSITIVE_INFINITY
          : prediction - previousPrediction,
        nextPrediction === undefined
          ? Number.POSITIVE_INFINITY
          : nextPrediction - prediction,
      ),
    );
    const searchRadius = clamp(0.14 + localInterval * 0.42, 0.2, 0.65);
    const lowerBoundary = Math.max(
      prediction - searchRadius,
      previousPrediction === undefined
        ? Number.NEGATIVE_INFINITY
        : (previousPrediction + prediction) / 2,
    );
    const upperBoundary = Math.min(
      prediction + searchRadius,
      nextPrediction === undefined
        ? Number.POSITIVE_INFINITY
        : (prediction + nextPrediction) / 2,
    );
    let selectedIndex = -1;
    let selectedCost = Number.POSITIVE_INFINITY;

    for (let peakIndex = lastPeakIndex + 1; peakIndex < peaks.length; peakIndex += 1) {
      const peak = peaks[peakIndex];
      if (peak.time < lowerBoundary) continue;
      if (peak.time > upperBoundary) break;
      const distanceCost =
        Math.abs(peak.time - prediction) / searchRadius;
      const strengthCost = 1 - peak.strength;
      const pulseStrengthCost = 1 - pulse.strength;
      const cost =
        distanceCost * 0.62 +
        strengthCost * 0.28 +
        pulseStrengthCost * 0.1;
      if (cost < selectedCost) {
        selectedCost = cost;
        selectedIndex = peakIndex;
      }
    }
    if (selectedIndex < 0 || selectedCost > 0.9) return;
    const peak = peaks[selectedIndex];
    lastPeakIndex = selectedIndex;
    matches.push({
      baselineError: Math.abs(
        mapAudioTimeWithAnchors(peak.time, baseAnchors) - pulse.time,
      ),
      peak,
      predictedAudioTime: prediction,
      pulse,
    });
  });
  return matches;
};

const selectRefinedMatches = (
  matches: readonly TailMatch[],
  maximumCount: number,
  requiredMatch: TailMatch | null,
): TailMatch[] => {
  if (matches.length < 2 || maximumCount < 2) return [];
  const requiredIndex =
    requiredMatch === null ? -1 : matches.indexOf(requiredMatch);
  const selected = new Set<number>([
    0,
    matches.length - 1,
    ...(requiredIndex >= 0 ? [requiredIndex] : []),
  ]);
  if (selected.size > maximumCount) return [];
  while (selected.size < maximumCount) {
    const ordered = [...selected].sort((left, right) => left - right);
    let bestIndex = -1;
    let bestError = Number.NEGATIVE_INFINITY;
    for (let segment = 0; segment < ordered.length - 1; segment += 1) {
      const leftIndex = ordered[segment];
      const rightIndex = ordered[segment + 1];
      const left = matches[leftIndex];
      const right = matches[rightIndex];
      for (
        let index = leftIndex + 1;
        index < rightIndex;
        index += 1
      ) {
        const current = matches[index];
        if (
          ordered.some((selectedIndex) => {
            const selectedMatch = matches[selectedIndex];
            return (
              Math.abs(
                current.peak.time - selectedMatch.peak.time,
              ) < MINIMUM_REFINED_GAP_SECONDS ||
              Math.abs(
                current.pulse.time - selectedMatch.pulse.time,
              ) < MINIMUM_REFINED_GAP_SECONDS
            );
          })
        ) {
          continue;
        }
        const progress =
          (current.peak.time - left.peak.time) /
          Math.max(
            MINIMUM_ANCHOR_DELTA_SECONDS,
            right.peak.time - left.peak.time,
          );
        const expectedMidi =
          left.pulse.time +
          (right.pulse.time - left.pulse.time) * progress;
        const mappingError = Math.abs(
          current.pulse.time - expectedMidi,
        );
        const score =
          mappingError +
          current.baselineError * 0.12 +
          current.peak.strength * 0.004;
        if (score > bestError) {
          bestError = score;
          bestIndex = index;
        }
      }
    }
    if (bestIndex < 0) break;
    selected.add(bestIndex);
  }
  return [...selected]
    .sort((left, right) => left - right)
    .map((index) => matches[index]);
};

const calculateTempoDropRatio = (
  matches: readonly TailMatch[],
  audioTimeForMatch: (match: TailMatch) => number,
): number => {
  const rates: number[] = [];
  for (let index = 1; index < matches.length; index += 1) {
    const audioDelta =
      audioTimeForMatch(matches[index]) -
      audioTimeForMatch(matches[index - 1]);
    const midiDelta =
      matches[index].pulse.time - matches[index - 1].pulse.time;
    if (audioDelta <= 0.08 || midiDelta <= 0.02) continue;
    rates.push(midiDelta / audioDelta);
  }
  if (rates.length < 7) return 0;
  const groupSize = Math.max(3, Math.floor(rates.length * 0.36));
  const early = median(rates.slice(0, groupSize));
  const late = median(rates.slice(-groupSize));
  return early > 1e-6 ? clamp(1 - late / early, -1, 1) : 0;
};

const calculateCumulativeLagDropRatio = (
  matches: readonly TailMatch[],
  audioTimeForMatch: (match: TailMatch) => number,
): number => {
  if (matches.length < 7) return 0;
  const groupSize = Math.max(3, Math.floor(matches.length * 0.3));
  const early = matches.slice(0, groupSize);
  const late = matches.slice(-groupSize);
  const earlyLag = median(
    early.map(
      (match) => audioTimeForMatch(match) - match.pulse.time,
    ),
  );
  const lateLag = median(
    late.map(
      (match) => audioTimeForMatch(match) - match.pulse.time,
    ),
  );
  const midiSpan =
    median(late.map((match) => match.pulse.time)) -
    median(early.map((match) => match.pulse.time));
  if (midiSpan <= 0.1) return 0;
  const lagSlope = (lateLag - earlyLag) / midiSpan;
  return clamp(lagSlope / (1 + Math.abs(lagSlope)), -1, 1);
};

const maximumMatchGap = (
  matches: readonly TailMatch[],
): number => {
  let maximum = 0;
  for (let index = 1; index < matches.length; index += 1) {
    maximum = Math.max(
      maximum,
      matches[index].peak.time - matches[index - 1].peak.time,
    );
  }
  return maximum;
};

const calculateDenseMedianError = (
  anchors: readonly AlignmentAnchorCandidate[],
  mapping: Float64Array,
  audioHopSeconds: number,
  midiHopSeconds: number,
  startTime: number,
  endTime: number,
): number => {
  if (
    anchors.length < 2 ||
    mapping.length < 2 ||
    audioHopSeconds <= 0 ||
    midiHopSeconds <= 0 ||
    endTime <= startTime
  ) {
    return 0;
  }
  const firstFrame = clamp(
    Math.floor(startTime / audioHopSeconds),
    0,
    mapping.length - 1,
  );
  const lastFrame = clamp(
    Math.ceil(endTime / audioHopSeconds),
    firstFrame,
    mapping.length - 1,
  );
  const sampleStride = Math.max(
    1,
    Math.round(0.1 / audioHopSeconds),
  );
  const errors: number[] = [];
  for (
    let frame = firstFrame;
    frame <= lastFrame;
    frame += sampleStride
  ) {
    const midiFrame = mapping[frame];
    if (!Number.isFinite(midiFrame)) continue;
    const audioTime = frame * audioHopSeconds;
    errors.push(
      Math.abs(
        mapAudioTimeWithAnchors(audioTime, anchors) -
          midiFrame * midiHopSeconds,
      ),
    );
  }
  return median(errors);
};

const hasSmoothNonterminalRates = (
  anchors: readonly MarkedAnchor[],
): boolean => {
  const rates: number[] = [];
  for (let index = 1; index < anchors.length; index += 1) {
    if (anchors[index].kind === 'terminal') continue;
    const previous = anchors[index - 1].anchor;
    const current = anchors[index].anchor;
    rates.push(
      (current.midiTime - previous.midiTime) /
        (current.audioTime - previous.audioTime),
    );
  }
  for (let index = 1; index < rates.length; index += 1) {
    const smaller = Math.min(rates[index - 1], rates[index]);
    const larger = Math.max(rates[index - 1], rates[index]);
    if (
      smaller <= 0 ||
      larger / smaller > MAXIMUM_ADJACENT_RATE_RATIO
    ) {
      return false;
    }
  }
  return true;
};

const isReliableFinalMatch = (
  match: TailMatch,
  matches: readonly TailMatch[],
  pulses: readonly MidiPulse[],
  midiDuration: number,
  audioDuration: number,
): boolean => {
  const lastPulse = pulses.at(-1);
  if (!lastPulse) return false;
  const intervals: number[] = [];
  for (let index = 1; index < pulses.length; index += 1) {
    const interval = pulses[index].time - pulses[index - 1].time;
    if (interval > 0.04) intervals.push(interval);
  }
  const allowedMidiTail = clamp(median(intervals) * 4, 2.5, 8);
  const matchIndex = matches.indexOf(match);
  const laterMatches =
    matchIndex < 0 ? Number.POSITIVE_INFINITY : matches.length - matchIndex - 1;
  return (
    laterMatches <= 3 &&
    lastPulse.time - match.pulse.time <= allowedMidiTail &&
    midiDuration - match.pulse.time <= allowedMidiTail &&
    audioDuration - match.peak.time <= 12 &&
    match.peak.strength >= 0.3
  );
};

const findRelaxedTerminalMatch = (
  matches: readonly TailMatch[],
  peaks: readonly RmsPeak[],
  pulses: readonly MidiPulse[],
  terminal: AlignmentAnchorCandidate,
  midiDuration: number,
  audioDuration: number,
): { match: TailMatch; minimumRate: number } | null => {
  const lastPulse = pulses.at(-1);
  if (!lastPulse) return null;
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const match = matches[index];
    const isLastMidiAttack =
      index === matches.length - 1 &&
      Math.abs(match.pulse.time - lastPulse.time) <= 0.05;
    const significantLaterPeaks = peaks.filter(
      (peak) =>
        peak.time > match.peak.time + 0.08 &&
        peak.onsetStrength >= 0.3 &&
        peak.strength >= Math.max(0.5, match.peak.strength * 0.7),
    );
    let previousPeakTime = match.peak.time;
    const hasSeparateLaterAttack = significantLaterPeaks.some(
      (peak) => {
        const separated =
          peak.time - previousPeakTime >
          FINAL_RELEASE_CLUSTER_GAP_SECONDS;
        previousPeakTime = peak.time;
        return separated;
      },
    );
    const minimumRate = isLastMidiAttack && !hasSeparateLaterAttack
      ? MINIMUM_FINAL_RELEASE_SEGMENT_RATE
      : MINIMUM_RITARDANDO_SEGMENT_RATE;
    const candidate: AlignmentAnchorCandidate = {
      audioTime: match.peak.time,
      midiTime: match.pulse.time,
      confidence: match.peak.strength,
    };
    if (
      isUsableSegment(
        candidate,
        terminal,
        minimumRate,
      ) &&
      isReliableFinalMatch(
        match,
        matches,
        pulses,
        midiDuration,
        audioDuration,
      )
    ) {
      return { match, minimumRate };
    }
  }
  return null;
};

const pruneBaseAnchors = (
  anchors: MarkedAnchor[],
  relaxedTerminalAnchor: AlignmentAnchorCandidate | null,
  relaxedTerminalMinimumRate: number,
): MarkedAnchor[] => {
  const output = anchors.slice();
  while (output.length > MAXIMUM_ANCHORS) {
    let selectedIndex = -1;
    let selectedError = Number.POSITIVE_INFINITY;
    for (let index = 1; index < output.length - 1; index += 1) {
      if (output[index].kind !== 'base') continue;
      const left = output[index - 1].anchor;
      const current = output[index].anchor;
      const right = output[index + 1].anchor;
      if (
        !isUsableSegment(
          left,
          right,
          output[index + 1].kind === 'terminal' &&
            output[index - 1].kind === 'refined' &&
            output[index - 1].anchor === relaxedTerminalAnchor
            ? relaxedTerminalMinimumRate
            : MINIMUM_SEGMENT_RATE,
        )
      ) {
        continue;
      }
      const progress =
        (current.audioTime - left.audioTime) /
        Math.max(
          MINIMUM_ANCHOR_DELTA_SECONDS,
          right.audioTime - left.audioTime,
        );
      const expected =
        left.midiTime + (right.midiTime - left.midiTime) * progress;
      const error = Math.abs(current.midiTime - expected);
      if (error < selectedError) {
        selectedError = error;
        selectedIndex = index;
      }
    }
    if (selectedIndex < 0) return [];
    output.splice(selectedIndex, 1);
  }
  return output;
};

const removeConflictingBaseAnchorsWithinEvidence = (
  anchors: MarkedAnchor[],
  evidenceMatches: readonly TailMatch[],
): void => {
  for (let index = anchors.length - 2; index > 0; index -= 1) {
    if (anchors[index].kind !== 'base') continue;
    let leftIndex = index - 1;
    while (
      leftIndex >= 0 &&
      anchors[leftIndex].kind !== 'refined'
    ) {
      leftIndex -= 1;
    }
    let rightIndex = index + 1;
    while (
      rightIndex < anchors.length &&
      anchors[rightIndex].kind !== 'refined'
    ) {
      rightIndex += 1;
    }
    if (leftIndex < 0 || rightIndex >= anchors.length) continue;
    const left = anchors[leftIndex].anchor;
    const right = anchors[rightIndex].anchor;
    if (!isUsableSegment(left, right, MINIMUM_SEGMENT_RATE)) {
      continue;
    }
    const evidence = evidenceMatches.filter(
      (match) =>
        match.peak.time >= left.audioTime &&
        match.peak.time <= right.audioTime,
    );
    if (evidence.length < 2) continue;
    const evidenceTimes = [
      left.audioTime,
      ...evidence.map((match) => match.peak.time),
      right.audioTime,
    ].sort((a, b) => a - b);
    const hasEvidenceGap = evidenceTimes.some(
      (time, evidenceIndex) =>
        evidenceIndex > 0 &&
        time - evidenceTimes[evidenceIndex - 1] >
          MAXIMUM_MATCH_GAP_SECONDS,
    );
    if (hasEvidenceGap) continue;
    const current = anchors[index].anchor;
    const progress =
      (current.audioTime - left.audioTime) /
      (right.audioTime - left.audioTime);
    const expectedMidi =
      left.midiTime + (right.midiTime - left.midiTime) * progress;
    if (Math.abs(current.midiTime - expectedMidi) >= 0.012) {
      anchors.splice(index, 1);
    }
  }
};

const buildRefinedAnchors = (
  baseAnchors: readonly AlignmentAnchorCandidate[],
  selectedMatches: readonly TailMatch[],
  relaxedTerminalMatch: TailMatch,
  relaxedTerminalMinimumRate: number,
  evidenceMatches: readonly TailMatch[],
): {
  anchors: MarkedAnchor[];
  relaxedTerminalAnchor: AlignmentAnchorCandidate | null;
  relaxedTerminalMinimumRate: number;
} => {
  if (
    baseAnchors.length < 2 ||
    selectedMatches.length < MINIMUM_REFINED_ANCHORS
  ) {
    return {
      anchors: [],
      relaxedTerminalAnchor: null,
      relaxedTerminalMinimumRate: MINIMUM_SEGMENT_RATE,
    };
  }
  const firstBaseAnchor = baseAnchors[0];
  const terminal = baseAnchors.at(-1)!;
  const output: MarkedAnchor[] = baseAnchors.map(
    (anchor, index): MarkedAnchor => ({
      anchor,
      kind:
        index === baseAnchors.length - 1 ? 'terminal' : 'base',
    }),
  );
  let relaxedTerminalAnchor: AlignmentAnchorCandidate | null = null;

  const orderedSelectedMatches = [...selectedMatches].sort(
    (left, right) => right.peak.time - left.peak.time,
  );
  for (const match of orderedSelectedMatches) {
    const candidate: AlignmentAnchorCandidate = {
      audioTime: match.peak.time,
      midiTime: match.pulse.time,
      confidence: clamp(
        0.45 + match.peak.strength * 0.45 +
          (1 - clamp(match.baselineError / 0.5, 0, 1)) * 0.1,
        0,
        1,
      ),
    };
    if (
      candidate.audioTime <=
        firstBaseAnchor.audioTime + MINIMUM_ANCHOR_DELTA_SECONDS ||
      candidate.midiTime <=
        firstBaseAnchor.midiTime + MINIMUM_ANCHOR_DELTA_SECONDS ||
      candidate.audioTime >=
        terminal.audioTime - MINIMUM_ANCHOR_DELTA_SECONDS ||
      candidate.midiTime >=
        terminal.midiTime - MINIMUM_ANCHOR_DELTA_SECONDS
    ) {
      continue;
    }

    const candidateOutput = output.slice();
    let rightIndex = candidateOutput.findIndex(
      (entry) => entry.anchor.audioTime >= candidate.audioTime,
    );
    if (rightIndex < 0) rightIndex = candidateOutput.length - 1;
    const nearDuplicateIndex = [rightIndex - 1, rightIndex].find(
      (index) => {
        const entry = candidateOutput[index];
        return (
          entry?.kind === 'base' &&
          index > 0 &&
          Math.abs(entry.anchor.audioTime - candidate.audioTime) <
            0.02 &&
          Math.abs(entry.anchor.midiTime - candidate.midiTime) <
            0.02
        );
      },
    );
    if (nearDuplicateIndex !== undefined) {
      candidateOutput.splice(nearDuplicateIndex, 1);
      rightIndex = candidateOutput.findIndex(
        (entry) => entry.anchor.audioTime >= candidate.audioTime,
      );
      if (rightIndex < 0) {
        rightIndex = candidateOutput.length - 1;
      }
    }

    while (rightIndex > 0) {
      const previous = candidateOutput[rightIndex - 1];
      if (
        isUsableSegment(
          previous.anchor,
          candidate,
          MINIMUM_SEGMENT_RATE,
        )
      ) {
        break;
      }
      if (previous.kind !== 'base' || rightIndex - 1 === 0) {
        rightIndex = -1;
        break;
      }
      candidateOutput.splice(rightIndex - 1, 1);
      rightIndex -= 1;
    }
    if (rightIndex <= 0) continue;

    const isRelaxedTerminalCandidate =
      match === relaxedTerminalMatch;
    while (rightIndex < candidateOutput.length) {
      const next = candidateOutput[rightIndex];
      const minimumRate =
        next.kind === 'terminal' && isRelaxedTerminalCandidate
          ? relaxedTerminalMinimumRate
          : MINIMUM_SEGMENT_RATE;
      if (isUsableSegment(candidate, next.anchor, minimumRate)) {
        break;
      }
      if (next.kind !== 'base') {
        rightIndex = -1;
        break;
      }
      candidateOutput.splice(rightIndex, 1);
    }
    if (
      rightIndex <= 0 ||
      rightIndex >= candidateOutput.length
    ) {
      continue;
    }

    candidateOutput.splice(rightIndex, 0, {
      anchor: candidate,
      kind: 'refined',
    });
    output.splice(0, output.length, ...candidateOutput);
    if (isRelaxedTerminalCandidate) {
      relaxedTerminalAnchor = candidate;
    }
  }

  removeConflictingBaseAnchorsWithinEvidence(
    output,
    evidenceMatches,
  );
  const pruned = pruneBaseAnchors(
    output,
    relaxedTerminalAnchor,
    relaxedTerminalMinimumRate,
  );
  if (
    pruned.length === 0 ||
    pruned[0].anchor !== firstBaseAnchor ||
    pruned.at(-1)?.anchor !== terminal
  ) {
    return {
      anchors: [],
      relaxedTerminalAnchor: null,
      relaxedTerminalMinimumRate: MINIMUM_SEGMENT_RATE,
    };
  }
  const lastEntry = pruned.at(-2);
  if (
    relaxedTerminalAnchor !== null &&
    (lastEntry?.kind !== 'refined' ||
      lastEntry.anchor !== relaxedTerminalAnchor)
  ) {
    relaxedTerminalAnchor = null;
  }
  return {
    anchors: pruned,
    relaxedTerminalAnchor,
    relaxedTerminalMinimumRate:
      relaxedTerminalAnchor === null
        ? MINIMUM_SEGMENT_RATE
        : relaxedTerminalMinimumRate,
  };
};

export const refineRitardandoTail = (
  input: RitardandoTailRefinementInput,
): RitardandoTailRefinementResult => {
  const fallback = (
    diagnostics = createEmptyDiagnostics(),
  ): RitardandoTailRefinementResult => ({
    anchors: input.baseAnchors.slice(),
    diagnostics,
  });
  if (
    input.baseAnchors.length < 2 ||
    input.audioRms.length < 5 ||
    input.denseMidiFramesByAudioFrame.length < 2
  ) {
    return fallback();
  }

  const pulses = collectMidiPulses(
    input.midiReference,
    input.midiDuration,
  );
  if (pulses.length < MINIMUM_MATCHES) return fallback();
  const predictedTailStart = invertDenseMapping(
    pulses[0].time,
    input.denseMidiFramesByAudioFrame,
    input.audioFeatureHopSeconds,
    input.midiFeatureHopSeconds,
  );
  const tailStart = clamp(
    predictedTailStart - 0.8,
    0,
    input.audioDuration,
  );
  const tailWindowSeconds = input.audioDuration - tailStart;
  const peaks = detectProminentRmsPeaks(
    input.audioRms,
    input.audioRmsHopSeconds,
    input.audioOnsets,
    input.audioFeatureHopSeconds,
    tailStart,
    input.audioDuration,
  );
  if (peaks.length < MINIMUM_MATCHES) {
    return fallback({
      ...createEmptyDiagnostics(tailWindowSeconds),
      tailRmsPeakCount: peaks.length,
    });
  }

  const matches = matchPulsesToPeaks(
    pulses,
    peaks,
    input.denseMidiFramesByAudioFrame,
    input.audioFeatureHopSeconds,
    input.midiFeatureHopSeconds,
    input.baseAnchors,
  );
  const peakTempoDropRatio = Math.max(
    calculateTempoDropRatio(
      matches,
      (match) => match.peak.time,
    ),
    calculateCumulativeLagDropRatio(
      matches,
      (match) => match.peak.time,
    ),
  );
  const dtwTempoDropRatio = Math.max(
    calculateTempoDropRatio(
      matches,
      (match) => match.predictedAudioTime,
    ),
    calculateCumulativeLagDropRatio(
      matches,
      (match) => match.predictedAudioTime,
    ),
  );
  const matchSpan =
    matches.length > 1
      ? matches.at(-1)!.peak.time - matches[0].peak.time
      : 0;
  const denseStartTime = matches[0]?.peak.time ?? tailStart;
  const denseEndTime = matches.at(-1)?.peak.time ?? input.audioDuration;
  const baseDenseMedianError = calculateDenseMedianError(
    input.baseAnchors,
    input.denseMidiFramesByAudioFrame,
    input.audioFeatureHopSeconds,
    input.midiFeatureHopSeconds,
    denseStartTime,
    denseEndTime,
  );
  const terminal = input.baseAnchors.at(-1)!;
  const relaxedTerminalSelection = findRelaxedTerminalMatch(
    matches,
    peaks,
    pulses,
    terminal,
    input.midiDuration,
    input.audioDuration,
  );
  const relaxedTerminalMatch =
    relaxedTerminalSelection?.match ?? null;
  const relaxedTerminalMatchIndex =
    relaxedTerminalSelection === null
      ? -1
      : matches.indexOf(relaxedTerminalSelection.match);
  const evaluationStartIndex = Math.floor(matches.length * 0.45);
  // Reserve interleaved late attacks as holdout evidence; they never create anchors.
  const evaluationMatches = matches.filter(
    (match, index) =>
      match !== relaxedTerminalMatch &&
      ((index > evaluationStartIndex &&
        index < matches.length - 1 &&
        (index - evaluationStartIndex) % 2 === 1) ||
        (relaxedTerminalMatchIndex >= 0 &&
          index > relaxedTerminalMatchIndex)),
  );
  const evaluationMatchSet = new Set(evaluationMatches);
  const anchorCandidates = matches.filter(
    (match, index) =>
      index >= evaluationStartIndex &&
      !evaluationMatchSet.has(match),
  );
  const maximumSelectedCount = Math.min(
    MAXIMUM_REFINED_ANCHORS,
    Math.floor(matches.length * 0.55),
    anchorCandidates.length,
  );
  const selectedMatches = selectRefinedMatches(
    anchorCandidates,
    maximumSelectedCount,
    relaxedTerminalMatch,
  );
  const baselineMedianError = median(
    evaluationMatches.map((match) => match.baselineError),
  );
  const initialDiagnostics: RitardandoTailDiagnostics = {
    ...createEmptyDiagnostics(tailWindowSeconds),
    tailBaselineMedianErrorSeconds: baselineMedianError,
    tailDenseMedianErrorSeconds: baseDenseMedianError,
    tailDtwTempoDropRatio: dtwTempoDropRatio,
    tailPeakMatchCount: matches.length,
    tailRmsPeakCount: peaks.length,
    tailTempoDropRatio: peakTempoDropRatio,
  };
  if (
    matches.length < MINIMUM_MATCHES ||
    selectedMatches.length < MINIMUM_REFINED_ANCHORS ||
    evaluationMatches.length < 4 ||
    matchSpan < MINIMUM_MATCH_SPAN_SECONDS ||
    maximumMatchGap(matches) > MAXIMUM_MATCH_GAP_SECONDS ||
    peakTempoDropRatio < MINIMUM_PEAK_TEMPO_DROP_RATIO ||
    dtwTempoDropRatio < MINIMUM_DTW_TEMPO_DROP_RATIO ||
    baselineMedianError < 0.018 ||
    relaxedTerminalSelection === null
  ) {
    return fallback(initialDiagnostics);
  }

  const refinement = buildRefinedAnchors(
    input.baseAnchors,
    selectedMatches,
    relaxedTerminalSelection.match,
    relaxedTerminalSelection.minimumRate,
    matches,
  );
  const marked = refinement.anchors;
  if (marked.length === 0) return fallback(initialDiagnostics);
  const refinedAnchors = marked.map((entry) => entry.anchor);
  const refinedCount = marked.filter(
    (entry) => entry.kind === 'refined',
  ).length;
  if (
    refinedCount < MINIMUM_REFINED_ANCHORS ||
    refinedAnchors.length > MAXIMUM_ANCHORS ||
    !allMarkedSegmentsAreUsable(
      marked,
      refinement.relaxedTerminalAnchor,
      refinement.relaxedTerminalMinimumRate,
    ) ||
    !hasSmoothNonterminalRates(marked)
  ) {
    return fallback(initialDiagnostics);
  }
  const evaluationErrors = evaluationMatches.map((match) =>
    Math.abs(
      mapAudioTimeWithAnchors(match.peak.time, refinedAnchors) -
        match.pulse.time,
    ),
  );
  const refinedDenseMedianError = calculateDenseMedianError(
    refinedAnchors,
    input.denseMidiFramesByAudioFrame,
    input.audioFeatureHopSeconds,
    input.midiFeatureHopSeconds,
    denseStartTime,
    denseEndTime,
  );
  const refinedMedianError = median(evaluationErrors);
  const improvement = baselineMedianError - refinedMedianError;
  const denseImprovement =
    baseDenseMedianError - refinedDenseMedianError;
  const terminalAnchor = refinedAnchors.at(-1)!;
  const penultimateAnchor = refinedAnchors.at(-2)!;
  const terminalSegmentRate =
    (terminalAnchor.midiTime - penultimateAnchor.midiTime) /
    (terminalAnchor.audioTime - penultimateAnchor.audioTime);
  const finalReleaseStretchApplied =
    refinement.relaxedTerminalMinimumRate ===
      MINIMUM_FINAL_RELEASE_SEGMENT_RATE &&
    terminalSegmentRate < MINIMUM_RITARDANDO_SEGMENT_RATE;
  if (
    refinedMedianError >= 0.08 ||
    improvement < 0.012 ||
    improvement <
      baselineMedianError * 0.25 ||
    refinedDenseMedianError > baseDenseMedianError + 0.06 ||
    refinedDenseMedianError >
      Math.max(0.08, baseDenseMedianError * 1.6)
  ) {
    return fallback(initialDiagnostics);
  }

  return {
    anchors: refinedAnchors,
    diagnostics: {
      tailBaselineMedianErrorSeconds: baselineMedianError,
      tailDenseImprovementSeconds: denseImprovement,
      tailDenseMedianErrorSeconds: refinedDenseMedianError,
      tailDtwTempoDropRatio: dtwTempoDropRatio,
      tailFinalReleaseStretchApplied: finalReleaseStretchApplied,
      tailImprovementSeconds: improvement,
      tailMeanErrorSeconds: mean(evaluationErrors),
      tailPeakMatchCount: matches.length,
      tailRefinedAnchorCount: refinedCount,
      tailRefinementApplied: true,
      tailRmsPeakCount: peaks.length,
      tailTempoDropRatio: peakTempoDropRatio,
      tailTerminalSegmentRate: terminalSegmentRate,
      tailWindowSeconds,
    },
  };
};
