import { describe, expect, it } from 'vitest';
import {
  isAudioFile,
  isMidiFile,
  selectDroppedMedia,
} from './fileDrop';

const file = (name: string, type: string) => ({ name, type });

describe('selección de archivos arrastrados', () => {
  it('no confunde audio/midi con el archivo de audio local', () => {
    const midi = file('EL INTACHABLE.midi', 'audio/midi');
    const audio = file('El intachable.mp3', 'audio/mpeg');

    expect(selectDroppedMedia([midi, audio])).toEqual({
      midiFile: midi,
      audioFile: audio,
    });
    expect(isMidiFile(midi)).toBe(true);
    expect(isAudioFile(midi)).toBe(false);
  });

  it('encuentra ambos archivos independientemente del orden', () => {
    const midi = file('partitura.MID', 'audio/x-midi');
    const audio = file('mezcla.WAV', '');

    expect(selectDroppedMedia([audio, midi])).toEqual({
      midiFile: midi,
      audioFile: audio,
    });
  });

  it('mantiene el audio vacío cuando solo se arrastra un MIDI', () => {
    const midi = file('solo.mid', 'application/x-midi');

    expect(selectDroppedMedia([midi])).toEqual({
      midiFile: midi,
      audioFile: null,
    });
  });
});
