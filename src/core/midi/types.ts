export const FAMILY_IDS = [
  'strings',
  'brass',
  'horns',
  'woodwinds',
  'reeds',
  'keyboards',
  'plucked',
  'percussion',
  'voices',
  'synth',
  'other',
] as const;

export type FamilyId = (typeof FAMILY_IDS)[number];

export interface TempoPoint {
  tick: number;
  seconds: number;
  microsecondsPerBeat: number;
}

export interface TimeSignaturePoint {
  tick: number;
  numerator: number;
  denominator: number;
}

export interface MidiTrackInfo {
  id: number;
  name: string;
  instrument: string;
  family: FamilyId;
  noteCount: number;
}

export interface PackedMidiNotes {
  starts: Float64Array;
  ends: Float64Array;
  pitches: Uint8Array;
  velocities: Uint8Array;
  channels: Uint8Array;
  tracks: Uint16Array;
  families: Uint8Array;
}

export interface PackedMidiProject {
  fileName: string;
  format: number;
  ticksPerBeat: number;
  duration: number;
  noteCount: number;
  tracks: MidiTrackInfo[];
  tempoMap: TempoPoint[];
  timeSignatures: TimeSignaturePoint[];
  notes: PackedMidiNotes;
}

export const familyIndex = (family: FamilyId): number =>
  FAMILY_IDS.indexOf(family);

export const familyFromIndex = (index: number): FamilyId =>
  FAMILY_IDS[index] ?? 'other';
