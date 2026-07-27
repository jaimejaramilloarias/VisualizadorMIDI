import { FAMILY_IDS } from '../midi/types';
import type {
  AlignmentAnchorCandidate,
  AlignmentAudioSource,
  AlignmentProgress,
  AutomaticAlignmentResult,
  MidiAlignmentReference,
} from './types';

const TARGET_SAMPLE_RATE = 11_025;
const FFT_SIZE = 2_048;
const HOP_SECONDS = 0.05;
const COARSE_FACTOR = 4;
const CHROMA_WEIGHT = 0.74;
const ONSET_WEIGHT = 1 - CHROMA_WEIGHT;
const MAXIMUM_ANCHORS = 32;
const MINIMUM_SEGMENT_RATE = 0.35;
const MAXIMUM_SEGMENT_RATE = 3;
const MINIMUM_ANCHOR_DELTA_SECONDS = 0.001;
const PERCUSSION_FAMILY_INDEX = FAMILY_IDS.indexOf('percussion');

export interface AlignmentFeatureSequence {
  chroma: Float32Array;
  duration: number;
  frameCount: number;
  hopSeconds: number;
  onsets: Float32Array;
  tonalActivity: Float32Array;
}

interface DtwPoint {
  audioFrame: number;
  midiFrame: number;
}

interface DtwResult {
  meanCost: number;
  path: DtwPoint[];
}

interface PathQuality {
  evidenceCoverage: number;
  evidenceMeanCost: number;
  jointEvidenceRatio: number;
  temporalCoverage: number;
}

type ProgressReporter = (progress: AlignmentProgress) => void;

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const normalizeChromaFrame = (
  chroma: Float32Array,
  offset: number,
): number => {
  let squared = 0;
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    squared += chroma[offset + pitchClass] ** 2;
  }
  const norm = Math.sqrt(squared);
  if (norm <= 1e-8) {
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      chroma[offset + pitchClass] = 0;
    }
    return 0;
  }
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    chroma[offset + pitchClass] /= norm;
  }
  return norm;
};

const percentile = (values: Float32Array, ratio: number): number => {
  const finite = Array.from(values, (value) =>
    Number.isFinite(value) ? Math.max(0, value) : 0,
  ).sort((left, right) => left - right);
  if (finite.length === 0) return 0;
  return finite[
    Math.min(
      finite.length - 1,
      Math.max(0, Math.floor((finite.length - 1) * ratio)),
    )
  ];
};

const normalizeOnsets = (raw: Float32Array): Float32Array => {
  const enhanced = new Float32Array(raw.length);
  let trailingSum = 0;
  const trailingWindow = 8;
  for (let index = 0; index < raw.length; index += 1) {
    const previousCount = Math.min(index, trailingWindow);
    const baseline =
      previousCount > 0 ? trailingSum / previousCount : 0;
    enhanced[index] = Math.max(0, raw[index] - baseline * 0.72);
    trailingSum += raw[index];
    if (index >= trailingWindow) trailingSum -= raw[index - trailingWindow];
  }

  const scale = Math.max(1e-8, percentile(enhanced, 0.95));
  for (let index = 0; index < enhanced.length; index += 1) {
    enhanced[index] = clamp(enhanced[index] / scale, 0, 1);
  }
  return enhanced;
};

const smoothChroma = (
  chroma: Float32Array,
  frameCount: number,
): Float32Array => {
  const smoothed = new Float32Array(chroma.length);
  const weights = [0.15, 0.22, 0.26, 0.22, 0.15];
  for (let frame = 0; frame < frameCount; frame += 1) {
    const outputOffset = frame * 12;
    for (let delta = -2; delta <= 2; delta += 1) {
      const sourceFrame = clamp(frame + delta, 0, frameCount - 1);
      const sourceOffset = sourceFrame * 12;
      const weight = weights[delta + 2];
      for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
        smoothed[outputOffset + pitchClass] +=
          chroma[sourceOffset + pitchClass] * weight;
      }
    }
    normalizeChromaFrame(smoothed, outputOffset);
  }
  return smoothed;
};

const createBitReverseTable = (size: number): Uint32Array => {
  const bits = Math.round(Math.log2(size));
  const table = new Uint32Array(size);
  for (let index = 0; index < size; index += 1) {
    let value = index;
    let reversed = 0;
    for (let bit = 0; bit < bits; bit += 1) {
      reversed = (reversed << 1) | (value & 1);
      value >>= 1;
    }
    table[index] = reversed;
  }
  return table;
};

const fftInPlace = (
  real: Float32Array,
  imaginary: Float32Array,
  cosine: Float32Array,
  sine: Float32Array,
): void => {
  const size = real.length;
  for (let length = 2; length <= size; length <<= 1) {
    const half = length >> 1;
    const tableStep = size / length;
    for (let start = 0; start < size; start += length) {
      for (let offset = 0; offset < half; offset += 1) {
        const tableIndex = offset * tableStep;
        const right = start + offset + half;
        const left = start + offset;
        const cos = cosine[tableIndex];
        const sin = sine[tableIndex];
        const rightReal =
          real[right] * cos - imaginary[right] * sin;
        const rightImaginary =
          real[right] * sin + imaginary[right] * cos;
        const leftReal = real[left];
        const leftImaginary = imaginary[left];
        real[left] = leftReal + rightReal;
        imaginary[left] = leftImaginary + rightImaginary;
        real[right] = leftReal - rightReal;
        imaginary[right] = leftImaginary - rightImaginary;
      }
    }
  }
};

const resampleAndDownmix = (
  source: AlignmentAudioSource,
  report?: (progress: number) => void,
): Float32Array => {
  const channels = source.channels.filter((channel) => channel.length > 0);
  if (channels.length === 0 || source.sampleRate <= 0) {
    throw new Error('El audio no contiene muestras que se puedan analizar.');
  }
  if (
    channels.length === 1 &&
    Math.abs(source.sampleRate - TARGET_SAMPLE_RATE) < 0.5
  ) {
    report?.(1);
    return channels[0];
  }
  const sourceLength = Math.min(...channels.map((channel) => channel.length));
  const ratio = source.sampleRate / TARGET_SAMPLE_RATE;
  const outputLength = Math.max(1, Math.floor(sourceLength / ratio));
  const output = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourceStart = Math.min(
      sourceLength - 1,
      Math.floor(outputIndex * ratio),
    );
    const sourceEnd = Math.min(
      sourceLength,
      Math.max(sourceStart + 1, Math.floor((outputIndex + 1) * ratio)),
    );
    let sum = 0;
    let count = 0;
    for (let sourceIndex = sourceStart; sourceIndex < sourceEnd; sourceIndex += 1) {
      for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
        sum += channels[channelIndex][sourceIndex] ?? 0;
        count += 1;
      }
    }
    output[outputIndex] = count > 0 ? sum / count : 0;
    if ((outputIndex & 0x3ffff) === 0) {
      report?.(outputIndex / outputLength);
    }
  }
  report?.(1);
  return output;
};

export const extractAudioAlignmentFeatures = (
  source: AlignmentAudioSource,
  report?: (progress: number) => void,
): AlignmentFeatureSequence => {
  if (source.duration < 1) {
    throw new Error('El audio es demasiado corto para estimar su sincronía.');
  }
  const samples = resampleAndDownmix(source, (progress) =>
    report?.(progress * 0.22),
  );
  const hopSize = Math.max(1, Math.round(TARGET_SAMPLE_RATE * HOP_SECONDS));
  const frameCount = Math.max(1, Math.floor(samples.length / hopSize) + 1);
  const chroma = new Float32Array(frameCount * 12);
  const tonalActivity = new Float32Array(frameCount);
  const rawOnsets = new Float32Array(frameCount);
  const real = new Float32Array(FFT_SIZE);
  const imaginary = new Float32Array(FFT_SIZE);
  const previousSpectrum = new Float32Array(FFT_SIZE / 2 + 1);
  const bitReverse = createBitReverseTable(FFT_SIZE);
  const window = new Float32Array(FFT_SIZE);
  const cosine = new Float32Array(FFT_SIZE / 2);
  const sine = new Float32Array(FFT_SIZE / 2);
  const binPitchClass = new Int8Array(FFT_SIZE / 2 + 1);
  const binFraction = new Float32Array(FFT_SIZE / 2 + 1);
  const minimumBin = Math.max(1, Math.ceil((55 * FFT_SIZE) / TARGET_SAMPLE_RATE));
  const maximumBin = Math.min(
    FFT_SIZE / 2,
    Math.floor((5_000 * FFT_SIZE) / TARGET_SAMPLE_RATE),
  );

  for (let index = 0; index < FFT_SIZE; index += 1) {
    window[index] =
      0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (FFT_SIZE - 1));
  }
  for (let index = 0; index < FFT_SIZE / 2; index += 1) {
    const angle = (-2 * Math.PI * index) / FFT_SIZE;
    cosine[index] = Math.cos(angle);
    sine[index] = Math.sin(angle);
  }
  for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
    const frequency = (bin * TARGET_SAMPLE_RATE) / FFT_SIZE;
    const midiPitch = 69 + 12 * Math.log2(frequency / 440);
    const wrapped = ((midiPitch % 12) + 12) % 12;
    binPitchClass[bin] = Math.floor(wrapped);
    binFraction[bin] = wrapped - Math.floor(wrapped);
  }

  const halfWindow = FFT_SIZE >> 1;
  for (let frame = 0; frame < frameCount; frame += 1) {
    const center = frame * hopSize;
    let squaredEnergy = 0;
    for (let index = 0; index < FFT_SIZE; index += 1) {
      const sampleIndex = center + index - halfWindow;
      const sample =
        sampleIndex >= 0 && sampleIndex < samples.length
          ? samples[sampleIndex]
          : 0;
      const windowed = sample * window[index];
      const reversed = bitReverse[index];
      real[reversed] = windowed;
      imaginary[reversed] = 0;
      squaredEnergy += sample * sample;
    }
    fftInPlace(real, imaginary, cosine, sine);

    const chromaOffset = frame * 12;
    let flux = 0;
    for (let bin = minimumBin; bin <= maximumBin; bin += 1) {
      const magnitude =
        Math.hypot(real[bin], imaginary[bin]) / FFT_SIZE;
      const logMagnitude = Math.log1p(magnitude * 160);
      flux += Math.max(0, logMagnitude - previousSpectrum[bin]);
      previousSpectrum[bin] = logMagnitude;
      const pitchClass = binPitchClass[bin];
      const fraction = binFraction[bin];
      chroma[chromaOffset + pitchClass] += logMagnitude * (1 - fraction);
      chroma[chromaOffset + ((pitchClass + 1) % 12)] +=
        logMagnitude * fraction;
    }

    const rms = Math.sqrt(squaredEnergy / FFT_SIZE);
    const rawNorm = normalizeChromaFrame(chroma, chromaOffset);
    tonalActivity[frame] = rms >= 0.00045 && rawNorm > 0.015 ? 1 : 0;
    if (tonalActivity[frame] === 0) {
      for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
        chroma[chromaOffset + pitchClass] = 0;
      }
    }
    rawOnsets[frame] = frame === 0 ? 0 : flux;
    if ((frame & 31) === 0) {
      report?.(0.22 + (frame / frameCount) * 0.78);
    }
  }
  report?.(1);

  return {
    chroma: smoothChroma(chroma, frameCount),
    duration: samples.length / TARGET_SAMPLE_RATE,
    frameCount,
    hopSeconds: hopSize / TARGET_SAMPLE_RATE,
    onsets: normalizeOnsets(rawOnsets),
    tonalActivity,
  };
};

export const extractMidiAlignmentFeatures = (
  midi: MidiAlignmentReference,
  hopSeconds: number,
): AlignmentFeatureSequence => {
  if (midi.noteCount < 1 || midi.duration < 0.1) {
    throw new Error('El MIDI no contiene suficientes notas para alinearlo.');
  }
  const frameCount = Math.max(1, Math.floor(midi.duration / hopSeconds) + 1);
  const chromaDelta = new Float32Array((frameCount + 1) * 12);
  const chroma = new Float32Array(frameCount * 12);
  const rawOnsets = new Float32Array(frameCount);
  const tonalActivity = new Float32Array(frameCount);
  const noteCount = Math.min(
    midi.noteCount,
    midi.starts.length,
    midi.ends.length,
    midi.pitches.length,
    midi.velocities.length,
  );

  for (let note = 0; note < noteCount; note += 1) {
    const start = Math.max(0, midi.starts[note] ?? 0);
    const end = Math.max(start + hopSeconds, midi.ends[note] ?? start);
    const startFrame = clamp(Math.round(start / hopSeconds), 0, frameCount - 1);
    const endFrame = clamp(
      Math.max(startFrame + 1, Math.ceil(end / hopSeconds)),
      1,
      frameCount,
    );
    const velocity = clamp((midi.velocities[note] ?? 0) / 127, 0, 1);
    const weight = Math.sqrt(Math.max(0.02, velocity));
    rawOnsets[startFrame] += weight;

    const isPercussion =
      midi.channels[note] === 9 ||
      midi.families[note] === PERCUSSION_FAMILY_INDEX;
    if (isPercussion) continue;
    const pitchClass = (midi.pitches[note] ?? 0) % 12;
    chromaDelta[startFrame * 12 + pitchClass] += weight;
    chromaDelta[endFrame * 12 + pitchClass] -= weight;
  }

  const active = new Float32Array(12);
  for (let frame = 0; frame < frameCount; frame += 1) {
    const offset = frame * 12;
    for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
      active[pitchClass] += chromaDelta[offset + pitchClass];
      chroma[offset + pitchClass] = Math.sqrt(
        Math.max(0, active[pitchClass]),
      );
    }
    tonalActivity[frame] = normalizeChromaFrame(chroma, offset) > 0 ? 1 : 0;
  }

  const spreadOnsets = new Float32Array(frameCount);
  const kernel = [0.08, 0.22, 0.4, 0.22, 0.08];
  for (let frame = 0; frame < frameCount; frame += 1) {
    if (rawOnsets[frame] <= 0) continue;
    for (let delta = -2; delta <= 2; delta += 1) {
      const target = frame + delta;
      if (target < 0 || target >= frameCount) continue;
      spreadOnsets[target] += rawOnsets[frame] * kernel[delta + 2];
    }
  }

  return {
    chroma: smoothChroma(chroma, frameCount),
    duration: midi.duration,
    frameCount,
    hopSeconds,
    onsets: normalizeOnsets(spreadOnsets),
    tonalActivity,
  };
};

const aggregateFeatures = (
  sequence: AlignmentFeatureSequence,
  factor: number,
): AlignmentFeatureSequence => {
  const frameCount = Math.max(1, Math.ceil(sequence.frameCount / factor));
  const chroma = new Float32Array(frameCount * 12);
  const onsets = new Float32Array(frameCount);
  const tonalActivity = new Float32Array(frameCount);
  for (let outputFrame = 0; outputFrame < frameCount; outputFrame += 1) {
    const start = outputFrame * factor;
    const end = Math.min(sequence.frameCount, start + factor);
    for (let inputFrame = start; inputFrame < end; inputFrame += 1) {
      const inputOffset = inputFrame * 12;
      const outputOffset = outputFrame * 12;
      for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
        chroma[outputOffset + pitchClass] +=
          sequence.chroma[inputOffset + pitchClass];
      }
      onsets[outputFrame] = Math.max(
        onsets[outputFrame],
        sequence.onsets[inputFrame],
      );
      tonalActivity[outputFrame] = Math.max(
        tonalActivity[outputFrame],
        sequence.tonalActivity[inputFrame],
      );
    }
    normalizeChromaFrame(chroma, outputFrame * 12);
  }
  return {
    chroma,
    duration: sequence.duration,
    frameCount,
    hopSeconds: sequence.hopSeconds * factor,
    onsets,
    tonalActivity,
  };
};

const featureDistance = (
  audio: AlignmentFeatureSequence,
  audioFrame: number,
  midi: AlignmentFeatureSequence,
  midiFrame: number,
): number => {
  const audioOffset = audioFrame * 12;
  const midiOffset = midiFrame * 12;
  let dot = 0;
  for (let pitchClass = 0; pitchClass < 12; pitchClass += 1) {
    dot +=
      audio.chroma[audioOffset + pitchClass] *
      midi.chroma[midiOffset + pitchClass];
  }
  const audioTonal = audio.tonalActivity[audioFrame] > 0;
  const midiTonal = midi.tonalActivity[midiFrame] > 0;
  const chromaCost =
    !audioTonal && !midiTonal
      ? 0.5
      : audioTonal !== midiTonal
        ? 0.9
        : 1 - clamp(dot, 0, 1);
  const onsetCost = Math.abs(
    audio.onsets[audioFrame] - midi.onsets[midiFrame],
  );
  return chromaCost * CHROMA_WEIGHT + onsetCost * ONSET_WEIGHT;
};

const smoothEnvelope = (values: Float32Array): Float32Array => {
  const output = new Float32Array(values.length);
  for (let index = 0; index < values.length; index += 1) {
    let sum = 0;
    let weight = 0;
    for (let delta = -2; delta <= 2; delta += 1) {
      const source = index + delta;
      if (source < 0 || source >= values.length) continue;
      const nextWeight = 3 - Math.abs(delta);
      sum += values[source] * nextWeight;
      weight += nextWeight;
    }
    output[index] = weight > 0 ? sum / weight : 0;
  }
  return output;
};

export const estimateOnsetLagFrames = (
  audio: AlignmentFeatureSequence,
  midi: AlignmentFeatureSequence,
): number => {
  const audioEnvelope = smoothEnvelope(audio.onsets);
  const midiEnvelope = smoothEnvelope(midi.onsets);
  const maximumLag = Math.min(
    Math.round(30 / audio.hopSeconds),
    Math.floor(audio.frameCount * 0.3),
  );
  const slope =
    (midi.frameCount - 1) / Math.max(1, audio.frameCount - 1);
  let bestLag = 0;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (let lag = -maximumLag; lag <= maximumLag; lag += 1) {
    let dot = 0;
    let audioSquared = 0;
    let midiSquared = 0;
    let compared = 0;
    for (let audioFrame = 0; audioFrame < audio.frameCount; audioFrame += 2) {
      const midiFrame = Math.round((audioFrame - lag) * slope);
      if (midiFrame < 0 || midiFrame >= midi.frameCount) continue;
      const audioValue = audioEnvelope[audioFrame];
      const midiValue = midiEnvelope[midiFrame];
      dot += audioValue * midiValue;
      audioSquared += audioValue * audioValue;
      midiSquared += midiValue * midiValue;
      compared += 1;
    }
    const coverage = compared / Math.max(1, Math.ceil(audio.frameCount / 2));
    if (coverage < 0.55) continue;
    const score =
      dot / Math.max(1e-8, Math.sqrt(audioSquared * midiSquared)) +
      coverage * 0.04;
    if (score > bestScore) {
      bestScore = score;
      bestLag = lag;
    }
  }
  return bestLag;
};

interface DtwBand {
  ends: Int32Array;
  starts: Int32Array;
}

const createLinearBand = (
  audioFrames: number,
  midiFrames: number,
  radius: number,
  lagFrames: number,
): DtwBand => {
  const starts = new Int32Array(audioFrames);
  const ends = new Int32Array(audioFrames);
  const slope = (midiFrames - 1) / Math.max(1, audioFrames - 1);
  for (let audioFrame = 0; audioFrame < audioFrames; audioFrame += 1) {
    const center = Math.round((audioFrame - lagFrames) * slope);
    starts[audioFrame] = Math.max(0, center - radius);
    ends[audioFrame] = Math.min(midiFrames - 1, center + radius);
  }
  return { starts, ends };
};

const createPathBand = (
  coarsePath: readonly DtwPoint[],
  coarseAudioFrames: number,
  coarseMidiFrames: number,
  fineAudioFrames: number,
  fineMidiFrames: number,
  radius: number,
): DtwBand => {
  const coarseMap = new Float64Array(coarseAudioFrames);
  const counts = new Uint16Array(coarseAudioFrames);
  coarsePath.forEach((point) => {
    coarseMap[point.audioFrame] += point.midiFrame;
    counts[point.audioFrame] += 1;
  });
  for (let index = 0; index < coarseAudioFrames; index += 1) {
    if (counts[index] > 0) coarseMap[index] /= counts[index];
    else coarseMap[index] = index === 0 ? 0 : coarseMap[index - 1];
  }

  const starts = new Int32Array(fineAudioFrames);
  const ends = new Int32Array(fineAudioFrames);
  const midiScale =
    (fineMidiFrames - 1) / Math.max(1, coarseMidiFrames - 1);
  for (let fineAudio = 0; fineAudio < fineAudioFrames; fineAudio += 1) {
    const coarsePosition =
      (fineAudio * Math.max(1, coarseAudioFrames - 1)) /
      Math.max(1, fineAudioFrames - 1);
    const left = Math.floor(coarsePosition);
    const right = Math.min(coarseAudioFrames - 1, left + 1);
    const mix = coarsePosition - left;
    const center = Math.round(
      (coarseMap[left] * (1 - mix) + coarseMap[right] * mix) * midiScale,
    );
    starts[fineAudio] = Math.max(0, center - radius);
    ends[fineAudio] = Math.min(fineMidiFrames - 1, center + radius);
  }
  return { starts, ends };
};

const runBandedDtw = (
  audio: AlignmentFeatureSequence,
  midi: AlignmentFeatureSequence,
  band: DtwBand,
  report?: (progress: number) => void,
): DtwResult => {
  const audioFrames = audio.frameCount;
  const midiFrames = midi.frameCount;
  const offsets = new Uint32Array(audioFrames);
  let cellCount = 0;
  for (let row = 0; row < audioFrames; row += 1) {
    offsets[row] = cellCount;
    cellCount += Math.max(0, band.ends[row] - band.starts[row] + 1);
  }
  if (cellCount <= 0 || cellCount > 90_000_000) {
    throw new Error(
      'La grabación requiere más memoria de la disponible para alinearla.',
    );
  }
  const directions = new Uint8Array(cellCount);
  const infinity = Number.POSITIVE_INFINITY;
  let previous2 = new Float64Array(midiFrames);
  let previous = new Float64Array(midiFrames);
  let current = new Float64Array(midiFrames);
  previous2.fill(infinity);
  previous.fill(infinity);
  current.fill(infinity);
  const warpPenalty = 0.055;
  const boundaryPenalty = 0.32;
  let bestEndCost = infinity;
  let bestEndAudio = -1;
  let bestEndMidi = -1;

  for (let audioFrame = 0; audioFrame < audioFrames; audioFrame += 1) {
    const start = band.starts[audioFrame];
    const end = band.ends[audioFrame];
    if (start > end) continue;
    current.fill(infinity, start, end + 1);
    for (let midiFrame = start; midiFrame <= end; midiFrame += 1) {
      const localCost = featureDistance(
        audio,
        audioFrame,
        midi,
        midiFrame,
      );
      let best = infinity;
      let direction = 5;

      if (audioFrame === 0 || midiFrame === 0) {
        const skippedFrames =
          audioFrame === 0
            ? midiFrame
            : midiFrame === 0
              ? audioFrame
              : 0;
        best = skippedFrames * boundaryPenalty;
      }
      if (
        audioFrame > 0 &&
        midiFrame > 0 &&
        midiFrame - 1 >= band.starts[audioFrame - 1] &&
        midiFrame - 1 <= band.ends[audioFrame - 1]
      ) {
        const candidate = previous[midiFrame - 1];
        if (candidate < best) {
          best = candidate;
          direction = 0;
        }
      }
      if (
        audioFrame > 1 &&
        midiFrame > 0 &&
        midiFrame - 1 >= band.starts[audioFrame - 2] &&
        midiFrame - 1 <= band.ends[audioFrame - 2]
      ) {
        const intermediateCost = Math.min(
          featureDistance(
            audio,
            audioFrame - 1,
            midi,
            midiFrame - 1,
          ),
          featureDistance(
            audio,
            audioFrame - 1,
            midi,
            midiFrame,
          ),
        );
        const candidate =
          previous2[midiFrame - 1] +
          warpPenalty +
          intermediateCost;
        if (candidate < best) {
          best = candidate;
          direction = 1;
        }
      }
      if (
        audioFrame > 0 &&
        midiFrame > 1 &&
        midiFrame - 2 >= band.starts[audioFrame - 1] &&
        midiFrame - 2 <= band.ends[audioFrame - 1]
      ) {
        const intermediateCost = Math.min(
          featureDistance(
            audio,
            audioFrame - 1,
            midi,
            midiFrame - 1,
          ),
          featureDistance(
            audio,
            audioFrame,
            midi,
            midiFrame - 1,
          ),
        );
        const candidate =
          previous[midiFrame - 2] +
          warpPenalty +
          intermediateCost;
        if (candidate < best) {
          best = candidate;
          direction = 2;
        }
      }

      current[midiFrame] = best + localCost;
      directions[offsets[audioFrame] + midiFrame - start] = direction;

      if (
        Number.isFinite(current[midiFrame]) &&
        (audioFrame === audioFrames - 1 || midiFrame === midiFrames - 1)
      ) {
        const tailFrames =
          audioFrame === audioFrames - 1
            ? midiFrames - 1 - midiFrame
            : audioFrames - 1 - audioFrame;
        const endCost =
          current[midiFrame] + tailFrames * boundaryPenalty;
        if (endCost < bestEndCost) {
          bestEndCost = endCost;
          bestEndAudio = audioFrame;
          bestEndMidi = midiFrame;
        }
      }
    }
    [previous2, previous, current] = [previous, current, previous2];
    if ((audioFrame & 15) === 0) {
      report?.(audioFrame / audioFrames);
    }
  }

  if (
    !Number.isFinite(bestEndCost) ||
    bestEndAudio < 0 ||
    bestEndMidi < 0
  ) {
    throw new Error(
      'No se encontró un recorrido de sincronía continuo entre audio y MIDI.',
    );
  }

  let audioFrame = bestEndAudio;
  let midiFrame = bestEndMidi;
  const reversedPath: DtwPoint[] = [];
  let guard = audioFrames + midiFrames + cellCount;
  while (guard > 0) {
    reversedPath.push({ audioFrame, midiFrame });
    const start = band.starts[audioFrame];
    if (midiFrame < start || midiFrame > band.ends[audioFrame]) {
      throw new Error('La ruta DTW salió de su banda de búsqueda.');
    }
    const direction =
      directions[offsets[audioFrame] + midiFrame - start];
    if (direction === 5) break;
    if (direction === 0 && audioFrame > 0 && midiFrame > 0) {
      audioFrame -= 1;
      midiFrame -= 1;
    } else if (direction === 1 && audioFrame > 1 && midiFrame > 0) {
      audioFrame -= 2;
      midiFrame -= 1;
    } else if (direction === 2 && audioFrame > 0 && midiFrame > 1) {
      audioFrame -= 1;
      midiFrame -= 2;
    } else {
      throw new Error('La ruta DTW contiene un salto inválido.');
    }
    guard -= 1;
  }
  if (guard <= 0) {
    throw new Error('La ruta DTW no pudo simplificarse de forma segura.');
  }
  const sparsePath = reversedPath.reverse();
  const path: DtwPoint[] = [];
  sparsePath.forEach((point, index) => {
    const previousPoint = sparsePath[index - 1];
    if (previousPoint && point.audioFrame - previousPoint.audioFrame === 2) {
      path.push({
        audioFrame: previousPoint.audioFrame + 1,
        midiFrame: Math.round(
          (previousPoint.midiFrame + point.midiFrame) / 2,
        ),
      });
    }
    path.push(point);
  });
  report?.(1);
  return {
    meanCost: bestEndCost / Math.max(1, path.length),
    path,
  };
};

const createDenseMapping = (
  path: readonly DtwPoint[],
  audioFrames: number,
): Float64Array => {
  if (path.length === 0) return new Float64Array(audioFrames);
  const sums = new Float64Array(audioFrames);
  const counts = new Uint16Array(audioFrames);
  path.forEach((point) => {
    sums[point.audioFrame] += point.midiFrame;
    counts[point.audioFrame] += 1;
  });
  const mapping = new Float64Array(audioFrames);
  const firstAudioFrame = path[0].audioFrame;
  const lastAudioFrame = path.at(-1)!.audioFrame;
  mapping.fill(path[0].midiFrame, 0, firstAudioFrame + 1);
  for (let frame = 0; frame < audioFrames; frame += 1) {
    if (counts[frame] > 0) mapping[frame] = sums[frame] / counts[frame];
    else if (frame > firstAudioFrame) mapping[frame] = mapping[frame - 1];
  }

  const smoothed = new Float64Array(audioFrames);
  smoothed.set(mapping);
  const radius = 2;
  for (let frame = 0; frame < audioFrames; frame += 1) {
    if (frame <= firstAudioFrame || frame >= lastAudioFrame) continue;
    const values: number[] = [];
    for (
      let source = Math.max(firstAudioFrame, frame - radius);
      source <= Math.min(lastAudioFrame, frame + radius);
      source += 1
    ) {
      values.push(mapping[source]);
    }
    values.sort((left, right) => left - right);
    smoothed[frame] = values[Math.floor(values.length / 2)];
    smoothed[frame] = Math.max(smoothed[frame - 1], smoothed[frame]);
  }
  smoothed[firstAudioFrame] = path[0].midiFrame;
  smoothed[lastAudioFrame] = path.at(-1)!.midiFrame;
  return smoothed;
};

const simplifyMapping = (
  mapping: Float64Array,
  audio: AlignmentFeatureSequence,
  midi: AlignmentFeatureSequence,
  first: number,
  last: number,
): number[] => {
  if (last <= first) return [first];
  const selected = new Set<number>([first, last]);
  const regularStep = Math.max(
    1,
    Math.round(Math.max(12, audio.duration / 18) / audio.hopSeconds),
  );
  for (
    let frame = first + regularStep;
    frame < last;
    frame += regularStep
  ) {
    selected.add(frame);
  }

  const toleranceFrames = 0.055 / midi.hopSeconds;
  // Reserve one slot for the exact, user-required terminal anchor.
  while (selected.size < MAXIMUM_ANCHORS - 1) {
    const ordered = [...selected].sort((left, right) => left - right);
    let bestFrame = -1;
    let bestError = toleranceFrames;
    for (let segment = 0; segment < ordered.length - 1; segment += 1) {
      const left = ordered[segment];
      const right = ordered[segment + 1];
      if (right - left < 3) continue;
      for (let frame = left + 1; frame < right; frame += 1) {
        const progress = (frame - left) / (right - left);
        const expected =
          mapping[left] + (mapping[right] - mapping[left]) * progress;
        const error = Math.abs(mapping[frame] - expected);
        if (error > bestError) {
          bestError = error;
          bestFrame = frame;
        }
      }
    }
    if (bestFrame < 0) break;
    selected.add(bestFrame);
  }

  const ordered = [...selected].sort((left, right) => left - right);
  const minimumGap = Math.round(0.5 / audio.hopSeconds);
  const accepted: number[] = [];
  ordered.forEach((frame, index) => {
    const previous = accepted.at(-1);
    if (
      index === 0 ||
      previous === undefined ||
      frame - previous >= minimumGap
    ) {
      accepted.push(frame);
    }
  });
  if (accepted.at(-1) !== last) {
    if (
      accepted.length > 1 &&
      last - accepted.at(-1)! < minimumGap
    ) {
      accepted.pop();
    }
    accepted.push(last);
  }
  return accepted;
};

const localConfidence = (
  audio: AlignmentFeatureSequence,
  midi: AlignmentFeatureSequence,
  mapping: Float64Array,
  audioFrame: number,
): number => {
  let cost = 0;
  let count = 0;
  const radius = Math.max(1, Math.round(0.4 / audio.hopSeconds));
  for (let delta = -radius; delta <= radius; delta += 1) {
    const nextAudio = audioFrame + delta;
    const nextMidi =
      nextAudio >= 0 && nextAudio < mapping.length
        ? Math.round(mapping[nextAudio])
        : -1;
    if (
      nextAudio < 0 ||
      nextAudio >= audio.frameCount ||
      nextMidi < 0 ||
      nextMidi >= midi.frameCount
    ) {
      continue;
    }
    cost += featureDistance(audio, nextAudio, midi, nextMidi);
    count += 1;
  }
  return clamp(1 - cost / Math.max(1, count), 0, 1);
};

export const alignmentPathToAnchors = (
  path: readonly DtwPoint[],
  audio: AlignmentFeatureSequence,
  midi: AlignmentFeatureSequence,
): AlignmentAnchorCandidate[] => {
  if (path.length < 2) {
    throw new Error('La ruta DTW no contiene suficientes coincidencias.');
  }
  const mapping = createDenseMapping(path, audio.frameCount);
  const firstFrame = path[0].audioFrame;
  const lastFrame = path.at(-1)!.audioFrame;
  const selectedFrames = simplifyMapping(
    mapping,
    audio,
    midi,
    firstFrame,
    lastFrame,
  );
  const anchors: AlignmentAnchorCandidate[] = [];
  selectedFrames.forEach((audioFrame) => {
    const midiFrame = clamp(
      Math.round(mapping[audioFrame]),
      0,
      midi.frameCount - 1,
    );
    const candidate = {
      audioTime: Math.min(audio.duration, audioFrame * audio.hopSeconds),
      midiTime: Math.min(midi.duration, midiFrame * midi.hopSeconds),
      confidence: localConfidence(audio, midi, mapping, audioFrame),
    };
    const previous = anchors.at(-1);
    if (
      previous &&
      (candidate.audioTime <= previous.audioTime + 0.001 ||
        candidate.midiTime <= previous.midiTime + 0.001)
    ) {
      return;
    }
    anchors.push(candidate);
  });
  if (anchors.length < 2) {
    throw new Error(
      'La coincidencia encontrada no produce una curva de tiempo utilizable.',
    );
  }
  return anchors;
};

const isUsableAnchorSegment = (
  previous: AlignmentAnchorCandidate,
  next: AlignmentAnchorCandidate,
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
  return rate >= MINIMUM_SEGMENT_RATE && rate <= MAXIMUM_SEGMENT_RATE;
};

const appendRequiredTerminalAnchor = (
  anchors: readonly AlignmentAnchorCandidate[],
  audioDuration: number,
  midiDuration: number,
): AlignmentAnchorCandidate[] => {
  const completed = anchors.slice();
  while (completed.length > 0) {
    const previous = completed.at(-1)!;
    const terminal = {
      audioTime: audioDuration,
      midiTime: midiDuration,
      confidence: previous.confidence,
    };
    if (isUsableAnchorSegment(previous, terminal)) {
      completed.push(terminal);
      return completed;
    }
    completed.pop();
  }
  throw new Error(
    'La coincidencia exigiría cambios de velocidad demasiado extremos para hacer coincidir los finales.',
  );
};

const hasUnreasonableSegmentRate = (
  anchors: readonly AlignmentAnchorCandidate[],
): boolean =>
  anchors.some(
    (anchor, index) =>
      index > 0 && !isUsableAnchorSegment(anchors[index - 1], anchor),
  );

const findLastMidiNoteOff = (
  midi: MidiAlignmentReference,
): number => {
  const noteCount = Math.min(midi.noteCount, midi.ends.length);
  let lastNoteOff = 0;
  for (let note = 0; note < noteCount; note += 1) {
    const end = midi.ends[note];
    if (Number.isFinite(end)) lastNoteOff = Math.max(lastNoteOff, end);
  }
  return lastNoteOff;
};

const hasAlignmentEvidence = (
  sequence: AlignmentFeatureSequence,
  frame: number,
): boolean =>
  sequence.tonalActivity[frame] > 0 ||
  sequence.onsets[frame] >= 0.12;

const countDistinctOnsets = (onsets: Float32Array): number => {
  let count = 0;
  let previousPeak = -4;
  for (let frame = 1; frame < onsets.length - 1; frame += 1) {
    if (
      onsets[frame] >= 0.35 &&
      onsets[frame] >= onsets[frame - 1] &&
      onsets[frame] > onsets[frame + 1] &&
      frame - previousPeak >= 3
    ) {
      count += 1;
      previousPeak = frame;
    }
  }
  return count;
};

const evaluatePathQuality = (
  path: readonly DtwPoint[],
  audio: AlignmentFeatureSequence,
  midi: AlignmentFeatureSequence,
): PathQuality => {
  const mapping = createDenseMapping(path, audio.frameCount);
  const firstAudio = path[0].audioFrame;
  const lastAudio = path.at(-1)!.audioFrame;
  const midiEvidenceMatched = new Uint8Array(midi.frameCount);
  const temporalBins = new Uint8Array(12);
  let audioEvidenceTotal = 0;
  let midiEvidenceTotal = 0;
  let matchedAudioEvidence = 0;
  let unionEvidence = 0;
  let jointEvidence = 0;
  let evidenceCost = 0;

  for (let frame = 0; frame < audio.frameCount; frame += 1) {
    if (hasAlignmentEvidence(audio, frame)) audioEvidenceTotal += 1;
  }
  for (let frame = 0; frame < midi.frameCount; frame += 1) {
    if (hasAlignmentEvidence(midi, frame)) midiEvidenceTotal += 1;
  }
  for (let audioFrame = firstAudio; audioFrame <= lastAudio; audioFrame += 1) {
    const midiFrame = clamp(
      Math.round(mapping[audioFrame]),
      0,
      midi.frameCount - 1,
    );
    const audioEvidence = hasAlignmentEvidence(audio, audioFrame);
    const midiEvidence = hasAlignmentEvidence(midi, midiFrame);
    if (!audioEvidence && !midiEvidence) continue;
    const cost = featureDistance(audio, audioFrame, midi, midiFrame);
    evidenceCost += cost;
    unionEvidence += 1;
    if (audioEvidence && midiEvidence) {
      jointEvidence += 1;
      matchedAudioEvidence += 1;
      midiEvidenceMatched[midiFrame] = 1;
      if (cost <= 0.5) {
        const bin = Math.min(
          temporalBins.length - 1,
          Math.floor(
            (audioFrame / Math.max(1, audio.frameCount)) *
              temporalBins.length,
          ),
        );
        temporalBins[bin] = 1;
      }
    }
  }

  let matchedMidiEvidence = 0;
  midiEvidenceMatched.forEach((matched, frame) => {
    if (matched && hasAlignmentEvidence(midi, frame)) {
      matchedMidiEvidence += 1;
    }
  });
  const audioCoverage =
    matchedAudioEvidence / Math.max(1, audioEvidenceTotal);
  const midiCoverage =
    matchedMidiEvidence / Math.max(1, midiEvidenceTotal);
  const temporalCoverage =
    temporalBins.reduce((sum, value) => sum + value, 0) /
    temporalBins.length;

  return {
    evidenceCoverage: (audioCoverage + midiCoverage) / 2,
    evidenceMeanCost:
      unionEvidence > 0 ? evidenceCost / unionEvidence : 1,
    jointEvidenceRatio:
      jointEvidence / Math.max(1, unionEvidence),
    temporalCoverage,
  };
};

const maximumAnchorApproximationError = (
  path: readonly DtwPoint[],
  anchors: readonly AlignmentAnchorCandidate[],
  audio: AlignmentFeatureSequence,
  midi: AlignmentFeatureSequence,
): number => {
  if (anchors.length < 2) return Number.POSITIVE_INFINITY;
  const mapping = createDenseMapping(path, audio.frameCount);
  let anchorIndex = 0;
  let maximumError = 0;
  const firstFrame = path[0].audioFrame;
  const lastFrame = path.at(-1)!.audioFrame;
  for (let audioFrame = firstFrame; audioFrame <= lastFrame; audioFrame += 1) {
    const audioTime = audioFrame * audio.hopSeconds;
    while (
      anchorIndex < anchors.length - 2 &&
      audioTime > anchors[anchorIndex + 1].audioTime
    ) {
      anchorIndex += 1;
    }
    const left = anchors[anchorIndex];
    const right = anchors[Math.min(anchors.length - 1, anchorIndex + 1)];
    const progress =
      (audioTime - left.audioTime) /
      Math.max(0.001, right.audioTime - left.audioTime);
    const interpolated =
      left.midiTime + (right.midiTime - left.midiTime) * progress;
    maximumError = Math.max(
      maximumError,
      Math.abs(mapping[audioFrame] * midi.hopSeconds - interpolated),
    );
  }
  return maximumError;
};

export const runAutomaticAlignment = (
  audioSource: AlignmentAudioSource,
  midiReference: MidiAlignmentReference,
  report: ProgressReporter = () => undefined,
): AutomaticAlignmentResult => {
  const lastMidiNoteOff = findLastMidiNoteOff(midiReference);
  if (midiReference.noteCount < 3 || lastMidiNoteOff < 1) {
    throw new Error('El MIDI no contiene suficientes notas para alinearlo.');
  }
  report({ phase: 'preparing-audio', progress: 0.1 });
  const audio = extractAudioAlignmentFeatures(audioSource, (progress) =>
    report({
      phase: progress < 0.25 ? 'preparing-audio' : 'audio-features',
      progress: 0.1 + progress * 0.4,
    }),
  );
  report({ phase: 'midi-features', progress: 0.52 });
  const midi = extractMidiAlignmentFeatures(
    {
      ...midiReference,
      // The musical timeline ends at the last note-off, independently of
      // container metadata or trailing file duration.
      duration: lastMidiNoteOff,
    },
    audio.hopSeconds,
  );

  const tonalFrames = audio.tonalActivity.reduce(
    (sum, value) => sum + (value > 0 ? 1 : 0),
    0,
  );
  const tonalCoverage = tonalFrames / Math.max(1, audio.frameCount);
  const onsetCount = countDistinctOnsets(audio.onsets);
  if (tonalCoverage < 0.025) {
    throw new Error(
      'El audio no contiene suficiente información tonal para comparar chroma.',
    );
  }
  if (onsetCount < 3) {
    throw new Error(
      'El audio no contiene suficientes ataques claros para estabilizar el DTW.',
    );
  }

  const coarseAudio = aggregateFeatures(audio, COARSE_FACTOR);
  const coarseMidi = aggregateFeatures(midi, COARSE_FACTOR);
  const lagFrames = estimateOnsetLagFrames(coarseAudio, coarseMidi);
  const coarseSlope =
    (coarseMidi.frameCount - 1) / Math.max(1, coarseAudio.frameCount - 1);
  const coarseRadius = Math.min(
    coarseMidi.frameCount - 1,
    Math.max(
      Math.round(12 / coarseMidi.hopSeconds),
      Math.min(
        Math.round(30 / coarseMidi.hopSeconds),
        Math.round(
          Math.max(coarseAudio.frameCount, coarseMidi.frameCount) * 0.12,
        ),
      ),
      Math.abs(Math.round(lagFrames * coarseSlope)) +
        Math.round(5 / coarseMidi.hopSeconds),
    ),
  );
  const coarseBand = createLinearBand(
    coarseAudio.frameCount,
    coarseMidi.frameCount,
    coarseRadius,
    lagFrames,
  );
  const coarse = runBandedDtw(
    coarseAudio,
    coarseMidi,
    coarseBand,
    (progress) =>
      report({ phase: 'coarse-dtw', progress: 0.55 + progress * 0.15 }),
  );

  const fineRadius = Math.max(12, Math.round(2.5 / midi.hopSeconds));
  const fineBand = createPathBand(
    coarse.path,
    coarseAudio.frameCount,
    coarseMidi.frameCount,
    audio.frameCount,
    midi.frameCount,
    fineRadius,
  );
  const fine = runBandedDtw(audio, midi, fineBand, (progress) =>
    report({ phase: 'fine-dtw', progress: 0.7 + progress * 0.25 }),
  );
  report({ phase: 'anchors', progress: 0.97 });
  const anchors = appendRequiredTerminalAnchor(
    alignmentPathToAnchors(fine.path, audio, midi),
    audioSource.duration,
    lastMidiNoteOff,
  );
  if (hasUnreasonableSegmentRate(anchors)) {
    throw new Error(
      'La coincidencia exigiría cambios de velocidad demasiado extremos.',
    );
  }

  const quality = evaluatePathQuality(fine.path, audio, midi);
  const matchQuality = clamp(
    1 - (quality.evidenceMeanCost - 0.08) / 0.74,
    0,
    1,
  );
  const maximumAnchorErrorSeconds = maximumAnchorApproximationError(
    fine.path,
    anchors,
    audio,
    midi,
  );
  const precisionFactor = clamp(
    1 - Math.max(0, maximumAnchorErrorSeconds - 0.08) / 0.8,
    0.75,
    1,
  );
  const confidence = clamp(
    matchQuality *
      (0.45 + quality.evidenceCoverage * 0.55) *
      (0.55 + quality.jointEvidenceRatio * 0.45) *
      (0.5 + quality.temporalCoverage * 0.5) *
      precisionFactor,
    0,
    1,
  );
  if (confidence < 0.22) {
    throw new Error(
      'No se encontró suficiente coincidencia musical entre el audio y el MIDI.',
    );
  }
  const audioSpan =
    anchors.at(-1)!.audioTime - anchors[0].audioTime;
  const midiSpan =
    anchors.at(-1)!.midiTime - anchors[0].midiTime;
  const timelineCoverage =
    (clamp(audioSpan / Math.max(0.001, audio.duration), 0, 1) +
      clamp(midiSpan / Math.max(0.001, midi.duration), 0, 1)) /
    2;
  const coverage = Math.min(timelineCoverage, quality.evidenceCoverage);
  report({ phase: 'anchors', progress: 1 });

  return {
    anchors,
    confidence,
    coverage,
    diagnostics: {
      audioFrames: audio.frameCount,
      midiFrames: midi.frameCount,
      meanCost: fine.meanCost,
      coarseMeanCost: coarse.meanCost,
      evidenceCoverage: quality.evidenceCoverage,
      estimatedOffsetSeconds:
        anchors[0].audioTime - anchors[0].midiTime,
      estimatedTempoRatio:
        midiSpan / Math.max(0.001, audioSpan),
      maximumAnchorErrorSeconds,
      temporalEvidenceCoverage: quality.temporalCoverage,
      tonalCoverage,
      onsetCount,
    },
  };
};
