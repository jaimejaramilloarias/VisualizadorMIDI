import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import type {
  MidiTrackInfo,
  PackedMidiProject,
  TempoPoint,
} from '../core/midi/types';
import {
  DEFAULT_SETTINGS,
  createStateDocument,
  hasForwardSyncMapping,
  mapAudioToMidi,
  mapAudioToMidiClock,
  normalizeAnchors,
  parseStateDocument,
  type SyncAnchor,
  type VisualizationId,
  type VisualizationSettings,
} from '../core/state/visualizationState';
import {
  FAMILY_NAMES,
  SHAPE_IDS,
  SHAPE_LABELS,
  cloneDefaultVisualConfiguration,
  createRenderAppearance,
  resolveTrackVisualStyle,
  type FamilyVisualStyle,
  type InstrumentVisualStyle,
  type VisualConfiguration,
} from '../core/state/visualConfiguration';
import {
  AudioTransport,
  type TransportSnapshot,
} from '../core/transport/AudioTransport';
import { RendererBridge } from '../renderer/RendererBridge';
import type { RenderTelemetry } from '../renderer/protocol';
import { Icon, type IconName } from './icons';
import { WaveformEditor } from './WaveformEditor';

interface ProjectSummary {
  fileName: string;
  duration: number;
  noteCount: number;
  tracks: MidiTrackInfo[];
  tempoMap: TempoPoint[];
}

interface MidiWorkerResponse {
  type: 'parsed' | 'error';
  requestId: number;
  project?: PackedMidiProject;
  message?: string;
}

const EMPTY_TRANSPORT: TransportSnapshot = {
  position: 0,
  duration: 0,
  playing: false,
  hasAudio: false,
};

const EMPTY_TELEMETRY: RenderTelemetry = {
  fps: 0,
  frameP95: 0,
  visibleNotes: 0,
  renderWidth: 0,
  renderHeight: 0,
  scale: 1,
};

const formatTime = (seconds: number): string => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  const decimals = Math.floor((safe % 1) * 10);
  return `${minutes}:${String(remainder).padStart(2, '0')}.${decimals}`;
};

const createId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `anchor-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const MAX_MIDI_SIZE = 64 * 1024 * 1024;
const MAX_AUDIO_SIZE = 400 * 1024 * 1024;
const MAX_BACKGROUND_SIZE = 24 * 1024 * 1024;

const beatDurationAt = (time: number, tempoMap: TempoPoint[]): number => {
  let selected = tempoMap[0];
  tempoMap.forEach((point) => {
    if (point.seconds <= time) selected = point;
  });
  return (selected?.microsecondsPerBeat ?? 500_000) / 1_000_000;
};

const parseMidiInWorker = async (file: File): Promise<PackedMidiProject> => {
  const worker = new Worker(new URL('../workers/midi.worker.ts', import.meta.url), {
    type: 'module',
  });
  const requestId = Date.now();
  const buffer = await file.arrayBuffer();

  return await new Promise<PackedMidiProject>((resolve, reject) => {
    worker.onmessage = (event: MessageEvent<MidiWorkerResponse>) => {
      if (event.data.requestId !== requestId) return;
      worker.terminate();
      if (event.data.type === 'parsed' && event.data.project) {
        resolve(event.data.project);
      } else {
        reject(new Error(event.data.message ?? 'No fue posible leer el MIDI.'));
      }
    };
    worker.onerror = (event) => {
      worker.terminate();
      reject(new Error(event.message || 'El lector MIDI se detuvo.'));
    };
    worker.postMessage(
      { type: 'parse', requestId, fileName: file.name, buffer },
      [buffer],
    );
  });
};

function ToolButton({
  icon,
  label,
  onClick,
  active = false,
  disabled = false,
  compact = false,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  compact?: boolean;
}) {
  return (
    <button
      aria-label={label}
      className={`tool-button${active ? ' is-active' : ''}${compact ? ' is-compact' : ''}`}
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      <Icon name={icon} />
      {!compact && <span>{label}</span>}
    </button>
  );
}

function RangeControl({
  label,
  value,
  min,
  max,
  step,
  suffix,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  suffix: string;
  onChange: (value: number) => void;
}) {
  return (
    <label className="range-control">
      <span className="control-label">
        <span>{label}</span>
        <output>
          {value.toFixed(step < 1 ? 1 : 0)}
          {suffix}
        </output>
      </span>
      <input
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
    </label>
  );
}

export function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<RendererBridge | null>(null);
  const transportRef = useRef<AudioTransport | null>(null);
  const midiInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const backgroundInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const anchorsRef = useRef<SyncAnchor[]>([]);
  const visualConfigurationRef = useRef<VisualConfiguration>(
    cloneDefaultVisualConfiguration(),
  );
  const anchorPreviewRef = useRef<number | null>(null);
  const selectionAnchorRef = useRef<string | null>(null);
  const lastTapRef = useRef<{ audioTime: number; midiTime: number } | null>(
    null,
  );
  const lastUiUpdateRef = useRef(0);
  const lastClockRef = useRef({
    sentAt: 0,
    midiTime: -1,
    playbackRate: 1,
    playing: false,
  });

  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [visualization, setVisualization] =
    useState<VisualizationId>('now-line');
  const [settings, setSettings] =
    useState<VisualizationSettings>(DEFAULT_SETTINGS);
  const [syncAnchors, setSyncAnchors] = useState<SyncAnchor[]>([]);
  const [visualConfiguration, setVisualConfiguration] =
    useState<VisualConfiguration>(() => cloneDefaultVisualConfiguration());
  const [anchorMidiDraft, setAnchorMidiDraft] = useState<number | null>(null);
  const [inspectorTab, setInspectorTab] = useState<
    'visual' | 'instruments' | 'sync'
  >('visual');
  const [selectedTrackName, setSelectedTrackName] = useState<string | null>(
    null,
  );
  const [selectedTrackNames, setSelectedTrackNames] = useState<string[]>([]);
  const [waveformPeaks, setWaveformPeaks] = useState<Float32Array | null>(null);
  const [tapActive, setTapActive] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [transport, setTransport] =
    useState<TransportSnapshot>(EMPTY_TRANSPORT);
  const [telemetry, setTelemetry] =
    useState<RenderTelemetry>(EMPTY_TELEMETRY);
  const [leftCollapsed, setLeftCollapsed] = useState(
    () => window.matchMedia('(max-width: 800px)').matches,
  );
  const [rightCollapsed, setRightCollapsed] = useState(
    () => window.matchMedia('(max-width: 800px)').matches,
  );
  const [busy, setBusy] = useState<'midi' | 'audio' | null>(null);
  const [notice, setNotice] = useState(
    'Carga un MIDI para comenzar. El audio es opcional.',
  );
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    anchorsRef.current = syncAnchors;
  }, [syncAnchors]);

  useEffect(() => {
    visualConfigurationRef.current = visualConfiguration;
  }, [visualConfiguration]);

  useEffect(() => {
    anchorPreviewRef.current = anchorMidiDraft;
  }, [anchorMidiDraft]);

  useEffect(() => {
    const transportInstance = new AudioTransport();
    transportRef.current = transportInstance;
    const unsubscribe = transportInstance.subscribe(setTransport);
    return () => {
      unsubscribe();
      void transportInstance.destroy();
      transportRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!canvasRef.current) return;
    try {
      const renderer = new RendererBridge(canvasRef.current, {
        onTelemetry: setTelemetry,
        onError: setNotice,
      });
      rendererRef.current = renderer;
      renderer.setSettings(visualization, settings);
      renderer.setVisibility(!document.hidden);
      return () => {
        renderer.dispose();
        rendererRef.current = null;
      };
    } catch (error) {
      setNotice(
        error instanceof Error
          ? error.message
          : 'No fue posible iniciar el motor visual.',
      );
    }
  }, []);

  useEffect(() => {
    rendererRef.current?.setSettings(visualization, settings);
  }, [settings, visualization]);

  useEffect(() => {
    if (!project) return;
    rendererRef.current?.setAppearance(
      createRenderAppearance(project.tracks, visualConfiguration),
    );
  }, [project, visualConfiguration]);

  useEffect(() => {
    const handleVisibility = () => {
      rendererRef.current?.setVisibility(!document.hidden);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () =>
      document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  useEffect(() => {
    const compactQuery = window.matchMedia('(max-width: 800px)');
    const onChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setLeftCollapsed(true);
        setRightCollapsed(true);
      }
    };
    compactQuery.addEventListener('change', onChange);
    return () => compactQuery.removeEventListener('change', onChange);
  }, []);

  useEffect(() => {
    if (!tapActive) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.code !== 'Space' ||
        event.repeat ||
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return;
      }
      event.preventDefault();
      window.dispatchEvent(new CustomEvent('midi-stage-tap'));
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tapActive]);

  useEffect(() => {
    let frame = 0;
    const update = (now: number) => {
      const instance = transportRef.current;
      if (instance) {
        const snapshot = instance.getSnapshot(now);
        const offsetAudioTime =
          snapshot.position +
          visualConfigurationRef.current.global.audioOffsetMs / 1000;
        const preview = anchorPreviewRef.current;
        const mapping =
          preview === null
            ? mapAudioToMidiClock(offsetAudioTime, anchorsRef.current)
            : { midiTime: preview, playbackRate: 0 };
        const rendererPlaying = snapshot.playing && preview === null;
        const previous = lastClockRef.current;
        const shouldCorrectPlayingClock =
          rendererPlaying && now - previous.sentAt >= 200;
        const shouldUpdatePausedClock =
          !rendererPlaying &&
          Math.abs(mapping.midiTime - previous.midiTime) > 0.0005;
        const stateChanged =
          rendererPlaying !== previous.playing ||
          Math.abs(mapping.playbackRate - previous.playbackRate) > 0.0001;
        if (
          shouldCorrectPlayingClock ||
          shouldUpdatePausedClock ||
          stateChanged
        ) {
          rendererRef.current?.setClock({
            midiTime: mapping.midiTime,
            performanceTime: now,
            playing: rendererPlaying,
            playbackRate: mapping.playbackRate,
          });
          lastClockRef.current = {
            sentAt: now,
            midiTime: mapping.midiTime,
            playbackRate: mapping.playbackRate,
            playing: rendererPlaying,
          };
        }
        if (now - lastUiUpdateRef.current > 80) {
          setTransport(snapshot);
          lastUiUpdateRef.current = now;
        }
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, []);

  const updateSetting = useCallback(
    <Key extends keyof VisualizationSettings>(
      key: Key,
      value: VisualizationSettings[Key],
    ) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const loadMidi = useCallback(async (file: File) => {
    if (file.size > MAX_MIDI_SIZE) {
      setNotice('El MIDI supera el límite seguro de 64 MB para este dispositivo.');
      return;
    }
    setBusy('midi');
    setNotice(`Analizando ${file.name}…`);
    try {
      const parsed = await parseMidiInWorker(file);
      const summary: ProjectSummary = {
        fileName: parsed.fileName,
        duration: parsed.duration,
        noteCount: parsed.noteCount,
        tracks: parsed.tracks,
        tempoMap: parsed.tempoMap,
      };
      rendererRef.current?.setProject(parsed);
      setProject(summary);
      setSelectedTrackName(summary.tracks[0]?.name ?? null);
      setSelectedTrackNames(
        summary.tracks[0]?.name ? [summary.tracks[0].name] : [],
      );
      selectionAnchorRef.current = summary.tracks[0]?.name ?? null;
      transportRef.current?.setMidiDuration(parsed.duration);
      transportRef.current?.seek(0);
      setNotice(
        `${parsed.noteCount.toLocaleString('es-CO')} notas listas en ${parsed.tracks.length} pistas.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'No fue posible cargar el MIDI.',
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const loadAudio = useCallback(async (file: File) => {
    if (!transportRef.current) return;
    if (file.size > MAX_AUDIO_SIZE) {
      setNotice('El audio supera el límite seguro de 400 MB para este dispositivo.');
      return;
    }
    setBusy('audio');
    setNotice(`Decodificando ${file.name} localmente…`);
    try {
      const duration = await transportRef.current.loadAudio(file);
      setWaveformPeaks(transportRef.current.getWaveformPeaks());
      setAudioFileName(file.name);
      setNotice(
        `Audio listo (${formatTime(duration)}). El archivo permanece en este dispositivo.`,
      );
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `No fue posible abrir el audio: ${error.message}`
          : 'No fue posible abrir el audio.',
      );
    } finally {
      setBusy(null);
    }
  }, []);

  const loadBackgroundImage = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) {
      setNotice('Selecciona una imagen compatible.');
      return;
    }
    if (file.size > MAX_BACKGROUND_SIZE) {
      setNotice('La imagen supera el límite seguro de 24 MB.');
      return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      rendererRef.current?.setBackgroundImage(bitmap);
      setVisualConfiguration((current) => ({
        ...current,
        global: {
          ...current.global,
          backgroundImageName: file.name,
        },
      }));
      setNotice(
        `${file.name} aplicada como fondo. El JSON guardará su nombre, no la imagen.`,
      );
    } catch {
      setNotice('No fue posible decodificar la imagen de fondo.');
    }
  }, []);

  const loadDroppedFile = useCallback(
    (file: File) => {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.mid') || lowerName.endsWith('.midi')) {
        void loadMidi(file);
      } else if (file.type.startsWith('audio/')) {
        void loadAudio(file);
      } else if (file.type.startsWith('image/')) {
        void loadBackgroundImage(file);
      } else {
        setNotice('Usa un archivo MIDI, audio o imagen compatible.');
      }
    },
    [loadAudio, loadBackgroundImage, loadMidi],
  );

  const onDrop = (event: DragEvent<HTMLElement>) => {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files[0];
    if (file) loadDroppedFile(file);
  };

  const onFileInput =
    (loader: (file: File) => void) => (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) loader(file);
      event.target.value = '';
    };

  const exportState = () => {
    const document = createStateDocument({
      midiFileName: project?.fileName ?? null,
      audioFileName,
      visualization,
      settings,
      syncAnchors,
      visualConfiguration,
    });
    const blob = new Blob([`${JSON.stringify(document, null, 2)}\n`], {
      type: 'application/json',
    });
    const href = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    const baseName = (project?.fileName ?? 'visualizacion').replace(
      /\.(mid|midi)$/i,
      '',
    );
    link.href = href;
    link.download = `${baseName}.midi-stage.json`;
    link.click();
    URL.revokeObjectURL(href);
    setNotice('Estado guardado. El JSON no contiene MIDI ni audio.');
  };

  const importState = async (file: File) => {
    try {
      const document = parseStateDocument(await file.text());
      setVisualization(document.visualization);
      setSettings(document.settings);
      setSyncAnchors(document.syncAnchors);
      setVisualConfiguration(document.visualConfiguration);
      const expected = [document.source.midiFileName, document.source.audioFileName]
        .filter(Boolean)
        .join(' + ');
      setNotice(
        expected
          ? `Estado restaurado. Carga ${expected} para reproducirlo.`
          : 'Estado de visualización restaurado.',
      );
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'El JSON no es compatible.',
      );
    }
  };

  const addAnchorAtAudio = (audioTime: number, explicitMidiTime?: number) => {
    const midiTime =
      explicitMidiTime ??
      mapAudioToMidi(
        audioTime + visualConfiguration.global.audioOffsetMs / 1000,
        syncAnchors,
      );
    setSyncAnchors((current) =>
      normalizeAnchors([
        ...current.filter(
          (anchor) => Math.abs(anchor.audioTime - audioTime) > 0.001,
        ),
        { id: createId(), audioTime, midiTime },
      ]),
    );
    setAnchorMidiDraft(null);
  };

  const addAnchor = () => {
    addAnchorAtAudio(
      transport.position,
      anchorMidiDraft ?? undefined,
    );
  };

  const registerTap = useCallback(() => {
    if (!project || !transportRef.current?.getSnapshot().hasAudio) return;
    const audioTime = transportRef.current.getSnapshot().position;
    const previous = lastTapRef.current;
    if (previous && audioTime - previous.audioTime < 0.12) return;
    const midiTime = previous
      ? previous.midiTime + beatDurationAt(previous.midiTime, project.tempoMap)
      : mapAudioToMidi(
          audioTime +
            visualConfigurationRef.current.global.audioOffsetMs / 1000,
          anchorsRef.current,
        );
    lastTapRef.current = { audioTime, midiTime };
    setSyncAnchors((current) =>
      normalizeAnchors([
        ...current.filter(
          (anchor) => Math.abs(anchor.audioTime - audioTime) > 0.001,
        ),
        { id: createId(), audioTime, midiTime },
      ]),
    );
  }, [project]);

  useEffect(() => {
    const onTap = () => registerTap();
    window.addEventListener('midi-stage-tap', onTap);
    return () => window.removeEventListener('midi-stage-tap', onTap);
  }, [registerTap]);

  const startTapTempo = () => {
    if (!transport.hasAudio || !project) {
      setNotice('Carga MIDI y audio antes de iniciar tap tempo.');
      return;
    }
    lastTapRef.current = null;
    setTapActive(true);
    setNotice('Tap tempo activo: pulsa el botón o la barra espaciadora.');
    if (!transport.playing) void transportRef.current?.play();
  };

  const stopTapTempo = () => {
    setTapActive(false);
    lastTapRef.current = null;
    setNotice('Tap tempo finalizado. Puedes arrastrar sus anclas en la onda.');
  };

  const setAnchorDraft = (value: number) => {
    transportRef.current?.pause();
    setAnchorMidiDraft(
      Math.min(project?.duration ?? Number.MAX_SAFE_INTEGER, Math.max(0, value)),
    );
  };

  const updateGlobalVisual = <
    Key extends keyof VisualConfiguration['global'],
  >(
    key: Key,
    value: VisualConfiguration['global'][Key],
  ) => {
    setVisualConfiguration((current) => ({
      ...current,
      global: { ...current.global, [key]: value },
    }));
  };

  const updateInstrument = (
    trackName: string,
    updates: InstrumentVisualStyle,
  ) => {
    setVisualConfiguration((current) => ({
      ...current,
      instruments: {
        ...current.instruments,
        [trackName]: {
          ...current.instruments[trackName],
          ...updates,
        },
      },
    }));
  };

  const updateSelectedInstruments = (updates: InstrumentVisualStyle) => {
    const names =
      selectedTrackNames.length > 0
        ? selectedTrackNames
        : selectedTrackName
          ? [selectedTrackName]
          : [];
    setVisualConfiguration((current) => {
      const instruments = { ...current.instruments };
      names.forEach((name) => {
        instruments[name] = { ...instruments[name], ...updates };
      });
      return { ...current, instruments };
    });
  };

  const selectTrack = (
    trackName: string,
    event: ReactMouseEvent<HTMLButtonElement>,
  ) => {
    if (!project) return;
    const names = project.tracks.map((track) => track.name);
    if (event.shiftKey && selectionAnchorRef.current) {
      const start = names.indexOf(selectionAnchorRef.current);
      const end = names.indexOf(trackName);
      if (start >= 0 && end >= 0) {
        const range = names.slice(
          Math.min(start, end),
          Math.max(start, end) + 1,
        );
        setSelectedTrackNames(range);
      }
    } else if (event.metaKey || event.ctrlKey) {
      setSelectedTrackNames((current) =>
        current.includes(trackName)
          ? current.filter((name) => name !== trackName)
          : [...current, trackName],
      );
      selectionAnchorRef.current = trackName;
    } else {
      setSelectedTrackNames([trackName]);
      selectionAnchorRef.current = trackName;
    }
    setSelectedTrackName(trackName);
  };

  const beginTrackDrag = (
    trackName: string,
    event: DragEvent<HTMLButtonElement>,
  ) => {
    const names = selectedTrackNames.includes(trackName)
      ? selectedTrackNames
      : [trackName];
    if (!selectedTrackNames.includes(trackName)) {
      setSelectedTrackNames(names);
      setSelectedTrackName(trackName);
    }
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(
      'application/x-midi-stage-tracks',
      JSON.stringify(names),
    );
  };

  const assignDroppedFamily = (
    family: string,
    event: DragEvent<HTMLButtonElement>,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    try {
      const names = JSON.parse(
        event.dataTransfer.getData('application/x-midi-stage-tracks'),
      ) as unknown;
      if (!Array.isArray(names)) return;
      setVisualConfiguration((current) => {
        const instruments = { ...current.instruments };
        names.forEach((name) => {
          if (typeof name !== 'string') return;
          instruments[name] = { ...instruments[name], family };
        });
        return { ...current, instruments };
      });
      setNotice(`${names.length} pista(s) asignadas a ${family}.`);
    } catch {
      setNotice('No fue posible asignar las pistas arrastradas.');
    }
  };

  const updateFamily = (
    familyName: string,
    updates: Partial<FamilyVisualStyle>,
  ) => {
    setVisualConfiguration((current) => ({
      ...current,
      families: {
        ...current.families,
        [familyName]: {
          ...current.families[familyName],
          ...updates,
        },
      },
    }));
  };

  const updateShapeRule = (
    key: 'shapeExtensions' | 'shapeStretch',
    shape: (typeof SHAPE_IDS)[number],
    enabled: boolean,
  ) => {
    setVisualConfiguration((current) => ({
      ...current,
      [key]: { ...current[key], [shape]: enabled },
    }));
  };

  const resetSelectedInstruments = () => {
    const names =
      selectedTrackNames.length > 0
        ? selectedTrackNames
        : selectedTrackName
          ? [selectedTrackName]
          : [];
    setVisualConfiguration((current) => {
      const instruments = { ...current.instruments };
      names.forEach((name) => delete instruments[name]);
      return { ...current, instruments };
    });
  };

  const updateAnchor = (
    id: string,
    field: 'audioTime' | 'midiTime',
    value: number,
  ) => {
    setSyncAnchors((current) =>
      normalizeAnchors(
        current.map((anchor) =>
          anchor.id === id
            ? { ...anchor, [field]: Math.max(0, value || 0) }
            : anchor,
        ),
      ),
    );
  };

  const activeMidiTime = useMemo(
    () =>
      mapAudioToMidi(
        transport.position + visualConfiguration.global.audioOffsetMs / 1000,
        syncAnchors,
      ),
    [
      syncAnchors,
      transport.position,
      visualConfiguration.global.audioOffsetMs,
    ],
  );
  const syncMappingIsForward = useMemo(
    () => hasForwardSyncMapping(syncAnchors),
    [syncAnchors],
  );
  const selectedTrack =
    project?.tracks.find((track) => track.name === selectedTrackName) ?? null;
  const selectedResolvedStyle = selectedTrack
    ? resolveTrackVisualStyle(selectedTrack, visualConfiguration)
    : null;
  const selectedFamilyStyle = selectedResolvedStyle
    ? visualConfiguration.families[selectedResolvedStyle.family]
    : null;
  const progress =
    transport.duration > 0 ? transport.position / transport.duration : 0;

  return (
    <main
      className="app-shell"
      data-left-collapsed={leftCollapsed}
      data-right-collapsed={rightCollapsed}
      onDragEnter={(event) => {
        if (
          event.dataTransfer.types.includes(
            'application/x-midi-stage-tracks',
          )
        ) {
          return;
        }
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDrop}
    >
      <input
        accept=".mid,.midi,audio/midi,audio/x-midi"
        className="visually-hidden"
        onChange={onFileInput((file) => void loadMidi(file))}
        ref={midiInputRef}
        type="file"
      />
      <input
        accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
        className="visually-hidden"
        onChange={onFileInput((file) => void loadAudio(file))}
        ref={audioInputRef}
        type="file"
      />
      <input
        accept="image/*,.png,.jpg,.jpeg,.webp,.avif"
        className="visually-hidden"
        onChange={onFileInput((file) => void loadBackgroundImage(file))}
        ref={backgroundInputRef}
        type="file"
      />
      <input
        accept=".json,application/json"
        className="visually-hidden"
        onChange={onFileInput((file) => void importState(file))}
        ref={jsonInputRef}
        type="file"
      />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="sparkles" />
          </span>
          <span className="brand-copy">
            <strong>MIDI STAGE</strong>
            <small>Visualizador V2</small>
          </span>
        </div>
        <nav aria-label="Archivos" className="file-actions">
          <ToolButton
            disabled={busy !== null}
            icon="music"
            label={busy === 'midi' ? 'Cargando MIDI…' : 'Abrir MIDI'}
            onClick={() => midiInputRef.current?.click()}
          />
          <ToolButton
            disabled={busy !== null}
            icon="audio"
            label={busy === 'audio' ? 'Cargando audio…' : 'Añadir audio'}
            onClick={() => audioInputRef.current?.click()}
          />
          <span className="toolbar-divider" />
          <ToolButton
            icon="upload"
            label="Abrir estado"
            onClick={() => jsonInputRef.current?.click()}
          />
          <ToolButton
            icon="download"
            label="Guardar estado"
            onClick={exportState}
          />
          <ToolButton
            compact
            icon="info"
            label="Ayuda"
            onClick={() => setHelpOpen(true)}
          />
        </nav>
      </header>

      <aside className="left-panel panel-surface">
        <button
          aria-label={leftCollapsed ? 'Expandir visualizaciones' : 'Contraer visualizaciones'}
          className="collapse-button"
          onClick={() => {
            setLeftCollapsed((value) => {
              if (value && window.matchMedia('(max-width: 800px)').matches) {
                setRightCollapsed(true);
              }
              return !value;
            });
          }}
          title={leftCollapsed ? 'Expandir visualizaciones' : 'Contraer visualizaciones'}
          type="button"
        >
          <Icon name={leftCollapsed ? 'chevron-right' : 'chevron-left'} />
        </button>
        <div className="panel-heading">
          <Icon name="layers" />
          <span>
            <small>ESCENA</small>
            <strong>Visualización</strong>
          </span>
        </div>
        <div className="scene-list">
          <button
            aria-pressed={visualization === 'now-line'}
            className={`scene-card${visualization === 'now-line' ? ' is-selected' : ''}`}
            onClick={() => setVisualization('now-line')}
            title="NOW LINE"
            type="button"
          >
            <span className="scene-preview now-line-preview">
              <i />
              <i />
              <i />
              <b />
            </span>
            <span className="scene-copy">
              <strong>NOW LINE</strong>
              <small>Partitura horizontal</small>
            </span>
          </button>
          <button
            aria-pressed={visualization === 'piano-roll'}
            className={`scene-card${visualization === 'piano-roll' ? ' is-selected' : ''}`}
            onClick={() => setVisualization('piano-roll')}
            title="Piano Roll"
            type="button"
          >
            <span className="scene-preview piano-preview">
              <i />
              <i />
              <i />
              <b />
            </span>
            <span className="scene-copy">
              <strong>Piano Roll</strong>
              <small>Caída vertical</small>
            </span>
          </button>
          <button
            aria-pressed={visualization === 'orbit'}
            className={`scene-card${visualization === 'orbit' ? ' is-selected' : ''}`}
            onClick={() => setVisualization('orbit')}
            title="Órbita"
            type="button"
          >
            <span className="scene-preview orbit-preview">
              <i />
              <i />
              <i />
              <b />
            </span>
            <span className="scene-copy">
              <strong>Órbita</strong>
              <small>Tiempo radial</small>
            </span>
          </button>
        </div>
        <div className="privacy-card">
          <Icon name="info" />
          <p>
            MIDI y audio se procesan en este dispositivo. No se suben ni se
            incluyen en el JSON.
          </p>
        </div>
      </aside>

      <section className="stage">
        <div className="stage-meta">
          <div className="project-title">
            <span className={`status-dot${project ? ' is-ready' : ''}`} />
            <span>
              <strong>{project?.fileName ?? 'Sin MIDI cargado'}</strong>
              <small>
                {project
                  ? `${project.noteCount.toLocaleString('es-CO')} notas · ${project.tracks.length} pistas`
                  : 'Arrastra un archivo para comenzar'}
              </small>
            </span>
          </div>
          <div className="telemetry" aria-label="Rendimiento del lienzo">
            <span>{telemetry.fps || '—'} FPS</span>
            <span>{telemetry.visibleNotes.toLocaleString('es-CO')} visibles</span>
            <span>{telemetry.scale.toFixed(1)}×</span>
          </div>
        </div>

        <div
          className="canvas-frame"
          data-aspect-ratio={visualConfiguration.global.aspectRatio}
        >
          <canvas aria-label="Visualización MIDI" ref={canvasRef} />
          {!project && (
            <div className="empty-state">
              <span className="empty-icon">
                <Icon name="music" />
              </span>
              <h1>Tu música, en movimiento</h1>
              <p>
                Abre un MIDI. Puedes sumar audio y alinear ambos con anclas
                precisas.
              </p>
              <button
                className="primary-button"
                onClick={() => midiInputRef.current?.click()}
                type="button"
              >
                <Icon name="folder" />
                Elegir MIDI
              </button>
            </div>
          )}
          {dragging && (
            <div
              className="drop-overlay"
              onDragLeave={(event) => {
                if (event.currentTarget === event.target) setDragging(false);
              }}
            >
              <Icon name="download" />
              <strong>Suelta el archivo aquí</strong>
              <span>MIDI o audio compatible</span>
            </div>
          )}
        </div>

        <div className="notice" role="status">
          <span>{notice}</span>
          {audioFileName && (
            <span className="audio-chip">
              <Icon name="audio" />
              {audioFileName}
            </span>
          )}
        </div>

        <section aria-label="Transporte" className="transport-bar">
          <button
            aria-label="Volver al inicio"
            className="transport-icon"
            disabled={!project}
            onClick={() => transportRef.current?.restart()}
            title="Volver al inicio"
            type="button"
          >
            <Icon name="restart" />
          </button>
          <button
            aria-label="Retroceder 3 segundos"
            className="transport-icon seek-button"
            disabled={!project}
            onClick={() =>
              transportRef.current?.seek(Math.max(0, transport.position - 3))
            }
            title="Retroceder 3 segundos"
            type="button"
          >
            <Icon name="chevron-left" />
            <small>3</small>
          </button>
          <button
            aria-label={transport.playing ? 'Pausar' : 'Reproducir'}
            className="play-button"
            disabled={!project}
            onClick={() => void transportRef.current?.toggle()}
            title={transport.playing ? 'Pausar' : 'Reproducir'}
            type="button"
          >
            <Icon name={transport.playing ? 'pause' : 'play'} />
          </button>
          <button
            aria-label="Avanzar 3 segundos"
            className="transport-icon seek-button"
            disabled={!project}
            onClick={() =>
              transportRef.current?.seek(
                Math.min(transport.duration, transport.position + 3),
              )
            }
            title="Avanzar 3 segundos"
            type="button"
          >
            <Icon name="chevron-right" />
            <small>3</small>
          </button>
          <span className="timecode">{formatTime(transport.position)}</span>
          <label className="timeline">
            <span className="visually-hidden">Posición</span>
            <span className="timeline-fill" style={{ width: `${progress * 100}%` }} />
            <input
              disabled={!project}
              max={transport.duration || 1}
              min="0"
              onChange={(event) =>
                transportRef.current?.seek(Number(event.target.value))
              }
              step="0.01"
              type="range"
              value={transport.position}
            />
          </label>
          <span className="timecode is-duration">
            {formatTime(transport.duration)}
          </span>
          <div className="sync-readout" title="Tiempo MIDI después de aplicar las anclas">
            <Icon name="music" />
            <span>{formatTime(activeMidiTime)}</span>
          </div>
        </section>
      </section>

      <aside className="right-panel panel-surface">
        <button
          aria-label={rightCollapsed ? 'Expandir ajustes' : 'Contraer ajustes'}
          className="collapse-button"
          onClick={() => {
            setRightCollapsed((value) => {
              if (value && window.matchMedia('(max-width: 800px)').matches) {
                setLeftCollapsed(true);
              }
              return !value;
            });
          }}
          title={rightCollapsed ? 'Expandir ajustes' : 'Contraer ajustes'}
          type="button"
        >
          <Icon name={rightCollapsed ? 'chevron-left' : 'chevron-right'} />
        </button>
        <div className="panel-heading">
          <Icon name="settings" />
          <span>
            <small>INSPECTOR</small>
            <strong>Ajustes</strong>
          </span>
        </div>

        <div className="inspector-tabs" role="tablist" aria-label="Inspector">
          {(
            [
              ['visual', 'Visual'],
              ['instruments', 'Pistas'],
              ['sync', 'Sync'],
            ] as const
          ).map(([tab, label]) => (
            <button
              aria-selected={inspectorTab === tab}
              className={inspectorTab === tab ? 'is-selected' : ''}
              key={tab}
              onClick={() => setInspectorTab(tab)}
              role="tab"
              type="button"
            >
              {label}
            </button>
          ))}
        </div>

        <div className="panel-scroll">
          {inspectorTab === 'visual' && (
            <>
              <section className="inspector-section">
                <div className="section-heading">
                  <span>
                    <small>APARIENCIA</small>
                    <strong>Escena</strong>
                  </span>
                </div>
                <RangeControl
                  label="Ventana visible"
                  max={24}
                  min={3}
                  onChange={(value) => updateSetting('secondsVisible', value)}
                  step={1}
                  suffix=" s"
                  value={settings.secondsVisible}
                />
                <RangeControl
                  label="Resplandor de escena"
                  max={2}
                  min={0}
                  onChange={(value) => updateSetting('glow', value)}
                  step={0.1}
                  suffix="×"
                  value={settings.glow}
                />
                <RangeControl
                  label="Tamaño de nota"
                  max={1.8}
                  min={0.5}
                  onChange={(value) => updateSetting('noteScale', value)}
                  step={0.1}
                  suffix="×"
                  value={settings.noteScale}
                />
                <RangeControl
                  label="Cuadrícula"
                  max={1}
                  min={0}
                  onChange={(value) => updateSetting('gridOpacity', value)}
                  step={0.05}
                  suffix=""
                  value={settings.gridOpacity}
                />
                <div className="inline-control">
                  <label htmlFor="background-color">Color del canvas</label>
                  <input
                    aria-label="Color del canvas"
                    id="background-color"
                    onChange={(event) =>
                      updateSetting('background', event.target.value)
                    }
                    type="color"
                    value={settings.background}
                  />
                </div>
                <button
                  className="wide-action"
                  onClick={() => backgroundInputRef.current?.click()}
                  type="button"
                >
                  {visualConfiguration.global.backgroundImageName
                    ? `Cambiar fondo · ${visualConfiguration.global.backgroundImageName}`
                    : 'Añadir imagen de fondo'}
                </button>
                {visualConfiguration.global.backgroundImageName && (
                  <>
                    <RangeControl
                      label="Opacidad del fondo"
                      max={1}
                      min={0}
                      onChange={(value) =>
                        updateGlobalVisual('backgroundImageOpacity', value)
                      }
                      step={0.05}
                      suffix=""
                      value={
                        visualConfiguration.global.backgroundImageOpacity
                      }
                    />
                    <button
                      className="text-action"
                      onClick={() => {
                        rendererRef.current?.setBackgroundImage(null);
                        updateGlobalVisual('backgroundImageName', null);
                      }}
                      type="button"
                    >
                      Quitar imagen
                    </button>
                  </>
                )}
                <span className="subcontrol-label">Relación de aspecto</span>
                <div
                  className="segmented-control"
                  role="group"
                  aria-label="Relación de aspecto"
                >
                  {(['responsive', '16:9', '9:16'] as const).map((ratio) => (
                    <button
                      aria-pressed={
                        visualConfiguration.global.aspectRatio === ratio
                      }
                      className={
                        visualConfiguration.global.aspectRatio === ratio
                          ? 'is-selected'
                          : ''
                      }
                      key={ratio}
                      onClick={() => updateGlobalVisual('aspectRatio', ratio)}
                      type="button"
                    >
                      {ratio === 'responsive' ? 'Libre' : ratio}
                    </button>
                  ))}
                </div>
                <button
                  className="wide-action"
                  onClick={() =>
                    void canvasRef.current?.parentElement?.requestFullscreen()
                  }
                  type="button"
                >
                  Pantalla completa
                </button>
                <button
                  className="wide-action"
                  onClick={() => {
                    rendererRef.current?.refresh();
                    setNotice('Motor visual refrescado sin perder el estado.');
                  }}
                  type="button"
                >
                  Refrescar animación
                </button>
                <span className="subcontrol-label">Calidad</span>
                <div
                  className="segmented-control"
                  role="group"
                  aria-label="Calidad"
                >
                  {(['auto', 'high', 'ultra'] as const).map((quality) => (
                    <button
                      aria-pressed={settings.quality === quality}
                      className={
                        settings.quality === quality ? 'is-selected' : ''
                      }
                      key={quality}
                      onClick={() => updateSetting('quality', quality)}
                      type="button"
                    >
                      {quality === 'auto'
                        ? 'Auto'
                        : quality === 'high'
                          ? 'Alta'
                          : 'Ultra'}
                    </button>
                  ))}
                </div>
              </section>

              <section className="inspector-section">
                <div className="section-heading">
                  <span>
                    <small>COMPORTAMIENTO V1</small>
                    <strong>Geometría y efectos</strong>
                  </span>
                </div>
                <RangeControl
                  label="Velocidad base"
                  max={127}
                  min={1}
                  onChange={(value) =>
                    updateGlobalVisual('velocityBase', value)
                  }
                  step={1}
                  suffix=""
                  value={visualConfiguration.global.velocityBase}
                />
                <RangeControl
                  label="Tono global"
                  max={180}
                  min={-180}
                  onChange={(value) =>
                    updateGlobalVisual('colorToneShift', value)
                  }
                  step={1}
                  suffix="°"
                  value={visualConfiguration.global.colorToneShift}
                />
                <RangeControl
                  label="Altura global"
                  max={4}
                  min={0.4}
                  onChange={(value) => updateGlobalVisual('heightScale', value)}
                  step={0.1}
                  suffix="×"
                  value={visualConfiguration.global.heightScale}
                />
                <RangeControl
                  label="Opacidad extremos"
                  max={1}
                  min={0}
                  onChange={(value) => updateGlobalVisual('opacityEdge', value)}
                  step={0.05}
                  suffix=""
                  value={visualConfiguration.global.opacityEdge}
                />
                <RangeControl
                  label="Opacidad centro"
                  max={1}
                  min={0}
                  onChange={(value) =>
                    updateGlobalVisual('opacityCenter', value)
                  }
                  step={0.05}
                  suffix=""
                  value={visualConfiguration.global.opacityCenter}
                />
                <RangeControl
                  label="Glow global"
                  max={3}
                  min={0}
                  onChange={(value) =>
                    updateGlobalVisual('glowStrength', value)
                  }
                  step={0.1}
                  suffix="×"
                  value={visualConfiguration.global.glowStrength}
                />
                <RangeControl
                  label="Bump global"
                  max={3}
                  min={0}
                  onChange={(value) =>
                    updateGlobalVisual('bumpStrength', value)
                  }
                  step={0.1}
                  suffix="×"
                  value={visualConfiguration.global.bumpStrength}
                />
                <RangeControl
                  label="Supersampling"
                  max={3}
                  min={1}
                  onChange={(value) =>
                    updateGlobalVisual('supersampling', value)
                  }
                  step={0.1}
                  suffix="×"
                  value={visualConfiguration.global.supersampling}
                />
                <label className="switch-row">
                  <span>Etiquetas de nota</span>
                  <input
                    checked={
                      visualConfiguration.global.noteLabels.enabled
                    }
                    onChange={(event) =>
                      updateGlobalVisual('noteLabels', {
                        ...visualConfiguration.global.noteLabels,
                        enabled: event.target.checked,
                      })
                    }
                    type="checkbox"
                  />
                </label>
                {visualConfiguration.global.noteLabels.enabled && (
                  <>
                    <label className="select-control">
                      <span>Fuente de etiqueta</span>
                      <select
                        onChange={(event) =>
                          updateGlobalVisual('noteLabels', {
                            ...visualConfiguration.global.noteLabels,
                            font: event.target.value,
                          })
                        }
                        value={visualConfiguration.global.noteLabels.font}
                      >
                        {[
                          'Arial',
                          'Verdana',
                          'Trebuchet MS',
                          'Georgia',
                          'Times New Roman',
                          'Courier New',
                        ].map((font) => (
                          <option key={font} value={font}>
                            {font}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="inline-control">
                      <label htmlFor="label-color">Color de etiqueta</label>
                      <input
                        id="label-color"
                        onChange={(event) =>
                          updateGlobalVisual('noteLabels', {
                            ...visualConfiguration.global.noteLabels,
                            color: event.target.value,
                          })
                        }
                        type="color"
                        value={visualConfiguration.global.noteLabels.color}
                      />
                    </div>
                    <RangeControl
                      label="Tamaño de etiqueta"
                      max={42}
                      min={8}
                      onChange={(value) =>
                        updateGlobalVisual('noteLabels', {
                          ...visualConfiguration.global.noteLabels,
                          size: value,
                        })
                      }
                      step={1}
                      suffix=" px"
                      value={visualConfiguration.global.noteLabels.size}
                    />
                  </>
                )}
                <span className="subcontrol-label">Modo de FPS</span>
                <div className="segmented-control" role="group">
                  {(['auto', 'fixed'] as const).map((mode) => (
                    <button
                      className={
                        visualConfiguration.global.fpsMode === mode
                          ? 'is-selected'
                          : ''
                      }
                      key={mode}
                      onClick={() => updateGlobalVisual('fpsMode', mode)}
                      type="button"
                    >
                      {mode === 'auto' ? 'Automático' : 'Fijo'}
                    </button>
                  ))}
                </div>
                {visualConfiguration.global.fpsMode === 'fixed' && (
                  <RangeControl
                    label="FPS fijos"
                    max={240}
                    min={30}
                    onChange={(value) =>
                      updateGlobalVisual('fixedFps', value)
                    }
                    step={1}
                    suffix=""
                    value={visualConfiguration.global.fixedFps}
                  />
                )}
              </section>
            </>
          )}

          {inspectorTab === 'instruments' && (
            <>
              <section className="inspector-section">
                <div className="section-heading">
                  <span>
                    <small>INSTRUMENTOS</small>
                    <strong>Pistas activas</strong>
                  </span>
                  <span className="mini-actions">
                    <button
                      disabled={!project}
                      onClick={() =>
                        project?.tracks.forEach((track) =>
                          updateInstrument(track.name, { enabled: true }),
                        )
                      }
                      type="button"
                    >
                      Todas
                    </button>
                    <button
                      disabled={!project}
                      onClick={() =>
                        project?.tracks.forEach((track) =>
                          updateInstrument(track.name, { enabled: false }),
                        )
                      }
                      type="button"
                    >
                      Ninguna
                    </button>
                  </span>
                </div>
                {!project ? (
                  <p className="section-help">
                    Carga un MIDI para configurar sus instrumentos.
                  </p>
                ) : (
                  <>
                    <p className="section-help">
                      Toca para seleccionar; usa Shift/Cmd para varias. Arrastra
                      la selección a una familia.
                    </p>
                    <div className="family-drop-strip">
                      {FAMILY_NAMES.map((family) => (
                        <button
                          key={family}
                          onClick={() =>
                            updateSelectedInstruments({ family })
                          }
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={(event) =>
                            assignDroppedFamily(family, event)
                          }
                          title={`Asignar selección a ${family}`}
                          type="button"
                        >
                          {family}
                        </button>
                      ))}
                    </div>
                    <div className="track-list">
                      {project.tracks.map((track) => {
                        const trackStyle = resolveTrackVisualStyle(
                          track,
                          visualConfiguration,
                        );
                        return (
                          <button
                            className={
                              selectedTrackNames.includes(track.name)
                                ? 'track-row is-selected'
                                : 'track-row'
                            }
                            draggable
                            key={track.id}
                            onClick={(event) =>
                              selectTrack(track.name, event)
                            }
                            onDragStart={(event) =>
                              beginTrackDrag(track.name, event)
                            }
                            type="button"
                          >
                            <input
                              aria-label={`Activar ${track.name}`}
                              checked={trackStyle.enabled}
                              onChange={(event) =>
                                updateInstrument(track.name, {
                                  enabled: event.target.checked,
                                })
                              }
                              onClick={(event) => event.stopPropagation()}
                              type="checkbox"
                            />
                            <span
                              className="track-color"
                              style={{ background: trackStyle.color }}
                            />
                            <span>
                              <strong>{track.name}</strong>
                              <small>
                                {trackStyle.family} ·{' '}
                                {track.noteCount.toLocaleString('es-CO')}
                              </small>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>

              {selectedTrack && selectedResolvedStyle && (
                <section className="inspector-section">
                  <div className="section-heading">
                    <span>
                      <small>PERSONALIZACIÓN</small>
                      <strong>
                        {selectedTrackNames.length > 1
                          ? `${selectedTrackNames.length} pistas`
                          : selectedTrack.name}
                      </strong>
                    </span>
                    <button
                      className="text-action"
                      onClick={resetSelectedInstruments}
                      type="button"
                    >
                      Restablecer
                    </button>
                  </div>
                  <label className="select-control">
                    <span>Familia</span>
                    <select
                      onChange={(event) =>
                        updateSelectedInstruments({
                          family: event.target.value,
                        })
                      }
                      value={selectedResolvedStyle.family}
                    >
                      {FAMILY_NAMES.map((family) => (
                        <option key={family} value={family}>
                          {family}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="select-control">
                    <span>Figura</span>
                    <select
                      onChange={(event) =>
                        updateSelectedInstruments({
                          shape: event.target.value as (typeof SHAPE_IDS)[number],
                        })
                      }
                      value={selectedResolvedStyle.shape}
                    >
                      {SHAPE_IDS.map((shapeId) => (
                        <option key={shapeId} value={shapeId}>
                          {SHAPE_LABELS[shapeId]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="dual-color-control">
                    <label>
                      <span>Principal</span>
                      <input
                        onChange={(event) =>
                          updateSelectedInstruments({
                            color: event.target.value,
                          })
                        }
                        type="color"
                        value={selectedResolvedStyle.color}
                      />
                    </label>
                    <label>
                      <span>Secundario</span>
                      <input
                        onChange={(event) =>
                          updateSelectedInstruments({
                            secondaryColor: event.target.value,
                          })
                        }
                        type="color"
                        value={selectedResolvedStyle.secondaryColor}
                      />
                    </label>
                  </div>
                  <label className="switch-row">
                    <span>Extensión dinámica</span>
                    <input
                      checked={selectedResolvedStyle.extension}
                      onChange={(event) =>
                        updateSelectedInstruments({
                          extension: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  <label className="switch-row">
                    <span>Alargamiento</span>
                    <input
                      checked={selectedResolvedStyle.stretch}
                      onChange={(event) =>
                        updateSelectedInstruments({
                          stretch: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  <span className="subcontrol-label">
                    Regla global de {SHAPE_LABELS[selectedResolvedStyle.shape]}
                  </span>
                  <label className="switch-row">
                    <span>Figura admite extensión</span>
                    <input
                      checked={
                        visualConfiguration.shapeExtensions[
                          selectedResolvedStyle.shape
                        ]
                      }
                      onChange={(event) =>
                        updateShapeRule(
                          'shapeExtensions',
                          selectedResolvedStyle.shape,
                          event.target.checked,
                        )
                      }
                      type="checkbox"
                    />
                  </label>
                  <label className="switch-row">
                    <span>Figura admite alargamiento</span>
                    <input
                      checked={
                        visualConfiguration.shapeStretch[
                          selectedResolvedStyle.shape
                        ]
                      }
                      onChange={(event) =>
                        updateShapeRule(
                          'shapeStretch',
                          selectedResolvedStyle.shape,
                          event.target.checked,
                        )
                      }
                      type="checkbox"
                    />
                  </label>
                </section>
              )}

              {selectedResolvedStyle && selectedFamilyStyle && (
                <section className="inspector-section">
                  <div className="section-heading">
                    <span>
                      <small>AJUSTE POR FAMILIA</small>
                      <strong>{selectedResolvedStyle.family}</strong>
                    </span>
                  </div>
                  <RangeControl
                    label="Altura de familia"
                    max={4}
                    min={0.2}
                    onChange={(value) =>
                      updateFamily(selectedResolvedStyle.family, {
                        heightScale: value,
                      })
                    }
                    step={0.1}
                    suffix="×"
                    value={selectedFamilyStyle.heightScale}
                  />
                  <RangeControl
                    label="Glow de familia"
                    max={3}
                    min={0}
                    onChange={(value) =>
                      updateFamily(selectedResolvedStyle.family, {
                        glowStrength: value,
                      })
                    }
                    step={0.1}
                    suffix="×"
                    value={selectedFamilyStyle.glowStrength}
                  />
                  <RangeControl
                    label="Bump de familia"
                    max={3}
                    min={0}
                    onChange={(value) =>
                      updateFamily(selectedResolvedStyle.family, {
                        bumpStrength: value,
                      })
                    }
                    step={0.1}
                    suffix="×"
                    value={selectedFamilyStyle.bumpStrength}
                  />
                  <label className="switch-row">
                    <span>Contorno activo</span>
                    <input
                      checked={selectedFamilyStyle.outline.enabled}
                      onChange={(event) =>
                        updateFamily(selectedResolvedStyle.family, {
                          outline: {
                            ...selectedFamilyStyle.outline,
                            enabled: event.target.checked,
                          },
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  <label className="select-control">
                    <span>Modo de contorno</span>
                    <select
                      onChange={(event) =>
                        updateFamily(selectedResolvedStyle.family, {
                          outline: {
                            ...selectedFamilyStyle.outline,
                            mode: event.target.value as
                              | 'full'
                              | 'pre'
                              | 'post',
                          },
                        })
                      }
                      value={selectedFamilyStyle.outline.mode}
                    >
                      <option value="full">Completo</option>
                      <option value="pre">Antes de la línea</option>
                      <option value="post">Después de la línea</option>
                    </select>
                  </label>
                  <RangeControl
                    label="Grosor de contorno"
                    max={12}
                    min={0.25}
                    onChange={(value) =>
                      updateFamily(selectedResolvedStyle.family, {
                        outline: {
                          ...selectedFamilyStyle.outline,
                          width: value,
                        },
                      })
                    }
                    step={0.25}
                    suffix=" px"
                    value={selectedFamilyStyle.outline.width}
                  />
                  <RangeControl
                    label="Opacidad del contorno"
                    max={1}
                    min={0}
                    onChange={(value) =>
                      updateFamily(selectedResolvedStyle.family, {
                        outline: {
                          ...selectedFamilyStyle.outline,
                          opacity: value,
                        },
                      })
                    }
                    step={0.05}
                    suffix=""
                    value={selectedFamilyStyle.outline.opacity}
                  />
                  <label className="switch-row">
                    <span>Usar color de la figura</span>
                    <input
                      checked={selectedFamilyStyle.outline.useShapeColor}
                      onChange={(event) =>
                        updateFamily(selectedResolvedStyle.family, {
                          outline: {
                            ...selectedFamilyStyle.outline,
                            useShapeColor: event.target.checked,
                          },
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  {!selectedFamilyStyle.outline.useShapeColor && (
                    <div className="inline-control">
                      <label htmlFor="family-outline-color">
                        Color del contorno
                      </label>
                      <input
                        id="family-outline-color"
                        onChange={(event) =>
                          updateFamily(selectedResolvedStyle.family, {
                            outline: {
                              ...selectedFamilyStyle.outline,
                              color: event.target.value,
                            },
                          })
                        }
                        type="color"
                        value={selectedFamilyStyle.outline.color}
                      />
                    </div>
                  )}
                  <label className="switch-row">
                    <span>Extensión de familia</span>
                    <input
                      checked={selectedFamilyStyle.extension}
                      onChange={(event) =>
                        updateFamily(selectedResolvedStyle.family, {
                          extension: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  <label className="switch-row">
                    <span>Alargamiento de familia</span>
                    <input
                      checked={selectedFamilyStyle.stretch}
                      onChange={(event) =>
                        updateFamily(selectedResolvedStyle.family, {
                          stretch: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  <label className="switch-row">
                    <span>Líneas de conexión</span>
                    <input
                      checked={selectedFamilyStyle.line.enabled}
                      onChange={(event) =>
                        updateFamily(selectedResolvedStyle.family, {
                          line: {
                            ...selectedFamilyStyle.line,
                            enabled: event.target.checked,
                          },
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  <label className="switch-row">
                    <span>Viaje desde NOTE ON</span>
                    <input
                      checked={selectedFamilyStyle.travel.enabled}
                      onChange={(event) =>
                        updateFamily(selectedResolvedStyle.family, {
                          travel: {
                            ...selectedFamilyStyle.travel,
                            enabled: event.target.checked,
                          },
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  {selectedFamilyStyle.line.enabled && (
                    <>
                      <RangeControl
                        label="Grosor de conexión"
                        max={16}
                        min={0.25}
                        onChange={(value) =>
                          updateFamily(selectedResolvedStyle.family, {
                            line: {
                              ...selectedFamilyStyle.line,
                              width: value,
                            },
                          })
                        }
                        step={0.25}
                        suffix=" px"
                        value={selectedFamilyStyle.line.width}
                      />
                      <RangeControl
                        label="Opacidad de conexión"
                        max={1}
                        min={0}
                        onChange={(value) =>
                          updateFamily(selectedResolvedStyle.family, {
                            line: {
                              ...selectedFamilyStyle.line,
                              opacity: value,
                            },
                          })
                        }
                        step={0.05}
                        suffix=""
                        value={selectedFamilyStyle.line.opacity}
                      />
                    </>
                  )}
                  {selectedFamilyStyle.travel.enabled && (
                    <>
                      <RangeControl
                        label="Intensidad del viaje"
                        max={2}
                        min={0}
                        onChange={(value) =>
                          updateFamily(selectedResolvedStyle.family, {
                            travel: {
                              ...selectedFamilyStyle.travel,
                              intensity: value,
                            },
                          })
                        }
                        step={0.05}
                        suffix="×"
                        value={selectedFamilyStyle.travel.intensity}
                      />
                      <RangeControl
                        label="Zona magnética"
                        max={2}
                        min={0.5}
                        onChange={(value) =>
                          updateFamily(selectedResolvedStyle.family, {
                            travel: {
                              ...selectedFamilyStyle.travel,
                              magnetZone: value,
                            },
                          })
                        }
                        step={0.05}
                        suffix="×"
                        value={selectedFamilyStyle.travel.magnetZone}
                      />
                    </>
                  )}
                </section>
              )}
            </>
          )}

          {inspectorTab === 'sync' && (
            <>
              <section className="inspector-section sync-section">
                <div className="section-heading">
                  <span>
                    <small>TAP TEMPO</small>
                    <strong>Forma de onda</strong>
                  </span>
                </div>
                <p className="section-help">
                  Toca la onda para crear anclas, arrástralas para corregirlas o
                  captura pulsos en tiempo real.
                </p>
                <WaveformEditor
                  duration={transport.duration}
                  markers={syncAnchors}
                  onAdd={(audioTime) => addAnchorAtAudio(audioTime)}
                  onMove={(id, audioTime) =>
                    updateAnchor(id, 'audioTime', audioTime)
                  }
                  peaks={waveformPeaks}
                  playhead={transport.position}
                />
                <div className="tap-actions">
                  <button
                    className={tapActive ? 'text-action is-active' : 'text-action'}
                    disabled={!transport.hasAudio || !project}
                    onClick={tapActive ? stopTapTempo : startTapTempo}
                    type="button"
                  >
                    {tapActive ? 'Finalizar captura' : 'Iniciar tap tempo'}
                  </button>
                  <button
                    className="wide-action is-accent"
                    disabled={!tapActive}
                    onClick={registerTap}
                    type="button"
                  >
                    Pulso · Espacio
                  </button>
                </div>
              </section>

              <section className="inspector-section sync-section">
                <div className="section-heading">
                  <span>
                    <small>CALIBRACIÓN</small>
                    <strong>Nueva ancla</strong>
                  </span>
                  {anchorMidiDraft !== null && (
                    <button
                      className="text-action"
                      onClick={() => setAnchorMidiDraft(null)}
                      type="button"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
                <p className="section-help">
                  Pausa en un punto reconocible del audio y ajusta el instante
                  MIDI que debería verse allí.
                </p>
                <div className="sync-pair">
                  <span>
                    <small>AUDIO</small>
                    <strong>{formatTime(transport.position)}</strong>
                  </span>
                  <span className="sync-arrow">→</span>
                  <span>
                    <small>MIDI</small>
                    <strong>
                      {formatTime(anchorMidiDraft ?? activeMidiTime)}
                    </strong>
                  </span>
                </div>
                <input
                  className="sync-target-range"
                  disabled={!project}
                  max={project?.duration || 1}
                  min="0"
                  onChange={(event) =>
                    setAnchorDraft(Number(event.target.value))
                  }
                  step="0.01"
                  type="range"
                  value={anchorMidiDraft ?? activeMidiTime}
                />
                <div className="nudge-grid">
                  {[-0.1, -0.01, 0.01, 0.1].map((amount) => (
                    <button
                      disabled={!project}
                      key={amount}
                      onClick={() =>
                        setAnchorDraft(
                          (anchorMidiDraft ?? activeMidiTime) + amount,
                        )
                      }
                      type="button"
                    >
                      {amount > 0 ? '+' : ''}
                      {amount.toFixed(2)} s
                    </button>
                  ))}
                </div>
                <button
                  className="wide-action is-accent"
                  disabled={!project}
                  onClick={addAnchor}
                  type="button"
                >
                  <Icon name="plus" />
                  Guardar ancla
                </button>
              </section>

              <section className="inspector-section">
                <div className="section-heading">
                  <span>
                    <small>COMPATIBILIDAD V1</small>
                    <strong>Offset directo</strong>
                  </span>
                </div>
                <RangeControl
                  label="Audio offset"
                  max={5000}
                  min={-5000}
                  onChange={(value) =>
                    updateGlobalVisual('audioOffsetMs', value)
                  }
                  step={10}
                  suffix=" ms"
                  value={visualConfiguration.global.audioOffsetMs}
                />
              </section>

              <section className="inspector-section sync-section">
                <div className="section-heading">
                  <span>
                    <small>SINCRONIZACIÓN</small>
                    <strong>Anclas guardadas</strong>
                  </span>
                  <button
                    aria-label="Añadir ancla en la posición actual"
                    className="add-button"
                    disabled={!project}
                    onClick={addAnchor}
                    title="Añadir ancla en la posición actual"
                    type="button"
                  >
                    <Icon name="plus" />
                  </button>
                </div>
                {!syncMappingIsForward && (
                  <p className="sync-warning">
                    El tiempo MIDI debe avanzar entre anclas. Corrige los
                    valores para evitar que la imagen retroceda.
                  </p>
                )}
                {syncAnchors.length === 0 ? (
                  <button
                    className="empty-anchors"
                    disabled={!project}
                    onClick={addAnchor}
                    type="button"
                  >
                    <Icon name="plus" />
                    <span>
                      <strong>Crear primera ancla</strong>
                      <small>Usa la posición actual</small>
                    </span>
                  </button>
                ) : (
                  <div className="anchor-list">
                    {syncAnchors.map((anchor, index) => (
                      <div className="anchor-row" key={anchor.id}>
                        <span className="anchor-number">{index + 1}</span>
                        <label>
                          <span>Audio</span>
                          <input
                            min="0"
                            onChange={(event) =>
                              updateAnchor(
                                anchor.id,
                                'audioTime',
                                Number(event.target.value),
                              )
                            }
                            step="0.01"
                            type="number"
                            value={anchor.audioTime}
                          />
                        </label>
                        <label>
                          <span>MIDI</span>
                          <input
                            min="0"
                            onChange={(event) =>
                              updateAnchor(
                                anchor.id,
                                'midiTime',
                                Number(event.target.value),
                              )
                            }
                            step="0.01"
                            type="number"
                            value={anchor.midiTime}
                          />
                        </label>
                        <button
                          aria-label={`Eliminar ancla ${index + 1}`}
                          className="delete-button"
                          onClick={() =>
                            setSyncAnchors((current) =>
                              current.filter((item) => item.id !== anchor.id),
                            )
                          }
                          title="Eliminar ancla"
                          type="button"
                        >
                          <Icon name="trash" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
      {helpOpen && (
        <div
          aria-label="Ayuda de MIDI Stage"
          aria-modal="true"
          className="help-overlay"
          onClick={() => setHelpOpen(false)}
          role="dialog"
        >
          <div className="help-card" onClick={(event) => event.stopPropagation()}>
            <div className="section-heading">
              <span>
                <small>GUÍA RÁPIDA</small>
                <strong>Cómo trabajar en MIDI Stage</strong>
              </span>
              <button
                className="text-action"
                onClick={() => setHelpOpen(false)}
                type="button"
              >
                Cerrar
              </button>
            </div>
            <div className="help-grid">
              <section>
                <strong>1 · Archivos</strong>
                <p>
                  Carga el MIDI y, si quieres, un audio. Todo se procesa
                  localmente; el JSON sólo guarda ajustes y anclas.
                </p>
              </section>
              <section>
                <strong>2 · Pistas</strong>
                <p>
                  Usa Shift para un rango, Cmd/Ctrl para combinar y arrastra la
                  selección sobre una familia.
                </p>
              </section>
              <section>
                <strong>3 · Sincronía</strong>
                <p>
                  Añade anclas manuales o usa tap tempo. En la forma de onda,
                  toca para crear y arrastra para corregir.
                </p>
              </section>
              <section>
                <strong>4 · Rendimiento</strong>
                <p>
                  Calidad Auto adapta la resolución. Alta y Ultra conservan el
                  supersampling elegido; FPS fijo limita el ritmo del Worker.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
