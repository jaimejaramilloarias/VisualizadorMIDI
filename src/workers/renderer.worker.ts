/// <reference lib="webworker" />

import type { PackedMidiProject } from '../core/midi/types';
import {
  DEFAULT_SETTINGS,
  type VisualizationSettings,
} from '../core/state/visualizationState';
import {
  DEFAULT_VISUAL_CONFIGURATION,
  type RenderAppearance,
  type ResolvedTrackVisualStyle,
} from '../core/state/visualConfiguration';
import type {
  RenderClock,
  RendererInboundMessage,
  RendererOutboundMessage,
} from '../renderer/protocol';
import {
  advanceFrameCadence,
  computePastExtensionBounds,
  computeRenderScale,
  curveTravelOffset,
  extrapolateMidiTime,
  lockNoteOnArrivalOffset,
  noteOnGlowEnvelope,
  resolveTargetFps,
} from '../renderer/renderMath';
import { drawNoteShape, strokeNoteShape } from '../renderer/shapes';

const scope = self as DedicatedWorkerGlobalScope;

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let project: PackedMidiProject | null = null;
let cssWidth = 1;
let cssHeight = 1;
let devicePixelRatio = 1;
let renderScale = 1;
let settings: VisualizationSettings = { ...DEFAULT_SETTINGS };
let appearance: RenderAppearance = {
  global: structuredClone(DEFAULT_VISUAL_CONFIGURATION.global),
  tracks: [],
};
let clock: RenderClock = {
  midiTime: 0,
  epochTime: performance.timeOrigin + performance.now(),
  playing: false,
  playbackRate: 1,
};
let longNotes = new Uint32Array();
let lastFrame = performance.now();
let lastTelemetry = performance.now();
let frameDurations: number[] = [];
let visibleNotes = 0;
let animationHandle = 0;
let rendererVisible = true;
let adaptiveRatio = 1;
let slowWindows = 0;
let fastWindows = 0;
let displayRefreshRate = 60;
let previousAnimationFrame = 0;
let frameAccumulator = 0;

const fallbackTrackStyle: ResolvedTrackVisualStyle = {
  ...structuredClone(DEFAULT_VISUAL_CONFIGURATION.families.Auxiliares),
  enabled: true,
  family: 'Auxiliares',
};

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
  extrapolateMidiTime({
    midiTime: clock.midiTime,
    anchorEpochTime: clock.epochTime,
    nowEpochTime: performance.timeOrigin + now,
    playing: clock.playing,
    playbackRate: clock.playbackRate,
  });

const targetFps = (): number =>
  resolveTargetFps(appearance.global.fpsMode, displayRefreshRate);

const resetFrameCadence = (): void => {
  previousAnimationFrame = 0;
  frameAccumulator = 0;
  lastFrame = performance.now();
  frameDurations = [];
};

const shouldPresentFrame = (now: number): boolean => {
  if (appearance.global.fpsMode === 'auto') {
    previousAnimationFrame = now;
    frameAccumulator = 0;
    return true;
  }
  const target = targetFps();
  if (previousAnimationFrame <= 0) {
    previousAnimationFrame = now;
    frameAccumulator = 0;
    return true;
  }
  const delta = Math.min(250, Math.max(0, now - previousAnimationFrame));
  previousAnimationFrame = now;
  const cadence = advanceFrameCadence({
    accumulator: frameAccumulator,
    delta,
    targetFps: target,
  });
  frameAccumulator = cadence.accumulator;
  return cadence.present;
};

const applySize = (): void => {
  if (!canvas || !context) return;
  renderScale = computeRenderScale({
    cssWidth,
    cssHeight,
    devicePixelRatio,
    quality: settings.quality,
    adaptiveRatio,
    supersampling: appearance.global.supersampling,
  });
  canvas.width = Math.max(1, Math.round(cssWidth * renderScale));
  canvas.height = Math.max(1, Math.round(cssHeight * renderScale));
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
};

const getTrackStyle = (noteIndex: number): ResolvedTrackVisualStyle => {
  if (!project) return fallbackTrackStyle;
  const trackIndex = project.notes.tracks[noteIndex];
  return appearance.tracks[trackIndex] ?? fallbackTrackStyle;
};

const spatialOpacity = (centerX: number): number => {
  const distance = Math.min(
    1,
    Math.abs(centerX - cssWidth / 2) / Math.max(1, cssWidth / 2),
  );
  return (
    appearance.global.opacityCenter +
    (appearance.global.opacityEdge - appearance.global.opacityCenter) *
      distance
  );
};

const noteName = (pitch: number): string =>
  [
    'C',
    'C♯/D♭',
    'D',
    'D♯/E♭',
    'E',
    'F',
    'F♯/G♭',
    'G',
    'G♯/A♭',
    'A',
    'A♯/B♭',
    'B',
  ][((Math.round(pitch) % 12) + 12) % 12];

const renderBackdrop = (
  ctx: OffscreenCanvasRenderingContext2D,
): void => {
  ctx.fillStyle = settings.background;
  ctx.fillRect(0, 0, cssWidth, cssHeight);
};

const forEachVisibleNote = (
  visibleStart: number,
  visibleEnd: number,
  draw: (index: number) => boolean | void,
): number => {
  if (!project) return 0;
  const { starts, ends } = project.notes;
  const normalStart = lowerBound(starts, Math.max(0, visibleStart - 30));
  const normalEnd = lowerBound(starts, visibleEnd);
  let count = 0;

  for (let index = normalStart; index < normalEnd; index += 1) {
    if (ends[index] >= visibleStart) {
      if (draw(index) !== false) count += 1;
    }
  }

  for (const index of longNotes) {
    if (starts[index] > visibleEnd) break;
    if (
      starts[index] < visibleStart - 30 &&
      ends[index] >= visibleStart
    ) {
      if (draw(index) !== false) count += 1;
    }
  }
  return count;
};

const drawHorizontalScene = (
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

  interface NoteLayout {
    track: number;
    start: number;
    end: number;
    pitch: number;
    velocity: number;
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    centerY: number;
    alpha: number;
    active: boolean;
    style: ResolvedTrackVisualStyle;
  }

  const computeLayout = (index: number): NoteLayout | null => {
    const start = project!.notes.starts[index];
    const end = project!.notes.ends[index];
    const pitch = project!.notes.pitches[index];
    const rawVelocity = project!.notes.velocities[index];
    const velocity = rawVelocity / 127;
    const style = getTrackStyle(index);
    if (!style.enabled) return null;

    const secondsUntilNoteOn = start - time;
    const linearOffset = secondsUntilNoteOn * pixelsPerSecond;
    const travelOffset = curveTravelOffset({
      offset: linearOffset,
      canvasWidth: cssWidth,
      intensity: style.travel.intensity,
      magnetZone: style.travel.magnetZone,
      enabled: style.travel.enabled,
      released: time > end,
    });
    const arrivalX =
      playheadX + lockNoteOnArrivalOffset(travelOffset, linearOffset);
    const velocityScale = Math.max(
      0.22,
      Math.min(2.4, rawVelocity / Math.max(1, appearance.global.velocityBase)),
    );
    const duration = Math.max(0.001, end - start);
    const attack = Math.max(0, Math.min(1, (time - start) / 0.18));
    const release = Math.max(
      0,
      Math.min(1, (end - time) / Math.max(0.18, duration * 0.3)),
    );
    const bumpEnvelope =
      time >= start && time <= end ? Math.sin(attack * Math.PI) * release : 0;
    const bump =
      1 +
      bumpEnvelope *
        appearance.global.bumpStrength *
        style.bumpStrength *
        0.26;
    const height =
      noteHeight *
      appearance.global.heightScale *
      style.heightScale *
      velocityScale *
      bump;
    const durationWidth = Math.max(height, duration * pixelsPerSecond);
    let x = arrivalX;
    let width = height;
    if (style.stretch && !style.extension) {
      width = style.shape.endsWith('Double') ? height : durationWidth;
    } else if (style.stretch && style.extension && start <= time) {
      const progress = Math.max(0, Math.min(1, (time - start) / duration));
      if (time <= end) {
        const bounds = computePastExtensionBounds({
          playheadX,
          baseWidth: height,
          finalWidth: durationWidth,
          progress,
        });
        x = bounds.x;
        width = bounds.width;
      } else {
        width = durationWidth;
      }
    }
    const y = cssHeight - lanePadding - pitch * laneHeight - height * 0.5;
    const centerX = x + width / 2;
    return {
      track: project!.notes.tracks[index],
      start,
      end,
      pitch,
      velocity,
      x,
      y,
      width: Math.max(0.5, width),
      height: Math.max(0.5, height),
      centerX,
      centerY: y + height / 2,
      alpha:
        (0.48 + velocity * 0.5) * Math.max(0, spatialOpacity(centerX)),
      active: start <= time && end >= time,
      style,
    };
  };

  ctx.save();
  const layouts: NoteLayout[] = [];
  forEachVisibleNote(visibleStart, visibleEnd, (index) => {
    const layout = computeLayout(index);
    if (layout) layouts.push(layout);
  });
  visibleNotes = layouts.length;

  const byTrack = new Map<number, NoteLayout[]>();
  layouts.forEach((layout) => {
    if (!layout.style.line.enabled) return;
    const group = byTrack.get(layout.track);
    if (group) group.push(layout);
    else byTrack.set(layout.track, [layout]);
  });
  byTrack.forEach((group) => {
    for (let index = 0; index < group.length - 1; index += 1) {
      const current = group[index];
      const next = group[index + 1];
      const lineStyle = current.style.line;
      const alpha =
        lineStyle.opacity * ((current.alpha + next.alpha) / 2);
      if (alpha <= 0 || lineStyle.width <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = current.style.color;
      ctx.lineWidth = lineStyle.width;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(current.x, current.centerY);
      ctx.quadraticCurveTo(
        (current.x + next.x) / 2,
        (current.centerY + next.centerY) / 2,
        next.x,
        next.centerY,
      );
      ctx.stroke();
      ctx.restore();
    }
  });

  const drawLayout = (layout: NoteLayout): void => {
    const { start, velocity, style, active, x, y, width, height } = layout;
    const centerX = x + width / 2;
    const noteOnGlow = noteOnGlowEnvelope(time, start);
    const glow =
      settings.glow *
      (appearance.global.glowStrength + style.glowStrength) *
      (noteOnGlow * 1.8 + (active ? 0.35 : 0));

    ctx.globalAlpha = layout.alpha;
    if (glow > 0.02) {
      ctx.shadowColor = style.color;
      ctx.shadowBlur = Math.min(48, 12 * glow * velocity);
    }
    drawNoteShape(
      ctx,
      style.shape,
      x,
      y,
      width,
      height,
      style.color,
      style.secondaryColor,
    );
    ctx.shadowBlur = 0;

    const outlineAllowed =
      style.outline.mode === 'full' ||
      (style.outline.mode === 'pre' && start >= time) ||
      (style.outline.mode === 'post' && start < time);
    if (style.outline.enabled && outlineAllowed && style.outline.opacity > 0) {
      ctx.save();
      ctx.globalAlpha = style.outline.opacity;
      ctx.strokeStyle = style.outline.useShapeColor
        ? style.color
        : style.outline.color;
      ctx.lineWidth = style.outline.width;
      ctx.lineJoin = 'round';
      strokeNoteShape(ctx, style.shape, x, y, width, height);
      ctx.restore();
    }

    const labels = appearance.global.noteLabels;
    if (
      labels.enabled &&
      height >= labels.size * 0.72 &&
      width >= labels.size * 1.2
    ) {
      ctx.save();
      ctx.globalAlpha = Math.max(0.35, spatialOpacity(centerX));
      ctx.fillStyle = labels.color;
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.65)';
      ctx.lineWidth = Math.max(1, labels.size * 0.1);
      ctx.font = `${labels.size}px "${labels.font}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeText(noteName(layout.pitch), centerX, y + height / 2);
      ctx.fillText(noteName(layout.pitch), centerX, y + height / 2);
      ctx.restore();
    }
  };

  layouts.forEach((layout) => drawLayout(layout));

  ctx.restore();
};

const adaptResolution = (fps: number, p95: number): void => {
  if (settings.quality !== 'auto') return;
  const expectedFps = targetFps();
  const frameBudget = 1000 / expectedFps;
  if (
    fps < expectedFps * 0.9 ||
    (p95 > frameBudget * 1.35 && fps < expectedFps * 0.98)
  ) {
    slowWindows += 1;
    fastWindows = 0;
  } else if (
    p95 < frameBudget * 1.2 &&
    fps >= expectedFps * 0.97
  ) {
    fastWindows += 1;
    slowWindows = 0;
  } else {
    slowWindows = 0;
    fastWindows = 0;
  }

  if (slowWindows >= 1 && adaptiveRatio > 0.55) {
    adaptiveRatio = Math.max(0.55, adaptiveRatio - 0.12);
    slowWindows = 0;
    applySize();
  } else if (fastWindows >= 6 && adaptiveRatio < 1) {
    adaptiveRatio = Math.min(1, adaptiveRatio + 0.04);
    fastWindows = 0;
    applySize();
  }
};

const renderFrame = (now: number): void => {
  animationHandle = 0;
  if (!rendererVisible || !context || !canvas) return;
  if (clock.playing) {
    animationHandle = scope.requestAnimationFrame(renderFrame);
  }

  if (clock.playing && !shouldPresentFrame(now)) return;

  if (clock.playing) {
    const frameDuration = Math.max(0.01, now - lastFrame);
    lastFrame = now;
    frameDurations.push(frameDuration);
    if (frameDurations.length > 240) frameDurations.shift();
  }

  const time = currentMidiTime(now);
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  renderBackdrop(context);

  if (project) {
    drawHorizontalScene(context, time);
  } else {
    visibleNotes = 0;
  }

  if (
    clock.playing &&
    now - lastTelemetry >= 1000 &&
    frameDurations.length > 0
  ) {
    const sorted = [...frameDurations].sort((a, b) => a - b);
    const p95 = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))];
    const average =
      frameDurations.reduce((total, value) => total + value, 0) /
      frameDurations.length;
    const fps = Math.round(1000 / average);
    adaptResolution(fps, p95);
    send({
      type: 'telemetry',
      telemetry: {
        fps,
        frameP95: Math.round(p95 * 10) / 10,
        visibleNotes,
        renderWidth: canvas.width,
        renderHeight: canvas.height,
        scale: Math.round(renderScale * 100) / 100,
        displayFps: displayRefreshRate,
        targetFps: targetFps(),
      },
    });
    frameDurations = [];
    lastTelemetry = now;
  }
};

const requestRender = (): void => {
  if (!rendererVisible || animationHandle) return;
  if (!clock.playing) {
    resetFrameCadence();
  }
  animationHandle = scope.requestAnimationFrame(renderFrame);
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
      requestRender();
      send({ type: 'ready' });
    } else if (message.type === 'resize') {
      cssWidth = message.width;
      cssHeight = message.height;
      devicePixelRatio = message.devicePixelRatio;
      applySize();
      requestRender();
    } else if (message.type === 'project') {
      project = message.project;
      rebuildLongNoteIndex();
      requestRender();
    } else if (message.type === 'settings') {
      const qualityChanged = settings.quality !== message.settings.quality;
      settings = message.settings;
      if (qualityChanged) {
        adaptiveRatio = 1;
        slowWindows = 0;
        fastWindows = 0;
        applySize();
      }
      requestRender();
    } else if (message.type === 'appearance') {
      const supersamplingChanged =
        appearance.global.supersampling !==
        message.appearance.global.supersampling;
      const fpsModeChanged =
        appearance.global.fpsMode !== message.appearance.global.fpsMode;
      appearance = message.appearance;
      if (supersamplingChanged) applySize();
      if (fpsModeChanged) {
        slowWindows = 0;
        fastWindows = 0;
        resetFrameCadence();
      }
      requestRender();
    } else if (message.type === 'display-refresh-rate') {
      const previousTarget = targetFps();
      displayRefreshRate = Math.min(240, Math.max(30, message.fps));
      slowWindows = 0;
      fastWindows = 0;
      if (targetFps() !== previousTarget) resetFrameCadence();
      if (!clock.playing) {
        send({
          type: 'telemetry',
          telemetry: {
            fps: 0,
            frameP95: 0,
            visibleNotes,
            renderWidth: canvas?.width ?? 0,
            renderHeight: canvas?.height ?? 0,
            scale: Math.round(renderScale * 100) / 100,
            displayFps: displayRefreshRate,
            targetFps: targetFps(),
          },
        });
      }
      requestRender();
    } else if (message.type === 'clock') {
      const playingChanged = clock.playing !== message.clock.playing;
      clock = message.clock;
      if (playingChanged) resetFrameCadence();
      requestRender();
    } else if (message.type === 'visibility') {
      rendererVisible = message.visible;
      if (!rendererVisible && animationHandle) {
        scope.cancelAnimationFrame(animationHandle);
        animationHandle = 0;
      } else if (rendererVisible && !animationHandle) {
        resetFrameCadence();
        requestRender();
      }
    } else if (message.type === 'refresh') {
      adaptiveRatio = 1;
      slowWindows = 0;
      fastWindows = 0;
      resetFrameCadence();
      applySize();
      requestRender();
    } else if (message.type === 'clear') {
      project = null;
      longNotes = new Uint32Array();
      requestRender();
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
