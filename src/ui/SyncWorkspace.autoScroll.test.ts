// @vitest-environment jsdom

import {
  act,
  createElement,
  type ComponentProps,
} from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TransportSnapshot } from '../core/transport/AudioTransport';
import { SyncWorkspace } from './SyncWorkspace';

const waveformState = vi.hoisted(() => ({
  viewStart: 0,
}));

vi.mock('./WaveformEditor', () => ({
  WaveformEditor: (props: { viewStart: number }) => {
    waveformState.viewStart = props.viewStart;
    return null;
  },
}));

const mountedRoots: ReturnType<typeof createRoot>[] = [];

beforeEach(() => {
  (
    globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }
  ).IS_REACT_ACT_ENVIRONMENT = true;
});

afterEach(() => {
  mountedRoots.splice(0).forEach((root) => {
    act(() => root.unmount());
  });
  document.body.replaceChildren();
});

const transportAt = (
  position: number,
  playing: boolean,
): TransportSnapshot => ({
  position,
  visualPosition: position,
  duration: 100,
  playing,
  clockAdvancing: playing,
  starting: false,
  hasAudio: false,
  trimOffset: 0,
  volume: 1,
  muted: false,
  signalLevel: 0,
  audioState: 'unavailable',
  outputMode: 'native',
});

const createProps = (
  transport: TransportSnapshot,
): ComponentProps<typeof SyncWorkspace> => ({
  activeMidiTime: transport.position,
  anchors: [],
  automaticAlignment: {
    anchors: [],
    confidence: null,
    message: '',
    progress: 0,
    status: 'idle',
  },
  automaticAlignmentReady: false,
  audioFileName: null,
  forward: true,
  landmarks: [],
  magnetEnabled: false,
  midiDuration: 100,
  midiFileName: 'demo.midi',
  midiProjection: null,
  offsetMs: 0,
  onAddAnchor: vi.fn(),
  onAddFineTuneAnchor: vi.fn(),
  onApplyAutomaticAlignment: vi.fn(),
  onCancelAutomaticAlignment: vi.fn(),
  onClearAnchors: vi.fn(),
  onClose: vi.fn(),
  onDeleteAnchor: vi.fn(),
  onMagnetChange: vi.fn(),
  onMoveAnchor: vi.fn(),
  onOffsetChange: vi.fn(),
  onRefreshWaveform: vi.fn(),
  onRegisterTap: vi.fn(),
  onRunAutomaticAlignment: vi.fn(),
  onSeek: vi.fn(),
  onTapToggle: vi.fn(),
  onTogglePlayback: vi.fn(),
  peaks: null,
  tapActive: false,
  transport,
});

describe('SyncWorkspace auto scroll', () => {
  it('sigue la reproducción y se desactiva al desplazar la vista manualmente', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    const renderAt = (position: number, playing = true) => {
      act(() => {
        root.render(
          createElement(
            SyncWorkspace,
            createProps(transportAt(position, playing)),
          ),
        );
      });
    };

    renderAt(30);
    const zoomIn = [...host.querySelectorAll('.sync-zoom-control button')]
      .find((button) => button.textContent === '+');
    expect(zoomIn).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      (zoomIn as HTMLButtonElement).click();
    });
    expect(waveformState.viewStart).toBeCloseTo(14);

    renderAt(50);
    expect(waveformState.viewStart).toBeCloseTo(34);

    renderAt(60, false);
    expect(waveformState.viewStart).toBeCloseTo(34);
    renderAt(60);
    expect(waveformState.viewStart).toBeCloseTo(44);

    const panRight = host.querySelector<HTMLButtonElement>(
      '[aria-label="Desplazar vista a la derecha"]',
    );
    expect(panRight).not.toBeNull();
    act(() => panRight!.click());
    expect(waveformState.viewStart).toBe(50);

    const followToggle = host.querySelector<HTMLInputElement>(
      '.sync-follow-toggle input',
    );
    expect(followToggle?.checked).toBe(false);
    renderAt(60);
    expect(waveformState.viewStart).toBe(50);

    act(() => followToggle!.click());
    expect(followToggle?.checked).toBe(true);
    expect(waveformState.viewStart).toBeCloseTo(44);
  });

  it('desactiva el seguimiento cuando el usuario centra manualmente', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    mountedRoots.push(root);

    act(() => {
      root.render(
        createElement(
          SyncWorkspace,
          createProps(transportAt(30, true)),
        ),
      );
    });
    const zoomIn = [...host.querySelectorAll('.sync-zoom-control button')]
      .find((button) => button.textContent === '+');
    act(() => (zoomIn as HTMLButtonElement).click());
    expect(waveformState.viewStart).toBeCloseTo(14);

    const center = [...host.querySelectorAll('.sync-zoom-control button')]
      .find((button) => button.textContent === 'Centrar');
    act(() => (center as HTMLButtonElement).click());
    expect(waveformState.viewStart).toBeCloseTo(5);
    expect(
      host.querySelector<HTMLInputElement>(
        '.sync-follow-toggle input',
      )?.checked,
    ).toBe(false);
  });
});
