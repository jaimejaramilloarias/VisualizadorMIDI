import {
  DEFAULT_SETTINGS,
  type VisualizationSettings,
} from '../core/state/visualizationState';
import {
  cloneDefaultVisualConfiguration,
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

export const DEMO_MEDIA = {
  midiUrl: `${DEMO_BASE_URL}el-intachable.midi`,
  midiFileName: 'EL INTACHABLE.midi',
  audioUrl: `${DEMO_BASE_URL}el-intachable.mp3`,
  audioFileName: 'El intachable.mp3',
} as const;

export interface DemoMediaFiles {
  midiFile: File;
  audioFile: File;
}

export interface DemoPresentationState {
  settings: VisualizationSettings;
  visualConfiguration: VisualConfiguration;
}

export const createDemoPresentationState = (): DemoPresentationState => {
  const visualConfiguration = cloneDefaultVisualConfiguration();
  visualConfiguration.global.endCard = { ...DEMO_END_CARD };
  return {
    settings: { ...DEFAULT_SETTINGS },
    visualConfiguration,
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
): Promise<Blob> => {
  const response = await fetchResource(url, { cache: 'force-cache' });
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
  fetchResource: FetchDemoResource = fetch,
): Promise<DemoMediaFiles> => {
  const [midiBlob, audioBlob] = await Promise.all([
    readDemoResource(
      fetchResource,
      DEMO_MEDIA.midiUrl,
      'archivo MIDI',
    ),
    readDemoResource(
      fetchResource,
      DEMO_MEDIA.audioUrl,
      'archivo de audio',
    ),
  ]);

  return {
    midiFile: new File([midiBlob], DEMO_MEDIA.midiFileName, {
      type: 'audio/midi',
    }),
    audioFile: new File([audioBlob], DEMO_MEDIA.audioFileName, {
      type: 'audio/mpeg',
    }),
  };
};
