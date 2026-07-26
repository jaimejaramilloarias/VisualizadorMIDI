import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import type { SyncAnchor } from '../core/state/visualizationState';

type InteractionMode = 'anchors' | 'pan';

interface WaveformEditorProps {
  audioDuration: number;
  interactionMode: InteractionMode;
  markers: SyncAnchor[];
  onAdd: (audioTime: number) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, audioTime: number) => void;
  onPan: (deltaSeconds: number) => void;
  onSelect: (id: string | null) => void;
  onZoom: (factor: number, focusTime: number) => void;
  peaks: Float32Array | null;
  playhead: number;
  selectedAnchorId: string | null;
  viewDuration: number;
  viewStart: number;
}

interface AnchorHandle {
  id: string;
  x: number;
  y: number;
}

interface DragState {
  id?: string;
  pointerStartX: number;
  viewStart: number;
  type: 'anchor' | 'pan';
}

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
  const multiplier = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return multiplier * magnitude;
};

export function WaveformEditor({
  audioDuration,
  interactionMode,
  markers,
  onAdd,
  onDelete,
  onMove,
  onPan,
  onSelect,
  onZoom,
  peaks,
  playhead,
  selectedAnchorId,
  viewDuration,
  viewStart,
}: WaveformEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const handlesRef = useRef<AnchorHandle[]>([]);
  const [resizeRevision, setResizeRevision] = useState(0);

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
      plotLeft + ((time - viewStart) / Math.max(0.001, viewDuration)) * plotWidth;
    const xToTime = (x: number): number =>
      viewStart +
      ((x - plotLeft) / Math.max(1, plotWidth)) * Math.max(0.001, viewDuration);

    context.clearRect(0, 0, width, height);
    context.fillStyle = '#06080b';
    context.fillRect(0, 0, width, height);

    const background = context.createLinearGradient(0, audioTop, 0, audioBottom);
    background.addColorStop(0, 'rgba(255,255,255,.035)');
    background.addColorStop(1, 'rgba(255,255,255,.012)');
    context.fillStyle = background;
    context.fillRect(plotLeft, audioTop, plotWidth, audioBottom - audioTop);

    const gridStep = niceGridStep(viewDuration);
    const firstGrid = Math.ceil(viewStart / gridStep) * gridStep;
    context.font = '600 10px system-ui';
    context.textAlign = 'center';
    for (
      let time = firstGrid;
      time <= viewStart + viewDuration + gridStep * 0.001;
      time += gridStep
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

    if (peaks?.length) {
      const peakCount = Math.floor(peaks.length / 2);
      const visibleStartIndex = Math.max(
        0,
        Math.floor((viewStart / Math.max(audioDuration, 0.001)) * peakCount),
      );
      const visibleEndIndex = Math.min(
        peakCount - 1,
        Math.ceil(
          ((viewStart + viewDuration) / Math.max(audioDuration, 0.001)) *
            peakCount,
        ),
      );
      const visiblePeakCount = Math.max(
        1,
        visibleEndIndex - visibleStartIndex + 1,
      );
      const samplesPerPixel = visiblePeakCount / plotWidth;
      context.strokeStyle = '#78b9c9';
      context.globalAlpha = 0.9;
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

    const handles: AnchorHandle[] = [];
    markers.forEach((marker, index) => {
      const anchorX = timeToX(marker.audioTime);
      const visible =
        anchorX >= plotLeft - 20 && anchorX <= plotLeft + plotWidth + 20;
      if (!visible) return;
      const selected = marker.id === selectedAnchorId;
      context.strokeStyle = selected ? '#ffe55a' : 'rgba(255,213,0,.62)';
      context.lineWidth = selected ? 2.5 : 1.5;
      context.beginPath();
      context.moveTo(anchorX, audioTop);
      context.lineTo(anchorX, audioBottom);
      context.stroke();

      context.fillStyle = selected ? '#fff3a5' : '#ffd500';
      context.beginPath();
      context.arc(anchorX, audioMiddle, selected ? 8 : 6, 0, Math.PI * 2);
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

    if (markers.length === 0) {
      context.fillStyle = 'rgba(225,232,234,.42)';
      context.font = '600 13px system-ui';
      context.textAlign = 'center';
      context.fillText(
        'Toca la forma de onda para crear la primera ancla',
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
    markers,
    peaks,
    playhead,
    resizeRevision,
    selectedAnchorId,
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
      ((x - plotLeft) / Math.max(1, plotWidth)) * Math.max(0.001, viewDuration)
    );
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (audioDuration <= 0) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    if (interactionMode === 'pan') {
      dragRef.current = {
        pointerStartX: x,
        type: 'pan',
        viewStart,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    const nearest = handlesRef.current
      .map((handle) => ({
        ...handle,
        distance: Math.hypot(handle.x - x, handle.y - y),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest && nearest.distance <= 18) {
      onSelect(nearest.id);
      dragRef.current = {
        id: nearest.id,
        pointerStartX: x,
        type: 'anchor',
        viewStart,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }
    onAdd(
      Math.min(
        audioDuration,
        timeFromClientX(event.clientX, event.currentTarget),
      ),
    );
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (!drag) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    if (drag.type === 'pan') {
      onPan(
        -((x - drag.pointerStartX) / Math.max(1, bounds.width)) * viewDuration,
      );
      drag.pointerStartX = x;
      return;
    }
    if (!drag.id) return;
    const time = timeFromClientX(event.clientX, event.currentTarget);
    onMove(drag.id, Math.min(audioDuration, time));
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const onDoubleClick = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - bounds.left;
    const y = event.clientY - bounds.top;
    const nearest = handlesRef.current
      .map((handle) => ({
        ...handle,
        distance: Math.hypot(handle.x - x, handle.y - y),
      }))
      .sort((left, right) => left.distance - right.distance)[0];
    if (nearest && nearest.distance <= 20) onDelete(nearest.id);
  };

  const onWheel = (event: ReactWheelEvent<HTMLCanvasElement>) => {
    event.preventDefault();
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
      aria-label="Editor visual de sincronía. Cada ancla vertical une un tiempo de audio con su tiempo MIDI."
      className={`waveform-editor is-${interactionMode}`}
      onDoubleClick={onDoubleClick}
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onWheel={onWheel}
      ref={canvasRef}
      role="img"
    />
  );
}
