import { describe, expect, it } from 'vitest';
import { parseMidiFile } from './parseMidi';

const variableLength = (value: number): number[] => {
  const bytes = [value & 0x7f];
  let remaining = value >> 7;
  while (remaining > 0) {
    bytes.unshift((remaining & 0x7f) | 0x80);
    remaining >>= 7;
  }
  return bytes;
};

const uint32 = (value: number): number[] => [
  (value >>> 24) & 0xff,
  (value >>> 16) & 0xff,
  (value >>> 8) & 0xff,
  value & 0xff,
];

const midiWithTrack = (events: number[]): ArrayBuffer => {
  const header = [
    0x4d,
    0x54,
    0x68,
    0x64,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    1,
    0xe0,
  ];
  const track = [0x4d, 0x54, 0x72, 0x6b, ...uint32(events.length), ...events];
  return Uint8Array.from([...header, ...track]).buffer;
};

describe('parseMidiFile', () => {
  it('aplica el mapa de tempo a las notas ordenadas', () => {
    const events = [
      0,
      0xff,
      0x03,
      5,
      ...new TextEncoder().encode('Piano'),
      0,
      0xff,
      0x51,
      3,
      0x07,
      0xa1,
      0x20,
      0,
      0x90,
      60,
      100,
      ...variableLength(480),
      0x80,
      60,
      0,
      0,
      0xff,
      0x51,
      3,
      0x0f,
      0x42,
      0x40,
      0,
      0x90,
      64,
      80,
      ...variableLength(480),
      0x80,
      64,
      0,
      0,
      0xff,
      0x2f,
      0,
    ];

    const result = parseMidiFile(midiWithTrack(events), 'tempo.mid');

    expect(result.noteCount).toBe(2);
    expect([...result.notes.starts]).toEqual([0, 0.5]);
    expect([...result.notes.ends]).toEqual([0.5, 1.5]);
    expect(result.duration).toBe(1.5);
    expect(result.tracks[0].family).toBe('keyboards');
  });

  it('extiende una nota hasta soltar el pedal de sustain', () => {
    const events = [
      0,
      0x90,
      60,
      100,
      ...variableLength(240),
      0xb0,
      64,
      127,
      ...variableLength(240),
      0x80,
      60,
      0,
      ...variableLength(480),
      0xb0,
      64,
      0,
      0,
      0xff,
      0x2f,
      0,
    ];

    const result = parseMidiFile(midiWithTrack(events), 'sustain.mid');

    expect(result.noteCount).toBe(1);
    expect(result.notes.ends[0]).toBe(1);
  });

  it('rechaza archivos sin una cabecera MIDI', () => {
    expect(() =>
      parseMidiFile(Uint8Array.from([1, 2, 3, 4]).buffer),
    ).toThrow(/cabecera MIDI válida/);
  });
});
