/// <reference lib="webworker" />

import type { PackedMidiProject } from '../core/midi/types';
import {
  DEFAULT_SETTINGS,
  type VisualizationSettings,
} from '../core/state/visualizationState';
import {
  DEFAULT_VISUAL_CONFIGURATION,
  type EndCardSettings,
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
  computeEndCardLineProgress,
  computeNoteOnBumpScale,
  computeNoteOnGlowPresentation,
  computeNoteOnGlowStrength,
  computeHorizontalViewport,
  computeProgressiveApproachX,
  computeProgressiveNoteBounds,
  computeRenderScale,
  composeTravelStyle,
  curveTravelOffset,
  extrapolateMidiTime,
  familyDepthPriority,
  hasEndCardContent,
  lockNoteOnArrivalOffset,
  noteOnBumpEnvelope,
  noteOnGlowEnvelope,
  resolveTargetFps,
  isTerminalNoteOff,
  shouldRenderProgressiveNoteLength,
  woodwindInstrumentDepthPriority,
} from '../renderer/renderMath';
import { drawNoteShape } from '../renderer/shapes';

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
  trackCues: [],
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
let renderOverrunFrames = 0;
let sizeChangePending = false;
let endCardStartMidiTime: number | null = null;
const glowTextures = new Map<string, OffscreenCanvas>();
const labelMetrics = new Map<
  string,
  { text: string; width: number; height: number }
>();
let hitRegions: Array<{
  noteIndex: number;
  trackIndex: number;
  midiTime: number;
  x: number;
  y: number;
  width: number;
  height: number;
}> = [];

interface EndCardLineLayout {
  text: string;
  font: string;
  fontSize: number;
  x: number;
  y: number;
  maxWidth: number;
  sourceIndex: number;
}

let endCardLayoutCache: {
  key: string;
  lines: EndCardLineLayout[];
} | null = null;

const GLOW_TEXTURE_SIZE = 128;
const MAX_GLOW_TEXTURES = 48;

const getGlowTexture = (color: string): OffscreenCanvas | null => {
  const cached = glowTextures.get(color);
  if (cached) return cached;
  const texture = new OffscreenCanvas(GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);
  const textureContext = texture.getContext('2d', { alpha: true });
  if (!textureContext) return null;
  const center = GLOW_TEXTURE_SIZE / 2;
  const gradient = textureContext.createRadialGradient(
    center,
    center,
    0,
    center,
    center,
    center,
  );
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.16, color);
  gradient.addColorStop(0.52, `${color}8f`);
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)');
  textureContext.fillStyle = gradient;
  textureContext.fillRect(0, 0, GLOW_TEXTURE_SIZE, GLOW_TEXTURE_SIZE);
  if (glowTextures.size >= MAX_GLOW_TEXTURES) {
    const oldest = glowTextures.keys().next().value;
    if (typeof oldest === 'string') glowTextures.delete(oldest);
  }
  glowTextures.set(color, texture);
  return texture;
};

const getLabelMetrics = (
  ctx: OffscreenCanvasRenderingContext2D,
  pitch: number,
): { text: string; width: number; height: number } => {
  const labels = appearance.global.noteLabels;
  const text = noteName(pitch);
  const key = `${labels.font}|${labels.size}|${text}`;
  const cached = labelMetrics.get(key);
  if (cached) return cached;
  const measured = ctx.measureText(text);
  const result = {
    text,
    width: measured.width,
    height: Math.max(
      labels.size,
      measured.actualBoundingBoxAscent + measured.actualBoundingBoxDescent,
    ),
  };
  labelMetrics.set(key, result);
  return result;
};

const fallbackTrackStyle: ResolvedTrackVisualStyle = {
  ...structuredClone(DEFAULT_VISUAL_CONFIGURATION.families.Auxiliares),
  enabled: true,
  family: 'Auxiliares',
  noteLabelsEnabled: false,
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
  const fallback = appearance.tracks[trackIndex] ?? fallbackTrackStyle;
  const noteStart = project.notes.starts[noteIndex];
  const cues = appearance.trackCues[trackIndex] ?? [];
  for (let index = cues.length - 1; index >= 0; index -= 1) {
    if (cues[index].at <= noteStart) return cues[index].style;
  }
  return fallback;
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

const END_CARD_UI_FONT =
  'Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif';
const END_CARD_SERIF_FONT =
  '"Iowan Old Style", "Palatino Linotype", Palatino, Georgia, serif';
const END_CARD_ENTRANCE_OFFSET = 22;
const END_CARD_LINE_DEFINITIONS: ReadonlyArray<{
  key: keyof EndCardSettings;
  fontFamily: string;
  fontWeight: 400 | 700;
  sizeRatio: number;
  minimumSize: number;
  maximumSize: number;
}> = [
  {
    key: 'title',
    fontFamily: END_CARD_SERIF_FONT,
    fontWeight: 400,
    sizeRatio: 0.1,
    minimumSize: 34,
    maximumSize: 112,
  },
  {
    key: 'subtitle',
    fontFamily: END_CARD_UI_FONT,
    fontWeight: 700,
    sizeRatio: 0.055,
    minimumSize: 22,
    maximumSize: 64,
  },
  {
    key: 'composerArranger',
    fontFamily: END_CARD_UI_FONT,
    fontWeight: 400,
    sizeRatio: 0.036,
    minimumSize: 16,
    maximumSize: 42,
  },
  {
    key: 'freeText',
    fontFamily: END_CARD_UI_FONT,
    fontWeight: 400,
    sizeRatio: 0.029,
    minimumSize: 14,
    maximumSize: 34,
  },
];

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

const endCardFont = (
  weight: 400 | 700,
  size: number,
  family: string,
): string => `${weight} ${size}px ${family}`;

const resolveEndCardLayout = (
  ctx: OffscreenCanvasRenderingContext2D,
  endCard: EndCardSettings,
): EndCardLineLayout[] => {
  const cacheKey = [
    cssWidth,
    cssHeight,
    endCard.title,
    endCard.subtitle,
    endCard.composerArranger,
    endCard.freeText,
  ].join('\u0000');
  if (endCardLayoutCache?.key === cacheKey) {
    return endCardLayoutCache.lines;
  }

  const left = clamp(cssWidth * 0.075, 28, 96);
  const right = clamp(cssWidth * 0.075, 28, 96);
  const maximumTextWidth = Math.max(1, cssWidth - left - right);
  const referenceSize = Math.min(cssWidth, cssHeight * 1.35);
  const gap = clamp(cssHeight * 0.022, 10, 26);
  let y = clamp(cssHeight * 0.12, 42, 140);
  const lines: EndCardLineLayout[] = [];

  END_CARD_LINE_DEFINITIONS.forEach((definition, sourceIndex) => {
    const text = endCard[definition.key].trim();
    if (!text) return;
    const idealSize = clamp(
      referenceSize * definition.sizeRatio,
      definition.minimumSize,
      definition.maximumSize,
    );
    ctx.font = endCardFont(
      definition.fontWeight,
      idealSize,
      definition.fontFamily,
    );
    const measuredWidth = ctx.measureText(text).width;
    const fittedSize =
      measuredWidth > maximumTextWidth
        ? Math.max(
            definition.minimumSize,
            idealSize * (maximumTextWidth / measuredWidth),
          )
        : idealSize;
    const font = endCardFont(
      definition.fontWeight,
      fittedSize,
      definition.fontFamily,
    );
    lines.push({
      text,
      font,
      fontSize: fittedSize,
      x: left,
      y,
      maxWidth: maximumTextWidth,
      sourceIndex,
    });
    y += fittedSize * 1.16 + gap;
  });

  endCardLayoutCache = { key: cacheKey, lines };
  return lines;
};

const drawEndCard = (
  ctx: OffscreenCanvasRenderingContext2D,
  elapsed: number,
): void => {
  const lines = resolveEndCardLayout(ctx, appearance.global.endCard);
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  for (const line of lines) {
    const progress = computeEndCardLineProgress(
      elapsed,
      line.sourceIndex,
    );
    if (progress <= 0) continue;
    ctx.globalAlpha = progress;
    ctx.font = line.font;
    ctx.fillText(
      line.text,
      line.x,
      line.y + (1 - progress) * END_CARD_ENTRANCE_OFFSET,
      line.maxWidth,
    );
  }
  ctx.restore();
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
  const {
    playheadX,
    pastSeconds: past,
    futureSeconds: future,
    pixelsPerSecond,
  } = computeHorizontalViewport(cssWidth, settings.secondsVisible);
  const visibleStart = time - past;
  const visibleEnd = time + future;
  const lanePadding = Math.max(26, cssHeight * 0.075);
  const laneHeight = (cssHeight - lanePadding * 2) / 128;
  const noteHeight = Math.max(2.2, laneHeight * 1.55 * settings.noteScale);

  interface NoteLayout {
    noteIndex: number;
    trackIndex: number;
    start: number;
    end: number;
    pitch: number;
    velocity: number;
    x: number;
    y: number;
    width: number;
    height: number;
    centerX: number;
    alpha: number;
    depthPriority: number;
    instrumentDepthPriority: number;
    progressiveLength: boolean;
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
    const travel = composeTravelStyle(
      appearance.global.travel,
      style.travel,
    );
    const travelOffset = curveTravelOffset({
      offset: linearOffset,
      canvasWidth: cssWidth,
      intensity: travel.intensity,
      magnetZone: travel.magnetZone,
      enabled: travel.enabled,
      released: time > end,
    });
    const arrivalX =
      playheadX + lockNoteOnArrivalOffset(travelOffset, linearOffset);
    const velocityScale = Math.max(
      0.22,
      Math.min(2.4, rawVelocity / Math.max(1, appearance.global.velocityBase)),
    );
    const duration = Math.max(0.001, end - start);
    const terminalLength = isTerminalNoteOff(
      end,
      project!.duration,
    );
    const progressiveLength = shouldRenderProgressiveNoteLength({
      noteEnd: end,
      projectDuration: project!.duration,
      stretch: style.stretch,
      extension: style.extension,
    });
    const bumpEnvelope = noteOnBumpEnvelope(time, start);
    const bump = computeNoteOnBumpScale({
      pulse: bumpEnvelope,
      globalBump: appearance.global.bumpStrength,
      familyBump: style.bumpStrength,
    });
    const stableHeight =
      noteHeight *
      appearance.global.heightScale *
      style.heightScale *
      velocityScale;
    const height = stableHeight * bump;
    const progressiveBaseWidth = terminalLength
      ? stableHeight
      : height;
    const progressiveDurationWidth = Math.max(
      progressiveBaseWidth,
      duration * pixelsPerSecond,
    );
    const staticDurationWidth = Math.max(
      height,
      duration * pixelsPerSecond,
    );
    let x = arrivalX;
    let width = height;
    if (progressiveLength && start <= time) {
      const bounds = computeProgressiveNoteBounds({
        playheadX,
        baseWidth: progressiveBaseWidth,
        finalWidth: progressiveDurationWidth,
        noteOn: start,
        noteOff: end,
        midiTime: time,
        pixelsPerSecond,
      });
      x = bounds.x;
      width = bounds.width;
    } else if (terminalLength) {
      width = stableHeight;
      x = computeProgressiveApproachX(arrivalX, width);
    } else if (
      !progressiveLength &&
      style.stretch &&
      !style.extension
    ) {
      width = staticDurationWidth;
    }
    const y = cssHeight - lanePadding - pitch * laneHeight - height * 0.5;
    const centerX = x + width / 2;
    const trackIndex = project!.notes.tracks[index];
    const track = project!.tracks[trackIndex];
    return {
      noteIndex: index,
      trackIndex,
      start,
      end,
      pitch,
      velocity,
      x,
      y,
      width: Math.max(0.5, width),
      height: Math.max(0.5, height),
      centerX,
      alpha:
        (0.48 + velocity * 0.5) * Math.max(0, spatialOpacity(centerX)),
      depthPriority: familyDepthPriority(style.family),
      instrumentDepthPriority: woodwindInstrumentDepthPriority(
        style.family,
        track?.name ?? '',
        track?.instrument ?? '',
      ),
      progressiveLength,
      style,
    };
  };

  ctx.save();
  const layouts: NoteLayout[] = [];
  forEachVisibleNote(visibleStart, visibleEnd, (index) => {
    const layout = computeLayout(index);
    if (layout) layouts.push(layout);
  });
  layouts.sort(
    (left, right) =>
      left.depthPriority - right.depthPriority ||
      left.instrumentDepthPriority - right.instrumentDepthPriority ||
      left.trackIndex - right.trackIndex ||
      left.noteIndex - right.noteIndex,
  );
  visibleNotes = layouts.length;
  hitRegions.length = 0;
  for (const layout of layouts) {
    hitRegions.push({
      noteIndex: layout.noteIndex,
      trackIndex: layout.trackIndex,
      midiTime: layout.start,
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
    });
  }

  const drawLayout = (layout: NoteLayout): void => {
    const {
      start,
      velocity,
      style,
      x,
      y,
      width,
      height,
      progressiveLength,
    } = layout;
    const centerX = x + width / 2;
    const noteOnGlow = noteOnGlowEnvelope(time, start);
    const glow = computeNoteOnGlowStrength({
      pulse: noteOnGlow,
      sceneGlow: settings.glow,
      globalGlow: appearance.global.glowStrength,
      familyGlow: style.glowStrength,
    });

    if (glow > 0.001) {
      const halo = computeNoteOnGlowPresentation({
        strength: glow,
        velocity,
        noteHeight: height,
      });
      const haloCenterX =
        progressiveLength && start <= time
          ? x + width - height * 0.5
          : centerX;
      const haloCenterY = y + height * 0.5;
      const texture = getGlowTexture(style.color);
      if (texture) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = halo.alpha;
        ctx.drawImage(
          texture,
          haloCenterX - halo.radius,
          haloCenterY - halo.radius,
          halo.radius * 2,
          halo.radius * 2,
        );
        ctx.restore();
      }
    }
    ctx.globalAlpha = layout.alpha;
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

    const labels = appearance.global.noteLabels;
    if (style.noteLabelsEnabled) {
      ctx.save();
      ctx.font = `${labels.size}px "${labels.font}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const metrics = getLabelMetrics(ctx, layout.pitch);
      const boxWidth = metrics.width + labels.padding * 2;
      const boxHeight = metrics.height + labels.padding * 2;
      const boxX = centerX - boxWidth / 2;
      const boxY = y + height / 2 - boxHeight / 2;
      const radius = Math.min(
        labels.borderRadius,
        boxWidth / 2,
        boxHeight / 2,
      );
      ctx.globalAlpha =
        labels.backgroundOpacity * Math.max(0.35, spatialOpacity(centerX));
      ctx.fillStyle = labels.backgroundColor;
      ctx.beginPath();
      ctx.moveTo(boxX + radius, boxY);
      ctx.lineTo(boxX + boxWidth - radius, boxY);
      ctx.quadraticCurveTo(
        boxX + boxWidth,
        boxY,
        boxX + boxWidth,
        boxY + radius,
      );
      ctx.lineTo(boxX + boxWidth, boxY + boxHeight - radius);
      ctx.quadraticCurveTo(
        boxX + boxWidth,
        boxY + boxHeight,
        boxX + boxWidth - radius,
        boxY + boxHeight,
      );
      ctx.lineTo(boxX + radius, boxY + boxHeight);
      ctx.quadraticCurveTo(
        boxX,
        boxY + boxHeight,
        boxX,
        boxY + boxHeight - radius,
      );
      ctx.lineTo(boxX, boxY + radius);
      ctx.quadraticCurveTo(boxX, boxY, boxX + radius, boxY);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = Math.max(0.35, spatialOpacity(centerX));
      ctx.fillStyle = labels.color;
      ctx.fillText(metrics.text, centerX, y + height / 2);
      ctx.restore();
    }
  };

  for (const layout of layouts) drawLayout(layout);

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
    sizeChangePending = true;
  } else if (fastWindows >= 6 && adaptiveRatio < 1) {
    adaptiveRatio = Math.min(1, adaptiveRatio + 0.04);
    fastWindows = 0;
    sizeChangePending = true;
  }
};

const reactToRenderCost = (renderCost: number): void => {
  if (!clock.playing || settings.quality !== 'auto') return;
  const frameBudget = 1000 / targetFps();
  if (renderCost > frameBudget * 0.92) {
    renderOverrunFrames += 1;
  } else {
    renderOverrunFrames = Math.max(0, renderOverrunFrames - 1);
  }
  if (renderOverrunFrames >= 2 && adaptiveRatio > 0.55) {
    adaptiveRatio = Math.max(0.55, adaptiveRatio - 0.1);
    renderOverrunFrames = 0;
    fastWindows = 0;
    sizeChangePending = true;
  }
};

const renderFrame = (now: number): void => {
  animationHandle = 0;
  if (!rendererVisible || !context || !canvas) return;
  if (clock.playing) {
    animationHandle = scope.requestAnimationFrame(renderFrame);
  }

  if (clock.playing && !shouldPresentFrame(now)) return;

  if (sizeChangePending) {
    sizeChangePending = false;
    applySize();
  }

  if (clock.playing) {
    const frameDuration = Math.max(0.01, now - lastFrame);
    lastFrame = now;
    frameDurations.push(frameDuration);
    if (frameDurations.length > 240) frameDurations.shift();
  }

  const time = currentMidiTime(now);
  const renderStarted = performance.now();
  context.setTransform(renderScale, 0, 0, renderScale, 0, 0);
  renderBackdrop(context);

  if (project) {
    const endCardElapsed =
      endCardStartMidiTime !== null &&
      hasEndCardContent(appearance.global.endCard)
        ? time - endCardStartMidiTime
        : -1;
    if (endCardElapsed >= 0) {
      visibleNotes = 0;
      hitRegions.length = 0;
      drawEndCard(context, endCardElapsed);
    } else {
      drawHorizontalScene(context, time);
    }
  } else {
    visibleNotes = 0;
    hitRegions.length = 0;
  }
  reactToRenderCost(performance.now() - renderStarted);

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
      endCardStartMidiTime = null;
      rebuildLongNoteIndex();
      requestRender();
    } else if (message.type === 'settings') {
      const qualityChanged = settings.quality !== message.settings.quality;
      settings = message.settings;
      if (qualityChanged) {
        adaptiveRatio = 1;
        slowWindows = 0;
        fastWindows = 0;
        renderOverrunFrames = 0;
        sizeChangePending = false;
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
      glowTextures.clear();
      labelMetrics.clear();
      endCardLayoutCache = null;
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
      renderOverrunFrames = 0;
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
    } else if (message.type === 'end-card-timeline') {
      endCardStartMidiTime =
        message.startMidiTime !== null &&
        Number.isFinite(message.startMidiTime)
          ? Math.max(0, message.startMidiTime)
          : null;
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
    } else if (message.type === 'hit-test') {
      for (let index = hitRegions.length - 1; index >= 0; index -= 1) {
        const region = hitRegions[index];
        const padding = Math.max(4, Math.min(10, region.height * 0.25));
        if (
          message.x >= region.x - padding &&
          message.x <= region.x + region.width + padding &&
          message.y >= region.y - padding &&
          message.y <= region.y + region.height + padding
        ) {
          send({
            type: 'note-selected',
            selection: {
              noteIndex: region.noteIndex,
              trackIndex: region.trackIndex,
              midiTime: region.midiTime,
            },
          });
          break;
        }
      }
    } else if (message.type === 'refresh') {
      adaptiveRatio = 1;
      slowWindows = 0;
      fastWindows = 0;
      renderOverrunFrames = 0;
      sizeChangePending = false;
      resetFrameCadence();
      applySize();
      requestRender();
    } else if (message.type === 'clear') {
      project = null;
      endCardStartMidiTime = null;
      longNotes = new Uint32Array();
      hitRegions = [];
      endCardLayoutCache = null;
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
