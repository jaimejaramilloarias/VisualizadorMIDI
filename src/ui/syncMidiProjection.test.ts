import { describe, expect, it } from 'vitest';
import type { PackedMidiProject } from '../core/midi/types';
import {
  createSyncMidiProjection,
  selectVisibleGhostNotes,
} from './syncMidiProjection';

const projectWithNotes = (
  starts: number[],
  ends: number[],
  pitches = starts.map((_, index) => 60 + index),
): PackedMidiProject => ({
  fileName: 'projection.mid',
  format: 1,
  ticksPerBeat: 480,
  duration: Math.max(0, ...ends),
  noteCount: starts.length,
  tracks: [],
  tempoMap: [
    { tick: 0, seconds: 0, microsecondsPerBeat: 500_000 },
  ],
  timeSignatures: [{ tick: 0, numerator: 4, denominator: 4 }],
  notes: {
    starts: Float64Array.from(starts),
    ends: Float64Array.from(ends),
    pitches: Uint8Array.from(pitches),
    velocities: Uint8Array.from(starts.map((_, index) => 80 + index)),
    channels: new Uint8Array(starts.length),
    tracks: new Uint16Array(starts.length),
    families: new Uint8Array(starts.length),
  },
});

describe('syncMidiProjection', () => {
  it('retiene copias independientes antes de transferir los buffers originales', () => {
    const project = projectWithNotes([0, 1], [0.5, 2], [48, 72]);
    const projection = createSyncMidiProjection(project);

    project.notes.starts[0] = 99;
    project.notes.ends[1] = 99;
    project.notes.pitches[0] = 99;
    project.tempoMap[0].seconds = 99;
    project.timeSignatures[0].numerator = 7;

    expect([...projection.starts]).toEqual([0, 1]);
    expect([...projection.ends]).toEqual([0.5, 2]);
    expect([...projection.pitches]).toEqual([48, 72]);
    expect(projection.tempoMap[0].seconds).toBe(0);
    expect(projection.timeSignatures[0].numerator).toBe(4);
    expect(projection.pitchRange).toEqual({ minimum: 48, maximum: 72 });
  });

  it('selecciona por búsqueda binaria solo las notas que cruzan el viewport', () => {
    const projection = createSyncMidiProjection(
      projectWithNotes([0, 1, 2, 3, 4], [0.5, 1.5, 2.5, 3.5, 4.5]),
    );

    const selection = selectVisibleGhostNotes(projection, 1.75, 3.25);

    expect(selection.notes.map((note) => note.index)).toEqual([2, 3]);
    expect(selection.truncated).toBe(false);
    expect(selection.candidateCount).toBe(2);
  });

  it('incluye notas sostenidas que comienzan antes del viewport', () => {
    const projection = createSyncMidiProjection(
      projectWithNotes([0, 1, 2, 3], [10, 1.5, 2.5, 3.5]),
    );

    const selection = selectVisibleGhostNotes(projection, 2.75, 3.25);

    expect(selection.notes.map((note) => note.index)).toEqual([0, 3]);
  });

  it('respeta los límites semiabiertos y rechaza rangos vacíos o posteriores', () => {
    const projection = createSyncMidiProjection(
      projectWithNotes([0, 1, 2], [1, 2, 3]),
    );

    expect(
      selectVisibleGhostNotes(projection, 1, 2).notes.map(
        (note) => note.index,
      ),
    ).toEqual([1]);
    expect(selectVisibleGhostNotes(projection, 2, 2).notes).toEqual([]);
    expect(selectVisibleGhostNotes(projection, 4, 5).notes).toEqual([]);
  });

  it('limita vistas lejanas y distribuye la muestra por todo el tramo', () => {
    const starts = Array.from({ length: 100_000 }, (_, index) => index / 100);
    const projection = createSyncMidiProjection(
      projectWithNotes(
        starts,
        starts.map((start) => start + 0.005),
      ),
    );

    const selection = selectVisibleGhostNotes(projection, 0, 1_000, {
      maximumNotes: 100,
    });

    expect(selection.notes).toHaveLength(100);
    expect(selection.truncated).toBe(true);
    expect(selection.notes[0].start).toBeGreaterThan(0);
    expect(selection.notes.at(-1)!.start).toBeGreaterThan(990);
  });

  it('ordena una entrada anómala sin perder la correspondencia de atributos', () => {
    const projection = createSyncMidiProjection(
      projectWithNotes([2, 0, 1], [2.5, 0.5, 1.5], [72, 48, 60]),
    );

    expect([...projection.starts]).toEqual([0, 1, 2]);
    expect([...projection.ends]).toEqual([0.5, 1.5, 2.5]);
    expect([...projection.pitches]).toEqual([48, 60, 72]);
  });
});
