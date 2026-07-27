import { describe, expect, it, vi } from 'vitest';
import {
  DEMO_END_CARD,
  DEMO_MEDIA,
  createDemoPresentationState,
  fetchDemoMedia,
} from './demoMedia';

describe('demo integrada', () => {
  it('conserva exactamente los cuatro textos del cierre', () => {
    expect(DEMO_END_CARD).toEqual({
      title: 'El Intachable (Pasillo)',
      subtitle: 'Juan Domingo Córdoba',
      composerArranger: 'Arr. Jaime Jaramillo Arias',
      freeText:
        "Interpreta la Orquesta Filarmónica de Bogotá con Ensamble Cruza'o",
    });
  });

  it('crea un preset independiente con tamaño de nota 1.4', () => {
    const first = createDemoPresentationState();
    const second = createDemoPresentationState();

    expect(first.settings.noteScale).toBe(1.4);
    expect(first.visualConfiguration.global.endCard).toEqual(DEMO_END_CARD);
    first.visualConfiguration.global.endCard.title = 'Cambio local';
    expect(second.visualConfiguration.global.endCard.title).toBe(
      'El Intachable (Pasillo)',
    );
  });

  it('descarga MIDI y audio en paralelo y crea archivos compatibles', async () => {
    const fetchResource = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(
        url.endsWith('.midi')
          ? new Uint8Array([0x4d, 0x54, 0x68, 0x64])
          : new Uint8Array([0x49, 0x44, 0x33]),
        { status: 200 },
      );
    });

    const result = await fetchDemoMedia(fetchResource);

    expect(fetchResource).toHaveBeenCalledTimes(2);
    expect(fetchResource).toHaveBeenCalledWith(DEMO_MEDIA.midiUrl, {
      cache: 'force-cache',
    });
    expect(fetchResource).toHaveBeenCalledWith(DEMO_MEDIA.audioUrl, {
      cache: 'force-cache',
    });
    expect(result.midiFile).toMatchObject({
      name: DEMO_MEDIA.midiFileName,
      size: 4,
      type: 'audio/midi',
    });
    expect(result.audioFile).toMatchObject({
      name: DEMO_MEDIA.audioFileName,
      size: 3,
      type: 'audio/mpeg',
    });
  });

  it('informa claramente si falta uno de los medios publicados', async () => {
    const fetchResource = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith('.mp3')
        ? new Response(null, { status: 404 })
        : new Response(new Uint8Array([1]), { status: 200 }),
    );

    await expect(fetchDemoMedia(fetchResource)).rejects.toThrow(
      'No fue posible descargar el archivo de audio de la demo (404).',
    );
  });
});
