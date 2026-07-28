// @vitest-environment jsdom

import {
  act,
  createElement,
  type ComponentProps,
  type ComponentType,
} from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SyncMidiProjection } from './syncMidiProjection';
import { WaveformEditor } from './WaveformEditor';

type EditorProps = ComponentProps<typeof WaveformEditor> & {
  onSeek: (audioTime: number) => void;
};

const TestableWaveformEditor =
  WaveformEditor as ComponentType<EditorProps>;

const CANVAS_WIDTH = 1_000;
const CANVAS_HEIGHT = 500;
const PLOT_LEFT = 58;
const PLOT_WIDTH = CANVAS_WIDTH - PLOT_LEFT - 18;
const AUDIO_MIDDLE = (48 + (CANVAS_HEIGHT - 34)) / 2;

const xForTime = (time: number): number =>
  PLOT_LEFT + (time / 20) * PLOT_WIDTH;

const midiProjection: SyncMidiProjection = {
  duration: 20,
  ticksPerBeat: 480,
  tempoMap: [
    {
      tick: 0,
      seconds: 0,
      microsecondsPerBeat: 500_000,
    },
  ],
  timeSignatures: [
    {
      tick: 0,
      numerator: 4,
      denominator: 4,
    },
  ],
  noteCount: 0,
  starts: new Float64Array(),
  ends: new Float64Array(),
  pitches: new Uint8Array(),
  velocities: new Uint8Array(),
  pitchRange: null,
};

const markers = [
  { id: 'start', audioTime: 0, midiTime: 0 },
  { id: 'middle', audioTime: 10, midiTime: 10 },
  { id: 'end', audioTime: 20, midiTime: 20 },
];

interface CallbackSpies {
  onAdd: ReturnType<typeof vi.fn>;
  onAddGridAnchor: ReturnType<typeof vi.fn>;
  onMove: ReturnType<typeof vi.fn>;
  onPan: ReturnType<typeof vi.fn>;
  onSeek: ReturnType<typeof vi.fn>;
  onSelect: ReturnType<typeof vi.fn>;
  onZoom: ReturnType<typeof vi.fn>;
}

interface MountedEditor {
  callbacks: CallbackSpies;
  canvas: HTMLCanvasElement;
  root: Root;
}

const createCanvasContext = (): CanvasRenderingContext2D => {
  const gradient = { addColorStop: vi.fn() };
  const methods = new Set([
    'arc',
    'beginPath',
    'clearRect',
    'closePath',
    'fill',
    'fillRect',
    'fillText',
    'lineTo',
    'moveTo',
    'restore',
    'save',
    'setLineDash',
    'setTransform',
    'stroke',
  ]);
  return new Proxy(
    {},
    {
      get(target, property) {
        if (property === 'createLinearGradient') {
          return () => gradient;
        }
        if (
          typeof property === 'string' &&
          methods.has(property)
        ) {
          const record = target as Record<string, unknown>;
          record[property] ??= vi.fn();
          return record[property];
        }
        return (target as Record<PropertyKey, unknown>)[property];
      },
      set(target, property, value) {
        (target as Record<PropertyKey, unknown>)[property] = value;
        return true;
      },
    },
  ) as CanvasRenderingContext2D;
};

const dispatchPointer = (
  canvas: HTMLCanvasElement,
  type: 'pointercancel' | 'pointerdown' | 'pointermove' | 'pointerup',
  clientX: number,
  clientY: number,
  pointerType: 'mouse' | 'touch' = 'mouse',
  pointerId = 1,
  isPrimary = true,
): void => {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
  Object.defineProperties(event, {
    isPrimary: { value: isPrimary },
    pointerId: { value: pointerId },
    pointerType: { value: pointerType },
  });
  act(() => {
    canvas.dispatchEvent(event);
  });
};

const dispatchClick = (
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
  detail = 1,
): void => {
  act(() => {
    canvas.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        detail,
      }),
    );
  });
};

const dispatchDoubleClickSequence = (
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): void => {
  dispatchPointer(canvas, 'pointerdown', clientX, clientY);
  dispatchPointer(canvas, 'pointerup', clientX, clientY);
  dispatchClick(canvas, clientX, clientY, 1);
  dispatchPointer(canvas, 'pointerdown', clientX, clientY);
  dispatchPointer(canvas, 'pointerup', clientX, clientY);
  dispatchClick(canvas, clientX, clientY, 2);
  act(() => {
    canvas.dispatchEvent(
      new MouseEvent('dblclick', {
        bubbles: true,
        cancelable: true,
        clientX,
        clientY,
        detail: 2,
      }),
    );
  });
};

const dispatchTouchTap = (
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
): void => {
  dispatchPointer(
    canvas,
    'pointerdown',
    clientX,
    clientY,
    'touch',
  );
  dispatchPointer(
    canvas,
    'pointerup',
    clientX,
    clientY,
    'touch',
  );
  dispatchClick(canvas, clientX, clientY);
};

const mountEditor = (
  interactionMode: 'anchors' | 'grid' | 'pan',
  overrides: Partial<EditorProps> = {},
): MountedEditor => {
  const callbacks: CallbackSpies = {
    onAdd: vi.fn(),
    onAddGridAnchor: vi.fn(),
    onMove: vi.fn(),
    onPan: vi.fn(),
    onSeek: vi.fn(),
    onSelect: vi.fn(),
    onZoom: vi.fn(),
  };
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  act(() => {
    root.render(
      createElement(TestableWaveformEditor, {
        audioDuration: 20,
        interactionMode,
        landmarks: [],
        magnetEnabled: false,
        markers,
        midiGhostVisible: true,
        midiProjection,
        offsetMs: 0,
        onAdd: callbacks.onAdd,
        onAddGridAnchor: callbacks.onAddGridAnchor,
        onMove: callbacks.onMove,
        onPan: callbacks.onPan,
        onSeek: callbacks.onSeek,
        onSelect: callbacks.onSelect,
        onZoom: callbacks.onZoom,
        peaks: null,
        playhead: 0,
        selectedAnchorId: null,
        viewDuration: 20,
        viewStart: 0,
        ...overrides,
      }),
    );
  });

  const canvas = host.querySelector('canvas');
  if (!canvas) throw new Error('WaveformEditor no renderizó su canvas.');
  return { callbacks, canvas, root };
};

const mountedRoots: Root[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;

  class ResizeObserverMock {
    disconnect(): void {}
    observe(): void {}
    unobserve(): void {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock);
  vi.stubGlobal(
    'requestAnimationFrame',
    vi.fn(() => 1),
  );
  vi.stubGlobal('cancelAnimationFrame', vi.fn());
  vi.spyOn(
    HTMLCanvasElement.prototype,
    'getBoundingClientRect',
  ).mockReturnValue({
    bottom: CANVAS_HEIGHT,
    height: CANVAS_HEIGHT,
    left: 0,
    right: CANVAS_WIDTH,
    top: 0,
    width: CANVAS_WIDTH,
    x: 0,
    y: 0,
    toJSON: () => ({}),
  });
  vi.spyOn(
    HTMLCanvasElement.prototype,
    'getContext',
  ).mockImplementation(() => createCanvasContext());

  const captures = new WeakMap<HTMLCanvasElement, Set<number>>();
  Object.defineProperties(HTMLCanvasElement.prototype, {
    hasPointerCapture: {
      configurable: true,
      value(this: HTMLCanvasElement, pointerId: number) {
        return captures.get(this)?.has(pointerId) ?? false;
      },
    },
    releasePointerCapture: {
      configurable: true,
      value(this: HTMLCanvasElement, pointerId: number) {
        captures.get(this)?.delete(pointerId);
      },
    },
    setPointerCapture: {
      configurable: true,
      value(this: HTMLCanvasElement, pointerId: number) {
        const pointerIds = captures.get(this) ?? new Set<number>();
        pointerIds.add(pointerId);
        captures.set(this, pointerIds);
      },
    },
  });
});

afterEach(() => {
  mountedRoots.splice(0).forEach((root) => {
    act(() => root.unmount());
  });
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const renderEditor = (
  interactionMode: 'anchors' | 'grid' | 'pan',
  overrides: Partial<EditorProps> = {},
): MountedEditor => {
  const mounted = mountEditor(interactionMode, overrides);
  mountedRoots.push(mounted.root);
  return mounted;
};

describe('WaveformEditor interactions', () => {
  it('un clic simple sobre el fondo busca el playhead sin crear anclas', () => {
    const { callbacks, canvas } = renderEditor('anchors');
    const x = xForTime(15);

    dispatchPointer(canvas, 'pointerdown', x, 180);
    dispatchPointer(canvas, 'pointerup', x, 180);
    dispatchClick(canvas, x, 180);

    expect(callbacks.onSeek).toHaveBeenCalledTimes(1);
    expect(callbacks.onSeek).toHaveBeenCalledWith(
      expect.closeTo(15, 6),
    );
    expect(callbacks.onAdd).not.toHaveBeenCalled();
  });

  it('un doble clic crea exactamente una ancla solamente en modo Anclas', () => {
    const { callbacks, canvas } = renderEditor('anchors');
    const x = xForTime(15);

    dispatchDoubleClickSequence(canvas, x, 180);

    expect(callbacks.onAdd).toHaveBeenCalledTimes(1);
    expect(callbacks.onAdd).toHaveBeenCalledWith(
      expect.closeTo(15, 6),
    );
  });

  it('clic y doble clic sobre fondo en Ajustar grid buscan pero no crean anclas', () => {
    const { callbacks, canvas } = renderEditor('grid');
    const x = xForTime(15);

    dispatchPointer(canvas, 'pointerdown', x, 180);
    dispatchPointer(canvas, 'pointerup', x, 180);
    dispatchClick(canvas, x, 180);

    expect(callbacks.onSeek).toHaveBeenCalledTimes(1);
    expect(callbacks.onSeek).toHaveBeenLastCalledWith(
      expect.closeTo(15, 6),
    );
    expect(callbacks.onAdd).not.toHaveBeenCalled();
    expect(callbacks.onAddGridAnchor).not.toHaveBeenCalled();

    callbacks.onSeek.mockClear();
    dispatchDoubleClickSequence(canvas, x, 180);

    expect(callbacks.onAdd).not.toHaveBeenCalled();
    expect(callbacks.onAddGridAnchor).not.toHaveBeenCalled();
  });

  it('un drag de línea de grid crea la corrección y suprime el seek posterior', () => {
    const { callbacks, canvas } = renderEditor('grid');
    const startX = xForTime(8);
    const endX = xForTime(9);

    dispatchPointer(canvas, 'pointerdown', startX, 180);
    dispatchPointer(canvas, 'pointermove', endX, 180);
    dispatchPointer(canvas, 'pointerup', endX, 180);
    dispatchClick(canvas, endX, 180);

    expect(callbacks.onAddGridAnchor).toHaveBeenCalledTimes(1);
    expect(callbacks.onAddGridAnchor).toHaveBeenCalledWith(
      {
        continuityAudioTime: expect.closeTo(6, 6),
        continuityMidiTime: expect.closeTo(6, 6),
        targetAudioTime: expect.closeTo(9, 6),
        targetMidiTime: expect.closeTo(8, 6),
      },
    );
    expect(callbacks.onSeek).not.toHaveBeenCalled();
    expect(callbacks.onAdd).not.toHaveBeenCalled();
  });

  it('en Ajustar grid una ancla existente se selecciona y arrastra sin buscar', () => {
    const { callbacks, canvas } = renderEditor('grid');
    const startX = xForTime(10);
    const endX = xForTime(11);

    dispatchPointer(canvas, 'pointerdown', startX, AUDIO_MIDDLE);
    dispatchPointer(canvas, 'pointermove', endX, AUDIO_MIDDLE);
    dispatchPointer(canvas, 'pointerup', endX, AUDIO_MIDDLE);
    dispatchClick(canvas, endX, AUDIO_MIDDLE);

    expect(callbacks.onSelect).toHaveBeenCalledWith('middle');
    expect(callbacks.onMove).toHaveBeenCalledWith(
      'middle',
      expect.closeTo(11, 6),
    );
    expect(callbacks.onSeek).not.toHaveBeenCalled();
    expect(callbacks.onAdd).not.toHaveBeenCalled();
    expect(callbacks.onAddGridAnchor).not.toHaveBeenCalled();
  });

  it('en Ajustar grid la última ancla también puede reubicarse sin crear otra ni buscar', () => {
    const { callbacks, canvas } = renderEditor('grid');
    const startX = xForTime(20);
    const endX = xForTime(19);

    dispatchPointer(canvas, 'pointerdown', startX, AUDIO_MIDDLE);
    dispatchPointer(canvas, 'pointermove', endX, AUDIO_MIDDLE);
    dispatchPointer(canvas, 'pointerup', endX, AUDIO_MIDDLE);
    dispatchClick(canvas, endX, AUDIO_MIDDLE);

    expect(callbacks.onSelect).toHaveBeenCalledWith('end');
    expect(callbacks.onMove).toHaveBeenCalledWith(
      'end',
      expect.closeTo(19, 6),
    );
    expect(callbacks.onSeek).not.toHaveBeenCalled();
    expect(callbacks.onAdd).not.toHaveBeenCalled();
    expect(callbacks.onAddGridAnchor).not.toHaveBeenCalled();
  });

  it('pointercancel después de un drag no suprime el siguiente clic legítimo', () => {
    const { callbacks, canvas } = renderEditor('pan');
    const dragStartX = xForTime(5);
    const dragEndX = xForTime(7);
    const clickX = xForTime(15);

    dispatchPointer(canvas, 'pointerdown', dragStartX, 180);
    dispatchPointer(canvas, 'pointermove', dragEndX, 180);
    dispatchPointer(canvas, 'pointercancel', dragEndX, 180);
    dispatchClick(canvas, clickX, 180);

    expect(callbacks.onPan).toHaveBeenCalled();
    expect(callbacks.onSeek).toHaveBeenCalledTimes(1);
    expect(callbacks.onSeek).toHaveBeenCalledWith(
      expect.closeTo(15, 6),
    );
  });

  it('en Desplazar un clic busca y un pan real suprime su click posterior', () => {
    const { callbacks, canvas } = renderEditor('pan');
    const clickX = xForTime(15);

    dispatchPointer(canvas, 'pointerdown', clickX, 180);
    dispatchPointer(canvas, 'pointerup', clickX, 180);
    dispatchClick(canvas, clickX, 180);

    expect(callbacks.onSeek).toHaveBeenCalledTimes(1);
    expect(callbacks.onSeek).toHaveBeenCalledWith(
      expect.closeTo(15, 6),
    );

    callbacks.onPan.mockClear();
    callbacks.onSeek.mockClear();
    const dragStartX = xForTime(5);
    const dragEndX = xForTime(7);
    dispatchPointer(canvas, 'pointerdown', dragStartX, 180);
    dispatchPointer(canvas, 'pointermove', dragEndX, 180);
    dispatchPointer(canvas, 'pointerup', dragEndX, 180);
    dispatchClick(canvas, dragEndX, 180);

    expect(callbacks.onPan).toHaveBeenCalled();
    expect(callbacks.onSeek).not.toHaveBeenCalled();
  });

  it('un touch dentro del hitbox ampliado de ancla conserva su selección', () => {
    const { callbacks, canvas } = renderEditor('grid');
    const nearMiddleAnchorX = xForTime(10) + 15;

    dispatchPointer(
      canvas,
      'pointerdown',
      nearMiddleAnchorX,
      AUDIO_MIDDLE,
      'touch',
    );
    dispatchPointer(
      canvas,
      'pointerup',
      nearMiddleAnchorX,
      AUDIO_MIDDLE,
      'touch',
    );
    dispatchClick(canvas, nearMiddleAnchorX, AUDIO_MIDDLE);

    expect(callbacks.onSelect).toHaveBeenCalledWith('middle');
    expect(callbacks.onSelect).not.toHaveBeenCalledWith(null);
  });

  it('un doble toque touch libre crea exactamente una ancla sin dblclick nativo', () => {
    const { callbacks, canvas } = renderEditor('anchors');
    const freeX = xForTime(15);

    dispatchTouchTap(canvas, freeX, 180);
    dispatchTouchTap(canvas, freeX, 180);

    expect(callbacks.onAdd).toHaveBeenCalledTimes(1);
    expect(callbacks.onAdd).toHaveBeenCalledWith(
      expect.closeTo(15, 6),
    );
  });

  it('un doble toque touch dentro del hitbox de una ancla no crea otra', () => {
    const { callbacks, canvas } = renderEditor('anchors');
    const nearMiddleAnchorX = xForTime(10) + 15;

    dispatchTouchTap(canvas, nearMiddleAnchorX, AUDIO_MIDDLE);
    dispatchTouchTap(canvas, nearMiddleAnchorX, AUDIO_MIDDLE);

    expect(callbacks.onSelect).toHaveBeenCalledWith('middle');
    expect(callbacks.onAdd).not.toHaveBeenCalled();
  });

  it('un segundo dedo no completa un doble toque ni crea una ancla', () => {
    const { callbacks, canvas } = renderEditor('anchors');
    const freeX = xForTime(15);

    dispatchTouchTap(canvas, freeX, 180);
    dispatchPointer(
      canvas,
      'pointerdown',
      freeX,
      180,
      'touch',
      2,
      false,
    );
    dispatchPointer(
      canvas,
      'pointerup',
      freeX,
      180,
      'touch',
      2,
      false,
    );

    expect(callbacks.onAdd).not.toHaveBeenCalled();
  });

  it('el último grid draggable emite el par anterior + objetivo respetando offset', () => {
    const offsetMs = 1_500;
    const { callbacks, canvas } = renderEditor('grid', {
      markers: [
        { id: 'start-offset', audioTime: 1.5, midiTime: 0 },
        { id: 'middle-offset', audioTime: 11.5, midiTime: 10 },
      ],
      offsetMs,
    });
    const lastGridX = xForTime(20);
    const movedX = xForTime(19);

    dispatchPointer(canvas, 'pointerdown', lastGridX, 180);
    dispatchPointer(canvas, 'pointermove', movedX, 180);
    dispatchPointer(canvas, 'pointerup', movedX, 180);
    dispatchClick(canvas, movedX, 180);

    expect(callbacks.onAddGridAnchor).toHaveBeenCalledTimes(1);
    expect(callbacks.onAddGridAnchor).toHaveBeenCalledWith({
      continuityAudioTime: expect.closeTo(18, 6),
      continuityMidiTime: expect.closeTo(18, 6),
      targetAudioTime: expect.closeTo(19, 6),
      targetMidiTime: expect.closeTo(20, 6),
    });
    expect(callbacks.onSeek).not.toHaveBeenCalled();
  });
});
