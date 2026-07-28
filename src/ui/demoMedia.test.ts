import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DEMO_ID,
  DEMO_CATALOG,
  DEMO_END_CARD,
  DEMO_IDS,
  DEMO_MEDIA,
  createDemoPresentationState,
  fetchDemoMedia,
  type DemoId,
} from './demoMedia';

const successfulMediaResponse = (
  input: RequestInfo | URL,
): Response => {
  const url = String(input);
  if (url.endsWith('.json')) {
    const presentation = createDemoPresentationState();
    return new Response(
      JSON.stringify({
        schema: 'midi-visualizer-state',
        version: 2,
        savedAt: '2026-07-28T17:08:32.827Z',
        source: {
          midiFileName: 'EL INTACHABLE.midi',
          audioFileName: 'El intachable.mp3',
        },
        visualization: 'now-line',
        settings: presentation.settings,
        syncAnchors: [
          { id: 'fixture-anchor', audioTime: 0, midiTime: 0 },
        ],
        visualConfiguration: presentation.visualConfiguration,
      }),
      { status: 200 },
    );
  }
  return new Response(
    url.endsWith('.midi')
      ? new Uint8Array([0x4d, 0x54, 0x68, 0x64])
      : new Uint8Array([0x49, 0x44, 0x33]),
    { status: 200 },
  );
};

describe('catálogo de demos', () => {
  it('expone exactamente dos opciones estables y conserva la demo predeterminada', () => {
    expect(DEMO_IDS).toEqual([
      'el-intachable',
      'despasillo-por-favor',
    ]);
    expect(DEFAULT_DEMO_ID).toBe('el-intachable');
    expect(Object.keys(DEMO_CATALOG)).toEqual(DEMO_IDS);
    expect(DEMO_CATALOG['el-intachable']).toMatchObject({
      id: 'el-intachable',
      label: 'El Intachable',
      syncMode: 'state',
      stateUrl: expect.stringContaining(
        'el-intachable.midi-stage.json',
      ),
    });
    expect(DEMO_CATALOG['despasillo-por-favor']).toMatchObject({
      id: 'despasillo-por-favor',
      label: 'Despasillo por favor',
      syncMode: 'state',
      stateUrl: expect.stringContaining(
        'despasillo-por-favor.midi-stage.json',
      ),
    });
    expect(DEMO_MEDIA).toBe(DEMO_CATALOG[DEFAULT_DEMO_ID]);
  });

  it('declara rutas únicas para todos los medios y estados', () => {
    const assetUrls = DEMO_IDS.flatMap((demoId) => {
      const definition = DEMO_CATALOG[demoId];
      return [
        definition.midiUrl,
        definition.audioUrl,
        definition.stateUrl,
      ]
        .filter((url): url is string => typeof url === 'string');
    });

    expect(assetUrls.map((url) => url.split('/').at(-1))).toEqual([
      'el-intachable.midi',
      'el-intachable.mp3',
      'el-intachable.midi-stage.json',
      'despasillo-por-favor.midi',
      'despasillo-por-favor.mp3',
      'despasillo-por-favor.midi-stage.json',
    ]);
    expect(new Set(assetUrls).size).toBe(assetUrls.length);
  });
});

describe('estado de presentación de demos', () => {
  it('mantiene compatibilidad por defecto y devuelve copias independientes', () => {
    const implicit = createDemoPresentationState();
    const explicit = createDemoPresentationState(DEFAULT_DEMO_ID);

    expect(implicit).toEqual(explicit);
    expect(implicit.settings.noteScale).toBe(1.4);
    expect(implicit.visualConfiguration.global.endCard).toEqual(
      DEMO_END_CARD,
    );
    expect(implicit.syncAnchors).toEqual([]);
    expect(implicit.preserveSynchronization).toBe(false);

    implicit.visualConfiguration.global.endCard.title = 'Cambio local';
    expect(explicit.visualConfiguration.global.endCard.title).toBe(
      'El Intachable (Pasillo)',
    );
  });

  it('exige el estado guardado para una demo sincronizada por JSON', () => {
    expect(() =>
      createDemoPresentationState('despasillo-por-favor'),
    ).toThrow(
      'La demo Despasillo por favor requiere su estado guardado.',
    );
  });
});

describe('carga de demos', () => {
  it('la llamada sin id carga El Intachable con su estado actualizado', async () => {
    const visualConfiguration =
      createDemoPresentationState().visualConfiguration;
    const lastAnchor = {
      id: 'auto-10-31',
      audioTime: 182.94607515921697,
      midiTime: 180.45962861328124,
    };
    const syncAnchors = Array.from({ length: 35 }, (_, index) => {
      if (index === 0) {
        return {
          id: 'auto-10-0',
          audioTime: 0,
          midiTime: 0.14993197278911563,
        };
      }
      if (index === 34) return lastAnchor;
      const progress = index / 34;
      return {
        id: `intachable-anchor-${index}`,
        audioTime: lastAnchor.audioTime * progress,
        midiTime:
          0.14993197278911563 +
          (lastAnchor.midiTime - 0.14993197278911563) * progress,
      };
    });
    const stateText = JSON.stringify({
      schema: 'midi-visualizer-state',
      version: 2,
      savedAt: '2026-07-28T17:08:32.827Z',
      source: {
        midiFileName: 'EL INTACHABLE.midi',
        audioFileName: 'El intachable.mp3',
      },
      visualization: 'now-line',
      settings: {
        secondsVisible: 8,
        glow: 0.6,
        noteScale: 1.4,
        quality: 'ultra',
        background: '#000000',
      },
      syncAnchors,
      visualConfiguration,
    });
    const fetchResource = vi.fn(
      async (input: RequestInfo | URL) =>
        String(input).endsWith('.json')
          ? new Response(stateText, { status: 200 })
          : successfulMediaResponse(input),
    );

    const pending = fetchDemoMedia(undefined, fetchResource);

    expect(fetchResource).toHaveBeenCalledTimes(3);
    const result = await pending;
    expect(fetchResource).toHaveBeenCalledWith(
      DEMO_CATALOG['el-intachable'].midiUrl,
      { cache: 'force-cache' },
    );
    expect(fetchResource).toHaveBeenCalledWith(
      DEMO_CATALOG['el-intachable'].audioUrl,
      { cache: 'force-cache' },
    );
    expect(fetchResource).toHaveBeenCalledWith(
      DEMO_CATALOG['el-intachable'].stateUrl,
      { cache: 'no-cache' },
    );
    expect(result.definition).toBe(
      DEMO_CATALOG['el-intachable'],
    );
    expect(result.midiFile).toMatchObject({
      name: 'EL INTACHABLE.midi',
      size: 4,
      type: 'audio/midi',
    });
    expect(result.audioFile).toMatchObject({
      name: 'El intachable.mp3',
      size: 3,
      type: 'audio/mpeg',
    });
    expect(result.presentationState.syncAnchors).toHaveLength(35);
    expect(result.presentationState.syncAnchors.at(-1)).toEqual(
      lastAnchor,
    );
    expect(
      result.presentationState.preserveSynchronization,
    ).toBe(true);
  });

  it('Despasillo solicita MIDI, audio y estado en paralelo y conserva sus 71 anclas', async () => {
    const visualConfiguration =
      createDemoPresentationState().visualConfiguration;
    visualConfiguration.global.endCard = {
      title: 'Despasillo por Favor',
      subtitle: 'Lucas Saboyá',
      composerArranger: 'Arr. Jaime Jaramillo Arias',
      freeText: 'Orquesta Filarmónica de Bogotá',
    };
    const firstAnchor = {
      id: 'auto-5-0',
      audioTime: 0,
      midiTime: 1.649251700680272,
    };
    const lastAnchor = {
      id: 'auto-5-29',
      audioTime: 320.85665718629383,
      midiTime: 234.7105167939453,
    };
    const syncAnchors = Array.from({ length: 71 }, (_, index) => {
      if (index === 0) return firstAnchor;
      if (index === 70) return lastAnchor;
      const progress = index / 70;
      return {
        id: `anchor-${index}`,
        audioTime: lastAnchor.audioTime * progress,
        midiTime:
          firstAnchor.midiTime +
          (lastAnchor.midiTime - firstAnchor.midiTime) * progress,
      };
    });
    const stateText = JSON.stringify({
      schema: 'midi-visualizer-state',
      version: 2,
      savedAt: '2026-07-28T17:00:50.169Z',
      source: {
        midiFileName: 'DESPASILLO POR FAVOR.midi',
        audioFileName:
          'Despasillo por favor - Lucas Saboya\u0301.mp3',
      },
      visualization: 'now-line',
      settings: {
        secondsVisible: 12,
        glow: 0.6,
        noteScale: 0.8,
        quality: 'ultra',
        background: '#000000',
      },
      syncAnchors,
      visualConfiguration,
    });
    const fetchResource = vi.fn(
      async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('.json')) {
          return new Response(stateText, { status: 200 });
        }
        return successfulMediaResponse(input);
      },
    );

    const pending = fetchDemoMedia(
      'despasillo-por-favor',
      fetchResource,
    );

    expect(fetchResource).toHaveBeenCalledTimes(3);
    const result = await pending;
    const definition = DEMO_CATALOG['despasillo-por-favor'];
    expect(fetchResource.mock.calls).toEqual([
      [definition.midiUrl, { cache: 'force-cache' }],
      [definition.audioUrl, { cache: 'force-cache' }],
      [definition.stateUrl, { cache: 'no-cache' }],
    ]);
    expect(result.definition).toBe(definition);
    expect(result.midiFile.name).toBe('DESPASILLO POR FAVOR.midi');
    expect(result.audioFile.name.normalize('NFC')).toBe(
      'Despasillo por favor - Lucas Saboyá.mp3',
    );
    expect(result.presentationState.settings).toEqual({
      secondsVisible: 12,
      glow: 0.6,
      noteScale: 0.8,
      quality: 'ultra',
      background: '#000000',
    });
    expect(result.presentationState.syncAnchors).toHaveLength(71);
    expect(result.presentationState.syncAnchors[0]).toEqual({
      id: 'auto-5-0',
      audioTime: 0,
      midiTime: 1.649251700680272,
    });
    expect(result.presentationState.syncAnchors.at(-1)).toEqual({
      id: 'auto-5-29',
      audioTime: 320.85665718629383,
      midiTime: 234.7105167939453,
    });
    expect(
      result.presentationState.preserveSynchronization,
    ).toBe(true);
    expect(
      result.presentationState.visualConfiguration.global.endCard,
    ).toEqual({
      title: 'Despasillo por Favor',
      subtitle: 'Lucas Saboyá',
      composerArranger: 'Arr. Jaime Jaramillo Arias',
      freeText: 'Orquesta Filarmónica de Bogotá',
    });
  });

  it.each<{
    demoId: DemoId;
    failedSuffix: string;
    expectedMessage: string;
  }>([
    {
      demoId: 'el-intachable',
      failedSuffix: '.mp3',
      expectedMessage:
        'No fue posible descargar el archivo de audio de la demo (404).',
    },
    {
      demoId: 'despasillo-por-favor',
      failedSuffix: '.json',
      expectedMessage:
        'No fue posible descargar el estado de la demo (404).',
    },
  ])(
    'informa claramente un recurso faltante de $demoId',
    async ({ demoId, failedSuffix, expectedMessage }) => {
      const fetchResource = vi.fn(
        async (input: RequestInfo | URL) =>
          String(input).endsWith(failedSuffix)
            ? new Response(null, { status: 404 })
            : successfulMediaResponse(input),
      );

      await expect(
        fetchDemoMedia(demoId, fetchResource),
      ).rejects.toThrow(expectedMessage);
    },
  );

  it('rechaza recursos vacíos y estados corruptos con contexto de la demo', async () => {
    const emptyAudioFetch = vi.fn(
      async (input: RequestInfo | URL) =>
        String(input).endsWith('.mp3')
          ? new Response(new Uint8Array(), { status: 200 })
          : successfulMediaResponse(input),
    );
    await expect(
      fetchDemoMedia('el-intachable', emptyAudioFetch),
    ).rejects.toThrow('El archivo de audio de la demo llegó vacío.');

    const corruptStateFetch = vi.fn(
      async (input: RequestInfo | URL) =>
        String(input).endsWith('.json')
          ? new Response('{estado roto', { status: 200 })
          : successfulMediaResponse(input),
    );
    await expect(
      fetchDemoMedia('despasillo-por-favor', corruptStateFetch),
    ).rejects.toThrow(
      'El estado de la demo Despasillo por favor no es válido',
    );
  });
});
