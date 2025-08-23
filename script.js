// Script inicial para preparar el canvas
// En esta etapa no se implementa funcionalidad adicional

// Importación de utilidades modulares para efectos visuales y cálculos
const {
  computeOpacity,
  computeBumpHeight,
  computeGlowAlpha,
  drawNoteShape,
  adjustColorBrightness,
  NON_STRETCHED_SHAPES,
  SHAPE_OPTIONS,
  getFamilyModifiers,
  computeNoteWidth,
  calculateCanvasSize,
  computeSeekOffset,
  resetStartOffset,
} = typeof require !== 'undefined' ? require('./utils.js') : window.utils;

// "initializeUI" se declara globalmente en ui.js cuando se carga en el navegador.
// Para evitar un error de "Identifier has already been declared" al importar
// la función en este archivo, renombramos la referencia local.
const { initializeUI: initializeUIControls } =
  typeof require !== 'undefined' ? require('./ui.js') : window.ui;

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');

    // Canvas offscreen para optimizar el renderizado de notas
    const offscreenCanvas = document.createElement('canvas');
    const offscreenCtx = offscreenCanvas.getContext('2d');
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;

    // Relleno inicial del canvas como marcador de posición usando el canvas offscreen
    offscreenCtx.fillStyle = '#222';
    offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    ctx.drawImage(offscreenCanvas, 0, 0);

    const loadBtn = document.getElementById('load-midi');
    const fileInput = document.getElementById('midi-file-input');
    const loadWavBtn = document.getElementById('load-wav');
    const wavInput = document.getElementById('wav-file-input');
    const instrumentSelect = document.getElementById('instrument-select');
    const familySelect = document.getElementById('family-select');
    const toggleFamilyPanelBtn = document.getElementById('toggle-family-panel');
    const familyPanel = document.getElementById('family-config-panel');
    const assignmentModal = document.getElementById('assignment-modal');
    const modalInstrumentList = document.getElementById('modal-instrument-list');
    const modalFamilyZones = document.getElementById('modal-family-zones');
    const applyAssignmentsBtn = document.getElementById('apply-assignments');
    let currentTracks = [];
    let notes = [];
    const NOTE_MIN = 21;
    const NOTE_MAX = 108;
    const BASE_HEIGHT = 720;
    let currentAspect = '16:9';
    let pixelsPerSecond = canvas.width / 6;
    let animationId = null;
    let playStartTime = 0;
    let startOffset = 0;

    function saveAssignments() {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('instrumentFamilies', JSON.stringify(assignedFamilies));
      }
    }

    function updateTrackFamily(inst, fam) {
      const track = currentTracks.find((t) => t.instrument === inst);
      if (track) {
        track.family = fam;
        const preset = FAMILY_PRESETS[fam] || { shape: 'unknown', color: '#ffffff' };
        track.shape = preset.shape;
        const shift = INSTRUMENT_COLOR_SHIFT[track.instrument] || 0;
        track.color = adjustColorBrightness(preset.color, shift);
      }
    }

    function applyStoredAssignments() {
      currentTracks.forEach((t) => {
        const fam = assignedFamilies[t.instrument];
        if (fam) {
          updateTrackFamily(t.instrument, fam);
        }
      });
    }

    function buildFamilyPanel() {
      familyPanel.innerHTML = '';
      FAMILY_LIST.forEach((family) => {
        const item = document.createElement('div');
        item.className = 'family-config-item';
        item.dataset.family = family;

        const label = document.createElement('label');
        label.textContent = family;
        const colorInput = document.createElement('input');
        colorInput.type = 'color';
        colorInput.value = FAMILY_PRESETS[family]?.color || '#ffffff';
        const shapeSelect = document.createElement('select');
        SHAPE_OPTIONS.forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          if (opt.value === (FAMILY_PRESETS[family]?.shape || '')) o.selected = true;
          shapeSelect.appendChild(o);
        });

        colorInput.addEventListener('change', () => {
          setFamilyCustomization(family, { color: colorInput.value }, currentTracks);
        });
        shapeSelect.addEventListener('change', () => {
          setFamilyCustomization(family, { shape: shapeSelect.value }, currentTracks);
        });

        item.appendChild(label);
        item.appendChild(colorInput);
        item.appendChild(shapeSelect);
        familyPanel.appendChild(item);
      });

      const resetBtn = document.createElement('button');
      resetBtn.id = 'reset-family-defaults';
      resetBtn.textContent = 'Restablecer predeterminados';
      resetBtn.addEventListener('click', () => {
        resetFamilyCustomizations(currentTracks);
        buildFamilyPanel();
      });
      familyPanel.appendChild(resetBtn);

      const exportBtn = document.createElement('button');
      exportBtn.id = 'export-config';
      exportBtn.textContent = 'Exportar configuración';
      exportBtn.addEventListener('click', () => {
        const data = exportConfiguration();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'configuracion.json';
        a.click();
        URL.revokeObjectURL(url);
      });

      const importBtn = document.createElement('button');
      importBtn.id = 'import-config';
      importBtn.textContent = 'Importar configuración';
      const importInput = document.createElement('input');
      importInput.type = 'file';
      importInput.accept = 'application/json';
      importInput.style.display = 'none';
      importInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          importConfiguration(ev.target.result, currentTracks);
          populateInstrumentDropdown(currentTracks);
          buildFamilyPanel();
        };
        reader.readAsText(file);
      });
      importBtn.addEventListener('click', () => importInput.click());

      familyPanel.appendChild(exportBtn);
      familyPanel.appendChild(importBtn);
      familyPanel.appendChild(importInput);
    }

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
      familySelect.value = assignedFamilies[selected] || '';
    });

    familySelect.addEventListener('change', () => {
      const inst = instrumentSelect.value;
      if (!inst || inst === 'Instrumento') return;
      const fam = familySelect.value;
      if (fam) {
        assignedFamilies[inst] = fam;
      } else {
        delete assignedFamilies[inst];
      }
      saveAssignments();
      updateTrackFamily(inst, fam);
    });

    function showAssignmentModal(tracks) {
      modalInstrumentList.innerHTML = '';
      modalFamilyZones.innerHTML = '';
      assignmentModal.style.display = 'flex';

      modalInstrumentList.addEventListener('dragover', (e) => e.preventDefault());
      modalInstrumentList.addEventListener('drop', (e) => {
        e.preventDefault();
        const inst = e.dataTransfer.getData('text/plain');
        const li = assignmentModal.querySelector(`li[data-instrument="${inst}"]`);
        if (li) modalInstrumentList.appendChild(li);
      });

      FAMILY_LIST.forEach((family) => {
        const zone = document.createElement('div');
        zone.className = 'family-zone';
        zone.dataset.family = family;
        zone.addEventListener('dragover', (e) => e.preventDefault());
        zone.addEventListener('drop', (e) => {
          e.preventDefault();
          const inst = e.dataTransfer.getData('text/plain');
          const li = assignmentModal.querySelector(`li[data-instrument="${inst}"]`);
          if (li) zone.querySelector('ul').appendChild(li);
        });
        const h4 = document.createElement('h4');
        h4.textContent = family;
        const ul = document.createElement('ul');
        zone.appendChild(h4);
        zone.appendChild(ul);
        modalFamilyZones.appendChild(zone);
      });

      const instrumentNames = [...new Set(tracks.map((t) => t.instrument))];
      instrumentNames.forEach((name) => {
        const li = document.createElement('li');
        li.textContent = name;
        li.dataset.instrument = name;
        li.className = 'instrument-item';
        li.draggable = true;
        li.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', name);
        });

        const assigned = assignedFamilies[name];
        if (assigned) {
          const selector = `.family-zone[data-family='${CSS.escape(assigned)}'] ul`;
          const zone = modalFamilyZones.querySelector(selector);
          if (zone) zone.appendChild(li);
          else modalInstrumentList.appendChild(li);
        } else {
          modalInstrumentList.appendChild(li);
        }
      });
    }

    applyAssignmentsBtn.addEventListener('click', () => {
      modalFamilyZones.querySelectorAll('.family-zone').forEach((zone) => {
        const fam = zone.dataset.family;
        zone.querySelectorAll('li').forEach((li) => {
          assignedFamilies[li.dataset.instrument] = fam;
          updateTrackFamily(li.dataset.instrument, fam);
        });
      });
      modalInstrumentList.querySelectorAll('li').forEach((li) => {
        delete assignedFamilies[li.dataset.instrument];
        updateTrackFamily(li.dataset.instrument, '');
      });
      saveAssignments();
      populateInstrumentDropdown(currentTracks);
      instrumentSelect.value = 'Instrumento';
      familySelect.value = '';
      assignmentModal.style.display = 'none';
    });

    toggleFamilyPanelBtn.addEventListener('click', () => {
      const open = familyPanel.classList.toggle('active');
      toggleFamilyPanelBtn.textContent = open ? '▲' : '▼';
    });

    buildFamilyPanel();

    // ----- Configuración de Audio -----
    let audioCtx;
    function getAudioContext() {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      return audioCtx;
    }

    let audioBuffer = null; // Buffer de audio cargado
    let trimOffset = 0; // Tiempo inicial ignorando silencio
    let source = null; // Fuente de audio en reproducción
    let isPlaying = false;

    function applyCanvasSize(fullscreen = !!document.fullscreenElement) {
      const { width, height, styleWidth, styleHeight } = calculateCanvasSize(
        currentAspect,
        BASE_HEIGHT,
        fullscreen,
        window.innerWidth,
        window.innerHeight,
        window.devicePixelRatio || 1
      );
      canvas.width = width;
      canvas.height = height;
      offscreenCanvas.width = width;
      offscreenCanvas.height = height;
      canvas.style.width = `${styleWidth}px`;
      canvas.style.height = `${styleHeight}px`;
      pixelsPerSecond = canvas.width / 6;
    }

    applyCanvasSize(false);

    document.addEventListener('fullscreenchange', () => {
      applyCanvasSize();
    });

    function startPlayback() {
      if (!audioBuffer) return;
      const ctx = getAudioContext();
      source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(ctx.destination);
      source.onended = () => {
        isPlaying = false;
        source = null;
        stopAnimation();
        startOffset = 0;
        renderFrame(0);
      };
      playStartTime = ctx.currentTime;
      source.start(0, trimOffset + startOffset);
      isPlaying = true;
      startAnimation();
    }

    function stopPlayback(preserveOffset = true) {
      if (!isPlaying || !source) return;
      const ctx = getAudioContext();
      if (preserveOffset) {
        startOffset += ctx.currentTime - playStartTime;
      } else {
        startOffset = 0;
      }
      source.onended = null;
      source.stop();
      source = null;
      isPlaying = false;
      stopAnimation();
      renderFrame(startOffset);
    }

    function seek(delta) {
      if (!audioBuffer) return;
      const wasPlaying = isPlaying;
      stopPlayback(true);
      startOffset = computeSeekOffset(startOffset, delta, audioBuffer.duration, trimOffset);
      renderFrame(startOffset);
      if (wasPlaying) startPlayback();
    }

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
          applyStoredAssignments();
          populateInstrumentDropdown(currentTracks);
          showAssignmentModal(currentTracks);
          const tempoEvent = midi.tracks
            .flatMap((t) => t.events)
            .find((e) => e.type === 'tempo');
          const microPerBeat = tempoEvent ? tempoEvent.microsecondsPerBeat : 500000;
          const secondsPerTick = microPerBeat / 1e6 / midi.timeDivision;
          prepareNotesFromTracks(currentTracks, secondsPerTick);
          startOffset = 0;
          renderFrame(0);
          console.log('MIDI parsed', midi);
        };
        reader.readAsArrayBuffer(file);
      } else if (ext === 'xml') {
        reader.onload = (ev) => {
          const xml = parseMusicXML(ev.target.result);
          currentTracks = xml.tracks;
          applyStoredAssignments();
          populateInstrumentDropdown(currentTracks);
          showAssignmentModal(currentTracks);
          const secondsPerDiv = (60 / xml.tempo) / xml.divisions;
          prepareNotesFromTracks(currentTracks, secondsPerDiv);
          startOffset = 0;
          renderFrame(0);
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
      audioBuffer = await getAudioContext().decodeAudioData(arrayBuffer);

      // Detectar primer sample significativo para ignorar silencio
      const channel = audioBuffer.getChannelData(0);
      const threshold = 0.001;
      let startIndex = 0;
      while (startIndex < channel.length && Math.abs(channel[startIndex]) < threshold) {
        startIndex++;
      }
      trimOffset = startIndex / audioBuffer.sampleRate;
      startOffset = 0;
      console.log('WAV cargado, trimOffset =', trimOffset);
    });

    // Reproducción básica Play/Stop con animación y controles de búsqueda
    const uiControls = initializeUIControls({
      isPlaying: () => isPlaying,
      onPlay: async () => {
        if (!audioBuffer) return;
        const ctx = getAudioContext();
        await ctx.resume();
        startPlayback();
      },
      onStop: () => stopPlayback(true),
      onForward: () => seek(3),
      onBackward: () => seek(-3),
      onRestart: () => {
        const wasPlaying = isPlaying;
        stopPlayback(false);
        startOffset = resetStartOffset();
        renderFrame(startOffset);
        if (wasPlaying) startPlayback();
      },
      onAspect169: () => {
        currentAspect = '16:9';
        applyCanvasSize();
      },
      onAspect916: () => {
        currentAspect = '9:16';
        applyCanvasSize();
      },
      onFullScreen: () => {
        if (!document.fullscreenElement) {
          canvas.requestFullscreen();
        } else {
          document.exitFullscreen();
        }
      },
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        uiControls.playBtn.click();
      }
    });

    function prepareNotesFromTracks(tracks, secPerUnit) {
      notes = [];
      tracks.forEach((track) => {
        track.events.forEach((ev) => {
          if (ev.type === 'note') {
            const start = ev.start * secPerUnit;
            const duration = ev.duration * secPerUnit;
            notes.push({
              start,
              end: start + duration,
              noteNumber: ev.noteNumber,
              color: track.color || '#ffffff',
              shape: track.shape || 'square',
              family: track.family,
            });
          }
        });
      });
      notes.sort((a, b) => a.start - b.start);
    }

    function renderFrame(currentSec) {
      offscreenCtx.clearRect(0, 0, canvas.width, canvas.height);
      offscreenCtx.fillStyle = '#222';
      offscreenCtx.fillRect(0, 0, canvas.width, canvas.height);
      const noteHeight = canvas.height / 88;
      notes.forEach((n) => {
        const { sizeFactor, bump } = getFamilyModifiers(n.family);
        const baseHeight = noteHeight * sizeFactor;
        let xStart;
        let xEnd;
        let width;
        if (NON_STRETCHED_SHAPES.has(n.shape)) {
          width = baseHeight;
          const xCenter = canvas.width / 2 + (n.start - currentSec) * pixelsPerSecond;
          xStart = xCenter - width / 2;
          xEnd = xStart + width;
        } else {
          xStart = canvas.width / 2 + (n.start - currentSec) * pixelsPerSecond;
          xEnd = canvas.width / 2 + (n.end - currentSec) * pixelsPerSecond;
          width = xEnd - xStart;
        }
        if (xEnd < 0 || xStart > canvas.width) return;
        const clamped = Math.min(Math.max(n.noteNumber, NOTE_MIN), NOTE_MAX);

        // Altura con efecto "bump" cuando la nota cruza la línea de presente
        const height = computeBumpHeight(baseHeight, currentSec, n.start, n.end, bump);
        const y =
          canvas.height - (clamped - NOTE_MIN + 1) * noteHeight -
          (height - noteHeight) / 2;

        // Opacidad variable según distancia al centro
        const alpha = computeOpacity(xStart, xEnd, canvas.width);
        offscreenCtx.save();
        offscreenCtx.globalAlpha = alpha;
        offscreenCtx.fillStyle = n.color;
        drawNoteShape(offscreenCtx, n.shape, xStart, y, width, height);
        offscreenCtx.restore();

        // Brillo blanco corto en el NOTE ON presente
        const glowAlpha = computeGlowAlpha(currentSec, n.start);
        if (glowAlpha > 0) {
          offscreenCtx.save();
          offscreenCtx.globalAlpha = glowAlpha;
          offscreenCtx.strokeStyle = '#fff';
          offscreenCtx.lineWidth = 2;
          drawNoteShape(offscreenCtx, n.shape, xStart, y, width, height, true);
          offscreenCtx.restore();
        }
      });
      offscreenCtx.strokeStyle = '#fff';
      offscreenCtx.beginPath();
      offscreenCtx.moveTo(canvas.width / 2, 0);
      offscreenCtx.lineTo(canvas.width / 2, canvas.height);
      offscreenCtx.stroke();

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreenCanvas, 0, 0);
    }

    function startAnimation() {
      const step = () => {
        const currentSec =
          startOffset + (getAudioContext().currentTime - playStartTime);
        renderFrame(currentSec);
        if (isPlaying) animationId = requestAnimationFrame(step);
      };
      animationId = requestAnimationFrame(step);
    }

    function stopAnimation() {
      if (animationId) cancelAnimationFrame(animationId);
      animationId = null;
    }
  });
}

// ----- Parsing helpers -----

// Datos de familias con formas y colores predeterminados
const FAMILY_DEFAULTS = {
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

// Copia mutable de los valores predeterminados
const FAMILY_PRESETS = JSON.parse(JSON.stringify(FAMILY_DEFAULTS));

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

// Variación de tono por instrumento según su registro
const INSTRUMENT_COLOR_SHIFT = {
  Flauta: 0,
  Clarinete: -0.2,
  Oboe: 0,
  Fagot: -0.3,
  Saxofón: -0.1,
  Trompeta: 0.1,
  Trombón: -0.1,
  Tuba: -0.2,
  'Corno francés': 0,
  Piano: 0,
  Violín: 0.1,
  Viola: 0,
  Violonchelo: -0.1,
  Contrabajo: -0.2,
  Voz: 0,
};

const FAMILY_LIST = [
  'Maderas de timbre "redondo"',
  'Dobles cañas',
  'Saxofones',
  'Metales',
  'Percusión menor',
  'Tambores',
  'Platillos',
  'Placas',
  'Auxiliares',
  'Cuerdas frotadas',
  'Cuerdas pulsadas',
  'Voces',
];

let assignedFamilies = {};
if (typeof localStorage !== 'undefined') {
  assignedFamilies = JSON.parse(localStorage.getItem('instrumentFamilies') || '{}');
}

let familyCustomizations = {};
if (typeof localStorage !== 'undefined') {
  familyCustomizations = JSON.parse(localStorage.getItem('familyCustomizations') || '{}');
  Object.entries(familyCustomizations).forEach(([fam, cfg]) => {
    if (FAMILY_PRESETS[fam]) {
      if (cfg.color) FAMILY_PRESETS[fam].color = cfg.color;
      if (cfg.shape) FAMILY_PRESETS[fam].shape = cfg.shape;
    }
  });
}

function saveFamilyCustomizations() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('familyCustomizations', JSON.stringify(familyCustomizations));
  }
}

function setFamilyCustomization(family, { color, shape }, tracks = []) {
  const preset = FAMILY_PRESETS[family] || { shape: 'square', color: '#ffffff' };
  if (color) preset.color = color;
  if (shape) preset.shape = shape;
  FAMILY_PRESETS[family] = preset;
  familyCustomizations[family] = { color: preset.color, shape: preset.shape };
  saveFamilyCustomizations();
  tracks.forEach((t) => {
    if (t.family === family) {
      t.shape = preset.shape;
      const shift = INSTRUMENT_COLOR_SHIFT[t.instrument] || 0;
      t.color = adjustColorBrightness(preset.color, shift);
    }
  });
}

function resetFamilyCustomizations(tracks = []) {
  Object.keys(FAMILY_DEFAULTS).forEach((fam) => {
    FAMILY_PRESETS[fam] = { ...FAMILY_DEFAULTS[fam] };
  });
  familyCustomizations = {};
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('familyCustomizations');
  }
  tracks.forEach((t) => {
    const preset = FAMILY_PRESETS[t.family] || { shape: 'square', color: '#ffffff' };
    t.shape = preset.shape;
    const shift = INSTRUMENT_COLOR_SHIFT[t.instrument] || 0;
    t.color = adjustColorBrightness(preset.color, shift);
  });
}

function exportConfiguration() {
  return JSON.stringify({ assignedFamilies, familyCustomizations });
}

function importConfiguration(json, tracks = []) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  assignedFamilies = data.assignedFamilies || {};
  familyCustomizations = data.familyCustomizations || {};

  Object.keys(FAMILY_DEFAULTS).forEach((fam) => {
    FAMILY_PRESETS[fam] = { ...FAMILY_DEFAULTS[fam] };
  });
  Object.entries(familyCustomizations).forEach(([fam, cfg]) => {
    if (FAMILY_PRESETS[fam]) {
      if (cfg.color) FAMILY_PRESETS[fam].color = cfg.color;
      if (cfg.shape) FAMILY_PRESETS[fam].shape = cfg.shape;
    }
  });
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('instrumentFamilies', JSON.stringify(assignedFamilies));
    localStorage.setItem('familyCustomizations', JSON.stringify(familyCustomizations));
  }
  tracks.forEach((t) => {
    const fam = assignedFamilies[t.instrument] || t.family;
    t.family = fam;
    const preset = FAMILY_PRESETS[fam] || { shape: 'unknown', color: '#ffffff' };
    t.shape = preset.shape;
    const shift = INSTRUMENT_COLOR_SHIFT[t.instrument] || 0;
    t.color = adjustColorBrightness(preset.color, shift);
  });
}

// Asigna instrumento, familia, forma y color a cada pista
function assignTrackInfo(tracks) {
  return tracks.map((t) => {
    const instrument = t.name;
    const family = INSTRUMENT_FAMILIES[instrument] || 'Desconocida';
    const preset = FAMILY_PRESETS[family] || { shape: 'unknown', color: '#ffffff' };
    const shift = INSTRUMENT_COLOR_SHIFT[instrument] || 0;
    const color = adjustColorBrightness(preset.color, shift);
    return { ...t, instrument, family, shape: preset.shape, color };
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
    FAMILY_DEFAULTS,
    INSTRUMENT_FAMILIES,
    INSTRUMENT_COLOR_SHIFT,
    adjustColorBrightness,
    computeOpacity,
    computeBumpHeight,
    computeGlowAlpha,
    computeSeekOffset,
    resetStartOffset,
    drawNoteShape,
    getFamilyModifiers,
    computeNoteWidth,
    calculateCanvasSize,
    NON_STRETCHED_SHAPES,
    setFamilyCustomization,
    resetFamilyCustomizations,
    exportConfiguration,
    importConfiguration,
  };
}
