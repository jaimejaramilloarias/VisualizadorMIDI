import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { AlignmentAnchorCandidate } from '../core/alignment/types';
import {
  createSyncTimeline,
  type SyncAnchor,
} from '../core/state/visualizationState';
import {
  generateAdaptiveMidiGrid,
  insertFineTuneAnchorPair,
  mapDisplayAudioToSyncTime,
  mapSyncAudioToDisplayTime,
  resolveGridAnchorDrop,
  type AudioLandmark,
  type GridFineTuneRequest,
  type MidiGridLine,
} from './syncEditorMath';
import {
  selectVisibleGhostNotes,
  type SyncMidiProjection,
} from './syncMidiProjection';

type InteractionMode = 'anchors' | 'grid' | 'pan';

interface WaveformEditorProps {
  audioDuration: number;
  editingLocked?: boolean;
  ghostMarkers?: readonly AlignmentAnchorCandidate[];
  interactionMode: InteractionMode;
  landmarks: readonly AudioLandmark[];
  magnetEnabled: boolean;
  markers: SyncAnchor[];
  midiGhostVisible: boolean;
  midiProjection: SyncMidiProjection | null;
  offsetMs: number;
  onAdd: (audioTime: number) => void;
  onAddGridAnchor: (request: GridFineTuneRequest) => void;
  onMove: (id: string, audioTime: number) => void;
  onPan: (deltaSeconds: number) => void;
  onSeek: (time: number) => void;
  onSelect: (id: string | null) => void;
  onZoom: (factor: number, focusTime: number) => void;
  peaks: Float32Array | null;
  playhead: number;
  selectedAnchorId: string | null;
  timelineMarkers?: readonly SyncAnchor[];
  viewDuration: number;
  viewStart: number;
}

interface AnchorHandle {
  id: string;
  x: number;
  y: number;
}

interface GridHandle {
  continuityAudioTime: number;
  continuityLine: MidiGridLine;
  line: MidiGridLine;
  x: number;
  audioTime: number;
}

interface GridDragPreview {
  audioTime: number;
  continuityAudioTime: number;
  continuityMidiTime: number;
  midiTime: number;
  snapped: boolean;
}

interface TouchTapState {
  at: number;
  clientX: number;
  clientY: number;
}

interface DragState {
  didMove?: boolean;
  id?: string;
  continuityAudioTime?: number;
  continuityMidiTime?: number;
  midiTime?: number;
  pointerId: number;
  pointerLastX: number;
  pointerStartX: number;
  pointerType: string;
  type: 'anchor' | 'grid' | 'pan';
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const pointerDragThreshold = (pointerType: string): number =>
  pointerType === 'touch' ? 10 : pointerType === 'pen' ? 6 : 4;

const formatTime = (seconds: number): string => {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const minutes = Math.floor(safe / 60);
  const remainder = safe - minutes * 60;
  return `${minutes}:${remainder.toFixed(2).padStart(5, '0')}`;
};

const niceGridStep = (duration: number): number => {
  const desired = Math.max(0.001, duration / 9);
  const magnitude = 10 ** Math.floor(Math.log10(desired));
  const normalized = desired / magnitude;
  const multiplier =
    normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
};

export function WaveformEditor({
  audioDuration,
  editingLocked = false,
  ghostMarkers = [],
  interactionMode,
  landmarks,
  magnetEnabled,
  markers,
  midiGhostVisible,
  midiProjection,
  offsetMs,
  onAdd,
  onAddGridAnchor,
  onMove,
  onPan,
  onSeek,
  onSelect,
  onZoom,
  peaks,
  playhead,
  selectedAnchorId,
  timelineMarkers,
  viewDuration,
  viewStart,
}: WaveformEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const ignoreNativeDoubleClickUntilRef = useRef(0);
  const lastPointerTypeRef = useRef('');
  const lastTouchTapRef = useRef<TouchTapState | null>(null);
  const suppressNextClickRef = useRef(false);
  const handlesRef = useRef<AnchorHandle[]>([]);
  const gridHandlesRef = useRef<GridHandle[]>([]);
  const gridPreviewRef = useRef<GridDragPreview | null>(null);
  const pendingGridPreviewRef = useRef<GridDragPreview | null>(null);
  const gridPreviewFrameRef = useRef<number | null>(null);
  const [gridPreview, setGridPreview] = useState<GridDragPreview | null>(null);
  const [resizeRevision, setResizeRevision] = useState(0);

  const updateGridPreview = (preview: GridDragPreview | null) => {
    gridPreviewRef.current = preview;
    pendingGridPreviewRef.current = preview;
    if (preview === null) {
      if (gridPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(gridPreviewFrameRef.current);
        gridPreviewFrameRef.current = null;
      }
      setGridPreview(null);
      return;
    }
    if (gridPreviewFrameRef.current !== null) return;
    gridPreviewFrameRef.current = window.requestAnimationFrame(() => {
      gridPreviewFrameRef.current = null;
      setGridPreview(pendingGridPreviewRef.current);
    });
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => {
      setResizeRevision((revision) => revision + 1);
    });
    observer.observe(canvas);
    const frame = window.requestAnimationFrame(() => {
      setResizeRevision((revision) => revision + 1);
    });
    return () => {
      window.cancelAnimationFrame(frame);
      if (gridPreviewFrameRef.current !== null) {
        window.cancelAnimationFrame(gridPreviewFrameRef.current);
        gridPreviewFrameRef.current = null;
      }
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const bounds = canvas.getBoundingClientRect();
    const ratio = Math.min(2.5, window.devicePixelRatio || 1);
    canvas.width = Math.max(1, Math.round(bounds.width * ratio));
    canvas.height = Math.max(1, Math.round(bounds.height * ratio));
    const context = canvas.getContext('2d');
    if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);

    const width = bounds.width;
    const height = bounds.height;
    const plotLeft = 58;
    const plotRight = 18;
    const plotWidth = Math.max(1, width - plotLeft - plotRight);
    const audioTop = 48;
    const midiY = Math.max(audioTop + 80, height - 34);
    const audioBottom = midiY;
    const audioMiddle = (audioTop + audioBottom) / 2;
    const timeToX = (time: number): number =>
      plotLeft +
      ((time - viewStart) / Math.max(0.001, viewDuration)) * plotWidth;
    const xToTime = (x: number): number =>
      viewStart +
      ((x - plotLeft) / Math.max(1, plotWidth)) *
        Math.max(0.001, viewDuration);

    const offsetSeconds = Number.isFinite(offsetMs) ? offsetMs / 1000 : 0;
    const displayMarkers = markers.map((marker) => ({
      ...marker,
      audioTime: mapSyncAudioToDisplayTime(marker.audioTime, offsetMs),
    }));
    const previewAnchors =
      gridPreview && audioDuration > 0
        ? insertFineTuneAnchorPair({
            anchors: timelineMarkers ?? markers,
            continuityAnchor: {
              audioTime: mapDisplayAudioToSyncTime(
                gridPreview.continuityAudioTime,
                offsetMs,
              ),
              id: 'grid-continuity-preview',
              midiTime: gridPreview.continuityMidiTime,
            },
            targetAnchor: {
              id: 'grid-drag-preview',
              audioTime: mapDisplayAudioToSyncTime(
                gridPreview.audioTime,
                offsetMs,
              ),
              midiTime: gridPreview.midiTime,
            },
            audioDuration:
              audioDuration + Math.max(0, offsetSeconds),
          })
        : [...(timelineMarkers ?? markers)];
    const midiTimeline = createSyncTimeline(previewAnchors);
    const midiToAudioTime = (midiTime: number): number | null => {
      const internalAudioTime = midiTimeline.invert(midiTime);
      return internalAudioTime === null
        ? null
        : mapSyncAudioToDisplayTime(internalAudioTime, offsetMs);
    };

    context.clearRect(0, 0, width, height);
    context.fillStyle = '#06080b';
    context.fillRect(0, 0, width, height);

    const background = context.createLinearGradient(
      0,
      audioTop,
      0,
      audioBottom,
    );
    background.addColorStop(0, 'rgba(255,255,255,.035)');
    background.addColorStop(1, 'rgba(255,255,255,.012)');
    context.fillStyle = background;
    context.fillRect(plotLeft, audioTop, plotWidth, audioBottom - audioTop);

    const audioGridStep = niceGridStep(viewDuration);
    const firstAudioGrid =
      Math.ceil(viewStart / audioGridStep) * audioGridStep;
    context.font = '600 10px system-ui';
    context.textAlign = 'center';
    for (
      let time = firstAudioGrid;
      time <= viewStart + viewDuration + audioGridStep * 0.001;
      time += audioGridStep
    ) {
      const x = timeToX(time);
      context.strokeStyle = 'rgba(255,255,255,.06)';
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(x, 30);
      context.lineTo(x, midiY + 20);
      context.stroke();
      context.fillStyle = 'rgba(220,228,231,.52)';
      context.fillText(formatTime(time), x, 22);
    }

    context.fillStyle = 'rgba(220,228,231,.55)';
    context.textAlign = 'left';
    context.font = '800 9px system-ui';
    context.fillText('AUDIO', 12, audioTop + 14);
    context.fillText('MIDI', 12, midiY + 4);

    context.strokeStyle = 'rgba(255,255,255,.1)';
    context.beginPath();
    context.moveTo(plotLeft, audioMiddle);
    context.lineTo(plotLeft + plotWidth, audioMiddle);
    context.moveTo(plotLeft, midiY);
    context.lineTo(plotLeft + plotWidth, midiY);
    context.stroke();

    const displayAudioToMidiTime = (audioTime: number): number => {
      const effectiveAudioTime = audioTime + offsetSeconds;
      return effectiveAudioTime < 0
        ? 0
        : midiTimeline.map(effectiveAudioTime).midiTime;
    };
    const visibleMidiStart = displayAudioToMidiTime(viewStart);
    const visibleMidiEnd = displayAudioToMidiTime(
      viewStart + viewDuration,
    );
    const midiRangeStart = Math.min(visibleMidiStart, visibleMidiEnd);
    const midiRangeEnd = Math.max(visibleMidiStart, visibleMidiEnd);

    if (
      midiGhostVisible &&
      midiProjection &&
      midiTimeline.forward &&
      midiRangeEnd > midiRangeStart
    ) {
      const selection = selectVisibleGhostNotes(
        midiProjection,
        midiRangeStart,
        midiRangeEnd,
        {
          maximumNotes: gridPreview
            ? Math.min(
                4_000,
                Math.max(1_000, Math.ceil(plotWidth * 4)),
              )
            : Math.min(
                10_000,
                Math.max(1_500, Math.ceil(plotWidth * 8)),
              ),
        },
      );
      const pitchRange = midiProjection.pitchRange;
      if (pitchRange) {
        const pitchSpan = Math.max(
          1,
          pitchRange.maximum - pitchRange.minimum + 1,
        );
        const laneHeight = (audioBottom - audioTop) / pitchSpan;
        const noteHeight = clamp(laneHeight * 0.72, 1.2, 7);
        context.save();
        selection.notes.forEach((note) => {
          const noteStart = midiToAudioTime(note.start);
          const noteEnd = midiToAudioTime(note.end);
          if (noteStart === null || noteEnd === null) return;
          const rawX1 = timeToX(noteStart);
          const rawX2 = timeToX(noteEnd);
          if (
            rawX2 < plotLeft ||
            rawX1 > plotLeft + plotWidth
          ) {
            return;
          }
          const x1 = clamp(rawX1, plotLeft, plotLeft + plotWidth);
          const x2 = clamp(rawX2, plotLeft, plotLeft + plotWidth);
          const normalizedPitch =
            (note.pitch - pitchRange.minimum) / pitchSpan;
          const y =
            audioBottom -
            normalizedPitch * (audioBottom - audioTop - noteHeight) -
            noteHeight;
          const alpha = 0.075 + (note.velocity / 127) * 0.075;
          context.fillStyle = `rgba(238,243,244,${alpha.toFixed(3)})`;
          context.fillRect(
            x1,
            y,
            Math.max(1, x2 - x1),
            noteHeight,
          );
        });
        context.restore();
      }
    }

    if (peaks?.length) {
      const peakCount = Math.floor(peaks.length / 2);
      const visibleStartIndex = Math.max(
        0,
        Math.floor(
          (viewStart / Math.max(audioDuration, 0.001)) * peakCount,
        ),
      );
      const visibleEndIndex = Math.min(
        peakCount - 1,
        Math.ceil(
          ((viewStart + viewDuration) /
            Math.max(audioDuration, 0.001)) *
            peakCount,
        ),
      );
      const visiblePeakCount = Math.max(
        1,
        visibleEndIndex - visibleStartIndex + 1,
      );
      const samplesPerPixel = visiblePeakCount / plotWidth;
      context.strokeStyle = '#78b9c9';
      context.globalAlpha = 0.86;
      context.lineWidth = 1;
      context.beginPath();
      for (let pixel = 0; pixel <= plotWidth; pixel += 1) {
        const first = Math.min(
          visibleEndIndex,
          Math.floor(visibleStartIndex + pixel * samplesPerPixel),
        );
        const last = Math.min(
          visibleEndIndex,
          Math.max(
            first,
            Math.ceil(
              visibleStartIndex + (pixel + 1) * samplesPerPixel,
            ) - 1,
          ),
        );
        let minimum = 0;
        let maximum = 0;
        for (let index = first; index <= last; index += 1) {
          minimum = Math.min(minimum, peaks[index * 2] ?? 0);
          maximum = Math.max(maximum, peaks[index * 2 + 1] ?? 0);
        }
        const x = plotLeft + pixel;
        const amplitude = (audioBottom - audioTop) * 0.46;
        context.moveTo(x, audioMiddle + minimum * amplitude);
        context.lineTo(x, audioMiddle + maximum * amplitude);
      }
      context.stroke();
      context.globalAlpha = 1;
    }

    const midiGridLines =
      midiProjection && midiTimeline.forward
        ? generateAdaptiveMidiGrid({
            tempoMap: midiProjection.tempoMap,
            ticksPerBeat: midiProjection.ticksPerBeat,
            timeSignatures: midiProjection.timeSignatures,
            visibleMidiStart: midiRangeStart,
            visibleMidiEnd: midiRangeEnd,
            viewportWidth: plotWidth,
            includePrecedingLine: true,
          })
        : [];
    const gridHandles: GridHandle[] = [];
    midiGridLines.forEach((line, lineIndex) => {
      const continuityLine = midiGridLines[lineIndex - 1];
      const audioTime = midiToAudioTime(line.midiTime);
      if (audioTime === null) return;
      const continuityAudioTime = continuityLine
        ? midiToAudioTime(continuityLine.midiTime)
        : null;
      const x = timeToX(audioTime);
      if (x < plotLeft - 20 || x > plotLeft + plotWidth + 20) return;
      const isDragged =
        gridPreview &&
        Math.abs(gridPreview.midiTime - line.midiTime) < 1e-7;
      const isMajor = line.hierarchy === 'major';
      context.save();
      context.strokeStyle = isDragged
        ? gridPreview.snapped
          ? 'rgba(255,240,139,.98)'
          : 'rgba(255,213,0,.98)'
        : interactionMode === 'grid'
          ? isMajor
            ? 'rgba(255,213,0,.42)'
            : 'rgba(255,213,0,.18)'
          : isMajor
            ? 'rgba(255,213,0,.19)'
            : 'rgba(255,213,0,.07)';
      context.lineWidth = isDragged ? 2.5 : isMajor ? 1.2 : 1;
      if (!isMajor && !isDragged) context.setLineDash([2, 5]);
      context.beginPath();
      context.moveTo(x, audioTop);
      context.lineTo(x, audioBottom);
      context.stroke();
      context.setLineDash([]);
      if (interactionMode === 'grid') {
        context.fillStyle = isDragged
          ? '#fff2a3'
          : isMajor
            ? '#ffd500'
            : 'rgba(255,213,0,.72)';
        context.beginPath();
        context.moveTo(x, audioTop - 2);
        context.lineTo(x + (isMajor ? 6 : 4), audioTop + (isMajor ? 8 : 6));
        context.lineTo(x - (isMajor ? 6 : 4), audioTop + (isMajor ? 8 : 6));
        context.closePath();
        context.fill();
        if (isMajor && line.label) {
          context.fillStyle = 'rgba(255,225,83,.76)';
          context.font = '800 8px system-ui';
          context.textAlign = 'center';
          context.fillText(`C${line.label}`, x, audioTop - 8);
        }
      }
      context.restore();

      const duplicatesAnchor = displayMarkers.some(
        (anchor) => Math.abs(anchor.midiTime - line.midiTime) < 0.001,
      );
      const hasPreviousAnchor = displayMarkers.some(
        (anchor) => anchor.midiTime < line.midiTime - 0.001,
      );
      if (
        displayMarkers.length >= 2 &&
        !duplicatesAnchor &&
        hasPreviousAnchor &&
        continuityLine &&
        continuityAudioTime !== null &&
        continuityLine.midiTime < line.midiTime - 1e-9
      ) {
        gridHandles.push({
          continuityAudioTime,
          continuityLine,
          line,
          x,
          audioTime,
        });
      }
    });
    gridHandlesRef.current = gridHandles;

    ghostMarkers.forEach((marker) => {
      const anchorX = timeToX(marker.audioTime);
      if (
        anchorX < plotLeft - 20 ||
        anchorX > plotLeft + plotWidth + 20
      ) {
        return;
      }
      const opacity = 0.28 + clamp(marker.confidence, 0, 1) * 0.52;
      context.save();
      context.globalAlpha = opacity;
      context.strokeStyle = '#ffd500';
      context.lineWidth = 1.5;
      context.setLineDash([5, 5]);
      context.beginPath();
      context.moveTo(anchorX, audioTop);
      context.lineTo(anchorX, audioBottom);
      context.stroke();
      context.setLineDash([]);
      context.fillStyle = '#ffd500';
      context.beginPath();
      context.moveTo(anchorX, audioTop - 1);
      context.lineTo(anchorX + 5, audioTop + 7);
      context.lineTo(anchorX - 5, audioTop + 7);
      context.closePath();
      context.fill();
      context.restore();
    });

    const handles: AnchorHandle[] = [];
    displayMarkers.forEach((marker, index) => {
      const anchorX = timeToX(marker.audioTime);
      const visible =
        anchorX >= plotLeft - 20 &&
        anchorX <= plotLeft + plotWidth + 20;
      if (!visible) return;
      const selected = marker.id === selectedAnchorId;
      context.strokeStyle = selected
        ? '#ffe55a'
        : 'rgba(255,213,0,.62)';
      context.lineWidth = selected ? 2.5 : 1.5;
      context.beginPath();
      context.moveTo(anchorX, audioTop);
      context.lineTo(anchorX, audioBottom);
      context.stroke();

      context.fillStyle = selected ? '#fff3a5' : '#ffd500';
      context.beginPath();
      context.arc(
        anchorX,
        audioMiddle,
        selected ? 8 : 6,
        0,
        Math.PI * 2,
      );
      context.fill();
      context.beginPath();
      context.moveTo(anchorX, midiY - (selected ? 9 : 7));
      context.lineTo(anchorX + (selected ? 9 : 7), midiY);
      context.lineTo(anchorX, midiY + (selected ? 9 : 7));
      context.lineTo(anchorX - (selected ? 9 : 7), midiY);
      context.closePath();
      context.fill();

      context.fillStyle = '#15120a';
      context.font = '900 8px system-ui';
      context.textAlign = 'center';
      context.fillText(String(index + 1), anchorX, audioMiddle + 3);
      handles.push(
        { id: marker.id, x: anchorX, y: audioMiddle },
        { id: marker.id, x: anchorX, y: midiY },
      );
    });
    handlesRef.current = handles;

    if (
      playhead >= viewStart &&
      playhead <= viewStart + viewDuration
    ) {
      const playheadX = timeToX(playhead);
      context.strokeStyle = 'rgba(255,255,255,.94)';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(playheadX, 30);
      context.lineTo(playheadX, midiY + 22);
      context.stroke();
      context.fillStyle = '#fff';
      context.beginPath();
      context.moveTo(playheadX - 5, 30);
      context.lineTo(playheadX + 5, 30);
      context.lineTo(playheadX, 37);
      context.closePath();
      context.fill();
    }

    if (
      markers.length === 0 &&
      ghostMarkers.length === 0 &&
      !midiProjection
    ) {
      context.fillStyle = 'rgba(225,232,234,.42)';
      context.font = '600 13px system-ui';
      context.textAlign = 'center';
      context.fillText(
        'Carga MIDI y audio para comenzar la sincronización',
        plotLeft + plotWidth / 2,
        audioMiddle,
      );
    }

    canvas.dataset.plotLeft = String(plotLeft);
    canvas.dataset.plotWidth = String(plotWidth);
    canvas.dataset.audioMiddle = String(audioMiddle);
    canvas.dataset.midiY = String(midiY);
    canvas.dataset.xToTimeScale = String(viewDuration / plotWidth);
    canvas.dataset.xToTimeOrigin = String(xToTime(plotLeft));
  }, [
    audioDuration,
    ghostMarkers,
    gridPreview,
    interactionMode,
    markers,
    midiGhostVisible,
    midiProjection,
    offsetMs,
    peaks,
    playhead,
    resizeRevision,
    selectedAnchorId,
    timelineMarkers,
    viewDuration,
    viewStart,
  ]);

  const timeFromClientX = (
    clientX: number,
    canvas: HTMLCanvasElement,
  ): number => {
    const bounds = canvas.getBoundingClientRect();
    const plotLeft = Number(canvas.dataset.plotLeft || 0);
    const plotWidth = Number(canvas.dataset.plotWidth || bounds.width);
    const x = Math.min(
      plotLeft + plotWidth,
      Math.max(plotLeft, clientX - bounds.left),
    );
    return (
      viewStart +
      ((x - plotLeft) / Math.max(1, plotWidth)) *
        Math.max(0.001, viewDuration)
    );
  };

  const nearestAnchorAtX = (
    x: number,
    maximumDistance: number,
  ): AnchorHandle | null => {
    const uniqueHandles = new Map<string, AnchorHandle>();
    for (const handle of handlesRef.current) {
      if (!uniqueHandles.has(handle.id)) uniqueHandles.set(handle.id, handle);
    }
    const nearest = [...uniqueHandles.values()]
      .map((handle) => ({
        ...handle,
        distance: Math.abs(handle.x - x),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    return nearest && nearest.distance <= maximumDistance ? nearest : null;
  };

  const addAnchorAtClientX = (
    clientX: number,
    canvas: HTMLCanvasElement,
    hitDistance: number,
  ): boolean => {
    const bounds = canvas.getBoundingClientRect();
    const x = clientX - bounds.left;
    if (nearestAnchorAtX(x, hitDistance)) return false;
    onAdd(
      clamp(
        timeFromClientX(clientX, canvas),
        0,
        audioDuration,
      ),
    );
    return true;
  };

  const registerTouchTap = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (
      event.pointerType !== 'touch' ||
      event.isPrimary === false ||
      editingLocked ||
      interactionMode !== 'anchors'
    ) {
      lastTouchTapRef.current = null;
      return;
    }
    const now = Date.now();
    const previous = lastTouchTapRef.current;
    const isDoubleTap =
      previous !== null &&
      now - previous.at <= 400 &&
      Math.hypot(
        event.clientX - previous.clientX,
        event.clientY - previous.clientY,
      ) <= 24;
    if (!isDoubleTap) {
      lastTouchTapRef.current = {
        at: now,
        clientX: event.clientX,
        clientY: event.clientY,
      };
      return;
    }
    lastTouchTapRef.current = null;
    ignoreNativeDoubleClickUntilRef.current = now + 700;
    addAnchorAtClientX(event.clientX, event.currentTarget, 18);
  };

  const onPointerDown = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    if (
      audioDuration <= 0 ||
      event.isPrimary === false ||
      event.button !== 0 ||
      dragRef.current
    ) {
      return;
    }
    suppressNextClickRef.current = false;
    lastPointerTypeRef.current = event.pointerType;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    if (interactionMode === 'pan') {
      dragRef.current = {
        pointerId: event.pointerId,
        pointerLastX: x,
        pointerStartX: x,
        pointerType: event.pointerType,
        type: 'pan',
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (editingLocked) return;
    const nearestAnchor = nearestAnchorAtX(
      x,
      event.pointerType === 'touch' ? 18 : 12,
    );
    if (nearestAnchor) {
      onSelect(nearestAnchor.id);
      dragRef.current = {
        id: nearestAnchor.id,
        pointerId: event.pointerId,
        pointerLastX: x,
        pointerStartX: x,
        pointerType: event.pointerType,
        type: 'anchor',
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    if (interactionMode === 'grid') {
      const nearest = gridHandlesRef.current
        .map((handle) => ({
          ...handle,
          distance: Math.abs(handle.x - x),
        }))
        .sort((left, right) => left.distance - right.distance)[0];
      if (!nearest || nearest.distance > 24) return;
      onSelect(null);
      dragRef.current = {
        continuityAudioTime: nearest.continuityAudioTime,
        continuityMidiTime: nearest.continuityLine.midiTime,
        midiTime: nearest.line.midiTime,
        pointerId: event.pointerId,
        pointerLastX: x,
        pointerStartX: x,
        pointerType: event.pointerType,
        type: 'grid',
      };
      updateGridPreview({
        audioTime: nearest.audioTime,
        continuityAudioTime: nearest.continuityAudioTime,
        continuityMidiTime: nearest.continuityLine.midiTime,
        midiTime: nearest.line.midiTime,
        snapped: false,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
  };

  const onPointerMove = (
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const threshold = pointerDragThreshold(drag.pointerType);
    if (Math.abs(x - drag.pointerStartX) > threshold) drag.didMove = true;
    if (drag.type === 'pan') {
      if (!drag.didMove) return;
      onPan(
        -((x - drag.pointerLastX) / Math.max(1, bounds.width)) *
          viewDuration,
      );
      drag.pointerLastX = x;
      return;
    }
    if (
      drag.type === 'grid' &&
      drag.continuityAudioTime !== undefined &&
      drag.continuityMidiTime !== undefined &&
      drag.midiTime !== undefined
    ) {
      if (!drag.didMove) return;
      const plotWidth = Math.max(
        1,
        Number(event.currentTarget.dataset.plotWidth || bounds.width),
      );
      const resolved = resolveGridAnchorDrop({
        requestedAudioTime: timeFromClientX(
          event.clientX,
          event.currentTarget,
        ),
        midiTime: drag.midiTime,
        anchors: [
          ...markers.map((anchor) => ({
            ...anchor,
            audioTime: mapSyncAudioToDisplayTime(
              anchor.audioTime,
              offsetMs,
            ),
          })),
          {
            id: 'grid-continuity-bound',
            audioTime: drag.continuityAudioTime,
            midiTime: drag.continuityMidiTime,
          },
        ],
        audioDuration,
        landmarks,
        magnetEnabled,
        snapWindowSeconds: Math.min(
          0.3,
          Math.max(0.02, (viewDuration / plotWidth) * 14),
        ),
      });
      updateGridPreview({
        audioTime: resolved.audioTime,
        continuityAudioTime: drag.continuityAudioTime,
        continuityMidiTime: drag.continuityMidiTime,
        midiTime: resolved.midiTime,
        snapped: resolved.snapped,
      });
      return;
    }
    if (!drag.id) return;
    if (!drag.didMove) return;
    const time = timeFromClientX(event.clientX, event.currentTarget);
    onMove(
      drag.id,
      mapDisplayAudioToSyncTime(
        Math.min(audioDuration, time),
        offsetMs,
      ),
    );
  };

  const endDrag = (
    event: ReactPointerEvent<HTMLCanvasElement>,
    commitGrid = true,
  ) => {
    const drag = dragRef.current;
    if (drag && drag.pointerId !== event.pointerId) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const endX = event.clientX - bounds.left;
    const completedGridDrag =
      drag?.type === 'grid' &&
      drag.didMove &&
      Math.abs(endX - drag.pointerStartX) >
        pointerDragThreshold(drag.pointerType);
    if (
      commitGrid &&
      completedGridDrag &&
      gridPreviewRef.current
    ) {
      onAddGridAnchor({
        continuityAudioTime:
          gridPreviewRef.current.continuityAudioTime,
        continuityMidiTime:
          gridPreviewRef.current.continuityMidiTime,
        targetMidiTime: gridPreviewRef.current.midiTime,
        targetAudioTime: gridPreviewRef.current.audioTime,
      });
    }
    if (commitGrid && !drag?.didMove) {
      registerTouchTap(event);
    } else if (event.pointerType === 'touch') {
      lastTouchTapRef.current = null;
    }
    suppressNextClickRef.current =
      commitGrid && Boolean(drag?.didMove);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
    updateGridPreview(null);
  };

  const onClick = (event: ReactMouseEvent<HTMLCanvasElement>) => {
    if (audioDuration <= 0) return;
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const anchorHitDistance =
      lastPointerTypeRef.current === 'touch' ? 18 : 12;
    if (!nearestAnchorAtX(x, anchorHitDistance)) onSelect(null);
    onSeek(
      clamp(
        timeFromClientX(event.clientX, event.currentTarget),
        0,
        audioDuration,
      ),
    );
  };

  const onDoubleClick = (
    event: ReactMouseEvent<HTMLCanvasElement>,
  ) => {
    if (
      audioDuration <= 0 ||
      editingLocked ||
      interactionMode !== 'anchors' ||
      Date.now() < ignoreNativeDoubleClickUntilRef.current ||
      suppressNextClickRef.current
    ) {
      return;
    }
    addAnchorAtClientX(
      event.clientX,
      event.currentTarget,
      lastPointerTypeRef.current === 'touch' ? 18 : 14,
    );
  };

  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
    if (dragRef.current) return;
    if (event.ctrlKey || event.metaKey) {
      onZoom(
        event.deltaY < 0 ? 1.25 : 0.8,
        timeFromClientX(event.clientX, event.currentTarget),
      );
    } else {
      onPan((event.deltaX + event.deltaY) * (viewDuration / 900));
    }
  };

  return (
    <canvas
      aria-label="Editor visual de sincronía con forma de onda, MIDI fantasma, grid musical y anclas."
      className={`waveform-editor is-${interactionMode}${editingLocked ? ' is-locked' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      onPointerCancel={(event) => endDrag(event, false)}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onWheel={onWheel}
      ref={canvasRef}
      role="img"
    />
  );
}
