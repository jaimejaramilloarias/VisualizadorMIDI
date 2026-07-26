import { useEffect, useState } from 'react';
import type { SyncAnchor } from '../core/state/visualizationState';
import type { TransportSnapshot } from '../core/transport/AudioTransport';
import { Icon } from './icons';
import {
  MAX_SYNC_ZOOM,
  resolveSyncViewport,
  type AudioLandmark,
} from './syncEditorMath';
import { WaveformEditor } from './WaveformEditor';

type InteractionMode = 'anchors' | 'pan';

interface SyncWorkspaceProps {
  activeMidiTime: number;
  anchors: SyncAnchor[];
  audioFileName: string | null;
  forward: boolean;
  landmarks: readonly AudioLandmark[];
  magnetEnabled: boolean;
  midiDuration: number;
  midiFileName: string | null;
  offsetMs: number;
  onAddAnchor: (audioTime: number) => void;
  onClearAnchors: () => void;
  onClose: () => void;
  onDeleteAnchor: (id: string) => void;
  onMoveAnchor: (id: string, audioTime: number) => void;
  onMagnetChange: (enabled: boolean) => void;
  onOffsetChange: (value: number) => void;
  onRefreshWaveform: () => void;
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

export function SyncWorkspace({
  activeMidiTime,
  anchors,
  audioFileName,
  forward,
  landmarks,
  magnetEnabled,
  midiDuration,
  midiFileName,
  offsetMs,
  onAddAnchor,
  onClearAnchors,
  onClose,
  onDeleteAnchor,
  onMoveAnchor,
  onMagnetChange,
  onOffsetChange,
  onRefreshWaveform,
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
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const timelineDuration = Math.max(transport.duration, midiDuration, 1);
  const viewport = resolveSyncViewport(timelineDuration, zoom, viewStart);
  const selectedAnchor =
    anchors.find((anchor) => anchor.id === selectedAnchorId) ?? null;
  const selectedIndex = selectedAnchor
    ? anchors.findIndex((anchor) => anchor.id === selectedAnchor.id)
    : -1;
  const offsetDescription =
    offsetMs < 0
      ? `La animación espera ${Math.abs(offsetMs / 1000).toFixed(2)} segundos.`
      : offsetMs > 0
        ? `La animación comienza ${Math.abs(offsetMs / 1000).toFixed(2)} segundos adelantada.`
        : 'Audio y animación comienzan juntos.';

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
    if (!transport.hasAudio || peaks?.length) return;
    const frame = window.requestAnimationFrame(onRefreshWaveform);
    return () => window.cancelAnimationFrame(frame);
  }, [onRefreshWaveform, peaks, transport.hasAudio]);

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
    const nextZoom = clamp(zoom * factor, 1, MAX_SYNC_ZOOM);
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

  const moveSelectedAnchor = (delta: number) => {
    if (!selectedAnchor) return;
    onMoveAnchor(
      selectedAnchor.id,
      clamp(
        selectedAnchor.audioTime + delta,
        0,
        Math.max(0, transport.duration),
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
          <span title={transport.trimOffset > 0 ? `${transport.trimOffset.toFixed(3)} s de silencio inicial ignorados` : undefined}>
            <Icon name="audio" />
            {audioFileName ?? 'Carga audio local'}
          </span>
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
          <button onClick={() => changeZoom(0.5)} type="button">−</button>
          <span>{zoom.toFixed(1)}×</span>
          <button onClick={() => changeZoom(2)} type="button">+</button>
          <button onClick={centerPlayhead} type="button">Centrar</button>
        </div>

        <div className="sync-toolbar-group sync-navigation-group">
          <button
            aria-label="Desplazar vista a la izquierda"
            onClick={() => panBy(-viewport.duration * 0.8)}
            type="button"
          >
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
          <button
            aria-label="Desplazar vista a la derecha"
            onClick={() => panBy(viewport.duration * 0.8)}
            type="button"
          >
            <Icon name="chevron-right" />
          </button>
          <span className="sync-view-range">
            {formatTime(viewport.start)}—
            {formatTime(viewport.start + viewport.duration)}
          </span>
        </div>

        <div className="sync-toolbar-group sync-anchor-group">
          {selectedAnchor ? (
            <>
              <span
                className="sync-anchor-badge"
                title={`Audio ${formatTime(selectedAnchor.audioTime)} · pulso MIDI ${formatTime(selectedAnchor.midiTime)}`}
              >
                {selectedIndex + 1}
              </span>
              <button onClick={() => moveSelectedAnchor(-0.01)} type="button">
                −10 ms
              </button>
              <button onClick={() => moveSelectedAnchor(0.01)} type="button">
                +10 ms
              </button>
              <button
                aria-label={`Eliminar ancla ${selectedIndex + 1}`}
                className="sync-danger-button"
                onClick={() => {
                  onDeleteAnchor(selectedAnchor.id);
                  setSelectedAnchorId(null);
                }}
                type="button"
              >
                <Icon name="trash" />
              </button>
            </>
          ) : (
            <span className="sync-toolbar-label">Ancla —</span>
          )}
        </div>

        <div className="sync-toolbar-group sync-tap-group">
          <span className="sync-toolbar-label">Tap</span>
          <button
            className={tapActive ? 'is-active' : ''}
            disabled={!transport.hasAudio || midiDuration <= 0}
            onClick={onTapToggle}
            type="button"
          >
            {tapActive ? 'Finalizar' : 'Iniciar'}
          </button>
          <button
            className="sync-primary-button"
            disabled={!tapActive}
            onClick={onRegisterTap}
            type="button"
          >
            Pulso
          </button>
          <button
            className={`sync-danger-button${clearArmed ? ' is-armed' : ''}`}
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
            {clearArmed ? 'Confirmar' : 'Limpiar'}
          </button>
        </div>

        <div
          className="sync-toolbar-group sync-offset-group"
          title={offsetDescription}
        >
          <span className="sync-toolbar-label">
            Offset {offsetMs > 0 ? '+' : ''}
            {offsetMs} ms
          </span>
          <button
            aria-label="Reducir offset 10 milisegundos"
            onClick={() =>
              onOffsetChange(clamp(offsetMs - 10, -10_000, 10_000))
            }
            type="button"
          >
            −
          </button>
          <label>
            <span className="visually-hidden">Offset de animación</span>
            <input
              max="10000"
              min="-10000"
              onChange={(event) => onOffsetChange(Number(event.target.value))}
              step="10"
              type="range"
              value={offsetMs}
            />
          </label>
          <button
            aria-label="Aumentar offset 10 milisegundos"
            onClick={() =>
              onOffsetChange(clamp(offsetMs + 10, -10_000, 10_000))
            }
            type="button"
          >
            +
          </button>
          <button
            aria-label="Restablecer offset a cero"
            onClick={() => onOffsetChange(0)}
            type="button"
          >
            0
          </button>
        </div>

        <label className="sync-magnet">
          <input
            checked={magnetEnabled}
            onChange={(event) => onMagnetChange(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Magnetismo</strong>
            <small>{landmarks.length} picos RMS detectados</small>
          </span>
        </label>
      </div>

      {!forward && (
        <p className="sync-workspace-warning">
          El orden de algunos pulsos MIDI se invirtió. Reubica sus anclas sobre
          el audio hasta recuperar un recorrido ascendente.
        </p>
      )}

      <section className="sync-editor-stage">
        <WaveformEditor
          audioDuration={transport.duration}
          interactionMode={interactionMode}
          landmarks={landmarks}
          magnetEnabled={magnetEnabled}
          markers={anchors}
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
          <span><i className="is-audio" />Ancla vertical: posición en el audio</span>
          <span><i className="is-midi" />Pulso MIDI asociado</span>
          <span>Arrastra cualquier extremo para reubicar la ancla completa</span>
          <span>Doble clic para eliminar</span>
        </div>
      </section>
    </div>
  );
}
