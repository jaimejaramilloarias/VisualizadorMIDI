// Script inicial para preparar el canvas
// En esta etapa no se implementa funcionalidad adicional

// Importación de utilidades modulares para efectos visuales y cálculos
const {
  computeOpacity,
  computeBumpHeight,
  computeGlowAlpha,
  drawNoteShape,
  adjustColorBrightness,
  interpolateColor,
  NON_STRETCHED_SHAPES,
  SHAPE_OPTIONS,
  getFamilyModifiers,
  computeNoteWidth,
  calculateCanvasSize,
  computeSeekOffset,
  resetStartOffset,
  applyGlowEffect,
  startFixedFPSLoop,
  computeVelocityHeight,
  setVelocityBase,
  getVelocityBase,
  setOpacityScale,
  getOpacityScale,
  setGlowStrength,
  getGlowStrength,
    setBumpControl,
    getBumpControl,
    preprocessTempoMap,
    ticksToSeconds,
    validateColorRange,
    prefersReducedMotion,
  } = typeof require !== 'undefined' ? require('./utils.js') : window.utils;

// "initializeUI" e "initializeDeveloperMode" se declaran globalmente en ui.js cuando se
// carga en el navegador. Para evitar errores de "Identifier has already been declared"
// al importar estas funciones, renombramos las referencias locales.
const {
  initializeUI: initializeUIControls,
  initializeDeveloperMode: initDeveloperMode,
} = typeof require !== 'undefined' ? require('./ui.js') : window.ui;
const { loadMusicFile } =
  typeof require !== 'undefined' ? require('./midiLoader.js') : window.midiLoader;
const { loadWavFile } =
  typeof require !== 'undefined' ? require('./wavLoader.js') : window.wavLoader;
const { createAudioPlayer } =
  typeof require !== 'undefined' ? require('./audioPlayer.js') : window.audioPlayer;

// Estado de activación de instrumentos
const enabledInstruments =
  (typeof localStorage !== 'undefined' &&
    JSON.parse(localStorage.getItem('enabledInstruments') || '{}')) ||
  {};

function setInstrumentEnabled(inst, enabled) {
  enabledInstruments[inst] = enabled;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('enabledInstruments', JSON.stringify(enabledInstruments));
  }
}

function getVisibleNotes(allNotes) {
  return allNotes.filter(
    (n) => enabledInstruments[n.trackName ?? n.instrument] !== false,
  );
}

if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    const titleEl = document.getElementById('app-title');
    if (titleEl) {
      const vibrantColors = ['#ff595e', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93', '#ff924c', '#ff4d6d'];
      titleEl.innerHTML = [...titleEl.textContent]
        .map(
          (ch, i) =>
            `<span style="color:${vibrantColors[i % vibrantColors.length]}">${ch}</span>`
        )
        .join('');
    }

    const canvas = document.getElementById('visualizer');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    canvas.style.imageRendering = 'pixelated';
    // Sugerir al navegador que optimice transformaciones/opacidad del canvas
    canvas.style.willChange = 'transform, opacity';
    canvas.style.contain = 'paint';

    // Canvas offscreen para optimizar el renderizado de notas
    const offscreenCanvas = document.createElement('canvas');
    const offscreenCtx = offscreenCanvas.getContext('2d');
    offscreenCtx.imageSmoothingEnabled = false;
    offscreenCtx.lineCap = 'round';
    offscreenCtx.lineJoin = 'round';
    offscreenCanvas.width = canvas.width;
    offscreenCanvas.height = canvas.height;

    // Relleno inicial del canvas en negro absoluto
    offscreenCtx.fillStyle = '#000000';
    offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
    canvas.style.backgroundColor = '#000000';
    ctx.drawImage(offscreenCanvas, 0, 0);

    const loadBtn = document.getElementById('load-midi');
    const fileInput = document.getElementById('midi-file-input');
    const loadWavBtn = document.getElementById('load-wav');
    const wavInput = document.getElementById('wav-file-input');
    const instrumentSelect = document.getElementById('instrument-select');
    const familySelect = document.getElementById('family-select');
    const toggleFamilyPanelBtn = document.getElementById('toggle-family-panel');
    const familyPanel = document.getElementById('family-config-panel');
    const developerBtn = document.getElementById('developer-mode');
    const developerControls = document.getElementById('developer-controls');
    const assignmentModal = document.getElementById('assignment-modal');
    const modalInstrumentList = document.getElementById('modal-instrument-list');
    const modalFamilyZones = document.getElementById('modal-family-zones');
    const applyAssignmentsBtn = document.getElementById('apply-assignments');

    let velocityBase = getVelocityBase();

    // ---- Soporte de selección múltiple en el modal de asignación ----
    let modalSelectMode = null;
    let checkboxDrag = null;
    let lastModalIndex = null;
    modalInstrumentList.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return; // solo botón izquierdo
      const item = e.target.closest('.instrument-item');
      if (!item) return;
      const items = Array.from(
        modalInstrumentList.querySelectorAll('.instrument-item')
      );
      const idx = items.indexOf(item);
      if (e.shiftKey && lastModalIndex !== null) {
        const [start, end] = [lastModalIndex, idx].sort((a, b) => a - b);
        for (let i = start; i <= end; i++) {
          items[i].classList.add('selected');
        }
        modalSelectMode = null;
      } else {
        modalSelectMode = item.classList.contains('selected')
          ? 'deselect'
          : 'select';
        item.classList.toggle('selected', modalSelectMode === 'select');
      }
      lastModalIndex = idx;
    });
    modalInstrumentList.addEventListener('mousemove', (e) => {
      if (!modalSelectMode || e.buttons !== 1) return;
      const item = e.target.closest('.instrument-item');
      if (item)
        item.classList.toggle('selected', modalSelectMode === 'select');
    });
    document.addEventListener('mouseup', () => {
      modalSelectMode = null;
      checkboxDrag = null;
    });

    if (developerBtn && developerControls) {
      const devMode = initDeveloperMode({
        button: developerBtn,
        panel: developerControls,
      });

      developerBtn.addEventListener('click', () => {
        if (devMode.isActive()) {
          familyPanel.classList.add('active');
        }
      });

      // Control para ajustar la velocidad base de referencia
      const velLabel = document.createElement('label');
      velLabel.textContent = 'Velocidad base:';
      const velInput = document.createElement('input');
      velInput.type = 'number';
      velInput.min = '1';
      velInput.max = '127';
      velInput.value = velocityBase;
      velInput.addEventListener('change', () => {
        const val = parseInt(velInput.value, 10);
        if (!isNaN(val)) {
          velocityBase = Math.max(1, Math.min(127, val));
          setVelocityBase(velocityBase);
        }
      });
      const velItem = document.createElement('div');
      velItem.className = 'dev-control';
      velItem.appendChild(velLabel);
      velItem.appendChild(velInput);
      developerControls.appendChild(velItem);

      // Control para la escala de opacidad
      const { edge, mid } = getOpacityScale();
      const edgeLabel = document.createElement('label');
      edgeLabel.textContent = 'Opacidad extremos (%):';
      const edgeInput = document.createElement('input');
      edgeInput.type = 'number';
      edgeInput.min = '0';
      edgeInput.max = '100';
      edgeInput.value = Math.round(edge * 100);
      const midLabel = document.createElement('label');
      midLabel.textContent = 'Opacidad centro (%):';
      const midInput = document.createElement('input');
      midInput.type = 'number';
      midInput.min = '0';
      midInput.max = '100';
      midInput.value = Math.round(mid * 100);
      const updateOpacityScale = () => {
        const e = parseFloat(edgeInput.value) / 100;
        const m = parseFloat(midInput.value) / 100;
        if (!isNaN(e) && !isNaN(m) && m >= e && m <= 1) {
          setOpacityScale(e, m);
        }
      };
      edgeInput.addEventListener('change', updateOpacityScale);
      midInput.addEventListener('change', updateOpacityScale);
      const edgeItem = document.createElement('div');
      edgeItem.className = 'dev-control';
      edgeItem.appendChild(edgeLabel);
      edgeItem.appendChild(edgeInput);
      developerControls.appendChild(edgeItem);
      const midItem = document.createElement('div');
      midItem.className = 'dev-control';
      midItem.appendChild(midLabel);
      midItem.appendChild(midInput);
      developerControls.appendChild(midItem);

      // Control para el glow
      const glowLabel = document.createElement('label');
      glowLabel.textContent = 'Glow (%):';
      const glowInput = document.createElement('input');
      glowInput.type = 'number';
      glowInput.min = '0';
      glowInput.max = '300';
      glowInput.value = Math.round(getGlowStrength() * 100);
      glowInput.addEventListener('change', () => {
        const val = parseInt(glowInput.value, 10);
        if (!isNaN(val)) setGlowStrength(Math.max(0, val) / 100);
      });
      const glowItem = document.createElement('div');
      glowItem.className = 'dev-control';
      glowItem.appendChild(glowLabel);
      glowItem.appendChild(glowInput);
      developerControls.appendChild(glowItem);

      // Control para el bump
      const bumpLabel = document.createElement('label');
      bumpLabel.textContent = 'Bump (%):';
      const bumpInput = document.createElement('input');
      bumpInput.type = 'number';
      bumpInput.min = '0';
      bumpInput.max = '300';
      bumpInput.value = Math.round(getBumpControl() * 100);
      bumpInput.addEventListener('change', () => {
        const val = parseInt(bumpInput.value, 10);
        if (!isNaN(val)) setBumpControl(Math.max(0, val) / 100);
      });
      const bumpItem = document.createElement('div');
      bumpItem.className = 'dev-control';
      bumpItem.appendChild(bumpLabel);
      bumpItem.appendChild(bumpInput);
      developerControls.appendChild(bumpItem);
    }

    let currentTracks = [];
    let notes = [];
    const NOTE_MIN = 21;
    const NOTE_MAX = 108;
    const BASE_HEIGHT = 720;
    let currentAspect = '16:9';
    let pixelsPerSecond = canvas.width / 6;
    let stopLoop = null;
    let tempoMap = [];
    let timeDivision = 1;
    const audioPlayer = createAudioPlayer();

    function saveAssignments() {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('instrumentFamilies', JSON.stringify(assignedFamilies));
      }
    }

    function updateTrackFamily(trackName, fam) {
      const track = currentTracks.find((t) => t.name === trackName);
      const preset =
        FAMILY_PRESETS[fam] || { shape: 'unknown', color: '#ffffff' };
      if (track) {
        track.family = fam;
        track.shape = preset.shape;
        track.color = getInstrumentColor(preset, track.instrument);
      }
      notes.forEach((n) => {
        if ((n.trackName ?? n.instrument) === trackName) {
          n.family = fam;
          n.shape = preset.shape;
          n.color = getInstrumentColor(preset, n.instrument);
        }
      });
    }

    function applyStoredAssignments() {
      currentTracks.forEach((t) => {
        const fam = assignedFamilies[t.name];
        if (fam) {
          updateTrackFamily(t.name, fam);
        }
      });
    }

    function buildFamilyPanel() {
      const devControls = document.getElementById('developer-controls');
      familyPanel.innerHTML = '';
      if (devControls) familyPanel.appendChild(devControls);

      const colorColumn = document.createElement('div');
      colorColumn.className = 'side-column';
      const shapeColumn = document.createElement('div');
      shapeColumn.className = 'side-column';
      familyPanel.appendChild(colorColumn);
      familyPanel.appendChild(shapeColumn);

      const bgItem = document.createElement('div');
      bgItem.className = 'family-config-item';
      const bgLabel = document.createElement('label');
      bgLabel.textContent = 'Color del canvas';
      const bgInput = document.createElement('input');
      bgInput.type = 'color';
      bgInput.id = 'canvas-color-input';
      const toHex = (val) => {
        if (!val) return '#000000';
        if (val.startsWith('#')) return val;
        const m = val.match(/\d+/g);
        if (!m) return '#000000';
        return `#${m
          .slice(0, 3)
          .map((n) => parseInt(n, 10).toString(16).padStart(2, '0'))
          .join('')}`;
      };
      bgInput.value = toHex(canvas.style.backgroundColor);
      bgInput.addEventListener('change', () => {
        canvas.style.backgroundColor = bgInput.value;
        offscreenCtx.fillStyle = bgInput.value;
        offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        ctx.drawImage(offscreenCanvas, 0, 0);
      });
      bgItem.appendChild(bgLabel);
      bgItem.appendChild(bgInput);
      colorColumn.appendChild(bgItem);

      const instSection = document.createElement('div');
      instSection.className = 'inst-section';
      const instTitle = document.createElement('h4');
      instTitle.textContent = 'Instrumentos activos';
      instSection.appendChild(instTitle);
      const instBtnWrap = document.createElement('div');
      const activateAllBtn = document.createElement('button');
      activateAllBtn.textContent = 'Activar todos';
      activateAllBtn.addEventListener('click', () => {
        instSection
          .querySelectorAll('input[type="checkbox"]')
          .forEach((cb) => {
            cb.checked = true;
            setInstrumentEnabled(cb.dataset.instrument, true);
          });
      });
      const deactivateAllBtn = document.createElement('button');
      deactivateAllBtn.textContent = 'Desactivar todos';
      deactivateAllBtn.addEventListener('click', () => {
        instSection
          .querySelectorAll('input[type="checkbox"]')
          .forEach((cb) => {
            cb.checked = false;
            setInstrumentEnabled(cb.dataset.instrument, false);
          });
      });
      instBtnWrap.appendChild(activateAllBtn);
      instBtnWrap.appendChild(deactivateAllBtn);
      instSection.appendChild(instBtnWrap);
      currentTracks.forEach((t) => {
        const item = document.createElement('div');
        item.className = 'family-config-item';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = enabledInstruments[t.name] !== false;
        checkbox.dataset.instrument = t.name;
        checkbox.addEventListener('change', () =>
          setInstrumentEnabled(t.name, checkbox.checked)
        );
        const label = document.createElement('label');
        label.textContent = t.name;
        item.appendChild(checkbox);
        item.appendChild(label);
        instSection.appendChild(item);
      });
      familyPanel.appendChild(instSection);

      // Selección múltiple de instrumentos con click/drag
      instSection.addEventListener('mousedown', (e) => {
        if (e.target.type === 'checkbox') {
          e.preventDefault();
          checkboxDrag = !e.target.checked;
          e.target.checked = checkboxDrag;
          setInstrumentEnabled(e.target.dataset.instrument, checkboxDrag);
        }
      });
      instSection.addEventListener('mouseover', (e) => {
        if (checkboxDrag !== null && e.target.type === 'checkbox') {
          e.target.checked = checkboxDrag;
          setInstrumentEnabled(e.target.dataset.instrument, checkboxDrag);
        }
      });

      FAMILY_LIST.forEach((family) => {
        const colorItem = document.createElement('div');
        colorItem.className = 'family-config-item';
        colorItem.dataset.family = family;
        const colorLabel = document.createElement('label');
        colorLabel.textContent = family;
        const brightInput = document.createElement('input');
        brightInput.type = 'color';
        brightInput.value =
          FAMILY_PRESETS[family]?.colorBright ||
          FAMILY_PRESETS[family]?.color ||
          '#ffffff';
        const darkInput = document.createElement('input');
        darkInput.type = 'color';
        darkInput.value =
          FAMILY_PRESETS[family]?.colorDark ||
          FAMILY_PRESETS[family]?.color ||
          '#000000';
        brightInput.addEventListener('change', () => {
          setFamilyCustomization(
            family,
            { colorBright: brightInput.value },
            currentTracks,
            notes,
          );
        });
        darkInput.addEventListener('change', () => {
          setFamilyCustomization(
            family,
            { colorDark: darkInput.value },
            currentTracks,
            notes,
          );
        });
        colorItem.appendChild(colorLabel);
        colorItem.appendChild(brightInput);
        colorItem.appendChild(darkInput);
        colorColumn.appendChild(colorItem);

        const shapeItem = document.createElement('div');
        shapeItem.className = 'family-config-item';
        shapeItem.dataset.family = family;
        const shapeLabel = document.createElement('label');
        shapeLabel.textContent = family;
        const shapeSelect = document.createElement('select');
        SHAPE_OPTIONS.forEach((opt) => {
          const o = document.createElement('option');
          o.value = opt.value;
          o.textContent = opt.label;
          if (opt.value === (FAMILY_PRESETS[family]?.shape || '')) o.selected = true;
          shapeSelect.appendChild(o);
        });
        shapeSelect.addEventListener('change', () => {
          setFamilyCustomization(
            family,
            { shape: shapeSelect.value },
            currentTracks,
            notes,
          );
        });
        shapeItem.appendChild(shapeLabel);
        shapeItem.appendChild(shapeSelect);
        shapeColumn.appendChild(shapeItem);
      });

      const resetBtn = document.createElement('button');
      resetBtn.id = 'reset-family-defaults';
      resetBtn.textContent = 'Restablecer predeterminados';
      resetBtn.addEventListener('click', () => {
        resetFamilyCustomizations(currentTracks, notes);
        buildFamilyPanel();
      });
      resetBtn.style.gridColumn = '1 / -1';
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
          importConfiguration(ev.target.result, currentTracks, notes);
          populateInstrumentDropdown(currentTracks);
          buildFamilyPanel();
        };
        reader.readAsText(file);
      });
      importBtn.addEventListener('click', () => importInput.click());

      exportBtn.style.gridColumn = '1 / -1';
      importBtn.style.gridColumn = '1 / -1';
      familyPanel.appendChild(exportBtn);
      familyPanel.appendChild(importBtn);
      familyPanel.appendChild(importInput);
    }

    function populateInstrumentDropdown(tracks) {
      instrumentSelect.innerHTML = '<option>Instrumento</option>';
      tracks.forEach((t) => {
        const opt = document.createElement('option');
        opt.value = t.name;
        opt.textContent = t.name;
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

      const handleDrop = (e, target) => {
        e.preventDefault();
        let data = e.dataTransfer.getData('text/plain');
        let list;
        try {
          list = JSON.parse(data);
        } catch {
          list = [data];
        }
        list.forEach((inst) => {
          const li = assignmentModal.querySelector(
            `li[data-instrument="${CSS.escape(inst)}"]`
          );
          if (li) {
            li.classList.remove('selected');
            target.appendChild(li);
          }
        });
      };

      modalInstrumentList.addEventListener('dragover', (e) => e.preventDefault());
      modalInstrumentList.addEventListener('drop', (e) =>
        handleDrop(e, modalInstrumentList)
      );

      FAMILY_LIST.forEach((family) => {
        const zone = document.createElement('div');
        zone.className = 'family-zone';
        zone.dataset.family = family;
        zone.addEventListener('dragover', (e) => e.preventDefault());
        zone.addEventListener('drop', (e) =>
          handleDrop(e, zone.querySelector('ul'))
        );
        const h4 = document.createElement('h4');
        h4.textContent = family;
        const ul = document.createElement('ul');
        zone.appendChild(h4);
        zone.appendChild(ul);
        modalFamilyZones.appendChild(zone);
      });

      tracks.forEach((t) => {
        const name = t.name;
        const li = document.createElement('li');
        li.textContent = name;
        li.dataset.instrument = name;
        li.className = 'instrument-item';
        li.draggable = true;
          li.addEventListener('dragstart', (e) => {
            modalSelectMode = null; // detener selección al iniciar arrastre
            li.classList.add('selected');
            const selected = Array.from(
              assignmentModal.querySelectorAll('.instrument-item.selected')
            );
            const items = selected.includes(li) ? selected : [li];
            const payload = items.map((el) => el.dataset.instrument);
            e.dataTransfer.setData('text/plain', JSON.stringify(payload));
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

    loadDefaultConfiguration(currentTracks, notes)
      .catch(() => {})
      .then(() => {
        populateInstrumentDropdown(currentTracks);
        buildFamilyPanel();
      });

    // ----- Configuración de Audio -----
    let currentDPR = window.devicePixelRatio || 1;
    let superSampling = 1.25;
    const frameTimes = [];
    function applyCanvasSize(fullscreen = !!document.fullscreenElement) {
      const { width, height, styleWidth, styleHeight } = calculateCanvasSize(
        currentAspect,
        BASE_HEIGHT,
        fullscreen,
        window.innerWidth,
        window.innerHeight,
        currentDPR,
        superSampling
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

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() =>
        applyCanvasSize(!!document.fullscreenElement)
      );
      resizeObserver.observe(document.body);
    }

    function setupDPRListener() {
      if (!window.matchMedia) return;
      let mql = window.matchMedia(`(resolution: ${currentDPR}dppx)`);
      const onChange = () => {
        mql.removeEventListener('change', onChange);
        currentDPR = window.devicePixelRatio || 1;
        applyCanvasSize(!!document.fullscreenElement);
        mql = window.matchMedia(`(resolution: ${currentDPR}dppx)`);
        mql.addEventListener('change', onChange);
      };
      mql.addEventListener('change', onChange);
    }
    setupDPRListener();

    document.addEventListener('fullscreenchange', () => {
      const fs = !!document.fullscreenElement;
      applyCanvasSize(fs);
      canvas.style.cursor = fs ? 'none' : 'default';
    });

    function startPlayback() {
      if (
        !audioPlayer.start(notes, () => {
          stopAnimation();
          renderFrame(0);
        })
      )
        return;
      startAnimation();
    }

    function stopPlayback(preserveOffset = true) {
      audioPlayer.stop(preserveOffset);
      stopAnimation();
      renderFrame(audioPlayer.getStartOffset());
    }

    function seek(delta) {
      if (!audioPlayer.canStart(notes)) return;
      const wasPlaying = audioPlayer.isPlaying();
      audioPlayer.stop(true);
      stopAnimation();
      const duration = audioPlayer.getAudioBuffer()
        ? audioPlayer.getAudioBuffer().duration
        : notes.length > 0
        ? notes[notes.length - 1].end
        : 0;
      const trim = audioPlayer.getTrimOffset();
      audioPlayer.seek(delta, duration, trim);
      renderFrame(audioPlayer.getStartOffset());
      if (wasPlaying) startPlayback();
    }

    loadBtn.addEventListener('click', () => fileInput.click());
    loadWavBtn.addEventListener('click', () => wavInput.click());

    // Carga y parseo de archivos MIDI mediante módulo dedicado
    fileInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const { tracks, tempoMap: tMap, timeDivision: tDiv } = await loadMusicFile(
          file,
          { parseMIDI }
        );
        currentTracks = tracks;
        tempoMap = tMap || [];
        timeDivision = tDiv || 1;
        currentTracks.forEach((t) => {
          if (!(t.name in enabledInstruments)) {
            setInstrumentEnabled(t.name, true);
          }
        });
        applyStoredAssignments();
        populateInstrumentDropdown(currentTracks);
        showAssignmentModal(currentTracks);
        prepareNotesFromTracks(currentTracks, tempoMap, timeDivision);
        buildFamilyPanel();
        audioPlayer.resetStartOffset();
        renderFrame(0);
      } catch (err) {
        alert(err.message);
      }
    });

    // Carga de archivo WAV y eliminación de silencio inicial mediante módulo dedicado
    wavInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
      const result = await loadWavFile(file, audioPlayer.getAudioContext());
        audioPlayer.loadBuffer(result.audioBuffer, result.trimOffset);
        console.log('WAV cargado, trimOffset =', result.trimOffset);
      } catch (err) {
        alert(err.message);
      }
    });

    // Reproducción básica Play/Stop con animación y controles de búsqueda
    const uiControls = initializeUIControls({
      isPlaying: () => audioPlayer.isPlaying(),
      onPlay: async () => {
        const ctx = audioPlayer.getAudioContext();
        await ctx.resume();
        startPlayback();
      },
      onStop: () => stopPlayback(true),
      onForward: () => seek(3),
      onBackward: () => seek(-3),
      onRestart: () => {
        const wasPlaying = audioPlayer.isPlaying();
        audioPlayer.stop(false);
        stopAnimation();
        renderFrame(audioPlayer.getStartOffset());
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
          canvas.style.cursor = 'none';
        } else {
          document.exitFullscreen();
          canvas.style.cursor = 'default';
        }
      },
    });
    document.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        uiControls.playBtn.click();
      }
    });

    function prepareNotesFromTracks(tracks, tempoMapRaw, timeDivision) {
      notes = [];
      tempoMap = preprocessTempoMap(tempoMapRaw, timeDivision);
      tracks.forEach((track) => {
        track.events.forEach((ev) => {
          if (ev.type === 'note') {
            const start = ticksToSeconds(ev.start, tempoMap, timeDivision);
            const end = ticksToSeconds(ev.start + ev.duration, tempoMap, timeDivision);
            notes.push({
              start,
              end,
              noteNumber: ev.noteNumber,
              velocity: ev.velocity,
              color: track.color || '#ffffff',
              shape: track.shape || 'square',
              family: track.family,
              instrument: track.instrument,
              trackName: track.name,
            });
          }
        });
      });
      notes.sort((a, b) => a.start - b.start);
    }

    function renderFrame(currentSec) {
      offscreenCtx.clearRect(0, 0, canvas.width, canvas.height);
      // Usa el color de fondo asignado al canvas para rellenar cada frame
      offscreenCtx.fillStyle = canvas.style.backgroundColor || '#000000';
      offscreenCtx.fillRect(0, 0, canvas.width, canvas.height);
      const noteHeight = canvas.height / 88;
      getVisibleNotes(notes).forEach((n) => {
        const { sizeFactor, bump } = getFamilyModifiers(n.family);
        let baseHeight = noteHeight * sizeFactor;
          baseHeight = computeVelocityHeight(baseHeight, n.velocity || velocityBase);
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

        // Opacidad progresiva con relleno simétrico alrededor de la línea de presente
        const alpha = computeOpacity(xStart, xEnd, canvas.width);

        if (alpha > 0) {
          offscreenCtx.save();
          offscreenCtx.globalAlpha = alpha;
          offscreenCtx.fillStyle = n.color;
          drawNoteShape(offscreenCtx, n.shape, xStart, y, width, height);
          offscreenCtx.restore();

          offscreenCtx.save();
          offscreenCtx.globalAlpha = alpha;
          offscreenCtx.strokeStyle = n.color;
          drawNoteShape(offscreenCtx, n.shape, xStart, y, width, height, true);
          offscreenCtx.restore();
        }

        // Brillo blanco corto en el NOTE ON presente
        const glowAlpha = computeGlowAlpha(currentSec, n.start);
        if (glowAlpha > 0) {
          applyGlowEffect(
            offscreenCtx,
            n.shape,
            xStart,
            y,
            width,
            height,
            glowAlpha
          );
        }
      });
      // Línea de presente omitida para mantenerla invisible

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreenCanvas, 0, 0);
    }

    // Exponer la función para pruebas unitarias
    if (typeof window !== 'undefined') {
      window.__renderFrame = renderFrame;
      window.__setTestNotes = (n) => {
        notes = n;
      };
    }

    function adjustSupersampling(dt) {
      frameTimes.push(dt);
      if (frameTimes.length >= 30) {
        const avg =
          frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
        frameTimes.length = 0;
        if (avg > 18 && superSampling > 1) {
          superSampling = Math.max(1, superSampling - 0.1);
          applyCanvasSize(!!document.fullscreenElement);
        } else if (avg < 12 && superSampling < 2) {
          superSampling = Math.min(2, superSampling + 0.1);
          applyCanvasSize(!!document.fullscreenElement);
        }
      }
    }

    function startAnimation() {
      if (prefersReducedMotion()) {
        renderFrame(audioPlayer.getCurrentTime());
        return;
      }
      stopLoop = startFixedFPSLoop((dt) => {
        adjustSupersampling(dt);
        const currentSec = audioPlayer.getCurrentTime();
        renderFrame(currentSec);
        if (!audioPlayer.isPlaying()) stopAnimation();
      }, 60);
    }

    function stopAnimation() {
      if (stopLoop) stopLoop();
      stopLoop = null;
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
  'Cuerdas frotadas': { shape: 'diamond', color: '#ffa500' },
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

// Normaliza codificación y conserva caracteres con acento
const normalizeAccents = (name) => {
  let decoded = name;
  try {
    decoded = decodeURIComponent(escape(name));
  } catch (e) {
    // Si falla la decodificación, se usa el nombre original
  }
  return decoded.normalize('NFC');
};

// Normaliza el nombre del instrumento eliminando números,
// contenido entre paréntesis y numerales romanos para
// que "Flauta 1" o "Clarinete (Si Bemol) II" se asignen
// correctamente a su familia.
const normalizeInstrumentName = (name) =>
  normalizeAccents(name)
    .toLowerCase()
    .normalize('NFD').replace(/\p{Diacritic}/gu, '') // elimina diacríticos para coincidencias flexibles
    .replace(/\(.*?\)/g, '') // elimina texto entre paréntesis
    .replace(/\b[ivx]+\b/g, '') // elimina numerales romanos
    .replace(/\d+/g, '') // elimina dígitos
    .replace(/[^\p{L}\s]/gu, '') // remueve caracteres no alfabéticos, preservando cualquier letra Unicode
    .replace(/\s+/g, ' ') // colapsa espacios múltiples
    .trim();

const NORMALIZED_INSTRUMENT_MAP = Object.keys(INSTRUMENT_FAMILIES).reduce(
  (acc, inst) => {
    acc[normalizeInstrumentName(inst)] = inst;
    return acc;
  },
  {}
);

// Determina el nombre del instrumento permitiendo coincidencias parciales
const resolveInstrumentName = (name) => {
  const key = normalizeInstrumentName(name);
  if (NORMALIZED_INSTRUMENT_MAP[key]) return NORMALIZED_INSTRUMENT_MAP[key];
  const match = Object.entries(NORMALIZED_INSTRUMENT_MAP).find(
    ([norm]) => key.startsWith(norm) || norm.startsWith(key),
  );
  return match ? match[1] : normalizeAccents(name);
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

function getInstrumentColor(preset, instrument) {
  const shift = INSTRUMENT_COLOR_SHIFT[instrument] || 0;
  if (preset.colorBright && preset.colorDark) {
    const t = (shift + 1) / 2; // normaliza -1..1 a 0..1
    return interpolateColor(preset.colorDark, preset.colorBright, t);
  }
  return adjustColorBrightness(preset.color, shift);
}

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
      if (cfg.colorBright) FAMILY_PRESETS[fam].colorBright = cfg.colorBright;
      if (cfg.colorDark) FAMILY_PRESETS[fam].colorDark = cfg.colorDark;
      if (cfg.colorBright && cfg.colorDark && !cfg.color) {
        FAMILY_PRESETS[fam].color = interpolateColor(
          cfg.colorDark,
          cfg.colorBright,
          0.5,
        );
      }
    }
  });
}

function saveFamilyCustomizations() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('familyCustomizations', JSON.stringify(familyCustomizations));
  }
}

function setFamilyCustomization(
  family,
  { color, shape, colorBright, colorDark },
  tracks = [],
  notes = []
) {
  const preset = FAMILY_PRESETS[family] || { shape: 'square', color: '#ffffff' };
  if (color) {
    preset.color = color;
  }
  if (colorBright) {
    preset.colorBright = colorBright;
  }
  if (colorDark) {
    preset.colorDark = colorDark;
  }
  if (preset.colorBright && preset.colorDark) {
    const { bright, dark } = validateColorRange(
      preset.colorBright,
      preset.colorDark,
    );
    preset.colorBright = bright;
    preset.colorDark = dark;
    preset.color = interpolateColor(dark, bright, 0.5);
  }
  if (shape) preset.shape = shape;
  FAMILY_PRESETS[family] = preset;
  familyCustomizations[family] = { color: preset.color, shape: preset.shape };
  if (preset.colorBright) familyCustomizations[family].colorBright = preset.colorBright;
  if (preset.colorDark) familyCustomizations[family].colorDark = preset.colorDark;
  saveFamilyCustomizations();
  tracks.forEach((t) => {
    if (t.family === family) {
      t.shape = preset.shape;
      t.color = getInstrumentColor(preset, t.instrument);
    }
  });
  notes.forEach((n) => {
    if (n.family === family) {
      n.shape = preset.shape;
      n.color = getInstrumentColor(preset, n.instrument);
    }
  });
}

function resetFamilyCustomizations(tracks = [], notes = []) {
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
    t.color = getInstrumentColor(preset, t.instrument);
  });
  notes.forEach((n) => {
    const preset = FAMILY_PRESETS[n.family] || { shape: 'square', color: '#ffffff' };
    n.shape = preset.shape;
    n.color = getInstrumentColor(preset, n.instrument);
  });
}

function exportConfiguration() {
  return JSON.stringify({
    assignedFamilies,
    familyCustomizations,
    enabledInstruments,
    velocityBase: getVelocityBase(),
    opacityScale: getOpacityScale(),
    glowStrength: getGlowStrength(),
    bumpControl: getBumpControl(),
  });
}

function importConfiguration(json, tracks = [], notes = []) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  assignedFamilies = { ...((data.assignedFamilies || {})) };
  const famCustoms = data.familyCustomizations || {};
  familyCustomizations = famCustoms;
  Object.assign(enabledInstruments, data.enabledInstruments || {});
  if (typeof data.velocityBase === 'number') {
    setVelocityBase(data.velocityBase);
  }
  if (
    data.opacityScale &&
    typeof data.opacityScale.edge === 'number' &&
    typeof data.opacityScale.mid === 'number'
  ) {
    setOpacityScale(data.opacityScale.edge, data.opacityScale.mid);
  }
  if (typeof data.glowStrength === 'number') {
    setGlowStrength(data.glowStrength);
  }
  if (typeof data.bumpControl === 'number') {
    setBumpControl(data.bumpControl);
  }

  Object.keys(FAMILY_DEFAULTS).forEach((fam) => {
    FAMILY_PRESETS[fam] = { ...FAMILY_DEFAULTS[fam] };
  });
  Object.entries(famCustoms).forEach(([fam, cfg]) => {
    if (FAMILY_PRESETS[fam]) {
      FAMILY_PRESETS[fam] = { ...FAMILY_PRESETS[fam], ...cfg };
      if (cfg.colorBright && cfg.colorDark && !cfg.color) {
        FAMILY_PRESETS[fam].color = interpolateColor(
          cfg.colorDark,
          cfg.colorBright,
          0.5,
        );
      }
    }
  });
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('instrumentFamilies', JSON.stringify(assignedFamilies));
    localStorage.setItem('familyCustomizations', JSON.stringify(familyCustomizations));
    localStorage.setItem('enabledInstruments', JSON.stringify(enabledInstruments));
  }
  tracks.forEach((t) => {
    const fam = assignedFamilies[t.name] || t.family;
    t.family = fam;
    const preset =
      FAMILY_PRESETS[fam] || { shape: 'unknown', color: '#ffffff' };
    t.shape = preset.shape;
    t.color = getInstrumentColor(preset, t.instrument);
  });
  notes.forEach((n) => {
    const key = n.trackName ?? n.instrument;
    const fam = assignedFamilies[key] || n.family;
    n.family = fam;
    const preset =
      FAMILY_PRESETS[fam] || { shape: 'unknown', color: '#ffffff' };
    n.shape = preset.shape;
    n.color = getInstrumentColor(preset, n.instrument);
  });
}

async function loadDefaultConfiguration(tracks = [], notes = []) {
  try {
    let data;
    if (typeof window === 'undefined' && typeof require === 'function') {
      const fs = require('fs');
      const path = require('path');
      const filePath = path.join(__dirname || '.', 'configuracion.json');
      data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } else if (typeof window !== 'undefined' && window.DEFAULT_CONFIG) {
      data = window.DEFAULT_CONFIG;
    } else if (
      typeof fetch === 'function' &&
      !(typeof window !== 'undefined' && window.location.protocol === 'file:')
    ) {
      const response = await fetch('configuracion.json');
      if (!response.ok) return;
      data = await response.json();
    } else {
      return;
    }
    importConfiguration(data, tracks, notes);
  } catch (err) {
    /* Silent failure loading default configuration */
  }
}

// Asigna instrumento, familia, forma y color a cada pista
function assignTrackInfo(tracks) {
  return tracks.map((t) => {
    const instrument = resolveInstrumentName(t.name);
    const family = INSTRUMENT_FAMILIES[instrument] || 'Desconocida';
    const preset = FAMILY_PRESETS[family] || { shape: 'unknown', color: '#ffffff' };
    const color = getInstrumentColor(preset, instrument);
    return { ...t, instrument, family, shape: preset.shape, color };
  });
}

function parseMIDI(arrayBuffer) {
  const data = new DataView(arrayBuffer);
  let offset = 0;

  const readString = (len) => {
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = data.getUint8(offset++);
    }
    return new TextDecoder('utf-8').decode(bytes);
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
          trackName = new TextDecoder('utf-8').decode(new Uint8Array(meta));
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

  const tempoEvents = result.tracks
    .flatMap((t) => t.events.filter((e) => e.type === 'tempo'))
    .sort((a, b) => a.time - b.time);
  result.tempoMap =
    tempoEvents.length > 0
      ? tempoEvents
      : [{ time: 0, microsecondsPerBeat: 500000 }];
  result.tracks = assignTrackInfo(result.tracks);
  return result;
}


if (typeof module !== 'undefined') {
  module.exports = {
    parseMIDI,
    assignTrackInfo,
    FAMILY_PRESETS,
    FAMILY_DEFAULTS,
    INSTRUMENT_FAMILIES,
    INSTRUMENT_COLOR_SHIFT,
    adjustColorBrightness,
    computeOpacity,
    computeBumpHeight,
    computeGlowAlpha,
    applyGlowEffect,
    computeSeekOffset,
    resetStartOffset,
    drawNoteShape,
    getFamilyModifiers,
    computeNoteWidth,
    calculateCanvasSize,
    NON_STRETCHED_SHAPES,
      startFixedFPSLoop,
      computeVelocityHeight,
      setVelocityBase,
      getVelocityBase,
      setOpacityScale,
      getOpacityScale,
      setGlowStrength,
      getGlowStrength,
      setBumpControl,
      getBumpControl,
      preprocessTempoMap,
      ticksToSeconds,
      setFamilyCustomization,
    resetFamilyCustomizations,
    exportConfiguration,
    importConfiguration,
    loadDefaultConfiguration,
    setInstrumentEnabled,
    getVisibleNotes,
  };
}
