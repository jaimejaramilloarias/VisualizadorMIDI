export const VISUALIZATION_IDS = ['now-line'] as const;
export type VisualizationId = (typeof VISUALIZATION_IDS)[number];

export const QUALITY_PRESETS = ['auto', 'high', 'ultra'] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];

export interface SyncAnchor {
  id: string;
  audioTime: number;
  midiTime: number;
}

export interface MidiClockMapping {
  midiTime: number;
  playbackRate: number;
}

export interface SyncTimeline {
  anchors: readonly SyncAnchor[];
  forward: boolean;
  map: (audioTime: number) => MidiClockMapping;
}

export interface VisualizationSettings {
  secondsVisible: number;
  glow: number;
  noteScale: number;
  quality: QualityPreset;
  background: string;
}

export interface VisualizationStateDocument {
  schema: 'midi-visualizer-state';
  version: 2;
  savedAt: string;
  source: {
    midiFileName: string | null;
    audioFileName: string | null;
  };
  visualization: VisualizationId;
  settings: VisualizationSettings;
  syncAnchors: SyncAnchor[];
  visualConfiguration: VisualConfiguration;
}

export const DEFAULT_SETTINGS: VisualizationSettings = {
  secondsVisible: 8,
  glow: 0.8,
  noteScale: 1,
  quality: 'auto',
  background: '#000000',
};

const finiteNonNegative = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

export const normalizeAnchors = (anchors: SyncAnchor[]): SyncAnchor[] => {
  const byAudioTime = new Map<number, SyncAnchor>();
  anchors.forEach((anchor) => {
    if (!finiteNonNegative(anchor.audioTime) || !finiteNonNegative(anchor.midiTime)) {
      return;
    }
    byAudioTime.set(anchor.audioTime, {
      id: anchor.id || crypto.randomUUID(),
      audioTime: anchor.audioTime,
      midiTime: anchor.midiTime,
    });
  });
  return [...byAudioTime.values()].sort(
    (left, right) => left.audioTime - right.audioTime,
  );
};

export const mapAudioToMidi = (
  audioTime: number,
  anchors: SyncAnchor[],
): number => mapAudioToMidiClock(audioTime, anchors).midiTime;

const mapNormalizedAnchors = (
  audioTime: number,
  normalized: readonly SyncAnchor[],
): MidiClockMapping => {
  if (normalized.length === 0) {
    return { midiTime: Math.max(0, audioTime), playbackRate: 1 };
  }
  if (normalized.length === 1) {
    const anchor = normalized[0];
    return {
      midiTime: Math.max(0, anchor.midiTime + audioTime - anchor.audioTime),
      playbackRate: 1,
    };
  }

  let left = normalized[0];
  let right = normalized[1];

  if (audioTime <= normalized[0].audioTime) {
    left = normalized[0];
    right = normalized[1];
  } else if (audioTime >= normalized.at(-1)!.audioTime) {
    left = normalized.at(-2)!;
    right = normalized.at(-1)!;
  } else {
    let low = 0;
    let high = normalized.length - 1;
    while (low + 1 < high) {
      const middle = (low + high) >> 1;
      if (normalized[middle].audioTime <= audioTime) low = middle;
      else high = middle;
    }
    left = normalized[low];
    right = normalized[high];
  }

  const audioSpan = right.audioTime - left.audioTime;
  if (audioSpan <= 0) {
    return { midiTime: Math.max(0, left.midiTime), playbackRate: 0 };
  }
  const playbackRate = (right.midiTime - left.midiTime) / audioSpan;
  const progress = (audioTime - left.audioTime) / audioSpan;
  return {
    midiTime: Math.max(
      0,
      left.midiTime + (right.midiTime - left.midiTime) * progress,
    ),
    playbackRate,
  };
};

export const createSyncTimeline = (anchors: SyncAnchor[]): SyncTimeline => {
  const normalized = normalizeAnchors(anchors);
  const forward = normalized.every(
    (anchor, index) =>
      index === 0 || anchor.midiTime > normalized[index - 1].midiTime,
  );
  return {
    anchors: normalized,
    forward,
    map: (audioTime) => mapNormalizedAnchors(audioTime, normalized),
  };
};

export const mapAudioToMidiClock = (
  audioTime: number,
  anchors: SyncAnchor[],
): MidiClockMapping => createSyncTimeline(anchors).map(audioTime);

export const hasForwardSyncMapping = (anchors: SyncAnchor[]): boolean =>
  createSyncTimeline(anchors).forward;

export const createStateDocument = ({
  midiFileName,
  audioFileName,
  visualization,
  settings,
  syncAnchors,
  visualConfiguration = cloneDefaultVisualConfiguration(),
}: {
  midiFileName: string | null;
  audioFileName: string | null;
  visualization: VisualizationId;
  settings: VisualizationSettings;
  syncAnchors: SyncAnchor[];
  visualConfiguration?: VisualConfiguration;
}): VisualizationStateDocument => ({
  schema: 'midi-visualizer-state',
  version: 2,
  savedAt: new Date().toISOString(),
  source: { midiFileName, audioFileName },
  visualization,
  settings: { ...settings },
  syncAnchors: normalizeAnchors(syncAnchors),
  visualConfiguration: sanitizeVisualConfiguration(visualConfiguration),
});

export const parseStateDocument = (raw: string): VisualizationStateDocument => {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') {
    throw new Error('El archivo no contiene un estado válido.');
  }
  const untyped = value as Record<string, unknown>;
  if (
    untyped.schema !== 'midi-visualizer-state' &&
    ('familyCustomizations' in untyped ||
      'assignedFamilies' in untyped ||
      'enabledInstruments' in untyped)
  ) {
    return createStateDocument({
      midiFileName: null,
      audioFileName: null,
      visualization: 'now-line',
      settings: {
        ...DEFAULT_SETTINGS,
        secondsVisible:
          typeof untyped.visibleSeconds === 'number'
            ? Math.min(30, Math.max(2, untyped.visibleSeconds))
            : DEFAULT_SETTINGS.secondsVisible,
      },
      syncAnchors: [],
      visualConfiguration: migrateV1VisualConfiguration(untyped),
    });
  }
  const candidate = value as Partial<
    Omit<VisualizationStateDocument, 'version'>
  > & {
    version?: number;
  };
  if (
    candidate.schema !== 'midi-visualizer-state' ||
    (candidate.version !== 1 && candidate.version !== 2)
  ) {
    throw new Error('La versión del estado no es compatible.');
  }
  const incoming = candidate.settings as Partial<VisualizationSettings> | undefined;
  const quality = QUALITY_PRESETS.includes(incoming?.quality as QualityPreset)
    ? (incoming?.quality as QualityPreset)
    : DEFAULT_SETTINGS.quality;
  const background =
    typeof incoming?.background === 'string' &&
    /^#[0-9a-f]{6}$/i.test(incoming.background)
      ? incoming.background
      : DEFAULT_SETTINGS.background;

  const settings: VisualizationSettings = {
    secondsVisible:
      finiteNonNegative(incoming?.secondsVisible) && incoming!.secondsVisible! > 0
        ? Math.min(30, Math.max(2, incoming!.secondsVisible!))
        : DEFAULT_SETTINGS.secondsVisible,
    glow: finiteNonNegative(incoming?.glow)
      ? Math.min(2, incoming!.glow!)
      : DEFAULT_SETTINGS.glow,
    noteScale: finiteNonNegative(incoming?.noteScale)
      ? Math.min(2, Math.max(0.4, incoming!.noteScale!))
      : DEFAULT_SETTINGS.noteScale,
    quality,
    background,
  };

  const source = candidate.source ?? {
    midiFileName: null,
    audioFileName: null,
  };

  return {
    schema: 'midi-visualizer-state',
    version: 2,
    savedAt:
      typeof candidate.savedAt === 'string'
        ? candidate.savedAt
        : new Date().toISOString(),
    source: {
      midiFileName:
        typeof source.midiFileName === 'string' ? source.midiFileName : null,
      audioFileName:
        typeof source.audioFileName === 'string' ? source.audioFileName : null,
    },
    visualization: 'now-line',
    settings,
    syncAnchors: normalizeAnchors(
      Array.isArray(candidate.syncAnchors)
        ? (candidate.syncAnchors as SyncAnchor[])
        : [],
    ),
    visualConfiguration: sanitizeVisualConfiguration(
      candidate.visualConfiguration,
    ),
  };
};
import {
  cloneDefaultVisualConfiguration,
  migrateV1VisualConfiguration,
  sanitizeVisualConfiguration,
  type VisualConfiguration,
} from './visualConfiguration';
