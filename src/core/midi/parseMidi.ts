import {
  FAMILY_IDS,
  familyIndex,
  type FamilyId,
  type MidiTrackInfo,
  type PackedMidiProject,
  type TempoPoint,
  type TimeSignaturePoint,
} from './types';

interface RawTempo {
  tick: number;
  microsecondsPerBeat: number;
}

interface RawNote {
  startTick: number;
  endTick: number;
  pitch: number;
  velocity: number;
  channel: number;
  track: number;
  program: number;
  trackName: string;
  instrumentName: string;
}

interface ActiveNote {
  startTick: number;
  pitch: number;
  velocity: number;
  channel: number;
  track: number;
  program: number;
  trackName: string;
  instrumentName: string;
}

class MidiReader {
  readonly view: DataView;
  offset = 0;

  constructor(buffer: ArrayBuffer) {
    this.view = new DataView(buffer);
  }

  get remaining(): number {
    return this.view.byteLength - this.offset;
  }

  ensure(length: number): void {
    if (length < 0 || this.offset + length > this.view.byteLength) {
      throw new Error('El archivo MIDI termina de forma inesperada.');
    }
  }

  readU8(): number {
    this.ensure(1);
    return this.view.getUint8(this.offset++);
  }

  peekU8(): number {
    this.ensure(1);
    return this.view.getUint8(this.offset);
  }

  readU16(): number {
    this.ensure(2);
    const value = this.view.getUint16(this.offset);
    this.offset += 2;
    return value;
  }

  readU32(): number {
    this.ensure(4);
    const value = this.view.getUint32(this.offset);
    this.offset += 4;
    return value;
  }

  readAscii(length: number): string {
    this.ensure(length);
    let result = '';
    for (let index = 0; index < length; index += 1) {
      result += String.fromCharCode(this.readU8());
    }
    return result;
  }

  readBytes(length: number): Uint8Array {
    this.ensure(length);
    const bytes = new Uint8Array(
      this.view.buffer,
      this.view.byteOffset + this.offset,
      length,
    );
    this.offset += length;
    return new Uint8Array(bytes);
  }

  skip(length: number): void {
    this.ensure(length);
    this.offset += length;
  }

  readVariableLength(): number {
    let value = 0;
    for (let count = 0; count < 4; count += 1) {
      const byte = this.readU8();
      value = (value << 7) | (byte & 0x7f);
      if ((byte & 0x80) === 0) return value;
    }
    throw new Error('Valor de longitud variable MIDI inválido.');
  }
}

const decodeMidiText = (bytes: Uint8Array): string => {
  if (bytes.length === 0) return '';
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).trim();
  } catch {
    try {
      return new TextDecoder('windows-1252').decode(bytes).trim();
    } catch {
      return String.fromCharCode(...bytes).trim();
    }
  }
};

const normalizeName = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const FAMILY_RULES: Array<{ family: FamilyId; tokens: string[] }> = [
  {
    family: 'strings',
    tokens: ['violin', 'viola', 'cello', 'violonchelo', 'contrabajo', 'strings', 'cuerdas'],
  },
  {
    family: 'horns',
    tokens: ['horn', 'corno', 'trompa'],
  },
  {
    family: 'brass',
    tokens: ['trumpet', 'trompeta', 'trombon', 'trombone', 'tuba', 'euphonium', 'bombardino'],
  },
  {
    family: 'woodwinds',
    tokens: ['flute', 'flauta', 'piccolo', 'flautin', 'pipe'],
  },
  {
    family: 'reeds',
    tokens: [
      'oboe',
      'bassoon',
      'fagot',
      'clarinet',
      'clarinete',
      'sax',
      'reed',
      'corno ingles',
    ],
  },
  {
    family: 'keyboards',
    tokens: ['piano', 'organ', 'organo', 'celesta', 'keyboard', 'teclado', 'clav'],
  },
  {
    family: 'plucked',
    tokens: ['guitar', 'guitarra', 'harp', 'arpa', 'pizzicato', 'ukulele', 'lute'],
  },
  {
    family: 'percussion',
    tokens: ['drum', 'percusion', 'percussion', 'timbal', 'cymbal', 'platillo', 'conga', 'clave'],
  },
  {
    family: 'voices',
    tokens: ['voice', 'voz', 'choir', 'coro', 'vocal'],
  },
  {
    family: 'synth',
    tokens: ['synth', 'sintetizador', 'pad', 'lead'],
  },
];

const FUZZY_INSTRUMENT_RULES: Array<{
  family: FamilyId;
  instruments: string[];
}> = [
  {
    family: 'woodwinds',
    instruments: ['flauta', 'flautin', 'piccolo'],
  },
  {
    family: 'reeds',
    instruments: ['oboe', 'fagot', 'bassoon', 'clarinete', 'saxofon'],
  },
  {
    family: 'horns',
    instruments: ['corno', 'trompa'],
  },
  {
    family: 'brass',
    instruments: ['trompeta', 'trombon', 'tuba', 'bombardino'],
  },
  {
    family: 'strings',
    instruments: ['violin', 'viola', 'violonchelo', 'cello', 'contrabajo'],
  },
];

const fuzzyInstrumentFamily = (normalizedName: string): FamilyId | null => {
  const compact = normalizedName.replace(/\s+/g, '');
  if (compact.length < 4) return null;
  for (const rule of FUZZY_INSTRUMENT_RULES) {
    for (const instrument of rule.instruments) {
      if (
        compact.includes(instrument) ||
        (compact.startsWith(instrument.slice(0, 2)) &&
          compact.endsWith(instrument.slice(-2)))
      ) {
        return rule.family;
      }
    }
  }
  return null;
};

const familyFromProgram = (program: number): FamilyId => {
  if (program <= 7) return 'keyboards';
  if (program <= 15) return 'percussion';
  if (program <= 23) return 'keyboards';
  if (program <= 31) return 'plucked';
  if (program <= 39) return 'plucked';
  if (program <= 55) return 'strings';
  if (program <= 63) return 'brass';
  if (program <= 71) return 'reeds';
  if (program <= 79) return 'woodwinds';
  if (program <= 103) return 'synth';
  if (program <= 111) return 'plucked';
  if (program <= 119) return 'percussion';
  return 'other';
};

export const detectFamily = (
  trackName: string,
  instrumentName: string,
  channel: number,
  program: number,
): FamilyId => {
  if (channel === 9) return 'percussion';
  const normalized = normalizeName(`${instrumentName} ${trackName}`);
  for (const rule of FAMILY_RULES) {
    if (rule.tokens.some((token) => normalized.includes(token))) {
      return rule.family;
    }
  }
  const fuzzyFamily = fuzzyInstrumentFamily(normalized);
  if (fuzzyFamily) return fuzzyFamily;
  return familyFromProgram(program);
};

const buildTempoMap = (
  rawTempo: RawTempo[],
  ticksPerBeat: number,
): TempoPoint[] => {
  const valuesByTick = new Map<number, number>([[0, 500_000]]);
  rawTempo
    .sort((left, right) => left.tick - right.tick)
    .forEach((event) => valuesByTick.set(event.tick, event.microsecondsPerBeat));

  const points = [...valuesByTick.entries()]
    .map(([tick, microsecondsPerBeat]) => ({ tick, microsecondsPerBeat }))
    .sort((left, right) => left.tick - right.tick);

  let previousTick = 0;
  let previousTempo = points[0]?.microsecondsPerBeat ?? 500_000;
  let seconds = 0;

  return points.map((point, index) => {
    if (index > 0) {
      seconds +=
        ((point.tick - previousTick) * previousTempo) /
        ticksPerBeat /
        1_000_000;
    }
    previousTick = point.tick;
    previousTempo = point.microsecondsPerBeat;
    return { ...point, seconds };
  });
};

export const ticksToSeconds = (
  tick: number,
  tempoMap: TempoPoint[],
  ticksPerBeat: number,
): number => {
  let low = 0;
  let high = tempoMap.length - 1;
  let selected = tempoMap[0];

  while (low <= high) {
    const middle = (low + high) >> 1;
    const candidate = tempoMap[middle];
    if (candidate.tick <= tick) {
      selected = candidate;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return (
    selected.seconds +
    ((tick - selected.tick) * selected.microsecondsPerBeat) /
      ticksPerBeat /
      1_000_000
  );
};

export const parseMidiFile = (
  buffer: ArrayBuffer,
  fileName = 'Sin título.mid',
): PackedMidiProject => {
  const reader = new MidiReader(buffer);
  if (reader.readAscii(4) !== 'MThd') {
    throw new Error('El archivo no contiene una cabecera MIDI válida.');
  }

  const headerLength = reader.readU32();
  if (headerLength < 6) throw new Error('Cabecera MIDI incompleta.');
  const format = reader.readU16();
  const trackCount = reader.readU16();
  const division = reader.readU16();
  reader.skip(headerLength - 6);

  if (format === 2) {
    throw new Error('Los archivos MIDI formato 2 aún no están soportados.');
  }
  if ((division & 0x8000) !== 0) {
    throw new Error('La división temporal SMPTE aún no está soportada.');
  }
  if (division === 0) throw new Error('La resolución temporal del MIDI es inválida.');

  const rawNotes: RawNote[] = [];
  const rawTempo: RawTempo[] = [];
  const timeSignatures: TimeSignaturePoint[] = [];
  const trackMetadata: Array<{
    id: number;
    name: string;
    instrument: string;
    programs: number[];
  }> = [];

  const finalizeNote = (note: ActiveNote, endTick: number): void => {
    rawNotes.push({
      ...note,
      endTick: Math.max(note.startTick + 1, endTick),
    });
  };

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (reader.readAscii(4) !== 'MTrk') {
      throw new Error(`No se encontró la pista MIDI ${trackIndex + 1}.`);
    }
    const trackLength = reader.readU32();
    const trackEnd = reader.offset + trackLength;
    if (trackEnd > reader.view.byteLength) {
      throw new Error(`La pista MIDI ${trackIndex + 1} está incompleta.`);
    }

    let tick = 0;
    let runningStatus: number | null = null;
    let trackName = `Pista ${trackIndex + 1}`;
    let instrumentName = '';
    const programs = new Uint8Array(16);
    const active = new Map<string, ActiveNote[]>();
    const sustained = new Map<number, ActiveNote[]>();
    const pedalDown = new Uint8Array(16);

    const releaseSustained = (channel: number, releaseTick: number): void => {
      const held = sustained.get(channel);
      if (!held) return;
      held.forEach((note) => finalizeNote(note, releaseTick));
      held.length = 0;
    };

    while (reader.offset < trackEnd) {
      tick += reader.readVariableLength();
      let status = reader.peekU8();

      if ((status & 0x80) !== 0) {
        status = reader.readU8();
        if (status < 0xf0) runningStatus = status;
      } else if (runningStatus !== null) {
        status = runningStatus;
      } else {
        throw new Error(`Running status inválido en la pista ${trackIndex + 1}.`);
      }

      if (status === 0xff) {
        runningStatus = null;
        const metaType = reader.readU8();
        const length = reader.readVariableLength();
        const data = reader.readBytes(length);
        if (metaType === 0x03) {
          trackName = decodeMidiText(data) || trackName;
        } else if (metaType === 0x04) {
          instrumentName = decodeMidiText(data) || instrumentName;
        } else if (metaType === 0x51 && data.length === 3) {
          rawTempo.push({
            tick,
            microsecondsPerBeat:
              (data[0] << 16) | (data[1] << 8) | data[2],
          });
        } else if (metaType === 0x58 && data.length >= 2) {
          timeSignatures.push({
            tick,
            numerator: data[0],
            denominator: 2 ** data[1],
          });
        }
        continue;
      }

      if (status === 0xf0 || status === 0xf7) {
        runningStatus = null;
        reader.skip(reader.readVariableLength());
        continue;
      }

      if (status >= 0xf0) {
        throw new Error(`Evento de sistema MIDI 0x${status.toString(16)} no soportado.`);
      }

      const command = status & 0xf0;
      const channel = status & 0x0f;
      const data1 = reader.readU8();
      const data2 = command === 0xc0 || command === 0xd0 ? 0 : reader.readU8();
      const key = `${channel}:${data1}`;

      if (command === 0xc0) {
        programs[channel] = data1;
      } else if (command === 0xb0 && data1 === 64) {
        const nextPedalState = data2 >= 64;
        if (pedalDown[channel] && !nextPedalState) {
          releaseSustained(channel, tick);
        }
        pedalDown[channel] = nextPedalState ? 1 : 0;
      } else if (command === 0x90 && data2 > 0) {
        const queue = active.get(key) ?? [];
        queue.push({
          startTick: tick,
          pitch: data1,
          velocity: data2,
          channel,
          track: trackIndex,
          program: programs[channel],
          trackName,
          instrumentName,
        });
        active.set(key, queue);
      } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
        const queue = active.get(key);
        const note = queue?.shift();
        if (!note) continue;
        if (queue && queue.length === 0) active.delete(key);
        if (pedalDown[channel]) {
          const held = sustained.get(channel) ?? [];
          held.push(note);
          sustained.set(channel, held);
        } else {
          finalizeNote(note, tick);
        }
      }
    }

    sustained.forEach((notes) => notes.forEach((note) => finalizeNote(note, tick)));
    active.forEach((notes) => notes.forEach((note) => finalizeNote(note, tick)));
    reader.offset = trackEnd;

    trackMetadata.push({
      id: trackIndex,
      name: trackName,
      instrument: instrumentName || trackName,
      programs: [...programs],
    });
  }

  const tempoMap = buildTempoMap(rawTempo, division);
  const mappedNotes = rawNotes
    .map((note) => {
      const start = ticksToSeconds(note.startTick, tempoMap, division);
      const end = ticksToSeconds(note.endTick, tempoMap, division);
      const family = detectFamily(
        note.trackName,
        note.instrumentName,
        note.channel,
        note.program,
      );
      return { ...note, start, end, family };
    })
    .sort((left, right) => left.start - right.start || left.pitch - right.pitch);

  const starts = new Float64Array(mappedNotes.length);
  const ends = new Float64Array(mappedNotes.length);
  const pitches = new Uint8Array(mappedNotes.length);
  const velocities = new Uint8Array(mappedNotes.length);
  const channels = new Uint8Array(mappedNotes.length);
  const tracks = new Uint16Array(mappedNotes.length);
  const families = new Uint8Array(mappedNotes.length);
  const trackCounts = new Uint32Array(trackCount);
  const trackFamilies = Array.from({ length: trackCount }, () => new Uint32Array(FAMILY_IDS.length));

  mappedNotes.forEach((note, index) => {
    starts[index] = note.start;
    ends[index] = note.end;
    pitches[index] = note.pitch;
    velocities[index] = note.velocity;
    channels[index] = note.channel;
    tracks[index] = note.track;
    families[index] = familyIndex(note.family);
    trackCounts[note.track] += 1;
    trackFamilies[note.track][familyIndex(note.family)] += 1;
  });

  const trackInfo: MidiTrackInfo[] = trackMetadata.map((track) => {
    const counts = trackFamilies[track.id];
    let selectedFamilyIndex = FAMILY_IDS.indexOf('other');
    let selectedCount = -1;
    counts.forEach((count, index) => {
      if (count > selectedCount) {
        selectedCount = count;
        selectedFamilyIndex = index;
      }
    });
    return {
      id: track.id,
      name: track.name,
      instrument: track.instrument,
      family: FAMILY_IDS[selectedFamilyIndex] ?? 'other',
      noteCount: trackCounts[track.id],
    };
  });

  return {
    fileName,
    format,
    ticksPerBeat: division,
    duration: mappedNotes.reduce((maximum, note) => Math.max(maximum, note.end), 0),
    noteCount: mappedNotes.length,
    tracks: trackInfo,
    tempoMap,
    timeSignatures: timeSignatures.sort((left, right) => left.tick - right.tick),
    notes: { starts, ends, pitches, velocities, channels, tracks, families },
  };
};
