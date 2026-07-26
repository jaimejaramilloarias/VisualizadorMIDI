import {
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { SyncAnchor } from '../core/state/visualizationState';
import type { TransportSnapshot } from '../core/transport/AudioTransport';
import { Icon } from './icons';
import {
  detectAudioLandmarks,
  resolveSyncViewport,
} from './syncEditorMath';
import { WaveformEditor } from './WaveformEditor';

type AnchorField = 'audioTime' | 'midiTime';
type InteractionMode = 'anchors' | 'pan';

interface SyncWorkspaceProps {
  activeMidiTime: number;
  anchors: SyncAnchor[];
  audioFileName: string | null;
  forward: boolean;
  midiDuration: number;
  midiFileName: string | null;
  offsetMs: number;
  onAddAnchor: (audioTime: number) => void;
  onClearAnchors: () => void;
  onClose: () => void;
  onDeleteAnchor: (id: string) => void;
  onMoveAnchor: (id: string, field: AnchorField, value: number) => void;
  onOffsetChange: (value: number) => void;
  onRegisterTap: () => void;
  onSeek: (time: number) => void;
  onTapToggle: () => void;
  onTogglePlayback: () => void;
  peaks: Float32Array | null;
  tapActive: boolean;
  transport: TransportSnapshot;
}

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
};

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const OffsetControl = ({
  offsetMs,
  onChange,
}: {
  offsetMs: number;
  onChange: (value: number) => void;
}) => {
  const description =
    offsetMs < 0
      ? `La animación espera ${Math.abs(offsetMs / 1000).toFixed(2)} s después de iniciar el audio.`
      : offsetMs > 0
        ? `La animación comienza ${Math.abs(offsetMs / 1000).toFixed(2)} s adelantada respecto al audio.`
        : 'Audio y animación comienzan juntos.';
  return (
    <section className="sync-offset-card">
      <div>
        <small>DESFASE INICIAL</small>
        <strong>Offset de animación</strong>
        <p>{description}</p>
      </div>
      <div className="sync-offset-control">
        <button
          aria-label="Reducir offset 10 milisegundos"
          onClick={() => onChange(clamp(offsetMs - 10, -10_000, 10_000))}
          type="button"
        >
          −
        </button>
        <label>
          <span>{offsetMs > 0 ? '+' : ''}{offsetMs} ms</span>
          <input
            aria-label="Offset de animación respecto al audio"
            max="10000"
            min="-10000"
            onChange={(event) => onChange(Number(event.target.value))}
            step="10"
            type="range"
            value={offsetMs}
          />
        </label>
        <button
          aria-label="Aumentar offset 10 milisegundos"
          onClick={() => onChange(clamp(offsetMs + 10, -10_000, 10_000))}
          type="button"
        >
          +
        </button>
        <button className="sync-offset-reset" onClick={() => onChange(0)} type="button">
          Volver a 0
        </button>
      </div>
    </section>
  );
};

const AnchorSelection = ({
  anchors,
  selectedId,
  setSelectedId,
  onDelete,
  onMove,
}: {
  anchors: SyncAnchor[];
  selectedId: string | null;
  setSelectedId: Dispatch<SetStateAction<string | null>>;
  onDelete: (id: string) => void;
  onMove: (id: string, field: AnchorField, value: number) => void;
}) => {
  const selected = anchors.find((anchor) => anchor.id === selectedId) ?? null;
  if (!selected) {
    return (
      <div className="sync-selection-empty">
        Selecciona una ancla para desplazar por separado su punto de audio o su
        punto MIDI.
      </div>
    );
  }
  const index = anchors.findIndex((anchor) => anchor.id === selected.id);
  const nudge = (field: AnchorField, amount: number) => {
    onMove(selected.id, field, Math.max(0, selected[field] + amount));
  };
  return (
    <section className="sync-selection-card">
      <span className="sync-selection-number">{index + 1}</span>
      <div className="sync-selection-copy">
        <strong>Ancla seleccionada</strong>
        <small>
          Audio {formatTime(selected.audioTime)} → MIDI {formatTime(selected.midiTime)}
        </small>
      </div>
      <div className="sync-selection-nudges">
        <span>Audio</span>
        <button onClick={() => nudge('audioTime', -0.01)} type="button">−10 ms</button>
        <button onClick={() => nudge('audioTime', 0.01)} type="button">+10 ms</button>
        <span>MIDI</span>
        <button onClick={() => nudge('midiTime', -0.01)} type="button">−10 ms</button>
        <button onClick={() => nudge('midiTime', 0.01)} type="button">+10 ms</button>
      </div>
      <button
        aria-label={`Eliminar ancla ${index + 1}`}
        className="sync-delete-anchor"
        onClick={() => {
          onDelete(selected.id);
          setSelectedId(null);
        }}
        type="button"
      >
        <Icon name="trash" />
        Eliminar
      </button>
    </section>
  );
};

export function SyncWorkspace({
  activeMidiTime,
  anchors,
  audioFileName,
  forward,
  midiDuration,
  midiFileName,
  offsetMs,
  onAddAnchor,
  onClearAnchors,
  onClose,
  onDeleteAnchor,
  onMoveAnchor,
  onOffsetChange,
  onRegisterTap,
  onSeek,
  onTapToggle,
  onTogglePlayback,
  peaks,
  tapActive,
  transport,
}: SyncWorkspaceProps) {
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>('anchors');
  const [magnetEnabled, setMagnetEnabled] = useState(true);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const landmarks = useMemo(
    () => detectAudioLandmarks(peaks, transport.duration),
    [peaks, transport.duration],
  );
  const timelineDuration = Math.max(transport.duration, midiDuration, 1);
  const viewport = resolveSyncViewport(timelineDuration, zoom, viewStart);

  useEffect(() => {
    if (viewport.start !== viewStart) setViewStart(viewport.start);
  }, [viewStart, viewport.start]);

  useEffect(() => {
    if (
      selectedAnchorId &&
      !anchors.some((anchor) => anchor.id === selectedAnchorId)
    ) {
      setSelectedAnchorId(null);
    }
  }, [anchors, selectedAnchorId]);

  useEffect(() => {
    if (!clearArmed) return;
    const timer = window.setTimeout(() => setClearArmed(false), 3500);
    return () => window.clearTimeout(timer);
  }, [clearArmed]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedAnchorId &&
        !(event.target instanceof HTMLInputElement)
      ) {
        event.preventDefault();
        onDeleteAnchor(selectedAnchorId);
        setSelectedAnchorId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, onDeleteAnchor, selectedAnchorId]);

  const changeZoom = (factor: number, focusTime = transport.position) => {
    const nextZoom = clamp(zoom * factor, 1, 64);
    const currentRatio =
      (focusTime - viewport.start) / Math.max(0.001, viewport.duration);
    const nextDuration = timelineDuration / nextZoom;
    setZoom(nextZoom);
    setViewStart(focusTime - nextDuration * clamp(currentRatio, 0, 1));
  };

  const panBy = (delta: number) => {
    setViewStart((current) =>
      clamp(current + delta, 0, viewport.maximumStart),
    );
  };

  const centerPlayhead = () => {
    setViewStart(
      clamp(
        transport.position - viewport.duration / 2,
        0,
        viewport.maximumStart,
      ),
    );
  };

  return (
    <div
      aria-label="Editor visual de sincronía"
      aria-modal="true"
      className="sync-workspace"
      role="dialog"
    >
      <header className="sync-workspace-header">
        <div className="sync-workspace-title">
          <span className="sync-workspace-mark"><Icon name="sync" /></span>
          <span>
            <small>ESPACIO DE TRABAJO</small>
            <strong>Sincronía visual</strong>
          </span>
        </div>
        <div className="sync-workspace-sources">
          <span><Icon name="music" />{midiFileName ?? 'Carga un MIDI'}</span>
          <span><Icon name="audio" />{audioFileName ?? 'Carga audio local'}</span>
        </div>
        <button className="sync-close" onClick={onClose} type="button">
          Cerrar
        </button>
      </header>

      <div className="sync-toolbar">
        <div className="sync-transport">
          <button
            aria-label={transport.playing ? 'Pausar' : 'Reproducir'}
            className="sync-play"
            disabled={transport.duration <= 0}
            onClick={onTogglePlayback}
            type="button"
          >
            <Icon name={transport.playing ? 'pause' : 'play'} />
          </button>
          <button
            disabled={transport.duration <= 0}
            onClick={() => onSeek(Math.max(0, transport.position - 1))}
            type="button"
          >
            −1 s
          </button>
          <button
            disabled={transport.duration <= 0}
            onClick={() =>
              onSeek(Math.min(transport.duration, transport.position + 1))
            }
            type="button"
          >
            +1 s
          </button>
          <span className="sync-clock">
            <strong>{formatTime(transport.position)}</strong>
            <small>Audio</small>
          </span>
          <span className="sync-clock">
            <strong>{formatTime(activeMidiTime)}</strong>
            <small>MIDI</small>
          </span>
        </div>

        <div className="sync-mode-control" role="group" aria-label="Herramienta">
          <button
            aria-pressed={interactionMode === 'anchors'}
            className={interactionMode === 'anchors' ? 'is-active' : ''}
            onClick={() => setInteractionMode('anchors')}
            type="button"
          >
            Anclas
          </button>
          <button
            aria-pressed={interactionMode === 'pan'}
            className={interactionMode === 'pan' ? 'is-active' : ''}
            onClick={() => setInteractionMode('pan')}
            type="button"
          >
            Desplazar
          </button>
        </div>

        <div className="sync-zoom-control">
          <button onClick={() => changeZoom(0.8)} type="button">−</button>
          <span>{zoom.toFixed(1)}×</span>
          <button onClick={() => changeZoom(1.25)} type="button">+</button>
          <button onClick={centerPlayhead} type="button">Centrar</button>
        </div>

        <label className="sync-magnet">
          <input
            checked={magnetEnabled}
            onChange={(event) => setMagnetEnabled(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Magnetismo</strong>
            <small>{landmarks.length} ataques detectados</small>
          </span>
        </label>
      </div>

      {!forward && (
        <p className="sync-workspace-warning">
          Algunas anclas hacen retroceder el MIDI. Arrastra los rombos inferiores
          hasta mantener un recorrido ascendente.
        </p>
      )}

      <section className="sync-editor-stage">
        <WaveformEditor
          audioDuration={transport.duration}
          interactionMode={interactionMode}
          landmarks={landmarks}
          magnetEnabled={magnetEnabled}
          markers={anchors}
          midiDuration={Math.max(midiDuration, transport.duration)}
          onAdd={(audioTime) => {
            onAddAnchor(audioTime);
            setSelectedAnchorId(null);
          }}
          onDelete={onDeleteAnchor}
          onMove={onMoveAnchor}
          onPan={panBy}
          onSelect={setSelectedAnchorId}
          onZoom={changeZoom}
          peaks={peaks}
          playhead={transport.position}
          selectedAnchorId={selectedAnchorId}
          viewDuration={viewport.duration}
          viewStart={viewport.start}
        />
        <div className="sync-editor-legend">
          <span><i className="is-audio" />Círculo: audio</span>
          <span><i className="is-midi" />Rombo: MIDI</span>
          <span>Arrastra cada extremo de la ancla por separado</span>
          <span>Doble clic sobre un extremo para eliminar</span>
        </div>
      </section>

      <div className="sync-workspace-lower">
        <AnchorSelection
          anchors={anchors}
          onDelete={onDeleteAnchor}
          onMove={onMoveAnchor}
          selectedId={selectedAnchorId}
          setSelectedId={setSelectedAnchorId}
        />

        <section className="sync-tap-card">
          <div>
            <small>CAPTURA RÍTMICA</small>
            <strong>Tap tempo</strong>
            <p>Reproduce el audio y pulsa al escuchar cada ataque.</p>
          </div>
          <button
            className={tapActive ? 'is-active' : ''}
            disabled={!transport.hasAudio || midiDuration <= 0}
            onClick={onTapToggle}
            type="button"
          >
            {tapActive ? 'Finalizar' : 'Iniciar'}
          </button>
          <button
            className="sync-tap-pulse"
            disabled={!tapActive}
            onClick={onRegisterTap}
            type="button"
          >
            Pulso · Espacio
          </button>
          <button
            className={clearArmed ? 'sync-clear-anchors is-armed' : 'sync-clear-anchors'}
            disabled={anchors.length === 0}
            onClick={() => {
              if (!clearArmed) {
                setClearArmed(true);
                return;
              }
              onClearAnchors();
              setSelectedAnchorId(null);
              setClearArmed(false);
            }}
            type="button"
          >
            {clearArmed ? 'Confirmar limpieza' : 'Limpiar anclas'}
          </button>
        </section>

        <OffsetControl offsetMs={offsetMs} onChange={onOffsetChange} />
      </div>

      <footer className="sync-navigator">
        <button onClick={() => panBy(-viewport.duration * 0.8)} type="button">
          <Icon name="chevron-left" />
        </button>
        <label>
          <span className="visually-hidden">Desplazamiento horizontal</span>
          <input
            disabled={viewport.maximumStart <= 0}
            max={viewport.maximumStart}
            min="0"
            onChange={(event) => setViewStart(Number(event.target.value))}
            step={Math.max(0.001, viewport.duration / 1000)}
            type="range"
            value={viewport.start}
          />
        </label>
        <button onClick={() => panBy(viewport.duration * 0.8)} type="button">
          <Icon name="chevron-right" />
        </button>
        <span>
          Vista {formatTime(viewport.start)} —{' '}
          {formatTime(viewport.start + viewport.duration)}
        </span>
      </footer>
    </div>
  );
}
