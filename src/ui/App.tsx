import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react';
import type { MidiTrackInfo, PackedMidiProject } from '../core/midi/types';
import {
  DEFAULT_SETTINGS,
  createStateDocument,
  mapAudioToMidi,
  normalizeAnchors,
  parseStateDocument,
  type SyncAnchor,
  type VisualizationId,
  type VisualizationSettings,
} from '../core/state/visualizationState';
import {
  AudioTransport,
  type TransportSnapshot,
} from '../core/transport/AudioTransport';
import { RendererBridge } from '../renderer/RendererBridge';
import type { RenderTelemetry } from '../renderer/protocol';
import { Icon, type IconName } from './icons';

interface ProjectSummary {
  fileName: string;
  duration: number;
  noteCount: number;
  tracks: MidiTrackInfo[];
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
  const jsonInputRef = useRef<HTMLInputElement>(null);
  const anchorsRef = useRef<SyncAnchor[]>([]);
  const lastUiUpdateRef = useRef(0);

  const [project, setProject] = useState<ProjectSummary | null>(null);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const [visualization, setVisualization] =
    useState<VisualizationId>('now-line');
  const [settings, setSettings] =
    useState<VisualizationSettings>(DEFAULT_SETTINGS);
  const [syncAnchors, setSyncAnchors] = useState<SyncAnchor[]>([]);
  const [transport, setTransport] =
    useState<TransportSnapshot>(EMPTY_TRANSPORT);
  const [telemetry, setTelemetry] =
    useState<RenderTelemetry>(EMPTY_TELEMETRY);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [busy, setBusy] = useState<'midi' | 'audio' | null>(null);
  const [notice, setNotice] = useState(
    'Carga un MIDI para comenzar. El audio es opcional.',
  );
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    anchorsRef.current = syncAnchors;
  }, [syncAnchors]);

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
    let frame = 0;
    const update = (now: number) => {
      const instance = transportRef.current;
      if (instance) {
        const snapshot = instance.getSnapshot(now);
        const midiTime = mapAudioToMidi(
          snapshot.position,
          anchorsRef.current,
        );
        rendererRef.current?.setClock({
          midiTime,
          performanceTime: now,
          playing: snapshot.playing,
        });
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
    setBusy('midi');
    setNotice(`Analizando ${file.name}…`);
    try {
      const parsed = await parseMidiInWorker(file);
      const summary: ProjectSummary = {
        fileName: parsed.fileName,
        duration: parsed.duration,
        noteCount: parsed.noteCount,
        tracks: parsed.tracks,
      };
      rendererRef.current?.setProject(parsed);
      setProject(summary);
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
    setBusy('audio');
    setNotice(`Decodificando ${file.name} localmente…`);
    try {
      const duration = await transportRef.current.loadAudio(file);
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

  const loadDroppedFile = useCallback(
    (file: File) => {
      const lowerName = file.name.toLowerCase();
      if (lowerName.endsWith('.mid') || lowerName.endsWith('.midi')) {
        void loadMidi(file);
      } else if (file.type.startsWith('audio/')) {
        void loadAudio(file);
      } else {
        setNotice('Usa un archivo MIDI o un formato de audio compatible.');
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
      visualization,
      settings,
      syncAnchors,
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

  const addAnchor = () => {
    const audioTime = transport.position;
    const midiTime = mapAudioToMidi(audioTime, syncAnchors);
    setSyncAnchors((current) =>
      normalizeAnchors([
        ...current.filter(
          (anchor) => Math.abs(anchor.audioTime - audioTime) > 0.001,
        ),
        { id: createId(), audioTime, midiTime },
      ]),
    );
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
    () => mapAudioToMidi(transport.position, syncAnchors),
    [syncAnchors, transport.position],
  );
  const progress =
    transport.duration > 0 ? transport.position / transport.duration : 0;

  return (
    <main
      className="app-shell"
      data-left-collapsed={leftCollapsed}
      data-right-collapsed={rightCollapsed}
      onDragEnter={(event) => {
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
        </nav>
      </header>

      <aside className="left-panel panel-surface">
        <button
          aria-label={leftCollapsed ? 'Expandir visualizaciones' : 'Contraer visualizaciones'}
          className="collapse-button"
          onClick={() => setLeftCollapsed((value) => !value)}
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

        <div className="canvas-frame">
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
            aria-label={transport.playing ? 'Pausar' : 'Reproducir'}
            className="play-button"
            disabled={!project}
            onClick={() => void transportRef.current?.toggle()}
            title={transport.playing ? 'Pausar' : 'Reproducir'}
            type="button"
          >
            <Icon name={transport.playing ? 'pause' : 'play'} />
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
          onClick={() => setRightCollapsed((value) => !value)}
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

        <div className="panel-scroll">
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
              label="Resplandor"
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
              <label htmlFor="background-color">Fondo</label>
              <input
                aria-label="Color de fondo"
                id="background-color"
                onChange={(event) => updateSetting('background', event.target.value)}
                type="color"
                value={settings.background}
              />
            </div>
            <div className="segmented-control" role="group" aria-label="Calidad">
              {(['auto', 'high', 'ultra'] as const).map((quality) => (
                <button
                  aria-pressed={settings.quality === quality}
                  className={settings.quality === quality ? 'is-selected' : ''}
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

          <section className="inspector-section sync-section">
            <div className="section-heading">
              <span>
                <small>SINCRONIZACIÓN</small>
                <strong>Anclas</strong>
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
            <p className="section-help">
              Relaciona un instante del audio con otro del MIDI. Entre anclas,
              la app interpola la sincronía.
            </p>
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
      </aside>
    </main>
  );
}
