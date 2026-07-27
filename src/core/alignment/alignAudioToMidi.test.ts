import { describe, expect, it } from 'vitest';
import {
  extractAudioAlignmentFeatures,
  extractMidiAlignmentFeatures,
  runAutomaticAlignment,
} from './alignAudioToMidi';
import type {
  AlignmentAudioSource,
  MidiAlignmentReference,
} from './types';
import { createSyncTimeline } from '../state/visualizationState';

const SAMPLE_RATE = 11_025;

const synthesizeNotes = (
  duration: number,
  notes: Array<{ end: number; pitch: number; start: number }>,
): Float32Array => {
  const samples = new Float32Array(Math.ceil(duration * SAMPLE_RATE));
  notes.forEach((note) => {
    const start = Math.max(0, Math.floor(note.start * SAMPLE_RATE));
    const end = Math.min(samples.length, Math.ceil(note.end * SAMPLE_RATE));
    const frequency = 440 * 2 ** ((note.pitch - 69) / 12);
    const attackFrames = Math.max(1, Math.round(SAMPLE_RATE * 0.008));
    const releaseFrames = Math.max(1, Math.round(SAMPLE_RATE * 0.025));
    for (let frame = start; frame < end; frame += 1) {
      const local = frame - start;
      const remaining = end - frame;
      const envelope = Math.min(
        1,
        local / attackFrames,
        remaining / releaseFrames,
      );
      samples[frame] +=
        Math.sin((2 * Math.PI * frequency * frame) / SAMPLE_RATE) *
        envelope *
        0.7;
    }
  });
  return samples;
};

const makeMidiReference = (
  duration: number,
  notes: Array<{ end: number; pitch: number; start: number }>,
): MidiAlignmentReference => ({
  duration,
  noteCount: notes.length,
  starts: Float64Array.from(notes, (note) => note.start),
  ends: Float64Array.from(notes, (note) => note.end),
  pitches: Uint8Array.from(notes, (note) => note.pitch),
  velocities: Uint8Array.from(notes, () => 112),
  channels: Uint8Array.from(notes, () => 0),
  families: Uint8Array.from(notes, () => 0),
});

describe('alineación chroma + ataques + DTW', () => {
  it('detecta la clase cromática y el ataque de un La 440 Hz', () => {
    const source: AlignmentAudioSource = {
      channels: [
        synthesizeNotes(3, [{ start: 0.5, end: 2.5, pitch: 69 }]),
      ],
      duration: 3,
      sampleRate: SAMPLE_RATE,
    };
    const features = extractAudioAlignmentFeatures(source);
    const middleFrame = Math.round(1.2 / features.hopSeconds);
    const chroma = Array.from(
      features.chroma.subarray(middleFrame * 12, middleFrame * 12 + 12),
    );
    const strongestPitchClass = chroma.indexOf(Math.max(...chroma));
    const attackFrame = features.onsets.indexOf(
      Math.max(...features.onsets),
    );

    expect(strongestPitchClass).toBe(9);
    expect(
      Math.abs(attackFrame * features.hopSeconds - 0.5),
    ).toBeLessThan(0.11);
  });

  it('mantiene chroma MIDI durante la nota y excluye percusión del tono', () => {
    const reference = makeMidiReference(2, [
      { start: 0.25, end: 1.5, pitch: 60 },
      { start: 0.5, end: 0.6, pitch: 66 },
    ]);
    reference.channels[1] = 9;
    const features = extractMidiAlignmentFeatures(reference, 0.05);
    const frame = Math.round(1 / features.hopSeconds);
    const chroma = features.chroma.subarray(frame * 12, frame * 12 + 12);

    expect(chroma[0]).toBeGreaterThan(0.9);
    expect(chroma[6]).toBe(0);
    expect(Math.max(...features.onsets)).toBeGreaterThan(0.9);
  });

  it('recupera una deriva de tempo sintética y produce anclas ascendentes', () => {
    const midiNotes = Array.from({ length: 14 }, (_, index) => ({
      start: index * 0.45,
      end: index * 0.45 + 0.32,
      pitch: 60 + ((index * 5) % 12),
    }));
    const audioTimeForMidi = (midiTime: number): number =>
      midiTime <= 2.7
        ? midiTime
        : 2.7 + (midiTime - 2.7) * 1.28;
    const audioNotes = midiNotes.map((note) => ({
      start: audioTimeForMidi(note.start),
      end: audioTimeForMidi(note.end),
      pitch: note.pitch,
    }));
    const midiDuration = 6.4;
    const audioDuration = audioTimeForMidi(midiDuration);
    const source: AlignmentAudioSource = {
      channels: [synthesizeNotes(audioDuration, audioNotes)],
      duration: audioDuration,
      sampleRate: SAMPLE_RATE,
    };
    const result = runAutomaticAlignment(
      source,
      makeMidiReference(midiDuration, midiNotes),
    );
    const timeline = createSyncTimeline(
      result.anchors.map((anchor, index) => ({
        id: String(index),
        audioTime: anchor.audioTime,
        midiTime: anchor.midiTime,
      })),
    );
    const probeMidiTime = 4.5;
    const mapped = timeline.map(audioTimeForMidi(probeMidiTime)).midiTime;

    expect(result.anchors.length).toBeGreaterThanOrEqual(3);
    expect(result.anchors.length).toBeLessThanOrEqual(32);
    expect(
      result.anchors.every(
        (anchor, index) =>
          index === 0 ||
          (anchor.audioTime > result.anchors[index - 1].audioTime &&
            anchor.midiTime > result.anchors[index - 1].midiTime),
      ),
    ).toBe(true);
    expect(mapped).toBeCloseTo(probeMidiTime, 0);
    expect(result.confidence).toBeGreaterThan(0.35);
    expect(result.diagnostics.maximumAnchorErrorSeconds).toBeLessThan(0.12);
  });

  it('separa una introducción tonal que no existe en el MIDI', () => {
    const midiNotes = Array.from({ length: 12 }, (_, index) => ({
      start: index * 0.42,
      end: index * 0.42 + 0.29,
      pitch: 60 + ((index * 7) % 12),
    }));
    const introSeconds = 1;
    const audioNotes = [
      { start: 0, end: 0.82, pitch: 73 },
      ...midiNotes.map((note) => ({
        start: note.start + introSeconds,
        end: note.end + introSeconds,
        pitch: note.pitch,
      })),
    ];
    const midiDuration = 5.3;
    const audioDuration = midiDuration + introSeconds;
    const result = runAutomaticAlignment(
      {
        channels: [synthesizeNotes(audioDuration, audioNotes)],
        duration: audioDuration,
        sampleRate: SAMPLE_RATE,
      },
      makeMidiReference(midiDuration, midiNotes),
    );

    expect(result.anchors[0].audioTime).toBeGreaterThan(0.6);
    expect(result.anchors[0].midiTime).toBeLessThan(0.35);
    expect(result.diagnostics.estimatedOffsetSeconds).toBeGreaterThan(0.5);
  });

  it('no presenta como fiable una pieza tonal distinta', () => {
    const audioNotes = [
      { start: 2, end: 2.4, pitch: 61 },
      { start: 7, end: 7.4, pitch: 63 },
      { start: 12, end: 12.4, pitch: 66 },
      { start: 17, end: 17.4, pitch: 68 },
    ];
    const midiNotes = [
      { start: 1, end: 1.4, pitch: 60 },
      { start: 6, end: 6.4, pitch: 64 },
      { start: 11, end: 11.4, pitch: 67 },
      { start: 16, end: 16.4, pitch: 71 },
    ];
    let confidence = 0;
    try {
      confidence = runAutomaticAlignment(
        {
          channels: [synthesizeNotes(20, audioNotes)],
          duration: 20,
          sampleRate: SAMPLE_RATE,
        },
        makeMidiReference(20, midiNotes),
      ).confidence;
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      return;
    }

    expect(confidence).toBeLessThan(0.4);
  });

  it(
    'mantiene acotada la ruta en una obra de tres minutos',
    () => {
      const duration = 180;
      const notes = Array.from({ length: 300 }, (_, index) => ({
        start: index * 0.59,
        end: index * 0.59 + 0.26,
        pitch: 48 + ((index * 7) % 24),
      }));
      const result = runAutomaticAlignment(
        {
          channels: [synthesizeNotes(duration, notes)],
          duration,
          sampleRate: SAMPLE_RATE,
        },
        makeMidiReference(duration, notes),
      );
      const timeline = createSyncTimeline(
        result.anchors.map((anchor, index) => ({
          id: String(index),
          audioTime: anchor.audioTime,
          midiTime: anchor.midiTime,
        })),
      );
      let maximumIdentityError = 0;
      for (let time = 0; time <= duration; time += 1) {
        maximumIdentityError = Math.max(
          maximumIdentityError,
          Math.abs(timeline.map(time).midiTime - time),
        );
      }
      expect(result.anchors.length).toBeGreaterThanOrEqual(10);
      expect(result.anchors.length).toBeLessThanOrEqual(32);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(maximumIdentityError).toBeLessThan(0.12);
    },
    10_000,
  );
});
