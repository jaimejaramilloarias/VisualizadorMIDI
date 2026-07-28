import type {
  PackedMidiProject,
  TempoPoint,
  TimeSignaturePoint,
} from '../core/midi/types';

export interface MidiPitchRange {
  minimum: number;
  maximum: number;
}

/**
 * Lightweight, renderer-independent MIDI data retained by the synchronization
 * editor after the packed project buffers are transferred to the render worker.
 */
export interface SyncMidiProjection {
  readonly duration: number;
  readonly ticksPerBeat: number;
  readonly tempoMap: readonly TempoPoint[];
  readonly timeSignatures: readonly TimeSignaturePoint[];
  readonly noteCount: number;
  readonly starts: Float64Array;
  readonly ends: Float64Array;
  readonly pitches: Uint8Array;
  readonly velocities: Uint8Array;
  readonly pitchRange: MidiPitchRange | null;
}

export interface VisibleGhostNote {
  readonly index: number;
  readonly start: number;
  readonly end: number;
  readonly pitch: number;
  readonly velocity: number;
}

export interface VisibleGhostNoteSelection {
  readonly notes: readonly VisibleGhostNote[];
  /**
   * Exact when `truncated` is false. When it is true this is a lower bound:
   * counting every overlapping sustained note would defeat the capped query.
   */
  readonly candidateCount: number;
  readonly truncated: boolean;
  readonly pitchRange: MidiPitchRange | null;
}

export interface SelectVisibleGhostNotesOptions {
  /**
   * Hard allocation/drawing budget. When exceeded, notes beginning inside the
   * viewport are sampled evenly across time instead of taking only its start.
   */
  readonly maximumNotes?: number;
}

interface IntervalIndex {
  readonly leafCount: number;
  readonly maximumEnds: Float64Array;
}

const DEFAULT_MAXIMUM_NOTES = 20_000;
const intervalIndexes = new WeakMap<SyncMidiProjection, IntervalIndex>();

const finiteNonNegative = (value: number): number =>
  Number.isFinite(value) ? Math.max(0, value) : 0;

const lowerBound = (
  values: Float64Array,
  value: number,
  upperBound = values.length,
): number => {
  let low = 0;
  let high = upperBound;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (values[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
};

const createIntervalIndex = (
  projection: SyncMidiProjection,
): IntervalIndex => {
  let leafCount = 1;
  while (leafCount < projection.noteCount) leafCount *= 2;
  const maximumEnds = new Float64Array(leafCount * 2);
  maximumEnds.fill(Number.NEGATIVE_INFINITY);
  maximumEnds.set(projection.ends, leafCount);
  for (let node = leafCount - 1; node > 0; node -= 1) {
    maximumEnds[node] = Math.max(
      maximumEnds[node * 2],
      maximumEnds[node * 2 + 1],
    );
  }
  return { leafCount, maximumEnds };
};

const resolveIntervalIndex = (
  projection: SyncMidiProjection,
): IntervalIndex => {
  const existing = intervalIndexes.get(projection);
  if (existing) return existing;
  const created = createIntervalIndex(projection);
  intervalIndexes.set(projection, created);
  return created;
};

const copyPackedNotesInStartOrder = (
  project: PackedMidiProject,
): {
  starts: Float64Array;
  ends: Float64Array;
  pitches: Uint8Array;
  velocities: Uint8Array;
} => {
  const noteCount = Math.min(
    Math.max(0, project.noteCount),
    project.notes.starts.length,
    project.notes.ends.length,
    project.notes.pitches.length,
    project.notes.velocities.length,
  );
  const starts = project.notes.starts.slice(0, noteCount);
  const ends = project.notes.ends.slice(0, noteCount);
  const pitches = project.notes.pitches.slice(0, noteCount);
  const velocities = project.notes.velocities.slice(0, noteCount);

  let alreadyOrdered = true;
  for (let index = 1; index < noteCount; index += 1) {
    if (starts[index] < starts[index - 1]) {
      alreadyOrdered = false;
      break;
    }
  }
  if (alreadyOrdered) return { starts, ends, pitches, velocities };

  const order = Array.from({ length: noteCount }, (_, index) => index).sort(
    (left, right) =>
      starts[left] - starts[right] || pitches[left] - pitches[right],
  );
  const orderedStarts = new Float64Array(noteCount);
  const orderedEnds = new Float64Array(noteCount);
  const orderedPitches = new Uint8Array(noteCount);
  const orderedVelocities = new Uint8Array(noteCount);
  order.forEach((sourceIndex, targetIndex) => {
    orderedStarts[targetIndex] = starts[sourceIndex];
    orderedEnds[targetIndex] = ends[sourceIndex];
    orderedPitches[targetIndex] = pitches[sourceIndex];
    orderedVelocities[targetIndex] = velocities[sourceIndex];
  });
  return {
    starts: orderedStarts,
    ends: orderedEnds,
    pitches: orderedPitches,
    velocities: orderedVelocities,
  };
};

export const createSyncMidiProjection = (
  project: PackedMidiProject,
): SyncMidiProjection => {
  const notes = copyPackedNotesInStartOrder(project);
  let minimumPitch = Number.POSITIVE_INFINITY;
  let maximumPitch = Number.NEGATIVE_INFINITY;
  notes.pitches.forEach((pitch) => {
    minimumPitch = Math.min(minimumPitch, pitch);
    maximumPitch = Math.max(maximumPitch, pitch);
  });

  const projection: SyncMidiProjection = {
    duration: finiteNonNegative(project.duration),
    ticksPerBeat: Math.max(
      1,
      Math.round(
        Number.isFinite(project.ticksPerBeat) ? project.ticksPerBeat : 1,
      ),
    ),
    tempoMap: project.tempoMap.map((point) => ({ ...point })),
    timeSignatures: project.timeSignatures.map((point) => ({ ...point })),
    noteCount: notes.starts.length,
    ...notes,
    pitchRange:
      notes.starts.length === 0
        ? null
        : { minimum: minimumPitch, maximum: maximumPitch },
  };
  intervalIndexes.set(projection, createIntervalIndex(projection));
  return projection;
};

const collectSustainedNotes = ({
  projection,
  index,
  limitExclusive,
  midiStart,
  maximumNotes,
}: {
  projection: SyncMidiProjection;
  index: IntervalIndex;
  limitExclusive: number;
  midiStart: number;
  maximumNotes: number;
}): { indices: number[]; truncated: boolean } => {
  const indices: number[] = [];
  let truncated = false;

  const visit = (
    node: number,
    rangeStart: number,
    rangeEnd: number,
  ): void => {
    if (
      rangeStart >= limitExclusive ||
      rangeStart >= projection.noteCount ||
      index.maximumEnds[node] <= midiStart
    ) {
      return;
    }
    if (indices.length >= maximumNotes) {
      truncated = true;
      return;
    }
    if (rangeEnd - rangeStart === 1) {
      if (projection.ends[rangeStart] > midiStart) indices.push(rangeStart);
      return;
    }
    const middle = (rangeStart + rangeEnd) >>> 1;
    visit(node * 2, rangeStart, middle);
    visit(node * 2 + 1, middle, rangeEnd);
  };

  visit(1, 0, index.leafCount);
  return { indices, truncated };
};

const evenlySampleRange = (
  start: number,
  count: number,
  maximumNotes: number,
): number[] => {
  if (maximumNotes <= 0 || count <= 0) return [];
  if (count <= maximumNotes) {
    return Array.from({ length: count }, (_, offset) => start + offset);
  }
  return Array.from({ length: maximumNotes }, (_, slot) => {
    const offset = Math.min(
      count - 1,
      Math.floor(((slot + 0.5) * count) / maximumNotes),
    );
    return start + offset;
  });
};

const noteFromIndex = (
  projection: SyncMidiProjection,
  index: number,
): VisibleGhostNote => ({
  index,
  start: projection.starts[index],
  end: projection.ends[index],
  pitch: projection.pitches[index],
  velocity: projection.velocities[index],
});

/**
 * Selects notes intersecting the half-open MIDI interval
 * `[midiStart, midiEnd)`. It finds notes that start in the interval with two
 * binary searches, and uses a max-end interval tree for notes sustained into
 * the viewport, so close zoom levels never scan the complete piece.
 */
export const selectVisibleGhostNotes = (
  projection: SyncMidiProjection,
  midiStart: number,
  midiEnd: number,
  options: SelectVisibleGhostNotesOptions = {},
): VisibleGhostNoteSelection => {
  const safeStart = finiteNonNegative(midiStart);
  const safeEnd = finiteNonNegative(midiEnd);
  const maximumNotes = Math.max(
    1,
    Math.floor(
      Number.isFinite(options.maximumNotes)
        ? options.maximumNotes!
        : DEFAULT_MAXIMUM_NOTES,
    ),
  );
  if (
    projection.noteCount === 0 ||
    safeEnd <= safeStart ||
    safeStart >= projection.duration
  ) {
    return {
      notes: [],
      candidateCount: 0,
      truncated: false,
      pitchRange: null,
    };
  }

  const firstStartingInside = lowerBound(
    projection.starts,
    safeStart,
    projection.noteCount,
  );
  const firstStartingAfter = lowerBound(
    projection.starts,
    safeEnd,
    projection.noteCount,
  );
  const startingInsideCount = firstStartingAfter - firstStartingInside;
  const sustainedBudget =
    startingInsideCount > 0
      ? Math.min(maximumNotes, Math.max(1, Math.floor(maximumNotes * 0.2)))
      : maximumNotes;
  const sustained = collectSustainedNotes({
    projection,
    index: resolveIntervalIndex(projection),
    limitExclusive: firstStartingInside,
    midiStart: safeStart,
    maximumNotes: sustainedBudget,
  });
  const insideBudget = maximumNotes - sustained.indices.length;
  const insideIndices = evenlySampleRange(
    firstStartingInside,
    startingInsideCount,
    insideBudget,
  );
  const indices = [...sustained.indices, ...insideIndices].sort(
    (left, right) => left - right,
  );
  const notes = indices
    .map((noteIndex) => noteFromIndex(projection, noteIndex))
    .filter((note) => note.start < safeEnd && note.end > safeStart);

  let minimumPitch = Number.POSITIVE_INFINITY;
  let maximumPitch = Number.NEGATIVE_INFINITY;
  notes.forEach((note) => {
    minimumPitch = Math.min(minimumPitch, note.pitch);
    maximumPitch = Math.max(maximumPitch, note.pitch);
  });
  const truncated =
    sustained.truncated || startingInsideCount > insideIndices.length;

  return {
    notes,
    candidateCount: startingInsideCount + sustained.indices.length,
    truncated,
    pitchRange:
      notes.length === 0
        ? null
        : { minimum: minimumPitch, maximum: maximumPitch },
  };
};
