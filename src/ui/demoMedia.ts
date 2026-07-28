import {
  DEFAULT_SETTINGS,
  normalizeAnchors,
  parseStateDocument,
  type SyncAnchor,
  type VisualizationStateDocument,
  type VisualizationSettings,
} from '../core/state/visualizationState';
import {
  cloneDefaultVisualConfiguration,
  sanitizeVisualConfiguration,
  type EndCardSettings,
  type VisualConfiguration,
} from '../core/state/visualConfiguration';

export const DEMO_END_CARD: Readonly<EndCardSettings> = {
  title: 'El Intachable (Pasillo)',
  subtitle: 'Juan Domingo Córdoba',
  composerArranger: 'Arr. Jaime Jaramillo Arias',
  freeText:
    "Interpreta la Orquesta Filarmónica de Bogotá con Ensamble Cruza'o",
};

const DEMO_BASE_URL = `${import.meta.env.BASE_URL}demo/`;

export const DEMO_IDS = [
  'el-intachable',
  'despasillo-por-favor',
] as const;

export type DemoId = (typeof DEMO_IDS)[number];

export const DEFAULT_DEMO_ID: DemoId = 'el-intachable';

export interface DemoDefinition {
  id: DemoId;
  label: string;
  midiUrl: string;
  midiFileName: string;
  audioUrl: string;
  audioFileName: string;
  stateUrl?: string;
  syncMode: 'auto' | 'state';
}

export const DEMO_CATALOG: Readonly<Record<DemoId, DemoDefinition>> = {
  'el-intachable': {
    id: 'el-intachable',
    label: 'El Intachable',
    midiUrl: `${DEMO_BASE_URL}el-intachable.midi`,
    midiFileName: 'EL INTACHABLE.midi',
    audioUrl: `${DEMO_BASE_URL}el-intachable.mp3`,
    audioFileName: 'El intachable.mp3',
    syncMode: 'auto',
  },
  'despasillo-por-favor': {
    id: 'despasillo-por-favor',
    label: 'Despasillo por favor',
    midiUrl: `${DEMO_BASE_URL}despasillo-por-favor.midi`,
    midiFileName: 'DESPASILLO POR FAVOR.midi',
    audioUrl: `${DEMO_BASE_URL}despasillo-por-favor.mp3`,
    audioFileName: 'Despasillo por favor - Lucas Saboyá.mp3',
    stateUrl: `${DEMO_BASE_URL}despasillo-por-favor.midi-stage.json`,
    syncMode: 'state',
  },
};

export const DEMO_MEDIA = DEMO_CATALOG[DEFAULT_DEMO_ID];

export interface DemoMediaFiles {
  midiFile: File;
  audioFile: File;
  definition: DemoDefinition;
  presentationState: DemoPresentationState;
}

export interface DemoPresentationState {
  settings: VisualizationSettings;
  visualConfiguration: VisualConfiguration;
  syncAnchors: SyncAnchor[];
  preserveSynchronization: boolean;
}

const presentationStateFromDocument = (
  document: VisualizationStateDocument,
): DemoPresentationState => ({
  settings: { ...document.settings },
  visualConfiguration: sanitizeVisualConfiguration(
    document.visualConfiguration,
  ),
  syncAnchors: normalizeAnchors(document.syncAnchors).map((anchor) => ({
    ...anchor,
  })),
  preserveSynchronization: document.syncAnchors.length > 0,
});

export const createDemoPresentationState = (
  demoId: DemoId = DEFAULT_DEMO_ID,
  document?: VisualizationStateDocument,
): DemoPresentationState => {
  if (document) return presentationStateFromDocument(document);
  if (demoId !== DEFAULT_DEMO_ID) {
    throw new Error(
      `La demo ${DEMO_CATALOG[demoId].label} requiere su estado guardado.`,
    );
  }
  const visualConfiguration = cloneDefaultVisualConfiguration();
  visualConfiguration.global.endCard = { ...DEMO_END_CARD };
  return {
    settings: { ...DEFAULT_SETTINGS },
    visualConfiguration,
    syncAnchors: [],
    preserveSynchronization: false,
  };
};

type FetchDemoResource = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

const readDemoResource = async (
  fetchResource: FetchDemoResource,
  url: string,
  label: string,
  cache: RequestCache = 'force-cache',
): Promise<Blob> => {
  const response = await fetchResource(url, { cache });
  if (!response.ok) {
    throw new Error(
      `No fue posible descargar el ${label} de la demo (${response.status}).`,
    );
  }
  const blob = await response.blob();
  if (blob.size < 1) {
    throw new Error(`El ${label} de la demo llegó vacío.`);
  }
  return blob;
};

export const fetchDemoMedia = async (
  demoId: DemoId = DEFAULT_DEMO_ID,
  fetchResource: FetchDemoResource = fetch,
): Promise<DemoMediaFiles> => {
  const definition = DEMO_CATALOG[demoId];
  const [midiBlob, audioBlob, stateBlob] = await Promise.all([
    readDemoResource(
      fetchResource,
      definition.midiUrl,
      'archivo MIDI',
    ),
    readDemoResource(
      fetchResource,
      definition.audioUrl,
      'archivo de audio',
    ),
    definition.stateUrl
      ? readDemoResource(
          fetchResource,
          definition.stateUrl,
          'estado',
          'no-cache',
        )
      : Promise.resolve(null),
  ]);

  let stateDocument: VisualizationStateDocument | undefined;
  if (stateBlob) {
    try {
      stateDocument = parseStateDocument(await stateBlob.text());
    } catch (error) {
      throw new Error(
        `El estado de la demo ${definition.label} no es válido: ${
          error instanceof Error ? error.message : 'formato desconocido'
        }`,
      );
    }
  }

  const presentationState = createDemoPresentationState(
    demoId,
    stateDocument,
  );
  const midiFileName =
    stateDocument?.source.midiFileName ?? definition.midiFileName;
  const audioFileName =
    stateDocument?.source.audioFileName?.normalize('NFC') ??
    definition.audioFileName;

  return {
    midiFile: new File([midiBlob], midiFileName, {
      type: 'audio/midi',
    }),
    audioFile: new File([audioBlob], audioFileName, {
      type: 'audio/mpeg',
    }),
    definition,
    presentationState,
  };
};
