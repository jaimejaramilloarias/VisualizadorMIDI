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
  MAX_SCENE_GLOW,
  createSyncTimeline,
  createStateDocument,
  mapAudioToMidiClockWithOffset,
  normalizeAnchors,
  parseStateDocument,
  type SyncAnchor,
  type VisualizationSettings,
} from '../core/state/visualizationState';
import {
  FAMILY_NAMES,
  MAX_EFFECT_STRENGTH,
  SHAPE_IDS,
  SHAPE_LABELS,
  cloneDefaultVisualConfiguration,
  createDistinctFamilyColors,
  createRenderAppearance,
  resolveTrackVisualStyle,
  resolveTrackVisualStyleAtTime,
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
import { resolveTransportShortcut } from './transportShortcuts';
import { SyncWorkspace } from './SyncWorkspace';
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
  starting: false,
  hasAudio: false,
};

const EMPTY_TELEMETRY: RenderTelemetry = {
  fps: 0,
  frameP95: 0,
  visibleNotes: 0,
  renderWidth: 0,
  renderHeight: 0,
  scale: 1,
  displayFps: 60,
  targetFps: 60,
};

const formatTime = (seconds: number): string => {
  const safe = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const minutes = Math.floor(safe / 60);
  const remainder = Math.floor(safe % 60);
  const decimals = Math.floor((safe % 1) * 10);
  return `${minutes}:${String(remainder).padStart(2, '0')}.${decimals}`;
};

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLSelectElement ||
  target instanceof HTMLTextAreaElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const createId = (): string =>
  globalThis.crypto?.randomUUID?.() ??
  `anchor-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const MAX_MIDI_SIZE = 64 * 1024 * 1024;
const MAX_AUDIO_SIZE = 400 * 1024 * 1024;

type InspectorMenuId =
  | 'canvas'
  | 'performance'
  | 'tracks'
  | 'style'
  | 'animation'
  | 'sync';

const INSPECTOR_MENUS: ReadonlyArray<{
  id: InspectorMenuId;
  label: string;
  description: string;
  icon: IconName;
}> = [
  { id: 'canvas', label: 'Canvas', description: 'Fondo y formato', icon: 'canvas' },
  {
    id: 'performance',
    label: 'Rendimiento',
    description: 'Resolución y pantalla',
    icon: 'gauge',
  },
  { id: 'tracks', label: 'Voces', description: 'Pistas e instrumentos', icon: 'music' },
  {
    id: 'style',
    label: 'Color y forma',
    description: 'Aspecto por voz',
    icon: 'palette',
  },
  {
    id: 'animation',
    label: 'Animación',
    description: 'Movimiento por voz',
    icon: 'motion',
  },
  {
    id: 'sync',
    label: 'Sincronía',
    description: 'Editor visual de audio',
    icon: 'sync',
  },
];

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
  const stepText = String(step);
  const decimalPlaces =
    step >= 1 ? 0 : Math.min(3, stepText.split('.')[1]?.length ?? 0);
  const formattedValue = value.toFixed(decimalPlaces);
  return (
    <label className="range-control">
      <span className="control-label">
        <span>{label}</span>
        <output>
          {formattedValue}{suffix}
        </output>
      </span>
      <input
        aria-label={label}
        aria-valuetext={`${formattedValue}${suffix}`}
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
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const syncTimelineRef = useRef(createSyncTimeline([]));
  const visualConfigurationRef = useRef<VisualConfiguration>(
    cloneDefaultVisualConfiguration(),
  );
  const projectRef = useRef<ProjectSummary | null>(null);
  const anchorPreviewRef = useRef<number | null>(null);
  const selectionAnchorRef = useRef<string | null>(null);
  const lastTapRef = useRef<{ audioTime: number; midiTime: number } | null>(
    null,
  );
  const lastUiUpdateRef = useRef(0);
  const midiLoadGenerationRef = useRef(0);
  const audioLoadGenerationRef = useRef(0);
  const preserveNextMidiPaletteRef = useRef(false);
  const busyGenerationRef = useRef(0);
  const lastClockRef = useRef({
    sentAt: 0,
    midiTime: -1,
    playbackRate: 1,
    playing: false,
  });

  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [settings, setSettings] =
    useState<VisualizationSettings>(DEFAULT_SETTINGS);
  const [syncAnchors, setSyncAnchors] = useState<SyncAnchor[]>([]);
  const [visualConfiguration, setVisualConfiguration] =
    useState<VisualConfiguration>(() => cloneDefaultVisualConfiguration());
  const [anchorMidiDraft, setAnchorMidiDraft] = useState<number | null>(null);
  const [inspectorTab, setInspectorTab] =
    useState<InspectorMenuId>('style');
  const [selectedTrackName, setSelectedTrackName] = useState<string | null>(
    null,
  );
  const [selectedTrackNames, setSelectedTrackNames] = useState<string[]>([]);
  const [selectedAnimationFamily, setSelectedAnimationFamily] =
    useState<string | null>(null);
  const [voiceEditPoint, setVoiceEditPoint] = useState<number | null>(null);
  const [voiceEditScope, setVoiceEditScope] = useState<'start' | 'point'>(
    'start',
  );
  const [waveformPeaks, setWaveformPeaks] = useState<Float32Array | null>(null);
  const [tapActive, setTapActive] = useState(false);
  const [syncWorkspaceOpen, setSyncWorkspaceOpen] = useState(false);
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

  const clearAnchorPreview = useCallback(() => {
    anchorPreviewRef.current = null;
    setAnchorMidiDraft(null);
  }, []);

  const togglePlayback = useCallback(async () => {
    const instance = transportRef.current;
    if (!instance) return;
    const snapshot = instance.getSnapshot();
    if (!snapshot.playing && !snapshot.starting) clearAnchorPreview();
    try {
      await instance.toggle();
    } catch (error) {
      setNotice(
        error instanceof Error
          ? `No fue posible iniciar la reproducción: ${error.message}`
          : 'No fue posible iniciar la reproducción.',
      );
    }
  }, [clearAnchorPreview]);

  useEffect(() => {
    syncTimelineRef.current = createSyncTimeline(syncAnchors);
  }, [syncAnchors]);

  useEffect(() => {
    visualConfigurationRef.current = visualConfiguration;
  }, [visualConfiguration]);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

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
        onNoteSelect: (selection) => {
          const track = projectRef.current?.tracks[selection.trackIndex];
          if (!track) return;
          setSelectedTrackName(track.name);
          setSelectedTrackNames([track.name]);
          selectionAnchorRef.current = track.name;
          setVoiceEditPoint(selection.midiTime);
          setVoiceEditScope('point');
          setInspectorTab('style');
          setRightCollapsed(false);
          if (window.matchMedia('(max-width: 800px)').matches) {
            setLeftCollapsed(true);
          }
          setNotice(
            `${track.name} seleccionada en ${formatTime(selection.midiTime)}. Elige si el cambio aplica desde ahí o desde el inicio.`,
          );
        },
        onError: setNotice,
      });
      rendererRef.current = renderer;
      renderer.setSettings(settings);
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
    rendererRef.current?.setSettings(settings);
  }, [settings]);

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
    const onKeyDown = (event: KeyboardEvent) => {
      const shortcut = resolveTransportShortcut({
        code: event.code,
        key: event.key,
        repeat: event.repeat,
        modified: event.metaKey || event.ctrlKey || event.altKey,
        editing: isEditableTarget(event.target),
        tapActive,
      });
      const instance = transportRef.current;
      if (!shortcut || !instance || !projectRef.current) return;
      event.preventDefault();
      if (shortcut === 'toggle-playback') {
        void togglePlayback();
        return;
      }
      const snapshot = instance.getSnapshot();
      const offset = shortcut === 'seek-backward' ? -3 : 3;
      instance.seek(
        Math.min(snapshot.duration, Math.max(0, snapshot.position + offset)),
      );
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [tapActive, togglePlayback]);

  useEffect(() => {
    if (!helpOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHelpOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [helpOpen]);

  useEffect(() => {
    let frame = 0;
    const update = (now: number) => {
      const instance = transportRef.current;
      if (instance) {
        const snapshot = instance.getSnapshot(now);
        const preview = anchorPreviewRef.current;
        const mapping =
          preview === null
            ? mapAudioToMidiClockWithOffset(
                snapshot.position,
                visualConfigurationRef.current.global.audioOffsetMs,
                syncTimelineRef.current,
              )
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
            epochTime: performance.timeOrigin + now,
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
    const loadGeneration = ++midiLoadGenerationRef.current;
    const busyGeneration = ++busyGenerationRef.current;
    setBusy('midi');
    setNotice(`Analizando ${file.name}…`);
    try {
      const parsed = await parseMidiInWorker(file);
      if (loadGeneration !== midiLoadGenerationRef.current) return;
      const summary: ProjectSummary = {
        fileName: parsed.fileName,
        duration: parsed.duration,
        noteCount: parsed.noteCount,
        tracks: parsed.tracks,
        tempoMap: parsed.tempoMap,
      };
      rendererRef.current?.setProject(parsed);
      projectRef.current = summary;
      setProject(summary);
      setSelectedTrackName(summary.tracks[0]?.name ?? null);
      setSelectedTrackNames(
        summary.tracks[0]?.name ? [summary.tracks[0].name] : [],
      );
      setVoiceEditPoint(null);
      setVoiceEditScope('start');
      setSelectedAnimationFamily(null);
      selectionAnchorRef.current = summary.tracks[0]?.name ?? null;
      transportRef.current?.setMidiDuration(parsed.duration);
      transportRef.current?.seek(0);
      if (preserveNextMidiPaletteRef.current) {
        preserveNextMidiPaletteRef.current = false;
      } else {
        setVisualConfiguration((current) => {
          const familyNames = summary.tracks.map(
            (track) => resolveTrackVisualStyle(track, current).family,
          );
          const colors = createDistinctFamilyColors(familyNames);
          const families = { ...current.families };
          Object.entries(colors).forEach(([familyName, color]) => {
            if (!families[familyName]) return;
            families[familyName] = { ...families[familyName], color };
          });
          return { ...current, families };
        });
      }
      setNotice(
        `${parsed.noteCount.toLocaleString('es-CO')} notas listas en ${parsed.tracks.length} pistas.`,
      );
    } catch (error) {
      if (loadGeneration !== midiLoadGenerationRef.current) return;
      setNotice(
        error instanceof Error ? error.message : 'No fue posible cargar el MIDI.',
      );
    } finally {
      if (busyGeneration === busyGenerationRef.current) setBusy(null);
    }
  }, []);

  const loadAudio = useCallback(async (file: File) => {
    if (!transportRef.current) return;
    if (file.size > MAX_AUDIO_SIZE) {
      setNotice('El audio supera el límite seguro de 400 MB para este dispositivo.');
      return;
    }
    const loadGeneration = ++audioLoadGenerationRef.current;
    const busyGeneration = ++busyGenerationRef.current;
    setBusy('audio');
    setWaveformPeaks(null);
    setAudioFileName(null);
    setNotice(`Decodificando ${file.name} localmente…`);
    try {
      const duration = await transportRef.current.loadAudio(file);
      if (loadGeneration !== audioLoadGenerationRef.current) return;
      setWaveformPeaks(transportRef.current.getWaveformPeaks(12_000));
      setAudioFileName(file.name);
      setNotice(
        `Audio listo (${formatTime(duration)}). El archivo permanece en este dispositivo.`,
      );
    } catch (error) {
      if (loadGeneration !== audioLoadGenerationRef.current) return;
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setNotice(
        error instanceof Error
          ? `No fue posible abrir el audio: ${error.message}`
          : 'No fue posible abrir el audio.',
      );
    } finally {
      if (busyGeneration === busyGenerationRef.current) setBusy(null);
    }
  }, []);

  const loadDroppedFile = useCallback(
    (file: File) => {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.mid') || lowerName.endsWith('.midi')) {
        void loadMidi(file);
      } else if (file.type.startsWith('audio/')) {
        void loadAudio(file);
      } else {
        setNotice('Usa un archivo MIDI o audio compatible.');
      }
    },
    [loadAudio, loadMidi],
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
      visualization: 'now-line',
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
      setSettings(document.settings);
      setSyncAnchors(document.syncAnchors);
      setVisualConfiguration(document.visualConfiguration);
      preserveNextMidiPaletteRef.current = true;
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
      mapAudioToMidiClockWithOffset(
        audioTime,
        visualConfiguration.global.audioOffsetMs,
        createSyncTimeline(syncAnchors),
      ).midiTime;
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
      : mapAudioToMidiClockWithOffset(
          audioTime,
          visualConfigurationRef.current.global.audioOffsetMs,
          syncTimelineRef.current,
        ).midiTime;
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
    clearAnchorPreview();
    setNotice('Tap tempo activo: pulsa el botón o la barra espaciadora.');
    if (!transport.playing) {
      void transportRef.current?.play().catch((error) => {
        setNotice(
          error instanceof Error
            ? `No fue posible iniciar el audio: ${error.message}`
            : 'No fue posible iniciar el audio.',
        );
      });
    }
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

  const updateInstrumentAppearanceFromStart = (
    trackName: string,
    updates: Pick<
      InstrumentVisualStyle,
      'color' | 'secondaryColor' | 'shape'
    >,
  ) => {
    setVisualConfiguration((current) => {
      const existing = current.instruments[trackName] ?? {};
      const cues = (existing.cues ?? [])
        .map((cue) => {
          const next = { ...cue };
          if (updates.color !== undefined) delete next.color;
          if (updates.secondaryColor !== undefined) delete next.secondaryColor;
          if (updates.shape !== undefined) delete next.shape;
          return next;
        })
        .filter(
          (cue) =>
            cue.color !== undefined ||
            cue.secondaryColor !== undefined ||
            cue.shape !== undefined,
        );
      return {
        ...current,
        instruments: {
          ...current.instruments,
          [trackName]: {
            ...existing,
            ...updates,
            ...(cues.length > 0 ? { cues } : { cues: undefined }),
          },
        },
      };
    });
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

  const updateSelectedAppearance = (
    updates: Pick<
      InstrumentVisualStyle,
      'color' | 'secondaryColor' | 'shape'
    >,
  ) => {
    const names =
      selectedTrackNames.length > 0
        ? selectedTrackNames
        : selectedTrackName
          ? [selectedTrackName]
          : [];
    if (
      voiceEditScope !== 'point' ||
      voiceEditPoint === null ||
      names.length === 0
    ) {
      setVisualConfiguration((current) => {
        const instruments = { ...current.instruments };
        names.forEach((name) => {
          const existing = instruments[name] ?? {};
          const cues = (existing.cues ?? [])
            .map((cue) => {
              const next = { ...cue };
              if (updates.color !== undefined) delete next.color;
              if (updates.secondaryColor !== undefined) {
                delete next.secondaryColor;
              }
              if (updates.shape !== undefined) delete next.shape;
              return next;
            })
            .filter(
              (cue) =>
                cue.color !== undefined ||
                cue.secondaryColor !== undefined ||
                cue.shape !== undefined,
            );
          instruments[name] = {
            ...existing,
            ...updates,
            ...(cues.length > 0 ? { cues } : { cues: undefined }),
          };
        });
        return { ...current, instruments };
      });
      return;
    }

    setVisualConfiguration((current) => {
      const instruments = { ...current.instruments };
      names.forEach((name) => {
        const existing = instruments[name] ?? {};
        const cues = [...(existing.cues ?? [])];
        const cueIndex = cues.findIndex(
          (cue) => Math.abs(cue.at - voiceEditPoint) < 0.001,
        );
        if (cueIndex >= 0) {
          cues[cueIndex] = { ...cues[cueIndex], ...updates };
        } else {
          cues.push({ at: voiceEditPoint, ...updates });
        }
        cues.sort((left, right) => left.at - right.at);
        instruments[name] = { ...existing, cues };
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
    setVoiceEditPoint(null);
    setVoiceEditScope('start');
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

  const syncTimeline = useMemo(
    () => createSyncTimeline(syncAnchors),
    [syncAnchors],
  );
  const activeMidiTime = useMemo(
    () =>
      mapAudioToMidiClockWithOffset(
        transport.position,
        visualConfiguration.global.audioOffsetMs,
        syncTimeline,
      ).midiTime,
    [
      syncTimeline,
      transport.position,
      visualConfiguration.global.audioOffsetMs,
    ],
  );
  const syncMappingIsForward = syncTimeline.forward;
  const selectedTrack =
    project?.tracks.find((track) => track.name === selectedTrackName) ?? null;
  const selectedResolvedStyle = selectedTrack
    ? voiceEditPoint === null
      ? resolveTrackVisualStyle(selectedTrack, visualConfiguration)
      : resolveTrackVisualStyleAtTime(
          selectedTrack,
          visualConfiguration,
          voiceEditPoint,
        )
    : null;
  const projectAnimationFamilies = useMemo(
    () =>
      project
        ? [
            ...new Set(
              project.tracks.map(
                (track) =>
                  resolveTrackVisualStyle(track, visualConfiguration).family,
              ),
            ),
          ]
        : [],
    [project, visualConfiguration],
  );
  const activeAnimationFamily =
    selectedAnimationFamily &&
    projectAnimationFamilies.includes(selectedAnimationFamily)
      ? selectedAnimationFamily
      : (projectAnimationFamilies[0] ?? null);
  const selectedFamilyStyle = activeAnimationFamily
    ? visualConfiguration.families[activeAnimationFamily]
    : null;
  const hasAnyNoteLabels =
    visualConfiguration.global.noteLabels.enabled ||
    Object.values(visualConfiguration.instruments).some(
      (instrument) => instrument.noteLabelsEnabled === true,
    );
  const progress =
    transport.duration > 0 ? transport.position / transport.duration : 0;
  const activeMenu =
    INSPECTOR_MENUS.find((menu) => menu.id === inspectorTab) ??
    INSPECTOR_MENUS[0];

  return (
    <main
      className="app-shell"
      data-inspector-tab={inspectorTab}
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
        aria-hidden="true"
        className="visually-hidden"
        onChange={onFileInput((file) => void loadMidi(file))}
        ref={midiInputRef}
        tabIndex={-1}
        type="file"
      />
      <input
        accept="audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac"
        aria-hidden="true"
        className="visually-hidden"
        onChange={onFileInput((file) => void loadAudio(file))}
        ref={audioInputRef}
        tabIndex={-1}
        type="file"
      />
      <input
        accept=".json,application/json"
        aria-hidden="true"
        className="visually-hidden"
        onChange={onFileInput((file) => void importState(file))}
        ref={jsonInputRef}
        tabIndex={-1}
        type="file"
      />

      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">
            <Icon name="sparkles" />
          </span>
          <span className="brand-copy">
            <strong>MIDI STAGE V2</strong>
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
          aria-label={leftCollapsed ? 'Expandir menús' : 'Contraer menús'}
          className="collapse-button"
          onClick={() => {
            setLeftCollapsed((value) => {
              if (value && window.matchMedia('(max-width: 800px)').matches) {
                setRightCollapsed(true);
              }
              return !value;
            });
          }}
          title={leftCollapsed ? 'Expandir menús' : 'Contraer menús'}
          type="button"
        >
          <Icon name={leftCollapsed ? 'chevron-right' : 'chevron-left'} />
        </button>
        <div className="panel-heading">
          <Icon name="settings" />
          <span>
            <small>MENÚ</small>
            <strong>Controles</strong>
          </span>
        </div>
        <div className="menu-list">
          {INSPECTOR_MENUS.map((menu) => (
            <button
              aria-pressed={
                menu.id === 'sync'
                  ? syncWorkspaceOpen
                  : inspectorTab === menu.id
              }
              className={`menu-card${
                menu.id === 'sync'
                  ? syncWorkspaceOpen
                    ? ' is-selected'
                    : ''
                  : inspectorTab === menu.id
                    ? ' is-selected'
                    : ''
              }`}
              key={menu.id}
              onClick={() => {
                if (menu.id === 'sync') {
                  setSyncWorkspaceOpen(true);
                  if (window.matchMedia('(max-width: 800px)').matches) {
                    setLeftCollapsed(true);
                    setRightCollapsed(true);
                  }
                  return;
                }
                setInspectorTab(menu.id);
                setRightCollapsed(false);
                if (window.matchMedia('(max-width: 800px)').matches) {
                  setLeftCollapsed(true);
                }
              }}
              title={`${menu.label} · ${menu.description}`}
              type="button"
            >
              <span className="menu-icon">
                <Icon name={menu.icon} />
              </span>
              <span className="menu-copy">
                <strong>{menu.label}</strong>
                <small>{menu.description}</small>
              </span>
            </button>
          ))}
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
            <span>
              {telemetry.fps || '—'} / {telemetry.targetFps} FPS
            </span>
            <span>{telemetry.visibleNotes.toLocaleString('es-CO')} visibles</span>
            <span>{telemetry.scale.toFixed(1)}×</span>
          </div>
        </div>

        <div
          className="canvas-frame"
          data-aspect-ratio={visualConfiguration.global.aspectRatio}
        >
          <canvas
            aria-label="Visualización MIDI interactiva"
            onClick={(event) => {
              const bounds = event.currentTarget.getBoundingClientRect();
              rendererRef.current?.hitTest(
                event.clientX - bounds.left,
                event.clientY - bounds.top,
              );
            }}
            ref={canvasRef}
          />
          {inspectorTab === 'sync' && (
            <section
              aria-label="Inspector horizontal de sincronía"
              className="sync-canvas-panel"
            >
              <header className="sync-canvas-panel-header">
                <span>
                  <Icon name="sync" />
                  <strong>Sincronía</strong>
                  <small>Panel horizontal · ⅓ del canvas</small>
                </span>
                <button
                  className="text-action"
                  onClick={() => {
                    setInspectorTab('style');
                    setRightCollapsed(false);
                  }}
                  type="button"
                >
                  Cerrar
                </button>
              </header>
              <div className="sync-canvas-grid">
                <section className="sync-dock-card sync-dock-waveform">
                  <div className="section-heading">
                    <span>
                      <small>TAP TEMPO</small>
                      <strong>Forma de onda</strong>
                    </span>
                  </div>
                  <WaveformEditor
                    audioDuration={transport.duration}
                    interactionMode="anchors"
                    landmarks={[]}
                    magnetEnabled={false}
                    markers={syncAnchors}
                    midiDuration={project?.duration ?? transport.duration}
                    onAdd={(audioTime) => addAnchorAtAudio(audioTime)}
                    onDelete={(id) =>
                      setSyncAnchors((current) =>
                        current.filter((anchor) => anchor.id !== id),
                      )
                    }
                    onMove={updateAnchor}
                    onPan={() => undefined}
                    onSelect={() => undefined}
                    onZoom={() => undefined}
                    peaks={waveformPeaks}
                    playhead={transport.position}
                    selectedAnchorId={null}
                    viewDuration={Math.max(0.001, transport.duration)}
                    viewStart={0}
                  />
                  <div className="tap-actions">
                    <button
                      className={
                        tapActive ? 'text-action is-active' : 'text-action'
                      }
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

                <section className="sync-dock-card">
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

                <section className="sync-dock-card">
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
                      El tiempo MIDI debe avanzar entre anclas.
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
              </div>
            </section>
          )}
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
            onClick={() => void togglePlayback()}
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
          <Icon name={activeMenu.icon} />
          <span>
            <small>INSPECTOR</small>
            <strong>{activeMenu.label}</strong>
          </span>
        </div>

        <div className="panel-scroll">
          {inspectorTab === 'style' && (
            <section className="inspector-section">
              <div className="section-heading">
                <span>
                  <small>CONTROLES PRINCIPALES</small>
                  <strong>Voz, figura y color</strong>
                </span>
                {selectedTrack && (
                  <button
                    className="text-action"
                    onClick={resetSelectedInstruments}
                    type="button"
                  >
                    Restablecer
                  </button>
                )}
              </div>
              <label className="select-control">
                <span>Voz o instrumento</span>
                <select
                  disabled={!project}
                  onChange={(event) => {
                    const name = event.target.value;
                    setSelectedTrackName(name);
                    setSelectedTrackNames(name ? [name] : []);
                    setVoiceEditPoint(null);
                    setVoiceEditScope('start');
                  }}
                  value={selectedTrackName ?? ''}
                >
                  {!project && <option value="">Carga un MIDI</option>}
                  {project?.tracks.map((track) => (
                    <option key={track.id} value={track.name}>
                      {track.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedTrack && selectedResolvedStyle && (
                <>
                  {voiceEditPoint !== null && (
                    <div className="voice-edit-scope">
                      <span>
                        Nota elegida en <strong>{formatTime(voiceEditPoint)}</strong>
                      </span>
                      <div
                        aria-label="Alcance de edición visual"
                        className="segmented-control"
                        role="group"
                      >
                        <button
                          aria-pressed={voiceEditScope === 'start'}
                          className={
                            voiceEditScope === 'start' ? 'is-selected' : ''
                          }
                          onClick={() => setVoiceEditScope('start')}
                          type="button"
                        >
                          Desde el inicio
                        </button>
                        <button
                          aria-pressed={voiceEditScope === 'point'}
                          className={
                            voiceEditScope === 'point' ? 'is-selected' : ''
                          }
                          onClick={() => setVoiceEditScope('point')}
                          type="button"
                        >
                          Desde este punto
                        </button>
                      </div>
                    </div>
                  )}
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
                        updateSelectedAppearance({
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
                      <span>Color principal</span>
                      <input
                        aria-label="Color principal"
                        onChange={(event) =>
                          updateSelectedAppearance({
                            color: event.target.value,
                          })
                        }
                        type="color"
                        value={selectedResolvedStyle.color}
                      />
                    </label>
                    <label>
                      <span>Color secundario</span>
                      <input
                        aria-label="Color secundario"
                        onChange={(event) =>
                          updateSelectedAppearance({
                            secondaryColor: event.target.value,
                          })
                        }
                        type="color"
                        value={selectedResolvedStyle.secondaryColor}
                      />
                    </label>
                  </div>
                  <label className="switch-row">
                    <span>Etiquetas en la selección</span>
                    <input
                      checked={selectedResolvedStyle.noteLabelsEnabled}
                      onChange={(event) =>
                        updateSelectedInstruments({
                          noteLabelsEnabled: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                </>
              )}
            </section>
          )}

          {(['canvas', 'performance', 'animation', 'style'] as InspectorMenuId[]).includes(
            inspectorTab,
          ) && (
            <>
              {inspectorTab !== 'style' && (
                <section className="inspector-section">
                <div className="section-heading">
                  <span>
                    <small>{activeMenu.description.toUpperCase()}</small>
                    <strong>{activeMenu.label}</strong>
                  </span>
                </div>
                {inspectorTab === 'animation' && (
                  <>
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
                  max={MAX_SCENE_GLOW}
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
                  </>
                )}
                {inspectorTab === 'canvas' && (
                  <>
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
                  onClick={() => updateSetting('background', '#000000')}
                  type="button"
                >
                  Negro absoluto
                </button>
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
                  </>
                )}
                {inspectorTab === 'performance' && (
                  <>
                <div className="performance-status">
                  <span>
                    <small>PANTALLA</small>
                    <strong>{telemetry.displayFps} Hz</strong>
                  </span>
                  <span>
                    <small>RENDER</small>
                    <strong>{telemetry.fps || '—'} FPS</strong>
                  </span>
                  <span>
                    <small>OBJETIVO</small>
                    <strong>{telemetry.targetFps} FPS</strong>
                  </span>
                </div>
                <p className="section-help">
                  Auto sigue la frecuencia real de la pantalla. Los modos 60 y
                  30 mantienen una cadencia fija cuando prefieres limitar carga.
                </p>
                <span className="subcontrol-label">FPS</span>
                <div
                  className="segmented-control"
                  role="group"
                  aria-label="Fotogramas por segundo"
                >
                  {(['auto', '60', '30'] as const).map((fpsMode) => (
                    <button
                      aria-pressed={
                        visualConfiguration.global.fpsMode === fpsMode
                      }
                      className={
                        visualConfiguration.global.fpsMode === fpsMode
                          ? 'is-selected'
                          : ''
                      }
                      key={fpsMode}
                      onClick={() => updateGlobalVisual('fpsMode', fpsMode)}
                      type="button"
                    >
                      {fpsMode === 'auto' ? 'Auto' : fpsMode}
                    </button>
                  ))}
                </div>
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
                        ? 'Adaptativa'
                        : quality === 'high'
                          ? 'Alta'
                          : 'Máxima'}
                    </button>
                  ))}
                </div>
                  </>
                )}
                </section>
              )}

              <section className="inspector-section">
                <div className="section-heading">
                  <span>
                    <small>AJUSTES DETALLADOS</small>
                    <strong>{activeMenu.label}</strong>
                  </span>
                </div>
                {inspectorTab === 'animation' && (
                  <>
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
                  </>
                )}
                {inspectorTab === 'style' && (
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
                )}
                {inspectorTab === 'animation' && (
                  <>
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
                  max={MAX_EFFECT_STRENGTH}
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
                  max={MAX_EFFECT_STRENGTH}
                  min={0}
                  onChange={(value) =>
                    updateGlobalVisual('bumpStrength', value)
                  }
                  step={0.1}
                  suffix="×"
                  value={visualConfiguration.global.bumpStrength}
                />
                <p className="section-help">
                  Glow y bump comienzan en el Note On: el primero produce un
                  destello breve y el segundo un rebote rápido de tamaño. Nunca
                  se anticipan al ataque.
                </p>
                  </>
                )}
                {inspectorTab === 'performance' && (
                  <>
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
                <div className="resolution-readout">
                  <span>Resolución interna</span>
                  <strong>
                    {telemetry.renderWidth || '—'} × {telemetry.renderHeight || '—'}
                  </strong>
                  <small>P95 de cuadro: {telemetry.frameP95 || '—'} ms</small>
                  <small>Escala Retina: {telemetry.scale.toFixed(2)}×</small>
                </div>
                  </>
                )}
                {inspectorTab === 'style' && (
                  <>
                <label className="switch-row">
                  <span>Etiquetas en todas las voces</span>
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
                {hasAnyNoteLabels && (
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
                    <div className="inline-control">
                      <label htmlFor="label-background">
                        Fondo del recuadro
                      </label>
                      <input
                        id="label-background"
                        onChange={(event) =>
                          updateGlobalVisual('noteLabels', {
                            ...visualConfiguration.global.noteLabels,
                            backgroundColor: event.target.value,
                          })
                        }
                        type="color"
                        value={
                          visualConfiguration.global.noteLabels.backgroundColor
                        }
                      />
                    </div>
                    <RangeControl
                      label="Tamaño de fuente"
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
                    <RangeControl
                      label="Margen dinámico del recuadro"
                      max={24}
                      min={0}
                      onChange={(value) =>
                        updateGlobalVisual('noteLabels', {
                          ...visualConfiguration.global.noteLabels,
                          padding: value,
                        })
                      }
                      step={1}
                      suffix=" px"
                      value={visualConfiguration.global.noteLabels.padding}
                    />
                    <RangeControl
                      label="Opacidad del recuadro"
                      max={1}
                      min={0}
                      onChange={(value) =>
                        updateGlobalVisual('noteLabels', {
                          ...visualConfiguration.global.noteLabels,
                          backgroundOpacity: value,
                        })
                      }
                      step={0.05}
                      suffix=""
                      value={
                        visualConfiguration.global.noteLabels.backgroundOpacity
                      }
                    />
                    <RangeControl
                      label="Redondeo del recuadro"
                      max={24}
                      min={0}
                      onChange={(value) =>
                        updateGlobalVisual('noteLabels', {
                          ...visualConfiguration.global.noteLabels,
                          borderRadius: value,
                        })
                      }
                      step={1}
                      suffix=" px"
                      value={
                        visualConfiguration.global.noteLabels.borderRadius
                      }
                    />
                  </>
                )}
                  </>
                )}
              </section>
            </>
          )}

          {inspectorTab === 'tracks' && (
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
                          <div
                            className={
                              selectedTrackNames.includes(track.name)
                                ? 'track-row is-selected'
                                : 'track-row'
                            }
                            key={track.id}
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
                            <button
                              className="track-select-button"
                              draggable
                              onClick={(event) =>
                                selectTrack(track.name, event)
                              }
                              onDragStart={(event) =>
                                beginTrackDrag(track.name, event)
                              }
                              type="button"
                            >
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
                            <label className="track-shape-control">
                              <span className="visually-hidden">
                                Figura de {track.name}
                              </span>
                              <select
                                aria-label={`Figura de ${track.name}`}
                                onChange={(event) =>
                                  updateInstrumentAppearanceFromStart(track.name, {
                                    shape: event.target
                                      .value as (typeof SHAPE_IDS)[number],
                                  })
                                }
                                onClick={(event) => event.stopPropagation()}
                                title={`Figura de ${track.name}`}
                                value={trackStyle.shape}
                              >
                                {SHAPE_IDS.map((shapeId) => (
                                  <option key={shapeId} value={shapeId}>
                                    {SHAPE_LABELS[shapeId]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="track-color-control">
                              <span className="visually-hidden">
                                Color de {track.name}
                              </span>
                              <input
                                aria-label={`Color de ${track.name}`}
                                onChange={(event) =>
                                  updateInstrumentAppearanceFromStart(track.name, {
                                    color: event.target.value,
                                  })
                                }
                                onClick={(event) => event.stopPropagation()}
                                title={`Color de ${track.name}`}
                                type="color"
                                value={trackStyle.color}
                              />
                            </label>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </section>
            </>
          )}

          {inspectorTab === 'style' && (
            <>
              {selectedTrack && selectedResolvedStyle && (
                <section className="inspector-section">
                  <div className="section-heading">
                    <span>
                      <small>OPCIONES AVANZADAS</small>
                      <strong>
                        {selectedTrackNames.length > 1
                          ? `${selectedTrackNames.length} pistas`
                          : selectedTrack.name}
                      </strong>
                    </span>
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
            </>
          )}

          {inspectorTab === 'animation' && (
            <>
              <section className="inspector-section">
                <label className="select-control">
                  <span>Familia de instrumentos</span>
                  <select
                    disabled={!project}
                    onChange={(event) =>
                      setSelectedAnimationFamily(event.target.value || null)
                    }
                    value={activeAnimationFamily ?? ''}
                  >
                    {!project && <option value="">Carga un MIDI</option>}
                    {projectAnimationFamilies.map((familyName) => (
                      <option key={familyName} value={familyName}>
                        {familyName} ·{' '}
                        {
                          project?.tracks.filter(
                            (track) =>
                              resolveTrackVisualStyle(
                                track,
                                visualConfiguration,
                              ).family === familyName,
                          ).length
                        }{' '}
                        pista(s)
                      </option>
                    ))}
                  </select>
                </label>
              </section>
              {activeAnimationFamily && selectedFamilyStyle && (
                <section className="inspector-section">
                  <div className="section-heading">
                    <span>
                      <small>AJUSTE POR FAMILIA</small>
                      <strong>{activeAnimationFamily}</strong>
                    </span>
                  </div>
                  <RangeControl
                    label="Altura de familia"
                    max={4}
                    min={0.2}
                    onChange={(value) =>
                      updateFamily(activeAnimationFamily, {
                        heightScale: value,
                      })
                    }
                    step={0.1}
                    suffix="×"
                    value={selectedFamilyStyle.heightScale}
                  />
                  <RangeControl
                    label="Glow de familia"
                    max={MAX_EFFECT_STRENGTH}
                    min={0}
                    onChange={(value) =>
                      updateFamily(activeAnimationFamily, {
                        glowStrength: value,
                      })
                    }
                    step={0.1}
                    suffix="×"
                    value={selectedFamilyStyle.glowStrength}
                  />
                  <RangeControl
                    label="Bump de familia"
                    max={MAX_EFFECT_STRENGTH}
                    min={0}
                    onChange={(value) =>
                      updateFamily(activeAnimationFamily, {
                        bumpStrength: value,
                      })
                    }
                    step={0.1}
                    suffix="×"
                    value={selectedFamilyStyle.bumpStrength}
                  />
                  <label className="switch-row">
                    <span>Extensión de familia</span>
                    <input
                      checked={selectedFamilyStyle.extension}
                      onChange={(event) =>
                        updateFamily(activeAnimationFamily, {
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
                        updateFamily(activeAnimationFamily, {
                          stretch: event.target.checked,
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  <label className="switch-row">
                    <span>Atracción hacia NOW</span>
                    <input
                      checked={selectedFamilyStyle.travel.enabled}
                      onChange={(event) =>
                        updateFamily(activeAnimationFamily, {
                          travel: {
                            ...selectedFamilyStyle.travel,
                            enabled: event.target.checked,
                          },
                        })
                      }
                      type="checkbox"
                    />
                  </label>
                  {selectedFamilyStyle.travel.enabled && (
                    <>
                      <RangeControl
                        label="Intensidad magnética"
                        max={2}
                        min={0}
                        onChange={(value) =>
                          updateFamily(activeAnimationFamily, {
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
                        label="Zona de aceleración"
                        max={2}
                        min={0.5}
                        onChange={(value) =>
                          updateFamily(activeAnimationFamily, {
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

          {inspectorTab === 'sync' && !rightCollapsed && (
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
                  audioDuration={transport.duration}
                  interactionMode="anchors"
                  landmarks={[]}
                  magnetEnabled={false}
                  markers={syncAnchors}
                  midiDuration={project?.duration ?? transport.duration}
                  onAdd={(audioTime) => addAnchorAtAudio(audioTime)}
                  onDelete={(id) =>
                    setSyncAnchors((current) =>
                      current.filter((anchor) => anchor.id !== id),
                    )
                  }
                  onMove={updateAnchor}
                  onPan={() => undefined}
                  onSelect={() => undefined}
                  onZoom={() => undefined}
                  peaks={waveformPeaks}
                  playhead={transport.position}
                  selectedAnchorId={null}
                  viewDuration={Math.max(0.001, transport.duration)}
                  viewStart={0}
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
      {syncWorkspaceOpen && (
        <SyncWorkspace
          activeMidiTime={activeMidiTime}
          anchors={syncAnchors}
          audioFileName={audioFileName}
          forward={syncMappingIsForward}
          midiDuration={project?.duration ?? 0}
          midiFileName={project?.fileName ?? null}
          offsetMs={visualConfiguration.global.audioOffsetMs}
          onAddAnchor={(audioTime) => addAnchorAtAudio(audioTime)}
          onClearAnchors={() => {
            setSyncAnchors([]);
            lastTapRef.current = null;
            setTapActive(false);
            clearAnchorPreview();
            setNotice('Todas las anclas fueron eliminadas.');
          }}
          onClose={() => setSyncWorkspaceOpen(false)}
          onDeleteAnchor={(id) =>
            setSyncAnchors((current) =>
              current.filter((anchor) => anchor.id !== id),
            )
          }
          onMoveAnchor={updateAnchor}
          onOffsetChange={(value) =>
            updateGlobalVisual('audioOffsetMs', value)
          }
          onRegisterTap={registerTap}
          onSeek={(time) => {
            clearAnchorPreview();
            transportRef.current?.seek(time);
          }}
          onTapToggle={tapActive ? stopTapTempo : startTapTempo}
          onTogglePlayback={() => void togglePlayback()}
          peaks={waveformPeaks}
          tapActive={tapActive}
          transport={transport}
        />
      )}
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
                  selección sobre una familia. También puedes tocar una nota
                  del canvas para editar esa voz desde el inicio o desde allí.
                </p>
              </section>
              <section>
                <strong>3 · Sincronía</strong>
                <p>
                  Abre el editor a pantalla completa. Arrastra los círculos de
                  audio y los rombos MIDI, navega con zoom o usa tap tempo. El
                  magnetismo aproxima las anclas a ataques claros del audio.
                </p>
              </section>
              <section>
                <strong>4 · Rendimiento</strong>
                <p>
                  Los FPS siguen la frecuencia real de la pantalla. La calidad
                  Adaptativa protege esa cadencia; también puedes fijar 60 o 30.
                </p>
              </section>
              <section>
                <strong>5 · Transporte</strong>
                <p>
                  Espacio reproduce o pausa. Las flechas izquierda y derecha
                  retroceden o avanzan tres segundos sin interferir con campos.
                </p>
              </section>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
