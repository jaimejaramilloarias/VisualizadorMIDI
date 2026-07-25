/// <reference lib="webworker" />

import { FAMILY_IDS } from '../core/midi/types';
import type { PackedMidiProject } from '../core/midi/types';
import {
  DEFAULT_SETTINGS,
  type VisualizationId,
  type VisualizationSettings,
} from '../core/state/visualizationState';
import type {
  RenderClock,
  RendererInboundMessage,
  RendererOutboundMessage,
} from '../renderer/protocol';

const scope = self as DedicatedWorkerGlobalScope;

const FAMILY_COLORS = [
  '#e99c53',
  '#eb6b6f',
  '#f2cb62',
  '#77b8dd',
  '#72d1c4',
  '#b991e6',
  '#da8cb8',
  '#a2d16a',
  '#eef0f4',
  '#6ee0dd',
  '#a8b0bd',
] as const;

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let project: PackedMidiProject | null = null;
let cssWidth = 1;
let cssHeight = 1;
let devicePixelRatio = 1;
let renderScale = 1;
let visualization: VisualizationId = 'now-line';
let settings: VisualizationSettings = { ...DEFAULT_SETTINGS };
let clock: RenderClock = {
  midiTime: 0,
  performanceTime: performance.now(),
  playing: false,
};
let longNotes = new Uint32Array();
let lastFrame = performance.now();
let lastTelemetry = performance.now();
let frameDurations: number[] = [];
let visibleNotes = 0;
let animationHandle = 0;

const send = (message: RendererOutboundMessage): void => {
  scope.postMessage(message);
};

const lowerBound = (values: Float64Array, target: number): number => {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < target) low = middle + 1;
    else high = middle;
  }
  return low;
};

const rebuildLongNoteIndex = (): void => {
  if (!project) {
    longNotes = new Uint32Array();
    return;
  }
  const indices: number[] = [];
  for (let index = 0; index < project.noteCount; index += 1) {
    if (project.notes.ends[index] - project.notes.starts[index] > 30) {
      indices.push(index);
    }
  }
  longNotes = Uint32Array.from(indices);
};

const currentMidiTime = (now: number): number =>
  Math.max(
    0,
    clock.midiTime +
      (clock.playing ? Math.max(0, now - clock.performanceTime) / 1000 : 0),
  );

const applySize = (): void => {
  if (!canvas || !context) return;
  const megapixelBudgets = {
    auto: 8_000_000,
    high: 12_000_000,
    ultra: 20_000_000,
  };
  const ratioCaps = { auto: 2, high: 2.5, ultra: 3 };
  const desiredRatio = Math.min(devicePixelRatio, ratioCaps[settings.quality]);
  const maximumRatio = Math.sqrt(
    megapixelBudgets[settings.quality] / Math.max(1, cssWidth * cssHeight),
  );
  renderScale = Math.max(1, Math.min(desiredRatio, maximumRatio));
  canvas.width = Math.max(1, Math.round(cssWidth * renderScale));
  canvas.height = Math.max(1, Math.round(cssHeight * renderScale));
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
};

const roundedRect = (
  ctx: OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
): void => {
  const safeRadius = Math.min(radius, Math.abs(width) / 2, Math.abs(height) / 2);
  ctx.beginPath();
  ctx.roundRect(x, y, width, height, safeRadius);
};

const renderBackdrop = (
  ctx: OffscreenCanvasRenderingContext2D,
  time: number,
): void => {
  ctx.save();
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  const wash = ctx.createRadialGradient(
    cssWidth * 0.48,
    cssHeight * 0.5,
    0,
    cssWidth * 0.48,
    cssHeight * 0.5,
    Math.max(cssWidth, cssHeight) * 0.7,
  );
  wash.addColorStop(0, 'rgba(33, 65, 82, 0.18)');
  wash.addColorStop(0.5, 'rgba(24, 38, 50, 0.07)');
  wash.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, cssWidth, cssHeight);

  ctx.strokeStyle = `rgba(195, 213, 220, ${settings.gridOpacity * 0.16})`;
  ctx.lineWidth = 1;
  const spacing = Math.max(56, cssWidth / 18);
  const offset = ((time * 18) % spacing + spacing) % spacing;
  for (let x = -offset; x < cssWidth + spacing; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, cssHeight);
    ctx.stroke();
  }
  ctx.restore();
};

const forEachVisibleNote = (
  visibleStart: number,
  visibleEnd: number,
  draw: (index: number) => void,
): number => {
  if (!project) return 0;
  const { starts, ends } = project.notes;
  const normalStart = lowerBound(starts, Math.max(0, visibleStart - 30));
  const normalEnd = lowerBound(starts, visibleEnd);
  let count = 0;

  for (let index = normalStart; index < normalEnd; index += 1) {
    if (ends[index] >= visibleStart) {
      draw(index);
      count += 1;
    }
  }

  for (const index of longNotes) {
    if (
      starts[index] < visibleStart - 30 &&
      starts[index] <= visibleEnd &&
      ends[index] >= visibleStart
    ) {
      draw(index);
      count += 1;
    }
  }
  return count;
};

const drawNowLine = (
  ctx: OffscreenCanvasRenderingContext2D,
  time: number,
): void => {
  if (!project) return;
  const playheadX = cssWidth * 0.38;
  const past = settings.secondsVisible * 0.38;
  const future = settings.secondsVisible - past;
  const visibleStart = time - past;
  const visibleEnd = time + future;
  const pixelsPerSecond = cssWidth / settings.secondsVisible;
  const lanePadding = Math.max(26, cssHeight * 0.075);
  const laneHeight = (cssHeight - lanePadding * 2) / 128;
  const noteHeight = Math.max(2.2, laneHeight * 1.55 * settings.noteScale);

  ctx.save();
  ctx.strokeStyle = `rgba(210, 224, 230, ${settings.gridOpacity})`;
  ctx.lineWidth = 1;
  for (
    let second = Math.floor(visibleStart);
    second <= visibleEnd;
    second += 1
  ) {
    const x = playheadX + (second - time) * pixelsPerSecond;
    ctx.globalAlpha = second % 4 === 0 ? 0.55 : 0.18;
    ctx.beginPath();
    ctx.moveTo(x, lanePadding * 0.55);
    ctx.lineTo(x, cssHeight - lanePadding * 0.55);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  visibleNotes = forEachVisibleNote(visibleStart, visibleEnd, (index) => {
    const start = project!.notes.starts[index];
    const end = project!.notes.ends[index];
    const pitch = project!.notes.pitches[index];
    const velocity = project!.notes.velocities[index] / 127;
    const family = project!.notes.families[index];
    const x = playheadX + (start - time) * pixelsPerSecond;
    const right = playheadX + (end - time) * pixelsPerSecond;
    const width = Math.max(2.5, right - x);
    const y =
      cssHeight -
      lanePadding -
      pitch * laneHeight -
      noteHeight * 0.5;
    const color = FAMILY_COLORS[family] ?? FAMILY_COLORS.at(-1)!;

    ctx.globalAlpha = 0.48 + velocity * 0.5;
    ctx.fillStyle = color;
    if (settings.glow > 0.02) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 8 * settings.glow * velocity;
    }
    roundedRect(ctx, x, y, width, noteHeight, noteHeight * 0.48);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  const line = ctx.createLinearGradient(
    playheadX,
    lanePadding * 0.35,
    playheadX,
    cssHeight - lanePadding * 0.35,
  );
  line.addColorStop(0, 'rgba(255,255,255,0)');
  line.addColorStop(0.12, 'rgba(242,248,250,0.92)');
  line.addColorStop(0.88, 'rgba(242,248,250,0.92)');
  line.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.globalAlpha = 1;
  ctx.strokeStyle = line;
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(playheadX, lanePadding * 0.35);
  ctx.lineTo(playheadX, cssHeight - lanePadding * 0.35);
  ctx.stroke();
  ctx.restore();
};

const drawPianoRoll = (
  ctx: OffscreenCanvasRenderingContext2D,
  time: number,
): void => {
  if (!project) return;
  const keyboardHeight = Math.max(52, cssHeight * 0.1);
  const playheadY = cssHeight - keyboardHeight;
  const visibleStart = time - 0.45;
  const visibleEnd = time + settings.secondsVisible;
  const pixelsPerSecond = playheadY / settings.secondsVisible;
  const noteWidth = Math.max(3, (cssWidth / 128) * 1.25 * settings.noteScale);

  ctx.save();
  ctx.strokeStyle = `rgba(210, 224, 230, ${settings.gridOpacity * 0.7})`;
  for (
    let second = Math.floor(visibleStart);
    second <= visibleEnd;
    second += 1
  ) {
    const y = playheadY - (second - time) * pixelsPerSecond;
    ctx.globalAlpha = second % 4 === 0 ? 0.5 : 0.16;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(cssWidth, y);
    ctx.stroke();
  }

  visibleNotes = forEachVisibleNote(visibleStart, visibleEnd, (index) => {
    const start = project!.notes.starts[index];
    const end = project!.notes.ends[index];
    const pitch = project!.notes.pitches[index];
    const velocity = project!.notes.velocities[index] / 127;
    const family = project!.notes.families[index];
    const x = ((pitch + 0.5) / 128) * cssWidth - noteWidth / 2;
    const bottom = playheadY - (start - time) * pixelsPerSecond;
    const top = playheadY - (end - time) * pixelsPerSecond;
    const height = Math.max(3, bottom - top);
    const color = FAMILY_COLORS[family] ?? FAMILY_COLORS.at(-1)!;

    ctx.globalAlpha = 0.5 + velocity * 0.46;
    ctx.fillStyle = color;
    ctx.shadowColor = color;
    ctx.shadowBlur = 7 * settings.glow * velocity;
    roundedRect(ctx, x, top, noteWidth, height, noteWidth * 0.45);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  ctx.globalAlpha = 1;
  const keyboardGradient = ctx.createLinearGradient(
    0,
    playheadY,
    0,
    cssHeight,
  );
  keyboardGradient.addColorStop(0, 'rgba(237, 242, 243, 0.18)');
  keyboardGradient.addColorStop(1, 'rgba(212, 222, 224, 0.07)');
  ctx.fillStyle = keyboardGradient;
  ctx.fillRect(0, playheadY, cssWidth, keyboardHeight);

  ctx.strokeStyle = 'rgba(238, 245, 246, 0.9)';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(0, playheadY);
  ctx.lineTo(cssWidth, playheadY);
  ctx.stroke();
  ctx.restore();
};

const renderFrame = (now: number): void => {
  animationHandle = scope.requestAnimationFrame(renderFrame);
  if (!context || !canvas) return;

  const frameDuration = Math.max(0.01, now - lastFrame);
  lastFrame = now;
  frameDurations.push(frameDuration);
  if (frameDurations.length > 240) frameDurations.shift();

  const time = currentMidiTime(now);
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  renderBackdrop(context, time);

  if (project) {
    if (visualization === 'piano-roll') {
      drawPianoRoll(context, time);
    } else {
      drawNowLine(context, time);
    }
  } else {
    visibleNotes = 0;
  }

  if (now - lastTelemetry >= 1000 && frameDurations.length > 0) {
    const sorted = [...frameDurations].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const average =
      frameDurations.reduce((total, value) => total + value, 0) /
      frameDurations.length;
    send({
      type: 'telemetry',
      telemetry: {
        fps: Math.round(1000 / average),
        frameP95: Math.round(p95 * 10) / 10,
        visibleNotes,
        renderWidth: canvas.width,
        renderHeight: canvas.height,
        scale: Math.round(renderScale * 100) / 100,
      },
    });
    frameDurations = [];
    lastTelemetry = now;
  }
};

scope.onmessage = (event: MessageEvent<RendererInboundMessage>): void => {
  try {
    const message = event.data;
    if (message.type === 'init') {
      canvas = message.canvas;
      context = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
      });
      if (!context) throw new Error('No fue posible iniciar el lienzo 2D.');
      cssWidth = message.width;
      cssHeight = message.height;
      devicePixelRatio = message.devicePixelRatio;
      applySize();
      if (!animationHandle) animationHandle = scope.requestAnimationFrame(renderFrame);
      send({ type: 'ready' });
    } else if (message.type === 'resize') {
      cssWidth = message.width;
      cssHeight = message.height;
      devicePixelRatio = message.devicePixelRatio;
      applySize();
    } else if (message.type === 'project') {
      project = message.project;
      rebuildLongNoteIndex();
    } else if (message.type === 'settings') {
      visualization = message.visualization;
      const qualityChanged = settings.quality !== message.settings.quality;
      settings = message.settings;
      if (qualityChanged) applySize();
    } else if (message.type === 'clock') {
      clock = message.clock;
    } else if (message.type === 'clear') {
      project = null;
      longNotes = new Uint32Array();
    }
  } catch (error) {
    send({
      type: 'error',
      message:
        error instanceof Error
          ? error.message
          : 'El motor visual encontró un error inesperado.',
    });
  }
};

export {};
