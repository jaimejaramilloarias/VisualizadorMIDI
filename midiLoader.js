(function (global) {
  function loadMusicFile(file, parsers) {
    return new Promise((resolve, reject) => {
      if (!file) {
        reject(new Error('No se proporcionó archivo'));
        return;
      }
      const ext = file.name.split('.').pop().toLowerCase();
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Error al leer el archivo'));
      if (ext === 'mid' || ext === 'midi') {
        reader.onload = (ev) => {
          try {
            const midi = parsers.parseMIDI(ev.target.result);
            const tempoEvent = midi.tracks
              .flatMap((t) => t.events)
              .find((e) => e.type === 'tempo');
            const microPerBeat = tempoEvent ? tempoEvent.microsecondsPerBeat : 500000;
            const secondsPerTick = microPerBeat / 1e6 / midi.timeDivision;
            resolve({ tracks: midi.tracks, secondsPerUnit: secondsPerTick });
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === 'xml') {
        reader.onload = (ev) => {
          try {
            const xml = parsers.parseMusicXML(ev.target.result);
            const secondsPerDiv = (60 / xml.tempo) / xml.divisions;
            resolve({ tracks: xml.tracks, secondsPerUnit: secondsPerDiv });
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsText(file);
      } else {
        reject(new Error('Formato no soportado'));
      }
    });
  }

  const api = { loadMusicFile };
  if (typeof module !== 'undefined') module.exports = api;
  else global.midiLoader = api;
})(typeof window !== 'undefined' ? window : global);
