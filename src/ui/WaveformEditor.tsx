import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import type { SyncAnchor } from '../core/state/visualizationState';

interface WaveformEditorProps {
  duration: number;
  markers: SyncAnchor[];
  peaks: Float32Array | null;
  playhead: number;
  onAdd: (audioTime: number) => void;
  onMove: (id: string, audioTime: number) => void;
}

export function WaveformEditor({
  duration,
  markers,
  peaks,
  playhead,
  onAdd,
  onMove,
}: WaveformEditorProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dragIdRef = useRef<string | null>(null);

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
    context.clearRect(0, 0, width, height);
    context.fillStyle = '#0c1014';
    context.fillRect(0, 0, width, height);
    context.strokeStyle = 'rgba(255,255,255,.06)';
    context.beginPath();
    context.moveTo(0, height / 2);
    context.lineTo(width, height / 2);
    context.stroke();

    if (peaks?.length) {
      context.strokeStyle = '#78b9c9';
      context.globalAlpha = 0.8;
      context.lineWidth = 1;
      context.beginPath();
      const count = peaks.length / 2;
      for (let index = 0; index < count; index += 1) {
        const x = (index / Math.max(1, count - 1)) * width;
        const minimum = peaks[index * 2];
        const maximum = peaks[index * 2 + 1];
        context.moveTo(x, height / 2 + minimum * height * 0.44);
        context.lineTo(x, height / 2 + maximum * height * 0.44);
      }
      context.stroke();
      context.globalAlpha = 1;
    }

    markers.forEach((marker, index) => {
      const x = (marker.audioTime / Math.max(duration, 0.001)) * width;
      context.strokeStyle = '#ffd500';
      context.lineWidth = 1.5;
      context.beginPath();
      context.moveTo(x, 5);
      context.lineTo(x, height - 5);
      context.stroke();
      context.fillStyle = '#ffd500';
      context.beginPath();
      context.arc(x, 8, 4.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#fff';
      context.font = '700 8px system-ui';
      context.textAlign = 'center';
      context.fillText(String(index + 1), x, height - 7);
    });

    const playheadX = (playhead / Math.max(duration, 0.001)) * width;
    context.strokeStyle = 'rgba(255,255,255,.9)';
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(playheadX, 0);
    context.lineTo(playheadX, height);
    context.stroke();
  }, [duration, markers, peaks, playhead]);

  const timeFromEvent = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const fraction = Math.max(
      0,
      Math.min(1, (event.clientX - bounds.left) / Math.max(1, bounds.width)),
    );
    return fraction * duration;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (!duration) return;
    const time = timeFromEvent(event);
    const bounds = event.currentTarget.getBoundingClientRect();
    const tolerance = (12 / Math.max(1, bounds.width)) * duration;
    const nearest = markers.find(
      (marker) => Math.abs(marker.audioTime - time) <= tolerance,
    );
    if (nearest) {
      dragIdRef.current = nearest.id;
      event.currentTarget.setPointerCapture(event.pointerId);
    } else {
      onAdd(time);
    }
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (dragIdRef.current) onMove(dragIdRef.current, timeFromEvent(event));
  };

  const endDrag = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragIdRef.current = null;
  };

  return (
    <canvas
      aria-label="Forma de onda; toca para crear una ancla y arrastra los marcadores para moverlos"
      className="waveform-editor"
      onPointerCancel={endDrag}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      ref={canvasRef}
      role="img"
    />
  );
}
