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

    loadBtn.addEventListener('click', () => fileInput.click());

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const ext = file.name.split('.').pop().toLowerCase();

      const reader = new FileReader();
      if (ext === 'mid' || ext === 'midi') {
        reader.onload = (ev) => {
          const midi = parseMIDI(ev.target.result);
          console.log('MIDI parsed', midi);
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === 'xml') {
        reader.onload = (ev) => {
          const xml = parseMusicXML(ev.target.result);
          console.log('MusicXML parsed', xml);
        };
        reader.readAsText(file);
      } else {
        alert('Formato no soportado');
      }
    });
  });
}

// ----- Parsing helpers -----

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

  return result;
}

function parseMusicXML(text) {
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

  return { tempo, divisions, tracks };
}

if (typeof module !== 'undefined') {
  module.exports = { parseMIDI, parseMusicXML };
}
