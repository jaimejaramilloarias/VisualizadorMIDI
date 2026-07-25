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
      } else {
        reject(new Error('Formato no soportado'));
      }
    });
  }

  const api = { loadMusicFile };
  if (typeof module !== 'undefined') module.exports = api;
  else global.midiLoader = api;
})(typeof window !== 'undefined' ? window : global);
