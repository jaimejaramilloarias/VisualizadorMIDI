export const VISUALIZATION_IDS = ['now-line', 'piano-roll'] as const;
export type VisualizationId = (typeof VISUALIZATION_IDS)[number];

export const QUALITY_PRESETS = ['auto', 'high', 'ultra'] as const;
export type QualityPreset = (typeof QUALITY_PRESETS)[number];

export interface SyncAnchor {
  id: string;
  audioTime: number;
  midiTime: number;
}

export interface VisualizationSettings {
  secondsVisible: number;
  glow: number;
  noteScale: number;
  gridOpacity: number;
  quality: QualityPreset;
  background: string;
}

export interface VisualizationStateDocument {
  schema: 'midi-visualizer-state';
  version: 1;
  savedAt: string;
  source: {
    midiFileName: string | null;
    audioFileName: string | null;
  };
  visualization: VisualizationId;
  settings: VisualizationSettings;
  syncAnchors: SyncAnchor[];
}

export const DEFAULT_SETTINGS: VisualizationSettings = {
  secondsVisible: 8,
  glow: 0.8,
  noteScale: 1,
  gridOpacity: 0.24,
  quality: 'auto',
  background: '#07090e',
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
): number => {
  const normalized = normalizeAnchors(anchors);
  if (normalized.length === 0) return Math.max(0, audioTime);
  if (normalized.length === 1) {
    const anchor = normalized[0];
    return Math.max(0, anchor.midiTime + audioTime - anchor.audioTime);
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
    for (let index = 0; index < normalized.length - 1; index += 1) {
      if (
        audioTime >= normalized[index].audioTime &&
        audioTime <= normalized[index + 1].audioTime
      ) {
        left = normalized[index];
        right = normalized[index + 1];
        break;
      }
    }
  }

  const audioSpan = right.audioTime - left.audioTime;
  if (audioSpan <= 0) return Math.max(0, left.midiTime);
  const progress = (audioTime - left.audioTime) / audioSpan;
  return Math.max(0, left.midiTime + (right.midiTime - left.midiTime) * progress);
};

export const createStateDocument = ({
  midiFileName,
  audioFileName,
  visualization,
  settings,
  syncAnchors,
}: {
  midiFileName: string | null;
  audioFileName: string | null;
  visualization: VisualizationId;
  settings: VisualizationSettings;
  syncAnchors: SyncAnchor[];
}): VisualizationStateDocument => ({
  schema: 'midi-visualizer-state',
  version: 1,
  savedAt: new Date().toISOString(),
  source: { midiFileName, audioFileName },
  visualization,
  settings: { ...settings },
  syncAnchors: normalizeAnchors(syncAnchors),
});

export const parseStateDocument = (raw: string): VisualizationStateDocument => {
  const value: unknown = JSON.parse(raw);
  if (!value || typeof value !== 'object') {
    throw new Error('El archivo no contiene un estado válido.');
  }
  const candidate = value as Partial<VisualizationStateDocument>;
  if (candidate.schema !== 'midi-visualizer-state' || candidate.version !== 1) {
    throw new Error('La versión del estado no es compatible.');
  }
  if (!VISUALIZATION_IDS.includes(candidate.visualization as VisualizationId)) {
    throw new Error('La visualización guardada no es válida.');
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
    gridOpacity: finiteNonNegative(incoming?.gridOpacity)
      ? Math.min(1, incoming!.gridOpacity!)
      : DEFAULT_SETTINGS.gridOpacity,
    quality,
    background,
  };

  const source = candidate.source ?? {
    midiFileName: null,
    audioFileName: null,
  };

  return {
    schema: 'midi-visualizer-state',
    version: 1,
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
    visualization: candidate.visualization as VisualizationId,
    settings,
    syncAnchors: normalizeAnchors(
      Array.isArray(candidate.syncAnchors)
        ? (candidate.syncAnchors as SyncAnchor[])
        : [],
    ),
  };
};
