import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS,
  createSyncTimeline,
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

  it('compila una línea temporal reutilizable y localiza tramos extensos', () => {
    const anchors = Array.from({ length: 2_000 }, (_, index) => ({
      id: String(index),
      audioTime: index * 0.5,
      midiTime: index * 0.49,
    }));
    const timeline = createSyncTimeline(anchors);

    expect(timeline.forward).toBe(true);
    const mapping = timeline.map(777.25);
    expect(mapping.midiTime).toBeCloseTo(761.705, 8);
    expect(mapping.playbackRate).toBeCloseTo(0.98, 8);
    expect(timeline.anchors).toHaveLength(2_000);
  });
});

describe('estado JSON', () => {
  it('usa los valores actuales de escena como predeterminados', () => {
    expect(DEFAULT_SETTINGS).toEqual({
      secondsVisible: 8,
      glow: 0.8,
      noteScale: 1,
      quality: 'auto',
      background: '#000000',
    });
  });

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
      'diamond',
    );
  });

  it('sanea valores de una configuración importada', () => {
    const parsed = parseStateDocument(
      JSON.stringify({
        schema: 'midi-visualizer-state',
        version: 1,
        savedAt: '2026-01-01T00:00:00.000Z',
        source: { midiFileName: 'obra.mid', audioFileName: null },
        visualization: 'escena-retirada',
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

    expect(parsed.visualization).toBe('now-line');
    expect(parsed.settings).toEqual({
      secondsVisible: 30,
      glow: 2,
      noteScale: 0.4,
      quality: 'auto',
      background: '#000000',
    });
  });

  it('normaliza cualquier escena heredada a la escena horizontal única', () => {
    const parsed = parseStateDocument(
      JSON.stringify({
        schema: 'midi-visualizer-state',
        version: 1,
        source: { midiFileName: null, audioFileName: null },
        visualization: 'visualizacion-v1',
        settings: DEFAULT_SETTINGS,
        syncAnchors: [],
      }),
    );

    expect(parsed.visualization).toBe('now-line');
  });
});
