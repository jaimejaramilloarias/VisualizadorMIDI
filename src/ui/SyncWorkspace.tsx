import { useEffect, useMemo, useRef, useState } from 'react';
import type { AlignmentAnchorCandidate } from '../core/alignment/types';
import type { SyncAnchor } from '../core/state/visualizationState';
import type { TransportSnapshot } from '../core/transport/AudioTransport';
import { Icon } from './icons';
import { KnobControl } from './KnobControl';
import {
  MAX_SYNC_ZOOM,
  mapSyncAudioToDisplayTime,
  resolveSyncViewport,
  type AudioLandmark,
  type GridFineTuneRequest,
} from './syncEditorMath';
import type { SyncMidiProjection } from './syncMidiProjection';
import { WaveformEditor } from './WaveformEditor';

type InteractionMode = 'anchors' | 'grid' | 'pan';

export interface AutomaticAlignmentView {
  anchors: readonly AlignmentAnchorCandidate[];
  confidence: number | null;
  message: string;
  progress: number;
  status: 'idle' | 'analyzing' | 'preview' | 'error';
}

interface SyncWorkspaceProps {
  activeMidiTime: number;
  anchors: SyncAnchor[];
  automaticAlignment: AutomaticAlignmentView;
  automaticAlignmentReady: boolean;
  audioFileName: string | null;
  forward: boolean;
  landmarks: readonly AudioLandmark[];
  magnetEnabled: boolean;
  midiDuration: number;
  midiFileName: string | null;
  midiProjection: SyncMidiProjection | null;
  offsetMs: number;
  onAddAnchor: (audioTime: number) => void;
  onAddFineTuneAnchor: (request: GridFineTuneRequest) => void;
  onApplyAutomaticAlignment: () => void;
  onCancelAutomaticAlignment: () => void;
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
  onRunAutomaticAlignment: () => void;
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
  automaticAlignment,
  automaticAlignmentReady,
  audioFileName,
  forward,
  landmarks,
  magnetEnabled,
  midiDuration,
  midiFileName,
  midiProjection,
  offsetMs,
  onAddAnchor,
  onAddFineTuneAnchor,
  onApplyAutomaticAlignment,
  onCancelAutomaticAlignment,
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
  onRunAutomaticAlignment,
  peaks,
  tapActive,
  transport,
}: SyncWorkspaceProps) {
  const automaticActionRef = useRef<HTMLButtonElement>(null);
  const [zoom, setZoom] = useState(1);
  const [viewStart, setViewStart] = useState(0);
  const [interactionMode, setInteractionMode] =
    useState<InteractionMode>('anchors');
  const [midiGhostVisible, setMidiGhostVisible] = useState(true);
  const [selectedAnchorId, setSelectedAnchorId] = useState<string | null>(null);
  const [clearArmed, setClearArmed] = useState(false);
  const timelineDuration = Math.max(transport.duration, midiDuration, 1);
  const viewport = resolveSyncViewport(timelineDuration, zoom, viewStart);
  const selectedAnchor =
    anchors.find((anchor) => anchor.id === selectedAnchorId) ?? null;
  const selectedAnchorDisplayTime = selectedAnchor
    ? Math.max(
        0,
        mapSyncAudioToDisplayTime(selectedAnchor.audioTime, offsetMs),
      )
    : null;
  const editorTimelineMarkers = useMemo(
    () =>
      automaticAlignment.status === 'preview'
        ? automaticAlignment.anchors.map((anchor, index) => ({
            id: `automatic-preview-${index}`,
            audioTime: anchor.audioTime,
            midiTime: anchor.midiTime,
          }))
        : anchors,
    [anchors, automaticAlignment],
  );
  const alignmentLocked =
    automaticAlignment.status === 'analyzing' ||
    automaticAlignment.status === 'preview';
  const canRunAutomaticAlignment =
    automaticAlignmentReady && transport.hasAudio && midiDuration > 0;
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
    if (
      interactionMode === 'grid' &&
      (!midiProjection || anchors.length < 2)
    ) {
      setInteractionMode('anchors');
    }
  }, [anchors.length, interactionMode, midiProjection]);

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
    if (
      automaticAlignment.status !== 'analyzing' &&
      automaticAlignment.status !== 'preview' &&
      automaticAlignment.status !== 'error'
    ) {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      automaticActionRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [automaticAlignment.status]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      } else if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedAnchorId &&
        !alignmentLocked &&
        !(event.target instanceof HTMLInputElement)
      ) {
        event.preventDefault();
        onDeleteAnchor(selectedAnchorId);
        setSelectedAnchorId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [alignmentLocked, onClose, onDeleteAnchor, selectedAnchorId]);

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
        Math.max(
          0,
          transport.duration + Math.max(0, offsetMs / 1000),
        ),
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
            disabled={
              transport.duration <= 0 ||
              automaticAlignment.status === 'analyzing'
            }
            onClick={onTogglePlayback}
            type="button"
          >
            <Icon name={transport.playing ? 'pause' : 'play'} />
          </button>
          <button
            disabled={
              transport.duration <= 0 ||
              automaticAlignment.status === 'analyzing'
            }
            onClick={() => onSeek(Math.max(0, transport.position - 1))}
            type="button"
          >
            −1 s
          </button>
          <button
            disabled={
              transport.duration <= 0 ||
              automaticAlignment.status === 'analyzing'
            }
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
            disabled={alignmentLocked}
            onClick={() => setInteractionMode('anchors')}
            type="button"
          >
            Anclas
          </button>
          <button
            aria-pressed={interactionMode === 'grid'}
            className={interactionMode === 'grid' ? 'is-active' : ''}
            disabled={
              alignmentLocked ||
              !midiProjection ||
              anchors.length < 2
            }
            onClick={() => setInteractionMode('grid')}
            title={
              anchors.length < 2
                ? 'Aplica primero la alineación automática o crea al menos dos anclas'
                : 'Arrastra un pulso del grid para crear una corrección local'
            }
            type="button"
          >
            Ajustar grid
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

        <label className="sync-ghost-toggle">
          <input
            checked={midiGhostVisible}
            disabled={!midiProjection}
            onChange={(event) => setMidiGhostVisible(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>MIDI fantasma</strong>
            <small>{midiProjection?.noteCount.toLocaleString('es-CO') ?? 0} notas</small>
          </span>
        </label>

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
                title={`Audio ${formatTime(selectedAnchorDisplayTime ?? 0)} · pulso MIDI ${formatTime(selectedAnchor.midiTime)}`}
              >
                {selectedIndex + 1}
              </span>
              <button
                disabled={alignmentLocked}
                onClick={() => moveSelectedAnchor(-0.01)}
                type="button"
              >
                −10 ms
              </button>
              <button
                disabled={alignmentLocked}
                onClick={() => moveSelectedAnchor(0.01)}
                type="button"
              >
                +10 ms
              </button>
              <button
                aria-label={`Eliminar ancla ${selectedIndex + 1}`}
                className="sync-danger-button"
                disabled={alignmentLocked}
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
            disabled={
              !transport.hasAudio ||
              midiDuration <= 0 ||
              alignmentLocked
            }
            onClick={onTapToggle}
            type="button"
          >
            {tapActive ? 'Finalizar' : 'Iniciar'}
          </button>
          <button
            className="sync-primary-button"
            disabled={!tapActive || alignmentLocked}
            onClick={onRegisterTap}
            type="button"
          >
            Pulso
          </button>
          <button
            className={`sync-danger-button${clearArmed ? ' is-armed' : ''}`}
            disabled={anchors.length === 0 || alignmentLocked}
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

        <div className="sync-toolbar-group sync-auto-group">
          {automaticAlignment.status === 'analyzing' ? (
            <>
              <span
                aria-label={`${automaticAlignment.message}: ${Math.round(automaticAlignment.progress * 100)} por ciento`}
                aria-valuemax={100}
                aria-valuemin={0}
                aria-valuenow={Math.round(automaticAlignment.progress * 100)}
                className="sync-auto-progress"
                role="progressbar"
              >
                <i
                  style={{
                    width: `${Math.round(automaticAlignment.progress * 100)}%`,
                  }}
                />
              </span>
              <span className="sync-toolbar-label">
                {Math.round(automaticAlignment.progress * 100)}%
              </span>
              <button
                className="sync-danger-button"
                onClick={onCancelAutomaticAlignment}
                ref={automaticActionRef}
                type="button"
              >
                Cancelar
              </button>
            </>
          ) : automaticAlignment.status === 'preview' ? (
            <>
              <span className="sync-auto-result">
                <strong>{automaticAlignment.anchors.length} anclas</strong>
                <small>
                  {Math.round((automaticAlignment.confidence ?? 0) * 100)}%
                  {' '}confianza
                </small>
              </span>
              <button
                className="sync-primary-button"
                onClick={onApplyAutomaticAlignment}
                ref={automaticActionRef}
                type="button"
              >
                Aplicar
              </button>
              <button
                onClick={onCancelAutomaticAlignment}
                type="button"
              >
                Descartar
              </button>
            </>
          ) : (
            <button
              className="sync-auto-button"
              disabled={!canRunAutomaticAlignment}
              onClick={onRunAutomaticAlignment}
              ref={
                automaticAlignment.status === 'error'
                  ? automaticActionRef
                  : undefined
              }
              title={
                canRunAutomaticAlignment
                  ? 'Analiza chroma, ataques y picos RMS; después alinea con DTW'
                  : 'Carga MIDI y audio para usar la sincronización automática'
              }
              type="button"
            >
              <Icon name="sparkles" />
              {automaticAlignment.status === 'error'
                ? 'Reintentar alineación'
                : 'Alinear automáticamente'}
            </button>
          )}
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
            disabled={alignmentLocked}
            onClick={() =>
              onOffsetChange(clamp(offsetMs - 10, -10_000, 10_000))
            }
            type="button"
          >
            −
          </button>
          <KnobControl
            compact
            disabled={alignmentLocked}
            label="Offset de animación"
            max={10_000}
            min={-10_000}
            onChange={onOffsetChange}
            step={10}
            suffix=" ms"
            value={offsetMs}
          />
          <button
            aria-label="Aumentar offset 10 milisegundos"
            disabled={alignmentLocked}
            onClick={() =>
              onOffsetChange(clamp(offsetMs + 10, -10_000, 10_000))
            }
            type="button"
          >
            +
          </button>
          <button
            aria-label="Restablecer offset a cero"
            disabled={alignmentLocked}
            onClick={() => onOffsetChange(0)}
            type="button"
          >
            0
          </button>
        </div>

        <label className="sync-magnet">
          <input
            checked={magnetEnabled}
            disabled={alignmentLocked}
            onChange={(event) => onMagnetChange(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Magnetismo RMS</strong>
            <small>
              {landmarks.length} picos para tap y ajuste de grid
            </small>
          </span>
        </label>
      </div>

      {(!forward || automaticAlignment.status !== 'idle') && (
        <div className="sync-workspace-messages">
          {!forward && (
            <p className="sync-workspace-warning">
              El orden de algunos pulsos MIDI se invirtió. Reubica sus anclas
              sobre el audio hasta recuperar un recorrido ascendente.
            </p>
          )}
          {automaticAlignment.status !== 'idle' && (
            <p
              className={`sync-auto-message is-${automaticAlignment.status}`}
              role="status"
              aria-atomic="true"
            >
              {automaticAlignment.message}
              {automaticAlignment.status === 'preview' &&
                anchors.length > 0 && (
                  <small>
                    Aplicar reemplazará {anchors.length} anclas actuales.
                  </small>
                )}
            </p>
          )}
        </div>
      )}

      <section className="sync-editor-stage">
        <WaveformEditor
          audioDuration={transport.duration}
          editingLocked={alignmentLocked}
          ghostMarkers={
            automaticAlignment.status === 'preview'
              ? automaticAlignment.anchors
              : []
          }
          interactionMode={interactionMode}
          landmarks={landmarks}
          magnetEnabled={magnetEnabled}
          markers={anchors}
          midiGhostVisible={midiGhostVisible}
          midiProjection={midiProjection}
          offsetMs={offsetMs}
          onAdd={(audioTime) => {
            onAddAnchor(audioTime);
            setSelectedAnchorId(null);
          }}
          onAddGridAnchor={onAddFineTuneAnchor}
          onMove={onMoveAnchor}
          onPan={panBy}
          onSeek={onSeek}
          onSelect={setSelectedAnchorId}
          onZoom={changeZoom}
          peaks={peaks}
          playhead={transport.position}
          selectedAnchorId={selectedAnchorId}
          timelineMarkers={editorTimelineMarkers}
          viewDuration={viewport.duration}
          viewStart={viewport.start}
        />
        <div className="sync-editor-legend">
          <span><i className="is-audio" />Ancla vertical: posición en el audio</span>
          <span><i className="is-midi" />Pulso MIDI asociado</span>
          {midiGhostVisible && midiProjection && (
            <span><i className="is-ghost" />Rectángulos: MIDI fantasma</span>
          )}
          {interactionMode === 'grid' && (
            <>
              <span><i className="is-grid" />Arrastra una línea: fija la anterior y ajusta desde ahí</span>
              <span>Arrastra cualquier ancla, incluida la última, para reposicionarla</span>
            </>
          )}
          {automaticAlignment.status === 'preview' && (
            <span><i className="is-automatic" />Línea discontinua: propuesta automática</span>
          )}
          {alignmentLocked ? (
            <span>Edición manual pausada mientras revisas la propuesta</span>
          ) : (
            <>
              <span>Arrastra cualquier extremo para reubicar la ancla completa</span>
              <span>Clic: mueve el playhead</span>
              {interactionMode === 'anchors' && (
                <span>Doble clic en un espacio libre: crea una ancla</span>
              )}
            </>
          )}
        </div>
      </section>
    </div>
  );
}
