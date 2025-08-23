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
            resolve({
              tracks: midi.tracks,
              tempoMap: midi.tempoMap,
              timeDivision: midi.timeDivision,
            });
          } catch (err) {
            reject(err);
          }
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === 'xml') {
        reader.onload = (ev) => {
          try {
            const xml = parsers.parseMusicXML(ev.target.result);
            const tempoMap = [
              {
                time: 0,
                microsecondsPerBeat: (60 / xml.tempo) * 1e6,
              },
            ];
            resolve({
              tracks: xml.tracks,
              tempoMap,
              timeDivision: xml.divisions,
            });
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
