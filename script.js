// Script inicial para preparar el canvas
// En esta etapa no se implementa funcionalidad adicional

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // Relleno inicial del canvas como marcador de posición
    ctx.fillStyle = '#222';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const loadBtn = document.getElementById('load-midi');
    const fileInput = document.getElementById('midi-file-input');
    const loadWavBtn = document.getElementById('load-wav');
    const wavInput = document.getElementById('wav-file-input');
    const playBtn = document.getElementById('play-stop');
    const instrumentSelect = document.getElementById('instrument-select');
    const familySelect = document.getElementById('family-select');
    let currentTracks = [];

    function populateInstrumentDropdown(tracks) {
      instrumentSelect.innerHTML = '<option>Instrumento</option>';
      tracks.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.instrument;
        opt.textContent = t.instrument;
        instrumentSelect.appendChild(opt);
      });
    }

    instrumentSelect.addEventListener('change', () => {
      const selected = instrumentSelect.value;
      const track = currentTracks.find((t) => t.instrument === selected);
      familySelect.value = track ? track.family : '';
    });

    // ----- Configuración de Audio -----
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    let audioBuffer = null; // Buffer de audio cargado
    let trimOffset = 0; // Tiempo inicial ignorando silencio
    let source = null; // Fuente de audio en reproducción
    let isPlaying = false;

    loadBtn.addEventListener('click', () => fileInput.click());
    loadWavBtn.addEventListener('click', () => wavInput.click());

    // Carga y parseo de archivos MIDI/XML
    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();

      const reader = new FileReader();
      if (ext === 'mid' || ext === 'midi') {
        reader.onload = (ev) => {
          const midi = parseMIDI(ev.target.result);
          currentTracks = midi.tracks;
          populateInstrumentDropdown(currentTracks);
          console.log('MIDI parsed', midi);
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === 'xml') {
        reader.onload = (ev) => {
          const xml = parseMusicXML(ev.target.result);
          currentTracks = xml.tracks;
          populateInstrumentDropdown(currentTracks);
          console.log('MusicXML parsed', xml);
        };
        reader.readAsText(file);
      } else {
        alert('Formato no soportado');
      }
    });

    // Carga de archivo WAV y eliminación de silencio inicial
    wavInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const arrayBuffer = await file.arrayBuffer();
      audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

      // Detectar primer sample significativo para ignorar silencio
      const channel = audioBuffer.getChannelData(0);
      const threshold = 0.001;
      let startIndex = 0;
      while (startIndex < channel.length && Math.abs(channel[startIndex]) < threshold) {
        startIndex++;
      }
      trimOffset = startIndex / audioBuffer.sampleRate;
      console.log('WAV cargado, trimOffset =', trimOffset);
    });

    // Reproducción básica Play/Stop
    playBtn.addEventListener('click', async () => {
      if (!audioBuffer) return;
      if (!isPlaying) {
        await audioCtx.resume();
        source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        source.onended = () => {
          isPlaying = false;
        };
        source.start(0, trimOffset);
        isPlaying = true;
      } else {
        source.stop();
        isPlaying = false;
      }
    });
  });
}

// ----- Parsing helpers -----

// Datos de familias con formas y colores predeterminados
const FAMILY_PRESETS = {
  'Maderas de timbre "redondo"': { shape: 'oval', color: '#0000ff' },
  'Dobles cañas': { shape: 'star', color: '#8a2be2' },
  'Saxofones': { shape: 'star', color: '#a0522d' },
  Metales: { shape: 'capsule', color: '#ffff00' },
  'Percusión menor': { shape: 'pentagon', color: '#808080' },
  Tambores: { shape: 'circle', color: '#808080' },
  Platillos: { shape: 'circle', color: '#808080' },
  Placas: { shape: 'square', color: '#ff0000' },
  Auxiliares: { shape: 'circle', color: '#4b0082' },
  'Cuerdas frotadas': { shape: 'triangle', color: '#ffa500' },
  'Cuerdas pulsadas': { shape: 'star4', color: '#008000' },
  Voces: { shape: 'capsule', color: '#808080' },
};

// Relación simple de instrumentos con familias
const INSTRUMENT_FAMILIES = {
  Flauta: 'Maderas de timbre "redondo"',
  Oboe: 'Dobles cañas',
  Clarinete: 'Dobles cañas',
  Fagot: 'Dobles cañas',
  Saxofón: 'Saxofones',
  Trompeta: 'Metales',
  Trombón: 'Metales',
  Tuba: 'Metales',
  'Corno francés': 'Metales',
  Piano: 'Cuerdas pulsadas',
  Violín: 'Cuerdas frotadas',
  Viola: 'Cuerdas frotadas',
  Violonchelo: 'Cuerdas frotadas',
  Contrabajo: 'Cuerdas frotadas',
  Voz: 'Voces',
};

// Asigna instrumento, familia, forma y color a cada pista
function assignTrackInfo(tracks) {
  return tracks.map((t) => {
    const instrument = t.name;
    const family = INSTRUMENT_FAMILIES[instrument] || 'Desconocida';
    const preset = FAMILY_PRESETS[family] || { shape: 'unknown', color: '#ffffff' };
    return { ...t, instrument, family, shape: preset.shape, color: preset.color };
  });
}

function parseMIDI(arrayBuffer) {
  const data = new DataView(arrayBuffer);
  let offset = 0;

  const readString = (len) => {
    let s = '';
    for (let i = 0; i < len; i++) {
      s += String.fromCharCode(data.getUint8(offset++));
    }
    return s;
  };

  const readUint32 = () => {
    const v = data.getUint32(offset);
    offset += 4;
    return v;
  };

  const readUint16 = () => {
    const v = data.getUint16(offset);
    offset += 2;
    return v;
  };

  const readVarInt = () => {
    let result = 0;
    while (true) {
      const b = data.getUint8(offset++);
      result = (result << 7) | (b & 0x7f);
      if ((b & 0x80) === 0) break;
    }
    return result;
  };

  if (readString(4) !== 'MThd') throw new Error('Archivo MIDI inválido');
  const headerLength = readUint32();
  const formatType = readUint16();
  const trackCount = readUint16();
  const timeDivision = readUint16();
  offset += headerLength - 6;

  const result = { formatType, trackCount, timeDivision, tracks: [] };

  for (let t = 0; t < trackCount; t++) {
    if (readString(4) !== 'MTrk') throw new Error('Chunk de pista faltante');
    const trackLength = readUint32();
    const trackEnd = offset + trackLength;

    let trackName = `Track ${t}`;
    const events = [];
    const active = {};
    let currentTime = 0;
    let lastEventType = null;

    while (offset < trackEnd) {
      const delta = readVarInt();
      currentTime += delta;
      let eventType = data.getUint8(offset++);

      if (eventType === 0xff) {
        const metaType = data.getUint8(offset++);
        const length = readVarInt();
        const meta = [];
        for (let i = 0; i < length; i++) meta.push(data.getUint8(offset++));
        if (metaType === 0x03) {
          trackName = String.fromCharCode(...meta);
        } else if (metaType === 0x51 && length === 3) {
          const microsecondsPerBeat = (meta[0] << 16) | (meta[1] << 8) | meta[2];
          events.push({ type: 'tempo', time: currentTime, microsecondsPerBeat });
        }
      } else if (eventType === 0xf0 || eventType === 0xf7) {
        const length = readVarInt();
        offset += length;
      } else {
        if ((eventType & 0x80) === 0) {
          offset--;
          eventType = lastEventType;
        } else {
          lastEventType = eventType;
        }
        const eventCode = eventType & 0xf0;
        const channel = eventType & 0x0f;
        const param1 = data.getUint8(offset++);
        const param2 = eventCode === 0xc0 || eventCode === 0xd0 ? null : data.getUint8(offset++);

        const key = `${channel}:${param1}`;
        if (eventCode === 0x90 && param2 !== 0) {
          active[key] = { start: currentTime, velocity: param2 };
        } else if (eventCode === 0x80 || (eventCode === 0x90 && param2 === 0)) {
          const note = active[key];
          if (note) {
            events.push({
              type: 'note',
              channel,
              noteNumber: param1,
              velocity: note.velocity,
              start: note.start,
              duration: currentTime - note.start,
            });
            delete active[key];
          }
        }
      }
    }

    result.tracks.push({ name: trackName, events });
  }

  result.tracks = assignTrackInfo(result.tracks);
  return result;
}

function parseMusicXML(text) {
  // Fallback simple parsing for entornos sin DOMParser (ej. pruebas en Node)
  if (typeof DOMParser === 'undefined') {
    const tempo = parseFloat((text.match(/<sound[^>]*tempo="([0-9.]+)"/i) || [0, '120'])[1]);
    const divisions = parseInt((text.match(/<divisions>(\d+)<\/divisions>/i) || [0, '1'])[1], 10);
    const trackName = (text.match(/<part-name>([^<]+)<\/part-name>/i) || [0, 'part'])[1];
    const stepToMidi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
    const events = [];
    let currentTime = 0;
    const noteRegex = /<note>([\s\S]*?)<\/note>/gi;
    let m;
    while ((m = noteRegex.exec(text))) {
      const block = m[1];
      const isRest = /<rest\b/i.test(block);
      const duration = parseInt((block.match(/<duration>(\d+)<\/duration>/i) || [0, '0'])[1], 10);
      if (!isRest) {
        const step = (block.match(/<step>([A-G])<\/step>/i) || [0, 'C'])[1];
        const octave = parseInt((block.match(/<octave>(\d+)<\/octave>/i) || [0, '4'])[1], 10);
        const alter = parseInt((block.match(/<alter>(-?\d+)<\/alter>/i) || [0, '0'])[1], 10);
        const noteNumber = stepToMidi[step] + alter + (octave + 1) * 12;
        events.push({ type: 'note', noteNumber, velocity: 64, start: currentTime, duration });
      }
      currentTime += duration;
    }
    const tracks = assignTrackInfo([{ name: trackName, events }]);
    return { tempo, divisions, tracks };
  }

  const parser = new DOMParser();
  const xml = parser.parseFromString(text, 'application/xml');
  const tempo = parseFloat(xml.querySelector('sound[tempo]')?.getAttribute('tempo')) || 120;
  const divisions = parseInt(xml.querySelector('divisions')?.textContent || '1', 10);

  const stepToMidi = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  const tracks = Array.from(xml.getElementsByTagName('part')).map((part) => {
    const trackName = part.querySelector('part-name')?.textContent || part.getAttribute('id');
    const events = [];
    let currentTime = 0;

    Array.from(part.getElementsByTagName('measure')).forEach((measure) => {
      Array.from(measure.getElementsByTagName('note')).forEach((noteEl) => {
        const duration = parseInt(noteEl.querySelector('duration')?.textContent || '0', 10);
        const isRest = noteEl.getElementsByTagName('rest').length > 0;
        if (!isRest) {
          const pitch = noteEl.querySelector('pitch');
          const step = pitch.querySelector('step').textContent;
          const octave = parseInt(pitch.querySelector('octave').textContent, 10);
          const alter = parseInt(pitch.querySelector('alter')?.textContent || '0', 10);
          const noteNumber = stepToMidi[step] + alter + (octave + 1) * 12;
          events.push({
            type: 'note',
            noteNumber,
            velocity: 64,
            start: currentTime,
            duration,
          });
        }
        currentTime += duration;
      });
    });

    return { name: trackName, events };
  });

  return { tempo, divisions, tracks: assignTrackInfo(tracks) };
}

if (typeof module !== 'undefined') {
  module.exports = {
    parseMIDI,
    parseMusicXML,
    assignTrackInfo,
    FAMILY_PRESETS,
    INSTRUMENT_FAMILIES,
  };
}
