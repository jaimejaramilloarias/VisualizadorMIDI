/// <reference lib="webworker" />

import type { PackedMidiProject } from '../core/midi/types';
import {
  DEFAULT_SETTINGS,
  type VisualizationId,
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
import { drawNoteShape, strokeNoteShape } from '../renderer/shapes';

const scope = self as DedicatedWorkerGlobalScope;

let canvas: OffscreenCanvas | null = null;
let context: OffscreenCanvasRenderingContext2D | null = null;
let project: PackedMidiProject | null = null;
let backgroundBitmap: ImageBitmap | null = null;
let cssWidth = 1;
let cssHeight = 1;
let devicePixelRatio = 1;
let renderScale = 1;
let visualization: VisualizationId = 'now-line';
let settings: VisualizationSettings = { ...DEFAULT_SETTINGS };
let appearance: RenderAppearance = {
  global: structuredClone(DEFAULT_VISUAL_CONFIGURATION.global),
  tracks: [],
};
let clock: RenderClock = {
  midiTime: 0,
  performanceTime: performance.now(),
  playing: false,
  playbackRate: 1,
};
let longNotes = new Uint32Array();
let nextNoteIndices = new Uint32Array();
let lastFrame = performance.now();
let lastTelemetry = performance.now();
let frameDurations: number[] = [];
let visibleNotes = 0;
let animationHandle = 0;
let rendererVisible = true;
let adaptiveRatio = 1;
let slowWindows = 0;
let fastWindows = 0;
let lastRenderedAt = 0;

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
    nextNoteIndices = new Uint32Array();
    return;
  }
  const indices: number[] = [];
  nextNoteIndices = new Uint32Array(project.noteCount);
  nextNoteIndices.fill(0xffffffff);
  const lastByTrack = new Map<number, number>();
  for (let index = 0; index < project.noteCount; index += 1) {
    if (project.notes.ends[index] - project.notes.starts[index] > 30) {
      indices.push(index);
    }
    const track = project.notes.tracks[index];
    const previous = lastByTrack.get(track);
    if (previous !== undefined) nextNoteIndices[previous] = index;
    lastByTrack.set(track, index);
  }
  longNotes = Uint32Array.from(indices);
};

const currentMidiTime = (now: number): number =>
  Math.max(
    0,
    clock.midiTime +
      (clock.playing
        ? (Math.max(0, now - clock.performanceTime) / 1000) *
          clock.playbackRate
        : 0),
  );

const applySize = (): void => {
  if (!canvas || !context) return;
  const megapixelBudgets = {
    auto: 8_000_000,
    high: 12_000_000,
    ultra: 20_000_000,
  };
  const ratioCaps = { auto: 2, high: 2.5, ultra: 3 };
  const desiredRatio =
    Math.min(devicePixelRatio, ratioCaps[settings.quality]) *
    (settings.quality === 'auto' ? adaptiveRatio : 1) *
    (appearance.global.supersampling / 2);
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

  if (backgroundBitmap && appearance.global.backgroundImageOpacity > 0) {
    const scale = Math.max(
      cssWidth / backgroundBitmap.width,
      cssHeight / backgroundBitmap.height,
    );
    const width = backgroundBitmap.width * scale;
    const height = backgroundBitmap.height * scale;
    ctx.globalAlpha = appearance.global.backgroundImageOpacity;
    ctx.drawImage(
      backgroundBitmap,
      (cssWidth - width) / 2,
      (cssHeight - height) / 2,
      width,
      height,
    );
    ctx.globalAlpha = 1;
  }

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

  interface NoteLayout {
    index: number;
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

  const curveTravelOffset = (
    offset: number,
    style: ResolvedTrackVisualStyle,
    released: boolean,
  ): number => {
    if (!style.travel.enabled || released || offset === 0) return offset;
    const maximum = cssWidth * 0.62 + Math.max(80, cssWidth * 0.1);
    if (Math.abs(offset) >= maximum) return offset;
    const normalized = Math.min(1, Math.abs(offset) / maximum);
    const curved =
      offset > 0
        ? normalized ** (1 + style.travel.magnetZone * 1.7)
        : 1 - (1 - normalized) ** (1 + style.travel.magnetZone * 0.45);
    const intensity = Math.min(2, Math.max(0, style.travel.intensity));
    let mixed =
      normalized + (curved - normalized) * Math.min(1, intensity);
    if (intensity > 1) mixed += (curved - mixed) * (intensity - 1);
    return (
      Math.sign(offset) *
      Math.max(0, Math.min(1, mixed)) *
      maximum
    );
  };

  const computeLayout = (index: number): NoteLayout | null => {
    const start = project!.notes.starts[index];
    const end = project!.notes.ends[index];
    const pitch = project!.notes.pitches[index];
    const rawVelocity = project!.notes.velocities[index];
    const velocity = rawVelocity / 127;
    const style = getTrackStyle(index);
    if (!style.enabled) return null;

    const linearOffset = (start - time) * pixelsPerSecond;
    const x =
      playheadX +
      curveTravelOffset(linearOffset, style, time > end);
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
    let width = height;
    if (style.stretch && !style.extension) {
      width = style.shape.endsWith('Double') ? height : durationWidth;
    } else if (style.stretch && style.extension && start <= time) {
      const progress = Math.max(0, Math.min(1, (time - start) / duration));
      width = height + progress * (durationWidth - height);
    }
    const y = cssHeight - lanePadding - pitch * laneHeight - height * 0.5;
    const centerX = x + width / 2;
    return {
      index,
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
    group.sort((left, right) => left.start - right.start);
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

  const drawLayout = (
    layout: NoteLayout,
    alphaScale = 1,
    override?: { x: number; y: number; width: number; height: number },
  ): void => {
    const { start, velocity, style, active } = layout;
    const x = override?.x ?? layout.x;
    const y = override?.y ?? layout.y;
    const width = override?.width ?? layout.width;
    const height = override?.height ?? layout.height;
    const centerX = x + width / 2;
    const noteOnGlow =
      Math.max(0, 1 - Math.max(0, time - start) / 0.28);
    const glow =
      settings.glow *
      (appearance.global.glowStrength + style.glowStrength) *
      (0.45 + noteOnGlow * 1.8 + (active ? 0.35 : 0));

    ctx.globalAlpha = layout.alpha * alphaScale;
    if (glow > 0.02) {
      ctx.shadowColor = style.color;
      ctx.shadowBlur = 12 * glow * velocity;
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
      ctx.globalAlpha = style.outline.opacity * alphaScale;
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
      ctx.globalAlpha =
        Math.max(0.35, spatialOpacity(centerX)) * alphaScale;
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
  layouts.forEach((layout) => {
    if (!layout.style.travel.enabled) return;
    const nextIndex = nextNoteIndices[layout.index];
    if (nextIndex === 0xffffffff) return;
    const nextStart = project!.notes.starts[nextIndex];
    const duration = nextStart - layout.start;
    if (duration <= 0 || time < layout.start || time > nextStart) return;
    const progress = Math.max(0, Math.min(1, (time - layout.start) / duration));
    const nextPitch = project!.notes.pitches[nextIndex];
    const nextStyle = getTrackStyle(nextIndex);
    if (!nextStyle.enabled) return;
    const targetY =
      cssHeight -
      lanePadding -
      nextPitch * laneHeight -
      layout.height * 0.5;
    const targetX =
      playheadX +
      curveTravelOffset(
        (nextStart - time) * pixelsPerSecond,
        nextStyle,
        false,
      );
    const scale = Math.max(0, 1 - progress);
    if (scale <= 0.02) return;
    const width = Math.max(0.5, layout.width * scale);
    const height = Math.max(0.5, layout.height * scale);
    drawLayout(layout, scale * 0.72, {
      x: layout.x + (targetX - layout.x) * progress,
      y:
        layout.centerY +
        (targetY + layout.height / 2 - layout.centerY) * progress -
        height / 2,
      width,
      height,
    });
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
    const style = getTrackStyle(index);
    if (!style.enabled) return;
    const x = ((pitch + 0.5) / 128) * cssWidth - noteWidth / 2;
    const bottom = playheadY - (start - time) * pixelsPerSecond;
    const top = playheadY - (end - time) * pixelsPerSecond;
    const height = Math.max(3, bottom - top);
    const color = style.color;

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

const drawOrbit = (
  ctx: OffscreenCanvasRenderingContext2D,
  time: number,
): void => {
  if (!project) return;
  const centerX = cssWidth * 0.5;
  const centerY = cssHeight * 0.51;
  const outerRadius = Math.max(
    80,
    Math.min(cssWidth, cssHeight) * 0.44,
  );
  const playheadRadius = Math.max(32, outerRadius * 0.18);
  const radialSpan = outerRadius - playheadRadius;
  const visibleStart = time - 0.35;
  const visibleEnd = time + settings.secondsVisible;
  const pulse = 0.5 + Math.sin(time * Math.PI * 2) * 0.5;

  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.lineWidth = 1;
  for (let ring = 0; ring < 6; ring += 1) {
    const radius = playheadRadius + (radialSpan * ring) / 5;
    ctx.strokeStyle = `rgba(205, 221, 225, ${
      settings.gridOpacity * (ring === 0 ? 0.46 : 0.13)
    })`;
    ctx.beginPath();
    ctx.arc(0, 0, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  for (let spoke = 0; spoke < 12; spoke += 1) {
    const angle = (spoke / 12) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = `rgba(205, 221, 225, ${settings.gridOpacity * 0.08})`;
    ctx.beginPath();
    ctx.moveTo(
      Math.cos(angle) * playheadRadius,
      Math.sin(angle) * playheadRadius,
    );
    ctx.lineTo(
      Math.cos(angle) * outerRadius,
      Math.sin(angle) * outerRadius,
    );
    ctx.stroke();
  }
  ctx.restore();

  visibleNotes = forEachVisibleNote(visibleStart, visibleEnd, (index) => {
    const start = project!.notes.starts[index];
    const end = project!.notes.ends[index];
    const pitch = project!.notes.pitches[index];
    const velocity = project!.notes.velocities[index] / 127;
    const style = getTrackStyle(index);
    if (!style.enabled) return;
    const active = start <= time && end >= time;
    const timeProgress = Math.max(
      0,
      Math.min(1, (start - time) / settings.secondsVisible),
    );
    const radius = active
      ? playheadRadius
      : playheadRadius + timeProgress * radialSpan;
    const angle = (pitch / 128) * Math.PI * 2 - Math.PI / 2;
    const noteDuration = Math.min(
      0.48,
      Math.max(0.018, ((end - start) / settings.secondsVisible) * 2.4),
    );
    const color = style.color;
    const lineWidth =
      (1.2 + velocity * 2.6 + (active ? pulse * 1.5 : 0)) *
      settings.noteScale;

    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.globalAlpha = active ? 0.9 : 0.38 + velocity * 0.5;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.shadowColor = color;
    ctx.shadowBlur =
      (active ? 12 + pulse * 8 : 5 + velocity * 5) * settings.glow;
    ctx.beginPath();
    ctx.arc(radius, 0, 0, 0, 0);
    ctx.beginPath();
    ctx.arc(
      0,
      0,
      radius,
      angle - noteDuration,
      angle,
      false,
    );
    ctx.stroke();

    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    ctx.beginPath();
    ctx.arc(x, y, lineWidth * (active ? 1.4 : 0.8), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });

  ctx.save();
  ctx.translate(centerX, centerY);
  const core = ctx.createRadialGradient(
    0,
    0,
    playheadRadius * 0.2,
    0,
    0,
    playheadRadius * 1.45,
  );
  core.addColorStop(0, `rgba(239, 155, 82, ${0.12 + pulse * 0.06})`);
  core.addColorStop(0.7, 'rgba(239, 155, 82, 0.035)');
  core.addColorStop(1, 'rgba(239, 155, 82, 0)');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, playheadRadius * 1.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(248, 242, 234, 0.9)';
  ctx.lineWidth = 1.3;
  ctx.shadowColor = '#ef9b52';
  ctx.shadowBlur = 8 + pulse * 4;
  ctx.beginPath();
  ctx.arc(0, 0, playheadRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
};

const adaptResolution = (fps: number, p95: number): void => {
  if (
    settings.quality !== 'auto' ||
    appearance.global.fpsMode === 'fixed'
  ) {
    return;
  }
  if (p95 > 21 || fps < 52) {
    slowWindows += 1;
    fastWindows = 0;
  } else if (p95 < 17.8 && fps >= 57) {
    fastWindows += 1;
    slowWindows = 0;
  } else {
    slowWindows = 0;
    fastWindows = 0;
  }

  if (slowWindows >= 2 && adaptiveRatio > 0.65) {
    adaptiveRatio = Math.max(0.65, adaptiveRatio - 0.1);
    slowWindows = 0;
    applySize();
  } else if (fastWindows >= 4 && adaptiveRatio < 1) {
    adaptiveRatio = Math.min(1, adaptiveRatio + 0.05);
    fastWindows = 0;
    applySize();
  }
};

const renderFrame = (now: number): void => {
  animationHandle = 0;
  if (rendererVisible) {
    animationHandle = scope.requestAnimationFrame(renderFrame);
  }
  if (!context || !canvas) return;

  if (
    appearance.global.fpsMode === 'fixed' &&
    now - lastRenderedAt < 1000 / appearance.global.fixedFps
  ) {
    return;
  }
  lastRenderedAt = now;

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
    } else if (visualization === 'orbit') {
      drawOrbit(context, time);
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
      if (qualityChanged) {
        adaptiveRatio = 1;
        slowWindows = 0;
        fastWindows = 0;
        applySize();
      }
    } else if (message.type === 'appearance') {
      const supersamplingChanged =
        appearance.global.supersampling !==
        message.appearance.global.supersampling;
      appearance = message.appearance;
      if (supersamplingChanged) applySize();
    } else if (message.type === 'background-image') {
      backgroundBitmap?.close();
      backgroundBitmap = message.bitmap;
    } else if (message.type === 'clock') {
      clock = message.clock;
    } else if (message.type === 'visibility') {
      rendererVisible = message.visible;
      if (!rendererVisible && animationHandle) {
        scope.cancelAnimationFrame(animationHandle);
        animationHandle = 0;
      } else if (rendererVisible && !animationHandle) {
        lastFrame = performance.now();
        frameDurations = [];
        animationHandle = scope.requestAnimationFrame(renderFrame);
      }
    } else if (message.type === 'refresh') {
      adaptiveRatio = 1;
      slowWindows = 0;
      fastWindows = 0;
      frameDurations = [];
      lastFrame = performance.now();
      lastRenderedAt = 0;
      applySize();
    } else if (message.type === 'clear') {
      project = null;
      longNotes = new Uint32Array();
      nextNoteIndices = new Uint32Array();
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
