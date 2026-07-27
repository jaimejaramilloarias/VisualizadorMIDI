import { describe, expect, it } from 'vitest';
import {
  detectProminentRmsPeaks,
  refineRitardandoTail,
} from './refineRitardandoTail';
import type {
  AlignmentAnchorCandidate,
  MidiAlignmentReference,
} from './types';

const RMS_HOP_SECONDS = 0.01;
const FEATURE_HOP_SECONDS = 0.05;

const createMidiReference = (
  starts: readonly number[],
  duration: number,
): MidiAlignmentReference => ({
  duration,
  noteCount: starts.length,
  starts: Float64Array.from(starts),
  ends: Float64Array.from(
    starts,
    (start, index) =>
      index === starts.length - 1
        ? duration
        : Math.min(duration, start + 0.32),
  ),
  pitches: Uint8Array.from(
    starts,
    (_, index) => 48 + ((index * 7) % 24),
  ),
  velocities: Uint8Array.from(
    starts,
    (_, index) => Math.max(48, 118 - index * 3),
  ),
  channels: Uint8Array.from(starts, () => 0),
  families: Uint8Array.from(starts, () => 0),
});

const addPeakEvidence = (
  rms: Float32Array,
  onsets: Float32Array,
  time: number,
  amplitude: number,
): void => {
  const rmsFrame = Math.round(time / RMS_HOP_SECONDS);
  if (rmsFrame > 1 && rmsFrame < rms.length - 2) {
    rms[rmsFrame - 1] += amplitude * 0.24;
    rms[rmsFrame] += amplitude;
    rms[rmsFrame + 1] += amplitude * 0.18;
  }
  const onsetFrame = Math.round(time / FEATURE_HOP_SECONDS);
  if (onsetFrame >= 0 && onsetFrame < onsets.length) {
    onsets[onsetFrame] = Math.max(onsets[onsetFrame], 0.82);
  }
};

const mapWithAnchors = (
  audioTime: number,
  anchors: readonly AlignmentAnchorCandidate[],
): number => {
  let right = anchors.findIndex(
    (anchor) => anchor.audioTime >= audioTime,
  );
  if (right < 0) right = anchors.length - 1;
  if (right === 0) right = 1;
  const leftAnchor = anchors[right - 1];
  const rightAnchor = anchors[right];
  const progress =
    (audioTime - leftAnchor.audioTime) /
    (rightAnchor.audioTime - leftAnchor.audioTime);
  return (
    leftAnchor.midiTime +
    (rightAnchor.midiTime - leftAnchor.midiTime) * progress
  );
};

describe('refinamiento RMS del ritardando final', () => {
  it('conserva picos locales de un final en diminuendo y exige ataque espectral', () => {
    const rms = new Float32Array(1_001);
    rms.fill(0.08);
    const onsets = new Float32Array(201);
    addPeakEvidence(rms, onsets, 3, 0.8);
    addPeakEvidence(rms, onsets, 5, 0.48);
    addPeakEvidence(rms, onsets, 7, 0.26);
    rms[Math.round(8 / RMS_HOP_SECONDS)] = 1.2;

    const peaks = detectProminentRmsPeaks(
      rms,
      RMS_HOP_SECONDS,
      onsets,
      FEATURE_HOP_SECONDS,
      2,
      9,
    );

    expect(peaks.map((peak) => peak.time)).toEqual([3, 5, 7]);
  });

  it('inserta detalle en una coda con ritardando y conserva el cierre exacto', () => {
    const midiDuration = 19.05;
    const audioTimeForMidi = (midiTime: number): number =>
      midiTime <= 12
        ? midiTime
        : 12 + (midiTime - 12) + (midiTime - 12) ** 2 / 16;
    const alignedAudioEnd = audioTimeForMidi(midiDuration);
    const audioDuration = alignedAudioEnd + 4;
    const pulseTimes = Array.from({ length: 18 }, (_, index) => index + 2);
    const midi = createMidiReference(pulseTimes, midiDuration);
    const rms = new Float32Array(
      Math.ceil(audioDuration / RMS_HOP_SECONDS) + 1,
    );
    rms.fill(0.055);
    const onsets = new Float32Array(
      Math.ceil(audioDuration / FEATURE_HOP_SECONDS) + 1,
    );
    pulseTimes.forEach((time, index) => {
      addPeakEvidence(
        rms,
        onsets,
        audioTimeForMidi(time),
        0.88 - index * 0.018,
      );
    });
    const denseMapping = new Float64Array(onsets.length);
    for (let frame = 0; frame < denseMapping.length; frame += 1) {
      const audioTime = frame * FEATURE_HOP_SECONDS;
      let low = 0;
      let high = midiDuration;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (low + high) / 2;
        if (audioTimeForMidi(middle) < audioTime) low = middle;
        else high = middle;
      }
      denseMapping[frame] =
        ((low + high) / 2) / FEATURE_HOP_SECONDS;
    }
    const baseAnchors: AlignmentAnchorCandidate[] = [
      { audioTime: 0, midiTime: 0, confidence: 0.9 },
      { audioTime: 1, midiTime: 1, confidence: 0.9 },
      { audioTime: 12, midiTime: 12, confidence: 0.9 },
      {
        audioTime: audioDuration,
        midiTime: midiDuration,
        confidence: 0.9,
      },
    ];

    const result = refineRitardandoTail({
      audioDuration,
      audioFeatureHopSeconds: FEATURE_HOP_SECONDS,
      audioOnsets: onsets,
      audioRms: rms,
      audioRmsHopSeconds: RMS_HOP_SECONDS,
      baseAnchors,
      denseMidiFramesByAudioFrame: denseMapping,
      midiDuration,
      midiFeatureHopSeconds: FEATURE_HOP_SECONDS,
      midiReference: midi,
    });
    const terminal = result.anchors.at(-1)!;
    const tailErrors = pulseTimes
      .filter((time) => time >= 13)
      .map((time) =>
        Math.abs(
          mapWithAnchors(
            audioTimeForMidi(time),
            result.anchors,
          ) - time,
        ),
      );

    expect(result.diagnostics.tailRefinementApplied).toBe(true);
    expect(result.diagnostics.tailRefinedAnchorCount).toBeGreaterThanOrEqual(4);
    expect(result.diagnostics.tailPeakMatchCount).toBeGreaterThanOrEqual(6);
    expect(result.diagnostics.tailTempoDropRatio).toBeGreaterThan(0.08);
    expect(result.diagnostics.tailImprovementSeconds).toBeGreaterThan(0.025);
    expect(
      result.diagnostics.tailDenseImprovementSeconds,
    ).toBeGreaterThanOrEqual(-0.06);
    expect(Math.max(...tailErrors)).toBeLessThan(0.08);
    expect(result.anchors.length).toBeLessThanOrEqual(32);
    expect(result.anchors[0]).toBe(baseAnchors[0]);
    expect(result.anchors).toContain(baseAnchors[1]);
    expect(
      result.diagnostics.tailRefinedAnchorCount /
        result.diagnostics.tailPeakMatchCount,
    ).toBeLessThanOrEqual(0.55);
    expect(terminal.audioTime).toBe(audioDuration);
    expect(terminal.midiTime).toBe(midiDuration);
    result.anchors.slice(1, -1).forEach((anchor, index) => {
      const previous = result.anchors[index];
      expect(
        (anchor.midiTime - previous.midiTime) /
          (anchor.audioTime - previous.audioTime),
      ).toBeGreaterThanOrEqual(0.35);
    });
    const penultimate = result.anchors.at(-2)!;
    const terminalRate =
      (terminal.midiTime - penultimate.midiTime) /
      (terminal.audioTime - penultimate.audioTime);
    expect(terminalRate).toBeLessThan(0.08);
    expect(terminalRate).toBeGreaterThanOrEqual(0.005);
    expect(
      result.diagnostics.tailFinalReleaseStretchApplied,
    ).toBe(true);
    expect(
      result.diagnostics.tailTerminalSegmentRate,
    ).toBeCloseTo(terminalRate, 8);

    const rmsWithReleaseCluster = rms.slice();
    const onsetsWithReleaseCluster = onsets.slice();
    const lastAttackAudioTime = audioTimeForMidi(pulseTimes.at(-1)!);
    [0.25, 0.55, 0.9].forEach((delay, index) => {
      addPeakEvidence(
        rmsWithReleaseCluster,
        onsetsWithReleaseCluster,
        lastAttackAudioTime + delay,
        0.78 - index * 0.08,
      );
    });
    const resultWithReleaseCluster = refineRitardandoTail({
      audioDuration,
      audioFeatureHopSeconds: FEATURE_HOP_SECONDS,
      audioOnsets: onsetsWithReleaseCluster,
      audioRms: rmsWithReleaseCluster,
      audioRmsHopSeconds: RMS_HOP_SECONDS,
      baseAnchors,
      denseMidiFramesByAudioFrame: denseMapping,
      midiDuration,
      midiFeatureHopSeconds: FEATURE_HOP_SECONDS,
      midiReference: midi,
    });
    expect(
      resultWithReleaseCluster.diagnostics
        .tailFinalReleaseStretchApplied,
    ).toBe(true);

    const rmsWithLaterAttack = rms.slice();
    const onsetsWithLaterAttack = onsets.slice();
    addPeakEvidence(
      rmsWithLaterAttack,
      onsetsWithLaterAttack,
      audioDuration - 1,
      0.95,
    );
    const resultWithLaterAttack = refineRitardandoTail({
      audioDuration,
      audioFeatureHopSeconds: FEATURE_HOP_SECONDS,
      audioOnsets: onsetsWithLaterAttack,
      audioRms: rmsWithLaterAttack,
      audioRmsHopSeconds: RMS_HOP_SECONDS,
      baseAnchors,
      denseMidiFramesByAudioFrame: denseMapping,
      midiDuration,
      midiFeatureHopSeconds: FEATURE_HOP_SECONDS,
      midiReference: midi,
    });
    expect(
      resultWithLaterAttack.diagnostics
        .tailFinalReleaseStretchApplied,
    ).toBe(false);

    const midiDurationWithUnmatchedFinalAttack = 19.2;
    const midiWithUnmatchedFinalAttack = createMidiReference(
      [...pulseTimes, 19.1],
      midiDurationWithUnmatchedFinalAttack,
    );
    const baseAnchorsWithUnmatchedFinalAttack = baseAnchors.map(
      (anchor, index) =>
        index === baseAnchors.length - 1
          ? {
              ...anchor,
              midiTime: midiDurationWithUnmatchedFinalAttack,
            }
          : anchor,
    );
    const resultWithUnmatchedFinalAttack = refineRitardandoTail({
      audioDuration,
      audioFeatureHopSeconds: FEATURE_HOP_SECONDS,
      audioOnsets: onsets,
      audioRms: rms,
      audioRmsHopSeconds: RMS_HOP_SECONDS,
      baseAnchors: baseAnchorsWithUnmatchedFinalAttack,
      denseMidiFramesByAudioFrame: denseMapping,
      midiDuration: midiDurationWithUnmatchedFinalAttack,
      midiFeatureHopSeconds: FEATURE_HOP_SECONDS,
      midiReference: midiWithUnmatchedFinalAttack,
    });
    expect(
      resultWithUnmatchedFinalAttack.diagnostics
        .tailFinalReleaseStretchApplied,
    ).toBe(false);
  });

  it('no agrega anclas cuando el final ya mantiene tempo estable', () => {
    const duration = 20;
    const pulseTimes = Array.from({ length: 18 }, (_, index) => index + 2);
    const midi = createMidiReference(pulseTimes, duration);
    const rms = new Float32Array(
      Math.ceil(duration / RMS_HOP_SECONDS) + 1,
    );
    rms.fill(0.05);
    const onsets = new Float32Array(
      Math.ceil(duration / FEATURE_HOP_SECONDS) + 1,
    );
    pulseTimes.forEach((time) =>
      addPeakEvidence(rms, onsets, time, 0.75),
    );
    const denseMapping = Float64Array.from(
      onsets,
      (_, index) => index,
    );
    const baseAnchors: AlignmentAnchorCandidate[] = [
      { audioTime: 0, midiTime: 0, confidence: 0.9 },
      { audioTime: duration, midiTime: duration, confidence: 0.9 },
    ];

    const result = refineRitardandoTail({
      audioDuration: duration,
      audioFeatureHopSeconds: FEATURE_HOP_SECONDS,
      audioOnsets: onsets,
      audioRms: rms,
      audioRmsHopSeconds: RMS_HOP_SECONDS,
      baseAnchors,
      denseMidiFramesByAudioFrame: denseMapping,
      midiDuration: duration,
      midiFeatureHopSeconds: FEATURE_HOP_SECONDS,
      midiReference: midi,
    });

    expect(result.diagnostics.tailRefinementApplied).toBe(false);
    expect(result.anchors).toEqual(baseAnchors);
  });

  it('no permite que diez coincidencias se validen a sí mismas', () => {
    const midiDuration = 12;
    const pulseTimes = Array.from({ length: 10 }, (_, index) => index + 2);
    const audioTimeForMidi = (midiTime: number): number =>
      midiTime <= 6
        ? midiTime
        : 6 + (midiTime - 6) + (midiTime - 6) ** 2 / 12;
    const audioDuration = audioTimeForMidi(midiDuration) + 1;
    const midi = createMidiReference(pulseTimes, midiDuration);
    const rms = new Float32Array(
      Math.ceil(audioDuration / RMS_HOP_SECONDS) + 1,
    );
    rms.fill(0.05);
    const onsets = new Float32Array(
      Math.ceil(audioDuration / FEATURE_HOP_SECONDS) + 1,
    );
    pulseTimes.forEach((time) =>
      addPeakEvidence(rms, onsets, audioTimeForMidi(time), 0.75),
    );
    const denseMapping = new Float64Array(onsets.length);
    for (let frame = 0; frame < denseMapping.length; frame += 1) {
      const audioTime = frame * FEATURE_HOP_SECONDS;
      let low = 0;
      let high = midiDuration;
      for (let iteration = 0; iteration < 24; iteration += 1) {
        const middle = (low + high) / 2;
        if (audioTimeForMidi(middle) < audioTime) low = middle;
        else high = middle;
      }
      denseMapping[frame] =
        ((low + high) / 2) / FEATURE_HOP_SECONDS;
    }
    const baseAnchors: AlignmentAnchorCandidate[] = [
      { audioTime: 0, midiTime: 0, confidence: 0.9 },
      {
        audioTime: audioDuration,
        midiTime: midiDuration,
        confidence: 0.9,
      },
    ];

    const result = refineRitardandoTail({
      audioDuration,
      audioFeatureHopSeconds: FEATURE_HOP_SECONDS,
      audioOnsets: onsets,
      audioRms: rms,
      audioRmsHopSeconds: RMS_HOP_SECONDS,
      baseAnchors,
      denseMidiFramesByAudioFrame: denseMapping,
      midiDuration,
      midiFeatureHopSeconds: FEATURE_HOP_SECONDS,
      midiReference: midi,
    });

    expect(result.diagnostics.tailPeakMatchCount).toBe(10);
    expect(result.diagnostics.tailRefinementApplied).toBe(false);
    expect(result.anchors).toEqual(baseAnchors);
  });

  it('rechaza un falso ritardando creado solo por picos RMS cada vez más tardíos', () => {
    const duration = 20;
    const pulseTimes = Array.from({ length: 18 }, (_, index) => index + 2);
    const midi = createMidiReference(pulseTimes, duration);
    const rms = new Float32Array(
      Math.ceil((duration + 1) / RMS_HOP_SECONDS) + 1,
    );
    rms.fill(0.05);
    const onsets = new Float32Array(
      Math.ceil((duration + 1) / FEATURE_HOP_SECONDS) + 1,
    );
    pulseTimes.forEach((time) => {
      const delayedPeak =
        time + Math.max(0, time - 10) ** 2 / 180;
      addPeakEvidence(rms, onsets, delayedPeak, 0.72);
    });
    const denseMapping = Float64Array.from(
      onsets,
      (_, index) => index,
    );
    const baseAnchors: AlignmentAnchorCandidate[] = [
      { audioTime: 0, midiTime: 0, confidence: 0.9 },
      { audioTime: duration, midiTime: duration, confidence: 0.9 },
    ];

    const result = refineRitardandoTail({
      audioDuration: duration,
      audioFeatureHopSeconds: FEATURE_HOP_SECONDS,
      audioOnsets: onsets,
      audioRms: rms,
      audioRmsHopSeconds: RMS_HOP_SECONDS,
      baseAnchors,
      denseMidiFramesByAudioFrame: denseMapping,
      midiDuration: duration,
      midiFeatureHopSeconds: FEATURE_HOP_SECONDS,
      midiReference: midi,
    });

    expect(result.diagnostics.tailDtwTempoDropRatio).toBeLessThan(0.01);
    expect(result.diagnostics.tailRefinementApplied).toBe(false);
    expect(result.anchors).toEqual(baseAnchors);
  });
});
