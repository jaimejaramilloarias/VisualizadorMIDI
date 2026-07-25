import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  createStateDocument,
  hasForwardSyncMapping,
  mapAudioToMidi,
  mapAudioToMidiClock,
  parseStateDocument,
} from './visualizationState';

describe('mapAudioToMidi', () => {
  it('mantiene una relación identidad sin anclas', () => {
    expect(mapAudioToMidi(12.5, [])).toBe(12.5);
  });

  it('interpola y extrapola de forma continua entre anclas', () => {
    const anchors = [
      { id: 'b', audioTime: 10, midiTime: 12 },
      { id: 'a', audioTime: 0, midiTime: 2 },
      { id: 'c', audioTime: 20, midiTime: 24 },
    ];

    expect(mapAudioToMidi(5, anchors)).toBe(7);
    expect(mapAudioToMidi(15, anchors)).toBe(18);
    expect(mapAudioToMidi(25, anchors)).toBe(30);
    expect(mapAudioToMidiClock(15, anchors).playbackRate).toBe(1.2);
  });

  it('expone la velocidad musical del tramo activo', () => {
    const result = mapAudioToMidiClock(5, [
      { id: 'a', audioTime: 0, midiTime: 0 },
      { id: 'b', audioTime: 10, midiTime: 9.8 },
    ]);

    expect(result.midiTime).toBe(4.9);
    expect(result.playbackRate).toBeCloseTo(0.98);
  });

  it('detecta anclas que harían retroceder la visualización', () => {
    expect(
      hasForwardSyncMapping([
        { id: 'a', audioTime: 0, midiTime: 2 },
        { id: 'b', audioTime: 10, midiTime: 1 },
      ]),
    ).toBe(false);
  });
});

describe('estado JSON', () => {
  it('no serializa el contenido del MIDI ni del audio', () => {
    const document = createStateDocument({
      midiFileName: 'obra.mid',
      audioFileName: 'mezcla.wav',
      visualization: 'now-line',
      settings: DEFAULT_SETTINGS,
      syncAnchors: [{ id: 'one', audioTime: 1.5, midiTime: 2 }],
    });
    const serialized = JSON.stringify(document);

    expect(serialized).toContain('obra.mid');
    expect(serialized).toContain('mezcla.wav');
    expect(serialized).not.toContain('data:audio');
    expect(serialized).not.toContain('ArrayBuffer');
    expect(document.version).toBe(2);
  });

  it('migra una configuración JSON de V1 al contrato V2', () => {
    const parsed = parseStateDocument(
      JSON.stringify({
        assignedFamilies: { Flauta: 'Custom 1' },
        familyCustomizations: {
          'Custom 1': {
            color: '#112233',
            shape: 'diamondDouble',
            secondaryColor: '#ffffff',
          },
        },
        enabledInstruments: { Flauta: false },
        visibleSeconds: 12,
        velocityBase: 80,
      }),
    );

    expect(parsed.version).toBe(2);
    expect(parsed.settings.secondsVisible).toBe(12);
    expect(parsed.visualConfiguration.global.velocityBase).toBe(80);
    expect(parsed.visualConfiguration.instruments.Flauta).toEqual({
      family: 'Custom 1',
      enabled: false,
    });
    expect(parsed.visualConfiguration.families['Custom 1'].shape).toBe(
      'diamondDouble',
    );
  });

  it('sanea valores de una configuración importada', () => {
    const parsed = parseStateDocument(
      JSON.stringify({
        schema: 'midi-visualizer-state',
        version: 1,
        savedAt: '2026-01-01T00:00:00.000Z',
        source: { midiFileName: 'obra.mid', audioFileName: null },
        visualization: 'piano-roll',
        settings: {
          secondsVisible: 500,
          glow: 9,
          noteScale: 0.1,
          gridOpacity: 8,
          quality: 'desconocida',
          background: 'red',
        },
        syncAnchors: [],
      }),
    );

    expect(parsed.visualization).toBe('piano-roll');
    expect(parsed.settings).toEqual({
      secondsVisible: 30,
      glow: 2,
      noteScale: 0.4,
      gridOpacity: 1,
      quality: 'auto',
      background: '#07090e',
    });
  });

  it('acepta la visualización orbital en estados nuevos', () => {
    const parsed = parseStateDocument(
      JSON.stringify({
        schema: 'midi-visualizer-state',
        version: 1,
        source: { midiFileName: null, audioFileName: null },
        visualization: 'orbit',
        settings: DEFAULT_SETTINGS,
        syncAnchors: [],
      }),
    );

    expect(parsed.visualization).toBe('orbit');
  });
});
