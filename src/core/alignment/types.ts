export const ALIGNMENT_PHASES = [
  'preparing-audio',
  'audio-features',
  'midi-features',
  'coarse-dtw',
  'fine-dtw',
  'anchors',
] as const;

export type AlignmentPhase = (typeof ALIGNMENT_PHASES)[number];

export interface AlignmentAudioSource {
  channels: Float32Array[];
  sampleRate: number;
  duration: number;
}

export interface MidiAlignmentReference {
  duration: number;
  noteCount: number;
  starts: Float64Array;
  ends: Float64Array;
  pitches: Uint8Array;
  velocities: Uint8Array;
  channels: Uint8Array;
  families: Uint8Array;
}

export interface AlignmentAnchorCandidate {
  audioTime: number;
  midiTime: number;
  confidence: number;
}

export interface AutomaticAlignmentDiagnostics {
  audioFrames: number;
  midiFrames: number;
  meanCost: number;
  coarseMeanCost: number;
  evidenceCoverage: number;
  estimatedOffsetSeconds: number;
  estimatedTempoRatio: number;
  maximumAnchorErrorSeconds: number;
  temporalEvidenceCoverage: number;
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
  tonalCoverage: number;
  onsetCount: number;
}

export interface AutomaticAlignmentResult {
  anchors: AlignmentAnchorCandidate[];
  confidence: number;
  coverage: number;
  diagnostics: AutomaticAlignmentDiagnostics;
}

export interface AlignmentProgress {
  phase: AlignmentPhase;
  progress: number;
}

export interface AlignmentWorkerRequest {
  type: 'align';
  requestId: number;
  audio: AlignmentAudioSource;
  midi: MidiAlignmentReference;
}

export type AlignmentWorkerResponse =
  | {
      type: 'progress';
      requestId: number;
      progress: AlignmentProgress;
    }
  | {
      type: 'result';
      requestId: number;
      result: AutomaticAlignmentResult;
    }
  | {
      type: 'error';
      requestId: number;
      message: string;
    };
