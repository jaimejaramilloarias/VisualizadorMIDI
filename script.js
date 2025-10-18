// Script inicial para preparar el canvas
// En esta etapa no se implementa funcionalidad adicional

// Importación de utilidades modulares para efectos visuales y cálculos
const {
  computeOpacity,
  computeBumpHeight,
  computeGlowAlpha,
  drawNoteShape,
  interpolateColor,
  NON_STRETCHED_SHAPES,
  SHAPE_OPTIONS,
  getFamilyModifiers,
  computeNoteWidth,
  calculateCanvasSize,
  computeSeekOffset,
  resetStartOffset,
  applyGlowEffect,
  startAutoFPSLoop,
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
  setHeightScale,
  getHeightScale,
  getHeightScaleConfig,
  computeDynamicBounds,
  computeDiamondBounds,
  setShapeExtension,
  getShapeExtension,
  getShapeExtensions,
  getFamilyLineSettings,
  updateFamilyLineSettings,
  getAllFamilyLineSettings,
  setAllFamilyLineSettings,
  resetFamilyLineSettings,
  isTravelEffectEnabled,
  setTravelEffectEnabled,
  getTravelEffectSettings,
  setTravelEffectSettings,
  resetTravelEffectSettings,
} = typeof require !== 'undefined' ? require('./utils.js') : window.utils;

// "setupHelpMessages" se declara globalmente en help.js. Para evitar conflictos
// de redeclaración en entornos donde los scripts comparten el ámbito global,
// renombramos la referencia local.
const { setupHelpMessages: initHelpMessages } =
  typeof require !== 'undefined' ? require('./help.js') : window.help;

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

// Parámetros de fluidez de animación
const FRAME_DT_MIN = 8;
const FRAME_DT_MAX = 32;
let superSampling = 1.25;

function setSuperSampling(val) {
  if (typeof val === 'number' && val >= 1 && val <= 2) {
    superSampling = val;
  }
}

function getSuperSampling() {
  return superSampling;
}

function setInstrumentEnabled(inst, enabled) {
  enabledInstruments[inst] = enabled;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('enabledInstruments', JSON.stringify(enabledInstruments));
  }
}

let visibleSeconds = 6;
let canvas = null;
let pixelsPerSecond = 0;
let audioOffsetMs = 0;

function setVisibleSeconds(sec) {
  if (typeof sec !== 'number' || sec <= 0) return;
  visibleSeconds = sec;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('visibleSeconds', String(visibleSeconds));
  }
  if (canvas) {
    pixelsPerSecond = canvas.width / visibleSeconds;
  }
}

function getVisibleSeconds() {
  if (typeof localStorage !== 'undefined') {
    const stored = parseFloat(localStorage.getItem('visibleSeconds'));
    if (!isNaN(stored) && stored > 0) {
      visibleSeconds = stored;
    }
  }
  return visibleSeconds;
}

getVisibleSeconds();

function setAudioOffset(ms) {
  if (typeof ms !== 'number') return;
  audioOffsetMs = ms;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('audioOffsetMs', String(audioOffsetMs));
  }
}

function getAudioOffset() {
  if (typeof localStorage !== 'undefined') {
    const stored = parseFloat(localStorage.getItem('audioOffsetMs'));
    if (!isNaN(stored)) {
      audioOffsetMs = stored;
    }
  }
  return audioOffsetMs;
}

getAudioOffset();

function getVisibleNotes(allNotes) {
  return allNotes.filter(
    (n) => enabledInstruments[n.trackName ?? n.instrument] !== false,
  );
}

async function restartPlayback(audioPlayer, stopAnimation, renderFrame, startPlayback) {
  audioPlayer.stop(false);
  audioPlayer.resetStartOffset();
  stopAnimation();
  renderFrame(audioOffsetMs / 1000);
  const ctx = audioPlayer.getAudioContext();
  await ctx.resume();
  startPlayback();
}

async function refreshPlaybackAnimation(
  audioPlayer,
  stopAnimation,
  renderFrameFn,
  startPlayback,
  { canStart = true, shouldRestart } = {}
) {
  if (!audioPlayer || typeof audioPlayer.isPlaying !== 'function') {
    throw new Error('audioPlayer con método isPlaying es requerido');
  }
  if (typeof stopAnimation !== 'function') {
    throw new Error('stopAnimation debe ser una función');
  }
  if (typeof renderFrameFn !== 'function') {
    throw new Error('renderFrameFn debe ser una función');
  }
  if (typeof startPlayback !== 'function') {
    throw new Error('startPlayback debe ser una función');
  }

  const wasPlaying = audioPlayer.isPlaying();
  const restart =
    typeof shouldRestart === 'boolean' ? shouldRestart : wasPlaying;

  if (wasPlaying && typeof audioPlayer.stop === 'function') {
    audioPlayer.stop(true);
  }

  stopAnimation();
  renderFrameFn();

  if (restart && canStart) {
    const ctx =
      typeof audioPlayer.getAudioContext === 'function'
        ? audioPlayer.getAudioContext()
        : null;
    if (ctx && typeof ctx.resume === 'function') {
      await ctx.resume();
    }
    await Promise.resolve(startPlayback());
  }
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

    canvas = document.getElementById('visualizer');
    if (!canvas) {
      console.warn('Canvas element with id "visualizer" not found.');
      return;
    }

    let ctx;
    // Verificamos WebGL2 en un canvas temporal para no bloquear el principal
    if (typeof WebGL2RenderingContext !== 'undefined') {
      const testCanvas = document.createElement('canvas');
      const gl = testCanvas.getContext('webgl2', { antialias: true });
      // La ruta WebGL aún no está implementada; liberamos cualquier contexto
      gl?.getExtension?.('WEBGL_lose_context')?.loseContext?.();
    }
    ctx = canvas.getContext('2d');

    if (!ctx) {
      console.warn('2D context not available.');
      return;
    }

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
    if (offscreenCtx) {
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
    }

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
    const tapTempoBtn = document.getElementById('tap-tempo-mode');
    const tapTempoPanel = document.getElementById('tap-tempo-panel');
    const startTapTempoBtn = document.getElementById('start-tap-tempo');
    const stopTapTempoBtn = document.getElementById('stop-tap-tempo');
    const tapTempoStatus = document.getElementById('tap-tempo-status');
    const tapTempoEditor = document.getElementById('tap-tempo-editor');
    const waveformCanvas = document.getElementById('tap-waveform');
    const zoomControl = document.getElementById('tap-zoom');
    const positionControl = document.getElementById('tap-position');
    const addMarkerBtn = document.getElementById('tap-marker-add');
    const deleteMarkerBtn = document.getElementById('tap-marker-delete');
    const tapTooltip = document.getElementById('tap-tooltip');

    let velocityBase = getVelocityBase();
    let tapTempoActive = false;
    let tapTempoHits = [];
    let tapTempoMarkers = [];
    let tapTempoModeActive = false;
    let selectedMarkerId = null;
    let markerIdCounter = 0;
    let waveformData = null;
    let waveformDuration = 0;
    let waveformCtx = waveformCanvas ? waveformCanvas.getContext('2d') : null;
    let waveformPixelRatio =
      typeof window !== 'undefined' && window.devicePixelRatio
        ? window.devicePixelRatio
        : 1;
    let waveformView = { start: 0, duration: 0 };
    let tapTempoStartReference = 0;
    let tapTempoMap = null;
    let originalTempoMap = [];
    let devMode = null;
    let draggingMarkerId = null;
    let markerHandles = [];
    let hoveredHandleKey = null;
    let altKeyActive = false;
    const audioPlayer = createAudioPlayer();
    syncWaveformCanvasSize();

    function getWaveformBaseWidth() {
      if (!waveformCanvas) return 0;
      const rect = waveformCanvas.getBoundingClientRect();
      if (rect.width > 0) return rect.width;
      if (waveformCanvas.offsetWidth > 0) return waveformCanvas.offsetWidth;
      const fromAttr = parseInt(waveformCanvas.getAttribute('width') || '0', 10);
      return fromAttr > 0 ? fromAttr : 1200;
    }

    function computeWaveformHeight(width) {
      const minHeight = 320;
      const maxHeight = 520;
      const proportional = Math.round(width * 0.3);
      return Math.max(minHeight, Math.min(maxHeight, proportional));
    }

    function syncWaveformCanvasSize() {
      if (!waveformCanvas || !waveformCtx) return;
      waveformPixelRatio =
        typeof window !== 'undefined' && window.devicePixelRatio
          ? window.devicePixelRatio
          : 1;
      const cssWidth = getWaveformBaseWidth();
      const cssHeight = computeWaveformHeight(cssWidth);
      waveformCanvas.style.width = '100%';
      waveformCanvas.style.height = `${cssHeight}px`;
      const pixelWidth = Math.max(1, Math.floor(cssWidth * waveformPixelRatio));
      const pixelHeight = Math.max(1, Math.floor(cssHeight * waveformPixelRatio));
      if (waveformCanvas.width !== pixelWidth || waveformCanvas.height !== pixelHeight) {
        waveformCanvas.width = pixelWidth;
        waveformCanvas.height = pixelHeight;
        waveformCtx = waveformCanvas.getContext('2d');
      }
      waveformCtx.lineCap = 'round';
      waveformCtx.lineJoin = 'round';
      waveformCtx.imageSmoothingEnabled = false;
    }

    function updateTapTempoAvailability() {
      const hasAudio = !!(audioPlayer && audioPlayer.getAudioBuffer());
      const canReset =
        tapTempoMarkers.length > 0 || originalTempoMap.length > 0 || hasAudio;
      if (startTapTempoBtn) {
        startTapTempoBtn.disabled = !hasAudio || tapTempoActive;
        if (!hasAudio && tapTempoStatus) {
          tapTempoStatus.textContent =
            'Carga un archivo WAV para habilitar la captura de tap tempo. Usa Alt+clic sobre la forma de onda para añadir marcadores, arrástralos desde el punto superior y elimínalos desde el punto inferior.';
        }
      }
      if (stopTapTempoBtn) {
        stopTapTempoBtn.disabled = !canReset;
        stopTapTempoBtn.textContent = tapTempoActive
          ? 'Detener tap tempo'
          : 'Reiniciar proceso tap tempo';
      }
    }

    function deactivateTapTempoMode() {
      if (!tapTempoModeActive) return;
      tapTempoModeActive = false;
      if (tapTempoPanel) tapTempoPanel.classList.add('hidden');
      if (tapTempoBtn) tapTempoBtn.classList.remove('active');
      hideTooltip();
      hoveredHandleKey = null;
      updateCursor();
    }

    function activateTapTempoMode() {
      if (tapTempoModeActive) return;
      tapTempoModeActive = true;
      if (tapTempoPanel) tapTempoPanel.classList.remove('hidden');
      if (tapTempoBtn) tapTempoBtn.classList.add('active');
      if (familyPanel) familyPanel.classList.remove('active');
      syncWaveformCanvasSize();
      renderWaveform();
      updateCursor();
    }

    function clampMarkerTime(time) {
      if (!waveformDuration || waveformDuration <= 0) {
        return Math.max(0, time);
      }
      return Math.min(Math.max(0, time), waveformDuration);
    }

    function sortMarkers() {
      tapTempoMarkers.sort((a, b) => a.time - b.time);
    }

    function setSelectedMarker(markerId) {
      selectedMarkerId = markerId;
      if (deleteMarkerBtn) {
        deleteMarkerBtn.disabled =
          markerId === null || tapTempoMarkers.length === 0;
      }
      renderWaveform();
      updateCursor();
    }

    function markersUpdated({ updateTempo = true } = {}) {
      sortMarkers();
      renderWaveform();
      updateZoomControls();
      if (updateTempo && tapTempoModeActive) {
        updateTempoMapFromMarkers();
      }
      updateCursor();
    }

    function hideTooltip() {
      if (!tapTooltip) return;
      tapTooltip.classList.add('hidden');
    }

    function showTooltip(text, clientX, clientY) {
      if (!tapTooltip || !tapTempoPanel) return;
      tapTooltip.textContent = text;
      tapTooltip.classList.remove('hidden');
      const panelRect = tapTempoPanel.getBoundingClientRect();
      const offsetX = clientX - panelRect.left + 12;
      const offsetY = clientY - panelRect.top + 12;
      tapTooltip.style.left = `${Math.round(offsetX)}px`;
      tapTooltip.style.top = `${Math.round(offsetY)}px`;
    }

    function updateCursor() {
      if (!waveformCanvas) return;
      if (!tapTempoModeActive || !waveformData) {
        waveformCanvas.style.cursor = 'not-allowed';
        return;
      }
      if (draggingMarkerId !== null) {
        waveformCanvas.style.cursor = 'grabbing';
        return;
      }
      if (hoveredHandleKey) {
        const handle = markerHandles.find((h) => h.key === hoveredHandleKey);
        if (handle) {
          waveformCanvas.style.cursor =
            handle.type === 'move' ? 'grab' : 'pointer';
          return;
        }
      }
      waveformCanvas.style.cursor = altKeyActive ? 'copy' : 'crosshair';
    }

    function findHandleAtPosition(x, y) {
      for (let i = 0; i < markerHandles.length; i++) {
        const handle = markerHandles[i];
        const dx = x - handle.x;
        const dy = y - handle.y;
        if (Math.hypot(dx, dy) <= handle.radius) {
          return handle;
        }
      }
      return null;
    }

    function buildWaveformFromBuffer(buffer, samples = 16384) {
      if (!buffer) return null;
      const channelData = buffer.numberOfChannels
        ? buffer.getChannelData(0)
        : null;
      if (!channelData) return null;
      const length = channelData.length;
      if (length === 0) return null;
      const baseWidth = waveformCanvas
        ? Math.max(1, Math.floor(getWaveformBaseWidth() * waveformPixelRatio))
        : 0;
      const targetSamples = Math.max(samples, baseWidth * 6);
      const step = Math.max(1, Math.floor(length / targetSamples));
      const waveform = [];
      for (let i = 0; i < length; i += step) {
        let min = 1;
        let max = -1;
        const end = Math.min(i + step, length);
        for (let j = i; j < end; j++) {
          const value = channelData[j];
          if (value < min) min = value;
          if (value > max) max = value;
        }
        waveform.push({ min, max });
      }
      return waveform;
    }

    function prepareWaveform(buffer) {
      syncWaveformCanvasSize();
      waveformDuration = buffer ? buffer.duration : 0;
      waveformData = buffer ? buildWaveformFromBuffer(buffer) : null;
      waveformView = {
        start: 0,
        duration: waveformDuration || 0,
      };
      renderWaveform();
      updateZoomControls();
      updateTapTempoAvailability();
      if (tapTempoEditor) {
        tapTempoEditor.classList.toggle(
          'hidden',
          !waveformData || waveformData.length === 0
        );
      }
      if (tapTempoStatus && waveformData && waveformData.length > 0) {
        tapTempoStatus.textContent =
          'Tap tempo listo. Usa Alt+clic para añadir marcadores, arrástralos desde el punto superior con las flechas y haz clic en el punto inferior para eliminarlos.';
      }
      updateCursor();
    }

    function getMinWindowSize() {
      if (!waveformDuration) return 0;
      const minByDuration = waveformDuration / 20;
      return Math.min(waveformDuration, Math.max(minByDuration, 0.5));
    }

    function updateZoomControls() {
      if (!zoomControl || !positionControl) return;
      const hasData =
        waveformData && waveformData.length > 0 && waveformDuration > 0;
      zoomControl.disabled = !hasData;
      positionControl.disabled = !hasData;
      if (addMarkerBtn) addMarkerBtn.disabled = !hasData;
      if (deleteMarkerBtn) {
        deleteMarkerBtn.disabled =
          !hasData || selectedMarkerId === null || tapTempoMarkers.length === 0;
      }
      if (!hasData) {
        zoomControl.value = '0';
        positionControl.value = '0';
        return;
      }
      if (!waveformView.duration || waveformView.duration > waveformDuration) {
        waveformView.duration = waveformDuration;
      }
      const minWindow = getMinWindowSize();
      const range = Math.max(waveformDuration - minWindow, 0);
      const fraction =
        range === 0
          ? 0
          : (waveformDuration - waveformView.duration) / range;
      zoomControl.value = String(Math.round(fraction * 100));
      const maxStart = Math.max(0, waveformDuration - waveformView.duration);
      const posFraction =
        maxStart === 0 ? 0 : waveformView.start / maxStart;
      positionControl.value = String(Math.round(posFraction * 100));
    }

    function renderWaveform() {
      if (!waveformCtx || !waveformCanvas) return;
      syncWaveformCanvasSize();
      const pixelRatio = waveformPixelRatio || 1;
      const width = waveformCanvas.width / pixelRatio;
      const height = waveformCanvas.height / pixelRatio;

      waveformCtx.save();
      waveformCtx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
      waveformCtx.clearRect(0, 0, width, height);
      waveformCtx.fillStyle = '#111';
      waveformCtx.fillRect(0, 0, width, height);
      waveformCtx.strokeStyle = '#333';
      waveformCtx.lineWidth = 1;
      waveformCtx.beginPath();
      waveformCtx.moveTo(0, height / 2);
      waveformCtx.lineTo(width, height / 2);
      waveformCtx.stroke();
      markerHandles = [];

      if (!waveformData || waveformData.length === 0 || !waveformDuration) {
        waveformCtx.restore();
        return;
      }

      const start = Math.max(0, Math.min(waveformView.start, waveformDuration));
      const duration = Math.max(
        0.001,
        Math.min(waveformView.duration || waveformDuration, waveformDuration)
      );
      const end = Math.min(start + duration, waveformDuration);
      const totalSamples = waveformData.length;
      const startIndex = Math.max(
        0,
        Math.floor((start / waveformDuration) * totalSamples)
      );
      const endIndex = Math.min(
        totalSamples - 1,
        Math.ceil((end / waveformDuration) * totalSamples)
      );
      const span = Math.max(1, endIndex - startIndex);

      waveformCtx.strokeStyle = '#4caf50';
      waveformCtx.lineWidth = Math.max(1, pixelRatio * 0.75);
      for (let i = startIndex; i <= endIndex; i++) {
        const sample = waveformData[i];
        const fraction = span === 0 ? 0 : (i - startIndex) / span;
        const x = fraction * width;
        const yMin = ((1 - sample.max) * 0.5) * height;
        const yMax = ((1 - sample.min) * 0.5) * height;
        waveformCtx.beginPath();
        waveformCtx.moveTo(x, yMin);
        waveformCtx.lineTo(x, yMax);
        waveformCtx.stroke();
      }

      const handleRadius = Math.max(8, Math.min(18, height * 0.07));
      const handleOffset = handleRadius + Math.max(12, height * 0.05);

      tapTempoMarkers.forEach((marker) => {
        if (marker.time < start || marker.time > end) return;
        const x = ((marker.time - start) / duration) * width;
        const selected = marker.id === selectedMarkerId;
        waveformCtx.beginPath();
        waveformCtx.moveTo(x, 0);
        waveformCtx.lineTo(x, height);
        waveformCtx.strokeStyle = selected ? '#ff5722' : '#ffeb3b';
        waveformCtx.lineWidth = selected ? 3 : 1.5;
        waveformCtx.stroke();

        const moveKey = `${marker.id}:move`;
        const deleteKey = `${marker.id}:delete`;
        markerHandles.push({
          key: moveKey,
          markerId: marker.id,
          type: 'move',
          x,
          y: handleOffset,
          radius: handleRadius,
        });
        markerHandles.push({
          key: deleteKey,
          markerId: marker.id,
          type: 'delete',
          x,
          y: height - handleOffset,
          radius: handleRadius,
        });

        const moveHovered = hoveredHandleKey === moveKey;
        const deleteHovered = hoveredHandleKey === deleteKey;
        const moveColor = moveHovered ? '#ffe082' : 'rgba(255, 235, 59, 0.9)';
        const deleteColor = deleteHovered ? '#ff8a65' : 'rgba(255, 112, 67, 0.9)';

        waveformCtx.save();
        waveformCtx.fillStyle = moveColor;
        waveformCtx.beginPath();
        waveformCtx.arc(x, handleOffset, handleRadius, 0, Math.PI * 2);
        waveformCtx.fill();
        waveformCtx.strokeStyle = '#0c0c0c';
        waveformCtx.lineWidth = moveHovered ? 2 : 1;
        waveformCtx.stroke();
        waveformCtx.beginPath();
        if (moveHovered) {
          waveformCtx.moveTo(x - handleRadius * 0.6, handleOffset);
          waveformCtx.lineTo(x + handleRadius * 0.6, handleOffset);
          waveformCtx.moveTo(x - handleRadius * 0.2, handleOffset - handleRadius * 0.4);
          waveformCtx.lineTo(x - handleRadius * 0.6, handleOffset);
          waveformCtx.moveTo(x - handleRadius * 0.2, handleOffset + handleRadius * 0.4);
          waveformCtx.lineTo(x - handleRadius * 0.6, handleOffset);
          waveformCtx.moveTo(x + handleRadius * 0.2, handleOffset - handleRadius * 0.4);
          waveformCtx.lineTo(x + handleRadius * 0.6, handleOffset);
          waveformCtx.moveTo(x + handleRadius * 0.2, handleOffset + handleRadius * 0.4);
          waveformCtx.lineTo(x + handleRadius * 0.6, handleOffset);
        } else {
          waveformCtx.moveTo(x, handleOffset - handleRadius * 0.45);
          waveformCtx.lineTo(x, handleOffset + handleRadius * 0.45);
        }
        waveformCtx.stroke();
        waveformCtx.restore();

        waveformCtx.save();
        waveformCtx.fillStyle = deleteColor;
        waveformCtx.beginPath();
        waveformCtx.arc(x, height - handleOffset, handleRadius, 0, Math.PI * 2);
        waveformCtx.fill();
        waveformCtx.strokeStyle = '#0c0c0c';
        waveformCtx.lineWidth = deleteHovered ? 2 : 1;
        waveformCtx.stroke();
        if (deleteHovered) {
          waveformCtx.beginPath();
          waveformCtx.moveTo(
            x - handleRadius * 0.6,
            height - handleOffset,
          );
          waveformCtx.lineTo(
            x + handleRadius * 0.6,
            height - handleOffset,
          );
          waveformCtx.stroke();
        }
        waveformCtx.restore();
      });
      waveformCtx.restore();
    }

    function addMarkerAt(time, { select = true, updateTempo = true } = {}) {
      const marker = { id: markerIdCounter++, time: clampMarkerTime(time) };
      tapTempoMarkers.push(marker);
      if (select) {
        setSelectedMarker(marker.id);
      }
      markersUpdated({ updateTempo });
      return marker;
    }

    function removeMarker(markerId, { updateTempo = true } = {}) {
      if (markerId === null || markerId === undefined) return;
      hoveredHandleKey = null;
      hideTooltip();
      const idx = tapTempoMarkers.findIndex((marker) => marker.id === markerId);
      if (idx === -1) return;
      tapTempoMarkers.splice(idx, 1);
      if (tapTempoMarkers.length === 0) {
        setSelectedMarker(null);
      } else if (selectedMarkerId === markerId) {
        const newIndex = Math.min(idx, tapTempoMarkers.length - 1);
        setSelectedMarker(tapTempoMarkers[newIndex].id);
      }
      markersUpdated({ updateTempo });
    }

    function removeSelectedMarker() {
      removeMarker(selectedMarkerId);
    }

    function updateMarkerTime(markerId, time, { updateTempo = false } = {}) {
      const marker = tapTempoMarkers.find((m) => m.id === markerId);
      if (!marker) return;
      marker.time = clampMarkerTime(time);
      markersUpdated({ updateTempo });
    }

    function loadTempoMarkersFromTempoMap(map, division) {
      hoveredHandleKey = null;
      hideTooltip();
      if (!Array.isArray(map) || map.length === 0) {
        tapTempoMarkers = [];
        markerIdCounter = 0;
        setSelectedMarker(null);
        markersUpdated({ updateTempo: false });
        return;
      }
      const processed = preprocessTempoMap(map, division);
      tapTempoMarkers = processed.map((event, index) => ({
        id: index,
        time: clampMarkerTime(event.seconds ?? 0),
      }));
      markerIdCounter = tapTempoMarkers.length;
      setSelectedMarker(tapTempoMarkers.length ? tapTempoMarkers[0].id : null);
      markersUpdated({ updateTempo: false });
    }

    function restoreOriginalTempoMap({ preserveStatus = false } = {}) {
      tapTempoMap = null;
      if (originalTempoMap.length > 0) {
        loadTempoMarkersFromTempoMap(originalTempoMap, timeDivision);
        prepareNotesFromTracks(currentTracks, originalTempoMap, timeDivision);
        renderFrame(audioPlayer.getStartOffset() + audioOffsetMs / 1000);
      } else {
        tapTempoMarkers = [];
        markerIdCounter = 0;
        setSelectedMarker(null);
        markersUpdated({ updateTempo: false });
      }
      if (!preserveStatus && tapTempoStatus) {
        tapTempoStatus.textContent =
          'Mapa de tempo del MIDI activo. Usa Alt+clic para añadir nuevos marcadores y ajústalos con los puntos superior e inferior de cada marcador.';
      }
    }

    function updateTempoMapFromMarkers() {
      if (!currentTracks || currentTracks.length === 0) return;
      if (tapTempoMarkers.length < 2) {
        if (originalTempoMap.length > 0) {
          prepareNotesFromTracks(currentTracks, originalTempoMap, timeDivision);
          renderFrame(audioPlayer.getStartOffset() + audioOffsetMs / 1000);
        }
        return;
      }

      const ordered = [...tapTempoMarkers].sort((a, b) => a.time - b.time);
      const events = [];
      for (let i = 1; i < ordered.length; i++) {
        const prev = ordered[i - 1];
        const curr = ordered[i];
        const interval = Math.max(curr.time - prev.time, 1 / 960);
        events.push({
          time: (i - 1) * timeDivision,
          microsecondsPerBeat: Math.round(interval * 1e6),
        });
      }

      tapTempoMap = events;
      prepareNotesFromTracks(currentTracks, tapTempoMap, timeDivision);
      renderFrame(audioPlayer.getStartOffset() + audioOffsetMs / 1000);
    }

    function resetTapTempoEditor({
      preserveStatus = false,
      preserveMarkers = false,
      restoreOriginalMap = false,
    } = {}) {
      tapTempoHits = [];
      draggingMarkerId = null;
      hoveredHandleKey = null;
      hideTooltip();
      if (restoreOriginalMap) {
        restoreOriginalTempoMap({ preserveStatus });
      } else if (!preserveMarkers) {
        tapTempoMarkers = [];
        tapTempoMap = null;
        markerIdCounter = 0;
        setSelectedMarker(null);
        renderWaveform();
        updateZoomControls();
        if (currentTracks.length && originalTempoMap.length > 0) {
          prepareNotesFromTracks(currentTracks, originalTempoMap, timeDivision);
          renderFrame(audioPlayer.getStartOffset() + audioOffsetMs / 1000);
        }
      } else {
        markersUpdated({ updateTempo: false });
      }
      if (!restoreOriginalMap) {
        if (!preserveStatus && tapTempoStatus) {
          tapTempoStatus.textContent =
            'Carga un archivo WAV y utiliza el tap tempo para crear un mapa de tempo personalizado. Usa Alt+clic para añadir marcadores, desplázalos desde el punto superior y elimínalos desde el inferior.';
        }
      }
      if (tapTempoEditor && waveformData && waveformData.length > 0) {
        tapTempoEditor.classList.remove('hidden');
      }
      updateTapTempoAvailability();
      updateCursor();
    }

    function handleTapTempoKey(event) {
      if (!tapTempoActive) return;
      if (event.repeat) return;
      const tag = event.target && event.target.tagName;
      if (tag && ['INPUT', 'TEXTAREA', 'SELECT'].includes(tag.toUpperCase())) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const current = audioPlayer.getCurrentTime();
      const relative = Math.max(0, current - tapTempoStartReference);
      tapTempoHits.push(relative);
      if (tapTempoStatus) {
        tapTempoStatus.textContent = `Pulsos registrados: ${tapTempoHits.length}`;
      }
    }

    async function startTapTempoRecording() {
      if (tapTempoActive) return;
      if (!audioPlayer.getAudioBuffer()) {
        if (tapTempoStatus) {
          tapTempoStatus.textContent =
            'Se necesita un archivo WAV cargado para iniciar el tap tempo.';
        }
        return;
      }
      tapTempoActive = true;
      updateTapTempoAvailability();
      tapTempoHits = [];
      draggingMarkerId = null;
      tapTempoStartReference = 0;
      if (tapTempoStatus) {
        tapTempoStatus.textContent =
          'Tap tempo activo. Marca el pulso presionando cualquier tecla.';
      }
      if (startTapTempoBtn) startTapTempoBtn.disabled = true;
      audioPlayer.stop(false);
      stopAnimation();
      audioPlayer.resetStartOffset();
      renderFrame(audioOffsetMs / 1000);
      const ctx = audioPlayer.getAudioContext();
      if (ctx && ctx.state === 'suspended' && ctx.resume) {
        await ctx.resume();
      }
      tapTempoStartReference = audioPlayer.getCurrentTime();
      const started = startPlayback({
        onEnded: () => finalizeTapTempoRecording(),
      });
      if (!started) {
        tapTempoActive = false;
        if (startTapTempoBtn) startTapTempoBtn.disabled = false;
        if (tapTempoStatus) {
          tapTempoStatus.textContent =
            'No fue posible iniciar la reproducción para el tap tempo.';
        }
        updateTapTempoAvailability();
        return;
      }
      document.addEventListener('keydown', handleTapTempoKey, true);
    }

    function finalizeTapTempoRecording({ canceled = false } = {}) {
      if (!tapTempoActive) return;
      tapTempoActive = false;
      document.removeEventListener('keydown', handleTapTempoKey, true);
      if (startTapTempoBtn) startTapTempoBtn.disabled = false;
      if (tapTempoHits.length === 0) {
        if (tapTempoStatus) {
          tapTempoStatus.textContent = canceled
            ? 'Tap tempo cancelado.'
            : 'No se registraron pulsos durante el tap tempo.';
        }
        updateTapTempoAvailability();
        return;
      }

      hoveredHandleKey = null;
      hideTooltip();
      markerIdCounter = 0;
      tapTempoMarkers = tapTempoHits.map((time) => ({
        id: markerIdCounter++,
        time: clampMarkerTime(time),
      }));
      sortMarkers();
      markerIdCounter = tapTempoMarkers.length;
      setSelectedMarker(
        tapTempoMarkers.length ? tapTempoMarkers[0].id : null
      );
      if (tapTempoEditor && waveformData) {
        tapTempoEditor.classList.remove('hidden');
      }

      if (tapTempoMarkers.length >= 2) {
        if (tapTempoStatus) {
          tapTempoStatus.textContent = `Tap tempo finalizado. Marcadores capturados: ${tapTempoMarkers.length}. Ajusta su posición desde el punto superior con las flechas o elimínalos desde el inferior.`;
        }
        markersUpdated();
      } else {
        if (tapTempoStatus) {
          tapTempoStatus.textContent =
            'Se necesitan al menos dos pulsos para generar un mapa de tempo.';
        }
        markersUpdated({ updateTempo: false });
      }
      tapTempoHits = [];
      updateTapTempoAvailability();
    }

    function positionToTime(clientX) {
      if (!waveformCanvas) return 0;
      const rect = waveformCanvas.getBoundingClientRect();
      const x = Math.min(Math.max(clientX - rect.left, 0), rect.width);
      const viewDuration = Math.max(
        0.001,
        Math.min(
          waveformView.duration || waveformDuration || 0,
          waveformDuration || 0.001
        )
      );
      const time = waveformView.start + (x / rect.width) * viewDuration;
      return clampMarkerTime(time);
    }

    function findMarkerNear(time, toleranceSeconds) {
      let closest = null;
      let minDelta = toleranceSeconds;
      tapTempoMarkers.forEach((marker) => {
        const delta = Math.abs(marker.time - time);
        if (delta <= minDelta) {
          closest = marker;
          minDelta = delta;
        }
      });
      return closest;
    }

    if (tapTempoBtn) {
      tapTempoBtn.addEventListener('click', () => {
        if (tapTempoModeActive) {
          deactivateTapTempoMode();
        } else {
          if (devMode && devMode.isActive()) {
            devMode.setActive(false);
          }
          activateTapTempoMode();
        }
      });
    }

    if (startTapTempoBtn) {
      startTapTempoBtn.addEventListener('click', () => {
        startTapTempoRecording().catch((err) => console.error(err));
      });
    }

    if (stopTapTempoBtn) {
      stopTapTempoBtn.addEventListener('click', () => {
        const hasAudioBuffer = !!audioPlayer.getAudioBuffer();
        if (tapTempoActive && hasAudioBuffer) {
          audioPlayer.stop(true);
          stopAnimation();
          renderFrame(audioOffsetMs / 1000);
          finalizeTapTempoRecording({ canceled: true });
          if (tapTempoStatus) {
            tapTempoStatus.textContent =
              'Tap tempo detenido. Puedes reiniciarlo cuando lo necesites.';
          }
        } else {
          resetTapTempoEditor({ restoreOriginalMap: true });
          if (tapTempoStatus && !tapTempoActive) {
            tapTempoStatus.textContent =
              'Se restauró el mapa de tempo original. Inicia una nueva captura cuando estés listo.';
          }
        }
        updateTapTempoAvailability();
      });
    }

    if (addMarkerBtn) {
      addMarkerBtn.addEventListener('click', () => {
        const viewDuration =
          waveformView.duration || waveformDuration || getMinWindowSize();
        if (!viewDuration) return;
        const center = waveformView.start + viewDuration / 2;
        addMarkerAt(center, { updateTempo: tapTempoModeActive });
      });
    }

    if (deleteMarkerBtn) {
      deleteMarkerBtn.addEventListener('click', () => {
        removeSelectedMarker();
      });
    }

    if (zoomControl) {
      zoomControl.addEventListener('input', () => {
        if (!waveformDuration) return;
        const fraction = parseInt(zoomControl.value || '0', 10) / 100;
        const minWindow = getMinWindowSize();
        const range = Math.max(waveformDuration - minWindow, 0);
        const newDuration = waveformDuration - fraction * range;
        waveformView.duration = Math.max(
          minWindow,
          Math.min(newDuration, waveformDuration)
        );
        if (waveformView.start + waveformView.duration > waveformDuration) {
          waveformView.start = Math.max(
            0,
            waveformDuration - waveformView.duration
          );
        }
        renderWaveform();
        updateZoomControls();
      });
    }

    if (positionControl) {
      positionControl.addEventListener('input', () => {
        if (!waveformDuration) return;
        const fraction = parseInt(positionControl.value || '0', 10) / 100;
        const maxStart = Math.max(0, waveformDuration - waveformView.duration);
        waveformView.start = fraction * maxStart;
        renderWaveform();
        updateZoomControls();
      });
    }

    if (waveformCanvas) {
      waveformCanvas.addEventListener('pointerdown', (event) => {
        if (
          !tapTempoModeActive ||
          !waveformData ||
          waveformData.length === 0 ||
          !waveformDuration
        ) {
          return;
        }
        const rect = waveformCanvas.getBoundingClientRect();
        const x = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
        const y = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
        altKeyActive = event.altKey;
        const handle = findHandleAtPosition(x, y);
        if (handle) {
          if (handle.type === 'move') {
            setSelectedMarker(handle.markerId);
            draggingMarkerId = handle.markerId;
            waveformCanvas.setPointerCapture(event.pointerId);
          } else if (handle.type === 'delete') {
            removeMarker(handle.markerId);
            hoveredHandleKey = null;
            hideTooltip();
          }
          updateCursor();
          return;
        }
        const time = positionToTime(event.clientX);
        if (event.altKey) {
          const created = addMarkerAt(time, { select: true, updateTempo: false });
          draggingMarkerId = created.id;
          waveformCanvas.setPointerCapture(event.pointerId);
        } else {
          const pixelTolerance = 8;
          const toleranceSeconds =
            (pixelTolerance / rect.width) *
            Math.max(waveformView.duration || waveformDuration || 0.001, 0.001);
          const marker = findMarkerNear(time, toleranceSeconds);
          if (marker) {
            setSelectedMarker(marker.id);
          } else {
            setSelectedMarker(null);
          }
        }
        updateCursor();
      });

      waveformCanvas.addEventListener('pointermove', (event) => {
        if (!waveformData || waveformData.length === 0) return;
        altKeyActive = event.altKey;
        if (!tapTempoModeActive) {
          hideTooltip();
          hoveredHandleKey = null;
          updateCursor();
          return;
        }
        const rect = waveformCanvas.getBoundingClientRect();
        const localX = Math.min(Math.max(event.clientX - rect.left, 0), rect.width);
        const localY = Math.min(Math.max(event.clientY - rect.top, 0), rect.height);
        if (draggingMarkerId !== null) {
          const time = positionToTime(event.clientX);
          updateMarkerTime(draggingMarkerId, time, { updateTempo: false });
        }
        const handle = findHandleAtPosition(localX, localY);
        const nextKey = handle ? handle.key : null;
        if (nextKey !== hoveredHandleKey) {
          hoveredHandleKey = nextKey;
          renderWaveform();
        }
        if (handle) {
          const tooltipText =
            handle.type === 'move'
              ? 'Haz clic y arrastra este punto superior para reubicar el marcador.'
              : 'Haz clic en el punto inferior para eliminar el marcador.';
          showTooltip(tooltipText, event.clientX, event.clientY);
        } else if (altKeyActive) {
          showTooltip(
            'Alt+clic para crear un nuevo marcador en esta posición.',
            event.clientX,
            event.clientY,
          );
        } else {
          hideTooltip();
        }
        updateCursor();
      });

      const endDrag = (event) => {
        if (draggingMarkerId === null) return;
        if (event && event.pointerId !== undefined) {
          waveformCanvas.releasePointerCapture(event.pointerId);
        }
        draggingMarkerId = null;
        markersUpdated();
        updateCursor();
      };

      waveformCanvas.addEventListener('pointerup', endDrag);
      waveformCanvas.addEventListener('pointercancel', endDrag);
      waveformCanvas.addEventListener('pointerleave', () => {
        if (draggingMarkerId === null) {
          hoveredHandleKey = null;
          hideTooltip();
          renderWaveform();
        }
        updateCursor();
      });
    }

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Alt') {
        altKeyActive = true;
        updateCursor();
      }
    });

    document.addEventListener('keyup', (event) => {
      if (event.key === 'Alt') {
        altKeyActive = false;
        updateCursor();
      }
    });

    updateTapTempoAvailability();


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
      devMode = initDeveloperMode({
        button: developerBtn,
        panel: developerControls,
        onToggle: (active) => {
          if (active) {
            familyPanel.classList.add('active');
            deactivateTapTempoMode();
          }
        },
      });

      // Control para segundos visibles en el canvas
      const secsLabel = document.createElement('label');
      secsLabel.textContent = 'Segundos visibles:';
      const secsInput = document.createElement('input');
      secsInput.type = 'number';
      secsInput.min = '1';
      secsInput.step = '0.1';
      secsInput.value = getVisibleSeconds();
      secsInput.addEventListener('change', () => {
        const val = parseFloat(secsInput.value);
        if (!isNaN(val) && val > 0) {
          setVisibleSeconds(val);
        }
      });
      const secsItem = document.createElement('div');
      secsItem.className = 'dev-control';
      secsItem.appendChild(secsLabel);
      secsItem.appendChild(secsInput);
      secsItem.dataset.help =
        'Ajusta cuántos segundos de animación son visibles en el canvas.';
      developerControls.appendChild(secsItem);

      // Control para audio offset
      const offsetLabel = document.createElement('label');
      offsetLabel.textContent = 'Audio offset (ms):';
      const offsetInput = document.createElement('input');
      offsetInput.type = 'number';
      offsetInput.step = '1';
      offsetInput.value = getAudioOffset();
      offsetInput.addEventListener('change', () => {
        const val = parseFloat(offsetInput.value);
        if (!isNaN(val)) {
          setAudioOffset(val);
        }
      });
      const offsetItem = document.createElement('div');
      offsetItem.className = 'dev-control';
      offsetItem.appendChild(offsetLabel);
      offsetItem.appendChild(offsetInput);
      offsetItem.dataset.help =
        'Retrasa o adelanta el inicio del audio respecto a la animación.';
      developerControls.appendChild(offsetItem);

      // Control para porcentaje de altura (global o por familia)
      const heightFamLabel = document.createElement('label');
      heightFamLabel.textContent = 'Familia altura:';
      const heightFamSelect = document.createElement('select');
      const globalOption = document.createElement('option');
      globalOption.value = '';
      globalOption.textContent = 'Global';
      heightFamSelect.appendChild(globalOption);
      Object.keys(FAMILY_PRESETS).forEach((fam) => {
        const opt = document.createElement('option');
        opt.value = fam;
        opt.textContent = fam;
        heightFamSelect.appendChild(opt);
      });
      const heightFamItem = document.createElement('div');
      heightFamItem.className = 'dev-control';
      heightFamItem.appendChild(heightFamLabel);
      heightFamItem.appendChild(heightFamSelect);
      heightFamItem.dataset.help =
        'Selecciona la familia a modificar o "Global" para todas las notas.';
      developerControls.appendChild(heightFamItem);

      const heightLabel = document.createElement('label');
      heightLabel.textContent = 'Altura (%):';
      const heightInput = document.createElement('input');
      heightInput.type = 'number';
      heightInput.min = '10';
      heightInput.max = '300';
      const updateHeightInput = () => {
        const fam = heightFamSelect.value || null;
        heightInput.value = Math.round(getHeightScale(fam) * 100);
      };
      heightFamSelect.addEventListener('change', updateHeightInput);
      updateHeightInput();
      heightInput.addEventListener('change', () => {
        const val = parseFloat(heightInput.value);
        if (!isNaN(val) && val > 0) {
          setHeightScale(val / 100, heightFamSelect.value || null);
        }
      });
      const heightItem = document.createElement('div');
      heightItem.className = 'dev-control';
      heightItem.appendChild(heightLabel);
      heightItem.appendChild(heightInput);
      heightItem.dataset.help =
        'Escala de altura aplicada a la familia seleccionada.';
      developerControls.appendChild(heightItem);

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
      velItem.dataset.help =
        'Define la velocidad MIDI considerada 100% de altura.';
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
      edgeItem.dataset.help =
        'Opacidad de las notas en los extremos del canvas.';
      developerControls.appendChild(edgeItem);
      const midItem = document.createElement('div');
      midItem.className = 'dev-control';
      midItem.appendChild(midLabel);
      midItem.appendChild(midInput);
      midItem.dataset.help =
        'Opacidad de las notas antes de cruzar la línea de presente.';
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
      glowItem.dataset.help =
        'Intensidad del brillo aplicado al pasar por la línea de presente.';
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
      bumpItem.dataset.help =
        'Cantidad de aumento de altura en el efecto bump.';
      developerControls.appendChild(bumpItem);

      const SHAPE_LABELS = {
        oval: 'Óvalo',
        capsule: 'Cápsula',
        star: 'Estrella',
        diamond: 'Diamante',
      };
      Object.keys(SHAPE_LABELS).forEach((shape) => {
        const label = document.createElement('label');
        label.textContent = `Extensión ${SHAPE_LABELS[shape]}:`;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = getShapeExtension(shape);
        checkbox.addEventListener('change', () =>
          setShapeExtension(shape, checkbox.checked),
        );
        const item = document.createElement('div');
        item.className = 'dev-control';
        item.appendChild(label);
        item.appendChild(checkbox);
        item.dataset.help = `Habilita la extensión progresiva de la figura ${SHAPE_LABELS[shape]}.`;
        developerControls.appendChild(item);
      });

      // Control para supersampling inicial
      const ssLabel = document.createElement('label');
      ssLabel.textContent = 'Supersampling:';
      const ssInput = document.createElement('input');
      ssInput.type = 'number';
      ssInput.step = '0.1';
      ssInput.min = '1';
      ssInput.max = '2';
      ssInput.value = superSampling.toFixed(1);
      ssInput.addEventListener('change', () => {
        const val = parseFloat(ssInput.value);
        if (!isNaN(val) && val >= 1 && val <= 2) {
          setSuperSampling(val);
          applyCanvasSize(!!document.fullscreenElement);
        }
      });
      const ssItem = document.createElement('div');
      ssItem.className = 'dev-control';
      ssItem.appendChild(ssLabel);
      ssItem.appendChild(ssInput);
      ssItem.dataset.help =
        'Factor de supersampling inicial aplicado al canvas.';
      developerControls.appendChild(ssItem);
    }
    // Inicializa los mensajes de ayuda flotantes
    initHelpMessages();

    let currentTracks = [];
    let notes = [];
    let trackNoteSequences = new Map();
    let startIndex = 0;
    let endIndex = 0;
    let lastTime = 0;
    const BACKWARD_TOLERANCE = 1 / 120;
    const NOTE_MIN = 21;
    const NOTE_MAX = 108;
    const BASE_HEIGHT = 720;
    let currentAspect = '16:9';
    pixelsPerSecond = canvas.width / visibleSeconds;
    let stopLoop = null;
    let tempoMap = [];
    let timeDivision = 1;

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
        track.color = getInstrumentColor(preset);
      }
      notes.forEach((n) => {
        if ((n.trackName ?? n.instrument) === trackName) {
          n.family = fam;
          n.shape = preset.shape;
          n.color = getInstrumentColor(preset);
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

      const createFamilySelector = () => {
        const select = document.createElement('select');
        const globalOption = document.createElement('option');
        globalOption.value = '';
        globalOption.textContent = 'Global';
        select.appendChild(globalOption);
        FAMILY_LIST.forEach((family) => {
          if (!FAMILY_PRESETS[family]) return;
          const option = document.createElement('option');
          option.value = family;
          option.textContent = family;
          select.appendChild(option);
        });
        return select;
      };

      const familiesFromSelection = (value) => {
        const list = value ? [value] : FAMILY_LIST;
        return list.filter((family) => !!FAMILY_PRESETS[family]);
      };

      const getColorState = (targetFamily) => {
        const families = familiesFromSelection(targetFamily);
        let baseColor = null;
        let mixed = false;
        families.forEach((family) => {
          const preset = FAMILY_PRESETS[family] || {};
          const color = preset.color || '#ffffff';
          if (baseColor === null) {
            baseColor = color;
          } else if (baseColor.toLowerCase() !== color.toLowerCase()) {
            mixed = true;
          }
        });
        if (baseColor === null) baseColor = '#ffffff';
        return { color: baseColor, mixed };
      };

      const getShapeState = (targetFamily) => {
        const families = familiesFromSelection(targetFamily);
        let baseShape = null;
        let mixed = false;
        families.forEach((family) => {
          const preset = FAMILY_PRESETS[family] || {};
          const shape = preset.shape || (SHAPE_OPTIONS[0] ? SHAPE_OPTIONS[0].value : 'square');
          if (baseShape === null) {
            baseShape = shape;
          } else if (baseShape !== shape) {
            mixed = true;
          }
        });
        if (baseShape === null) {
          baseShape = SHAPE_OPTIONS[0] ? SHAPE_OPTIONS[0].value : 'square';
        }
        return { shape: baseShape, mixed };
      };

      const getLineState = (targetFamily) => {
        const families = familiesFromSelection(targetFamily);
        let enabled = null;
        let opacity = null;
        let width = null;
        let travel = null;
        let mixedEnabled = false;
        let mixedOpacity = false;
        let mixedWidth = false;
        let mixedTravel = false;
        families.forEach((family) => {
          const settings = getFamilyLineSettings(family);
          const travelEnabled = isTravelEffectEnabled(family);
          if (enabled === null) {
            enabled = settings.enabled;
          } else if (enabled !== settings.enabled) {
            mixedEnabled = true;
          }
          if (opacity === null) {
            opacity = settings.opacity;
          } else if (Math.abs(opacity - settings.opacity) > 1e-6) {
            mixedOpacity = true;
          }
          if (width === null) {
            width = settings.width;
          } else if (Math.abs(width - settings.width) > 1e-6) {
            mixedWidth = true;
          }
          if (travel === null) {
            travel = travelEnabled;
          } else if (travel !== travelEnabled) {
            mixedTravel = true;
          }
        });
        if (enabled === null) {
          enabled = true;
          opacity = 0.45;
          width = 1.5;
          travel = false;
        }
        return {
          enabled,
          opacity,
          width,
          travel,
          mixedEnabled,
          mixedOpacity,
          mixedWidth,
          mixedTravel,
        };
      };

      const bgItem = document.createElement('div');
      bgItem.className = 'family-config-item';
      const bgLabel = document.createElement('label');
      bgLabel.textContent = 'Color del canvas';
      const bgInput = document.createElement('input');
      bgInput.type = 'color';
      bgInput.id = 'canvas-color-input';
      bgInput.value = toHex(canvas.style.backgroundColor);
      bgInput.addEventListener('change', () => {
        canvas.style.backgroundColor = bgInput.value;
        offscreenCtx.fillStyle = bgInput.value;
        offscreenCtx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        ctx.drawImage(offscreenCanvas, 0, 0);
      });
      bgItem.appendChild(bgLabel);
      bgItem.appendChild(bgInput);
      familyPanel.appendChild(bgItem);

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

      instSection.addEventListener('click', (e) => {
        if (e.target.type === 'checkbox') {
          e.preventDefault();
        }
      });

      const colorControl = document.createElement('div');
      colorControl.className = 'family-config-item family-config-group';
      const colorLabel = document.createElement('label');
      colorLabel.textContent = 'Color de familia:';
      const colorFamilySelect = createFamilySelector();
      const colorInput = document.createElement('input');
      colorInput.type = 'color';
      const colorHint = document.createElement('span');
      colorHint.className = 'control-hint';

      const updateColorControl = () => {
        const { color, mixed } = getColorState(colorFamilySelect.value);
        colorInput.value = color;
        colorHint.textContent = mixed ? 'Valores variados' : color.toUpperCase();
        colorHint.classList.toggle('hint-active', mixed);
      };

      colorFamilySelect.addEventListener('change', updateColorControl);
      colorInput.addEventListener('change', () => {
        const color = colorInput.value;
        familiesFromSelection(colorFamilySelect.value).forEach((family) =>
          setFamilyCustomization(
            family,
            { color },
            currentTracks,
            notes,
          ),
        );
        renderFrame(lastTime);
        updateColorControl();
      });

      colorControl.appendChild(colorLabel);
      colorControl.appendChild(colorFamilySelect);
      colorControl.appendChild(colorInput);
      colorControl.appendChild(colorHint);
      familyPanel.appendChild(colorControl);

      const shapeControl = document.createElement('div');
      shapeControl.className = 'family-config-item family-config-group';
      const shapeLabel = document.createElement('label');
      shapeLabel.textContent = 'Figura de familia:';
      const shapeFamilySelect = createFamilySelector();
      const shapeSelect = document.createElement('select');
      SHAPE_OPTIONS.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        shapeSelect.appendChild(option);
      });
      const shapeHint = document.createElement('span');
      shapeHint.className = 'control-hint';

      const updateShapeControl = () => {
        const { shape, mixed } = getShapeState(shapeFamilySelect.value);
        if (shapeSelect.querySelector(`option[value="${shape}"]`)) {
          shapeSelect.value = shape;
        } else if (SHAPE_OPTIONS[0]) {
          shapeSelect.value = SHAPE_OPTIONS[0].value;
        }
        const currentOption = SHAPE_OPTIONS.find((opt) => opt.value === shapeSelect.value);
        shapeHint.textContent = mixed
          ? 'Valores variados'
          : currentOption
          ? currentOption.label
          : '';
        shapeHint.classList.toggle('hint-active', mixed);
      };

      shapeFamilySelect.addEventListener('change', updateShapeControl);
      shapeSelect.addEventListener('change', () => {
        const shape = shapeSelect.value;
        familiesFromSelection(shapeFamilySelect.value).forEach((family) =>
          setFamilyCustomization(
            family,
            { shape },
            currentTracks,
            notes,
          ),
        );
        renderFrame(lastTime);
        updateShapeControl();
      });

      shapeControl.appendChild(shapeLabel);
      shapeControl.appendChild(shapeFamilySelect);
      shapeControl.appendChild(shapeSelect);
      shapeControl.appendChild(shapeHint);
      familyPanel.appendChild(shapeControl);

      const lineControl = document.createElement('div');
      lineControl.className = 'family-config-item family-line-item';
      const lineHeader = document.createElement('div');
      lineHeader.className = 'family-line-row family-line-header';
      const lineFamilyLabel = document.createElement('span');
      lineFamilyLabel.textContent = 'Familia línea:';
      const lineFamilySelect = createFamilySelector();
      lineHeader.appendChild(lineFamilyLabel);
      lineHeader.appendChild(lineFamilySelect);
      lineControl.appendChild(lineHeader);

      const lineToggleLabel = document.createElement('label');
      lineToggleLabel.className = 'family-line-toggle';
      const lineToggle = document.createElement('input');
      lineToggle.type = 'checkbox';
      lineToggleLabel.appendChild(lineToggle);
      lineToggleLabel.appendChild(document.createTextNode(' Línea activa'));
      lineControl.appendChild(lineToggleLabel);

      const opacityRow = document.createElement('div');
      opacityRow.className = 'family-line-row';
      const opacityText = document.createElement('span');
      opacityText.textContent = 'Opacidad';
      const opacityControl = document.createElement('div');
      opacityControl.className = 'family-line-range';
      const lineOpacity = document.createElement('input');
      lineOpacity.type = 'range';
      lineOpacity.min = '0';
      lineOpacity.max = '1';
      lineOpacity.step = '0.05';
      const opacityValue = document.createElement('span');
      opacityValue.className = 'range-value';
      opacityControl.appendChild(lineOpacity);
      opacityControl.appendChild(opacityValue);
      opacityRow.appendChild(opacityText);
      opacityRow.appendChild(opacityControl);
      lineControl.appendChild(opacityRow);

      const widthRow = document.createElement('div');
      widthRow.className = 'family-line-row';
      const widthText = document.createElement('span');
      widthText.textContent = 'Ancho';
      const widthControl = document.createElement('div');
      widthControl.className = 'family-line-range';
      const lineWidth = document.createElement('input');
      lineWidth.type = 'range';
      lineWidth.min = '0.25';
      lineWidth.max = '8';
      lineWidth.step = '0.05';
      const widthValue = document.createElement('span');
      widthValue.className = 'range-value';
      widthControl.appendChild(lineWidth);
      widthControl.appendChild(widthValue);
      widthRow.appendChild(widthText);
      widthRow.appendChild(widthControl);
      lineControl.appendChild(widthRow);

      const travelToggleLabel = document.createElement('label');
      travelToggleLabel.className = 'family-line-toggle';
      const travelToggle = document.createElement('input');
      travelToggle.type = 'checkbox';
      travelToggleLabel.appendChild(travelToggle);
      travelToggleLabel.appendChild(
        document.createTextNode(' Viaje tras NOTE OFF'),
      );
      lineControl.appendChild(travelToggleLabel);

      const updateLineControl = () => {
        const state = getLineState(lineFamilySelect.value);
        lineToggle.checked = state.enabled;
        lineToggle.indeterminate = state.mixedEnabled;
        lineOpacity.value = String(state.opacity);
        lineOpacity.disabled = !state.enabled && !state.mixedEnabled;
        opacityValue.textContent = state.mixedOpacity
          ? '—'
          : Number(state.opacity).toFixed(2);
        lineWidth.value = String(state.width);
        lineWidth.disabled = !state.enabled && !state.mixedEnabled;
        widthValue.textContent = state.mixedWidth
          ? '—'
          : Number(state.width).toFixed(2);
        travelToggle.checked = state.travel;
        travelToggle.indeterminate = state.mixedTravel;
      };

      lineFamilySelect.addEventListener('change', updateLineControl);
      lineToggle.addEventListener('change', () => {
        const enabled = lineToggle.checked;
        lineToggle.indeterminate = false;
        familiesFromSelection(lineFamilySelect.value).forEach((family) =>
          updateFamilyLineSettings(family, { enabled }),
        );
        renderFrame(lastTime);
        updateLineControl();
      });
      lineOpacity.addEventListener('input', () => {
        const value = parseFloat(lineOpacity.value);
        familiesFromSelection(lineFamilySelect.value).forEach((family) =>
          updateFamilyLineSettings(family, { opacity: value }),
        );
        renderFrame(lastTime);
        updateLineControl();
      });
      lineWidth.addEventListener('input', () => {
        const value = parseFloat(lineWidth.value);
        familiesFromSelection(lineFamilySelect.value).forEach((family) =>
          updateFamilyLineSettings(family, { width: value }),
        );
        renderFrame(lastTime);
        updateLineControl();
      });
      travelToggle.addEventListener('change', () => {
        const enabled = travelToggle.checked;
        travelToggle.indeterminate = false;
        familiesFromSelection(lineFamilySelect.value).forEach((family) =>
          setTravelEffectEnabled(family, enabled),
        );
        renderFrame(lastTime);
        updateLineControl();
      });

      familyPanel.appendChild(lineControl);

      updateColorControl();
      updateShapeControl();
      updateLineControl();

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
      pixelsPerSecond = canvas.width / visibleSeconds;
    }

    applyCanvasSize(false);

    if (typeof ResizeObserver !== 'undefined') {
      const resizeObserver = new ResizeObserver(() =>
        applyCanvasSize(!!document.fullscreenElement)
      );
      resizeObserver.observe(document.body);
    }

    window.addEventListener('resize', () => {
      syncWaveformCanvasSize();
      if (tapTempoModeActive) {
        renderWaveform();
      }
    });

    function setupDPRListener() {
      if (!window.matchMedia) return;
      let mql = window.matchMedia(`(resolution: ${currentDPR}dppx)`);
      const onChange = () => {
        mql.removeEventListener('change', onChange);
        currentDPR = window.devicePixelRatio || 1;
        applyCanvasSize(!!document.fullscreenElement);
        syncWaveformCanvasSize();
        if (tapTempoModeActive) {
          renderWaveform();
        }
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

    function startPlayback({ onEnded } = {}) {
      const endedHandler = () => {
        stopAnimation();
        renderFrame(audioOffsetMs / 1000);
        if (typeof onEnded === 'function') {
          onEnded();
        }
      };
      if (!audioPlayer.start(notes, endedHandler)) return false;
      startAnimation();
      return true;
    }

    function stopPlayback(preserveOffset = true) {
      audioPlayer.stop(preserveOffset);
      stopAnimation();
      renderFrame(audioPlayer.getStartOffset() + audioOffsetMs / 1000);
      if (tapTempoActive) {
        finalizeTapTempoRecording({ canceled: true });
      }
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
      renderFrame(audioPlayer.getStartOffset() + audioOffsetMs / 1000);
      if (wasPlaying) startPlayback();
    }

    async function refreshAnimation() {
      const canResume = audioPlayer.canStart(notes);
      await refreshPlaybackAnimation(
        audioPlayer,
        stopAnimation,
        () => renderFrame(audioPlayer.getStartOffset() + audioOffsetMs / 1000),
        () => startPlayback(),
        { canStart: canResume }
      );
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
        originalTempoMap = tempoMap.map((ev) => ({ ...ev }));
        timeDivision = tDiv || 1;
        currentTracks.forEach((t) => {
          if (!(t.name in enabledInstruments)) {
            setInstrumentEnabled(t.name, true);
          }
        });
        applyStoredAssignments();
        populateInstrumentDropdown(currentTracks);
        showAssignmentModal(currentTracks);
        buildFamilyPanel();
        restoreOriginalTempoMap({ preserveStatus: false });
        resetTapTempoEditor({ preserveStatus: true, preserveMarkers: true });
        audioPlayer.resetStartOffset();
        renderFrame(audioOffsetMs / 1000);
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
        prepareWaveform(result.audioBuffer);
        resetTapTempoEditor({ preserveStatus: true, preserveMarkers: true });
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
        restartPlayback(audioPlayer, stopAnimation, renderFrame, startPlayback);
      },
      onRefresh: () => {
        refreshAnimation().catch((err) => console.error(err));
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
      trackNoteSequences = new Map();
      tempoMap = preprocessTempoMap(tempoMapRaw, timeDivision);
      tracks.forEach((track) => {
        const sequence = [];
        trackNoteSequences.set(track.name, sequence);
        track.events.forEach((ev) => {
          if (ev.type === 'note') {
            const start = ticksToSeconds(ev.start, tempoMap, timeDivision);
            const end = ticksToSeconds(ev.start + ev.duration, tempoMap, timeDivision);
            const noteEntry = {
              start,
              end,
              noteNumber: ev.noteNumber,
              velocity: ev.velocity,
              color: track.color || '#ffffff',
              shape: track.shape || 'square',
              family: track.family,
              instrument: track.instrument,
              trackName: track.name,
              next: null,
              prev: null,
            };
            notes.push(noteEntry);
            sequence.push(noteEntry);
          }
        });
      });
      trackNoteSequences.forEach((sequence) => {
        sequence.sort((a, b) => a.start - b.start);
        for (let i = 0; i < sequence.length; i++) {
          const current = sequence[i];
          current.prev = sequence[i - 1] || null;
          current.next = sequence[i + 1] || null;
        }
      });
      notes.sort((a, b) => a.start - b.start);
      startIndex = 0;
      endIndex = 0;
      lastTime = 0;
    }

    function renderFrame(currentSec) {
      if (typeof currentSec !== 'number' || !isFinite(currentSec)) {
        currentSec = lastTime;
      }
      const movedBackward = currentSec + BACKWARD_TOLERANCE < lastTime;
      if (movedBackward) {
        startIndex = 0;
        endIndex = 0;
      } else if (currentSec < lastTime) {
        currentSec = lastTime;
      }
      lastTime = currentSec;

      offscreenCtx.clearRect(0, 0, canvas.width, canvas.height);
      offscreenCtx.fillStyle = canvas.style.backgroundColor || '#000000';
      offscreenCtx.fillRect(0, 0, canvas.width, canvas.height);

      const noteHeight = canvas.height / 88;
      const windowStart = currentSec - visibleSeconds / 2;
      const windowEnd = currentSec + visibleSeconds / 2;
      while (startIndex < notes.length && notes[startIndex].end < windowStart)
        startIndex++;
      while (endIndex < notes.length && notes[endIndex].start < windowEnd)
        endIndex++;

      const layouts = [];
      const trackSegments = new Map();
      const activeTravels = [];
      const margin = Math.max(canvas.width * 0.1, 80);

      const computeLayoutAt = (note, time) => {
        const { sizeFactor, bump } = getFamilyModifiers(note.family);
        let baseHeight = noteHeight * sizeFactor * getHeightScale(note.family);
        baseHeight = computeVelocityHeight(baseHeight, note.velocity || velocityBase);
        let xStart;
        let xEnd;
        let width;
        if (NON_STRETCHED_SHAPES.has(note.shape)) {
          width = baseHeight;
          const xCenter = canvas.width / 2 + (note.start - time) * pixelsPerSecond;
          xStart = xCenter - width / 2;
          xEnd = xStart + width;
        } else {
          ({ xStart, xEnd, width } = computeDynamicBounds(
            note,
            time,
            canvas.width,
            pixelsPerSecond,
            baseHeight,
            note.shape,
          ));
        }
        const clamped = Math.min(Math.max(note.noteNumber, NOTE_MIN), NOTE_MAX);
        const height = computeBumpHeight(baseHeight, time, note.start, note.end, bump);
        const y =
          canvas.height - (clamped - NOTE_MIN + 1) * noteHeight -
          (height - noteHeight) / 2;
        const alpha = computeOpacity(xStart, xEnd, canvas.width);
        const centerX = xStart + width / 2;
        const centerY = y + height / 2;
        return { xStart, xEnd, width, height, y, alpha, centerX, centerY };
      };

      for (let i = startIndex; i < endIndex; i++) {
        const note = notes[i];
        if (enabledInstruments[note.trackName ?? note.instrument] === false) continue;
        const metrics = computeLayoutAt(note, currentSec);
        if (metrics.xEnd < -margin || metrics.xStart > canvas.width + margin) continue;

        const layout = { note, metrics, drawBase: true };
        layouts.push(layout);

        const lineConfig = getFamilyLineSettings(note.family);
        if (lineConfig.enabled) {
          const trackKey = note.trackName ?? note.instrument;
          const group = trackSegments.get(trackKey);
          if (group) group.push(layout);
          else trackSegments.set(trackKey, [layout]);
        }

        const travelEnabled = isTravelEffectEnabled(note.family);
        if (travelEnabled && note.next && note.next.start > note.end) {
          const travelDuration = note.next.start - note.end;
          if (travelDuration > 0) {
            const travelProgress = (currentSec - note.end) / travelDuration;
            if (travelProgress >= 0) {
              layout.drawBase = currentSec < note.end;
              if (travelProgress <= 1) {
                activeTravels.push({ note, progress: travelProgress, layout });
              }
            }
          }
        }
      }

      trackSegments.forEach((segmentLayouts) => {
        if (segmentLayouts.length < 2) return;
        segmentLayouts.sort((a, b) => a.note.start - b.note.start);
        for (let idx = 0; idx < segmentLayouts.length - 1; idx++) {
          const current = segmentLayouts[idx];
          const next = segmentLayouts[idx + 1];
          const config = getFamilyLineSettings(current.note.family);
          if (!config.enabled || config.width <= 0) continue;
          const avgAlpha = ((current.metrics.alpha || 0) + (next.metrics.alpha || 0)) / 2;
          const lineAlpha = config.opacity * avgAlpha;
          if (lineAlpha <= 0) continue;
          const controlX = (current.metrics.centerX + next.metrics.centerX) / 2;
          const controlY = (current.metrics.centerY + next.metrics.centerY) / 2;
          offscreenCtx.save();
          offscreenCtx.strokeStyle = current.note.color;
          offscreenCtx.lineWidth = config.width;
          offscreenCtx.globalAlpha = lineAlpha;
          offscreenCtx.beginPath();
          offscreenCtx.moveTo(current.metrics.centerX, current.metrics.centerY);
          if (typeof offscreenCtx.quadraticCurveTo === 'function') {
            offscreenCtx.quadraticCurveTo(
              controlX,
              controlY,
              next.metrics.centerX,
              next.metrics.centerY,
            );
          } else {
            offscreenCtx.lineTo(next.metrics.centerX, next.metrics.centerY);
          }
          offscreenCtx.stroke();
          offscreenCtx.restore();
        }
      });

      for (const layout of layouts) {
        if (!layout.drawBase) continue;
        const { note, metrics } = layout;
        const alpha = metrics.alpha;
        if (alpha <= 0) continue;

        offscreenCtx.save();
        offscreenCtx.globalAlpha = alpha;
        offscreenCtx.fillStyle = note.color;
        drawNoteShape(offscreenCtx, note.shape, metrics.xStart, metrics.y, metrics.width, metrics.height);
        offscreenCtx.restore();

        offscreenCtx.save();
        offscreenCtx.globalAlpha = alpha;
        offscreenCtx.strokeStyle = note.color;
        drawNoteShape(
          offscreenCtx,
          note.shape,
          metrics.xStart,
          metrics.y,
          metrics.width,
          metrics.height,
          true,
        );
        offscreenCtx.restore();

        const glowAlpha = computeGlowAlpha(currentSec, note.start);
        if (glowAlpha > 0) {
          applyGlowEffect(
            offscreenCtx,
            note.shape,
            metrics.xStart,
            metrics.y,
            metrics.width,
            metrics.height,
            glowAlpha,
          );
        }
      }

      activeTravels.forEach(({ note, progress, layout }) => {
        const duration = note.next.start - note.end;
        if (duration <= 0) return;
        const clamped = Math.min(Math.max(progress, 0), 1);
        const startLayout = computeLayoutAt(note, note.end);
        const targetLayout = computeLayoutAt(note.next, note.next.start);
        const startShift = (currentSec - note.end) * pixelsPerSecond;
        const targetShift = (currentSec - note.next.start) * pixelsPerSecond;
        const startX = startLayout.centerX - startShift;
        const startY = startLayout.centerY;
        const endX = targetLayout.centerX - targetShift;
        const endY = targetLayout.centerY;
        const posX = startX + (endX - startX) * clamped;
        const posY = startY + (endY - startY) * clamped;
        const scale = Math.max(0, 1 - clamped);
        if (scale <= 0) return;
        const width = Math.max(0.0001, layout.metrics.width * scale);
        const height = Math.max(0.0001, layout.metrics.height * scale);
        const baseAlpha = Math.max(layout.metrics.alpha, 0);
        const alpha = Math.max(0, Math.min(1, baseAlpha * scale));
        if (alpha <= 0) return;
        const drawX = posX - width / 2;
        const drawY = posY - height / 2;
        if (drawX > canvas.width || drawX + width < 0) return;

        offscreenCtx.save();
        offscreenCtx.globalAlpha = alpha;
        offscreenCtx.fillStyle = note.color;
        drawNoteShape(offscreenCtx, note.shape, drawX, drawY, width, height);
        offscreenCtx.restore();

        offscreenCtx.save();
        offscreenCtx.globalAlpha = alpha;
        offscreenCtx.strokeStyle = note.color;
        drawNoteShape(offscreenCtx, note.shape, drawX, drawY, width, height, true);
        offscreenCtx.restore();
      });

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(offscreenCanvas, 0, 0);
    }

    // Exponer la función para pruebas unitarias
    if (typeof window !== 'undefined') {
      window.__renderFrame = renderFrame;
      window.__setTestNotes = (n) => {
        notes = n;
        startIndex = 0;
        endIndex = 0;
        lastTime = 0;
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
        renderFrame(audioPlayer.getCurrentTime() + audioOffsetMs / 1000);
        return;
      }
      const loopFn = (dt) => {
        adjustSupersampling(dt);
        const currentSec = audioPlayer.getCurrentTime() + audioOffsetMs / 1000;
        renderFrame(currentSec);
        if (!audioPlayer.isPlaying()) stopAnimation();
      };
      stopLoop = startAutoFPSLoop(loopFn, FRAME_DT_MIN, FRAME_DT_MAX);
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
  Cornos: { shape: 'capsule', color: '#ffff00' },
  'Percusión menor': { shape: 'pentagon', color: '#808080' },
  Tambores: { shape: 'circle', color: '#808080' },
  Platillos: { shape: 'circle', color: '#808080' },
  Placas: { shape: 'square', color: '#ff0000' },
  Auxiliares: { shape: 'circle', color: '#4b0082' },
  'Cuerdas frotadas': { shape: 'diamond', color: '#ffa500' },
  'Cuerdas pulsadas': { shape: 'star4', color: '#008000' },
  Voces: { shape: 'capsule', color: '#808080' },
  'Custom 1': { shape: 'square', color: '#ffffff' },
  'Custom 2': { shape: 'square', color: '#ffffff' },
  'Custom 3': { shape: 'square', color: '#ffffff' },
  'Custom 4': { shape: 'square', color: '#ffffff' },
  'Custom 5': { shape: 'square', color: '#ffffff' },
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
  'Corno francés': 'Cornos',
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

  // Determina el nombre del instrumento permitiendo coincidencias flexibles
  const fuzzyInstrumentMatch = (key) => {
    for (const [norm, inst] of Object.entries(NORMALIZED_INSTRUMENT_MAP)) {
      const startLen = Math.min(2, key.length, norm.length);
      const endLen = Math.min(2, key.length, norm.length);
      const startMatch = key.slice(0, startLen) === norm.slice(0, startLen);
      const endMatch = key.slice(-endLen) === norm.slice(-endLen);
      if (startMatch && endMatch) return inst;
    }
    return null;
  };

  const resolveInstrumentName = (name) => {
    const key = normalizeInstrumentName(name);
    if (NORMALIZED_INSTRUMENT_MAP[key]) return NORMALIZED_INSTRUMENT_MAP[key];
    const match = Object.entries(NORMALIZED_INSTRUMENT_MAP).find(
      ([norm]) => key.startsWith(norm) || norm.startsWith(key),
    );
    if (match) return match[1];
    const fuzzy = fuzzyInstrumentMatch(key);
    return fuzzy ? fuzzy : normalizeAccents(name);
  };

function getInstrumentColor(preset) {
  return preset.color;
}

const FAMILY_LIST = [
  'Maderas de timbre "redondo"',
  'Dobles cañas',
  'Saxofones',
  'Metales',
  'Cornos',
  'Percusión menor',
  'Tambores',
  'Platillos',
  'Placas',
  'Auxiliares',
  'Cuerdas frotadas',
  'Cuerdas pulsadas',
  'Voces',
  'Custom 1',
  'Custom 2',
  'Custom 3',
  'Custom 4',
  'Custom 5',
];

let assignedFamilies = {};
if (typeof localStorage !== 'undefined') {
  assignedFamilies = JSON.parse(localStorage.getItem('instrumentFamilies') || '{}');
}

let familyCustomizations = {};
if (typeof localStorage !== 'undefined') {
  const stored = JSON.parse(localStorage.getItem('familyCustomizations') || '{}');
  familyCustomizations = {};
  Object.entries(stored).forEach(([fam, cfg]) => {
    if (!FAMILY_PRESETS[fam]) return;
    const preset = { ...FAMILY_PRESETS[fam] };
    if (cfg.shape) preset.shape = cfg.shape;
    let resolvedColor = cfg.color;
    if (!resolvedColor && cfg.colorBright && cfg.colorDark) {
      const { bright, dark } = validateColorRange(cfg.colorBright, cfg.colorDark);
      resolvedColor = interpolateColor(dark, bright, 0.5);
    } else if (!resolvedColor && cfg.colorBright) {
      resolvedColor = cfg.colorBright;
    } else if (!resolvedColor && cfg.colorDark) {
      resolvedColor = cfg.colorDark;
    }
    if (resolvedColor) {
      preset.color = resolvedColor;
    }
    FAMILY_PRESETS[fam] = { shape: preset.shape, color: preset.color };
    familyCustomizations[fam] = { color: preset.color, shape: preset.shape };
  });
}

function saveFamilyCustomizations() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('familyCustomizations', JSON.stringify(familyCustomizations));
  }
}

function setFamilyCustomization(
  family,
  { color, shape, colorBright, colorDark } = {},
  tracks = [],
  notes = []
) {
  const basePreset = FAMILY_PRESETS[family] || { shape: 'square', color: '#ffffff' };
  const preset = { ...basePreset };
  let resolvedColor = color;
  if (!resolvedColor && colorBright && colorDark) {
    const { bright, dark } = validateColorRange(colorBright, colorDark);
    resolvedColor = interpolateColor(dark, bright, 0.5);
  } else if (!resolvedColor && colorBright) {
    resolvedColor = colorBright;
  } else if (!resolvedColor && colorDark) {
    resolvedColor = colorDark;
  }
  if (resolvedColor) {
    preset.color = resolvedColor;
  }
  if (shape) preset.shape = shape;
  FAMILY_PRESETS[family] = { shape: preset.shape, color: preset.color };
  familyCustomizations[family] = { color: preset.color, shape: preset.shape };
  saveFamilyCustomizations();
  tracks.forEach((t) => {
    if (t.family === family) {
      t.shape = preset.shape;
      t.color = getInstrumentColor(preset);
    }
  });
  notes.forEach((n) => {
    if (n.family === family) {
      n.shape = preset.shape;
      n.color = getInstrumentColor(preset);
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
  resetFamilyLineSettings();
  resetTravelEffectSettings();
  tracks.forEach((t) => {
    const preset = FAMILY_PRESETS[t.family] || { shape: 'square', color: '#ffffff' };
    t.shape = preset.shape;
    t.color = getInstrumentColor(preset);
  });
  notes.forEach((n) => {
    const preset = FAMILY_PRESETS[n.family] || { shape: 'square', color: '#ffffff' };
    n.shape = preset.shape;
    n.color = getInstrumentColor(preset);
  });
  if (typeof renderFrame === 'function') {
    renderFrame(lastTime);
  }
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
    visibleSeconds: getVisibleSeconds(),
    heightScale: getHeightScaleConfig(),
    shapeExtensions: getShapeExtensions(),
    familyLineSettings: getAllFamilyLineSettings(),
    familyTravelSettings: getTravelEffectSettings(),
  });
}

function importConfiguration(json, tracks = [], notes = []) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  assignedFamilies = { ...((data.assignedFamilies || {})) };
  const famCustoms = data.familyCustomizations || {};
  familyCustomizations = {};
  Object.assign(enabledInstruments, data.enabledInstruments || {});
  setAllFamilyLineSettings(data.familyLineSettings || {});
  setTravelEffectSettings(data.familyTravelSettings || {});
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
  if (typeof data.visibleSeconds === 'number') {
    setVisibleSeconds(data.visibleSeconds);
  }
  if (data.heightScale) {
    if (typeof data.heightScale.global === 'number') {
      setHeightScale(data.heightScale.global);
    }
    if (data.heightScale.families && typeof data.heightScale.families === 'object') {
      Object.entries(data.heightScale.families).forEach(([fam, val]) => {
        if (typeof val === 'number') setHeightScale(val, fam);
      });
    }
  }

  if (data.shapeExtensions && typeof data.shapeExtensions === 'object') {
    Object.entries(data.shapeExtensions).forEach(([shape, enabled]) => {
      setShapeExtension(shape, enabled);
    });
  }

  Object.keys(FAMILY_DEFAULTS).forEach((fam) => {
    FAMILY_PRESETS[fam] = { ...FAMILY_DEFAULTS[fam] };
  });
  Object.entries(famCustoms).forEach(([fam, cfg]) => {
    if (!FAMILY_PRESETS[fam]) return;
    const preset = { ...FAMILY_PRESETS[fam] };
    if (cfg.shape) preset.shape = cfg.shape;
    let resolvedColor = cfg.color;
    if (!resolvedColor && cfg.colorBright && cfg.colorDark) {
      const { bright, dark } = validateColorRange(cfg.colorBright, cfg.colorDark);
      resolvedColor = interpolateColor(dark, bright, 0.5);
    } else if (!resolvedColor && cfg.colorBright) {
      resolvedColor = cfg.colorBright;
    } else if (!resolvedColor && cfg.colorDark) {
      resolvedColor = cfg.colorDark;
    }
    if (resolvedColor) {
      preset.color = resolvedColor;
    }
    FAMILY_PRESETS[fam] = { shape: preset.shape, color: preset.color };
    familyCustomizations[fam] = { color: preset.color, shape: preset.shape };
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
    t.color = getInstrumentColor(preset);
  });
  notes.forEach((n) => {
    const key = n.trackName ?? n.instrument;
    const fam = assignedFamilies[key] || n.family;
    n.family = fam;
    const preset =
      FAMILY_PRESETS[fam] || { shape: 'unknown', color: '#ffffff' };
    n.shape = preset.shape;
    n.color = getInstrumentColor(preset);
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
    const color = getInstrumentColor(preset);
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
    startAutoFPSLoop,
    computeVelocityHeight,
    setVelocityBase,
    getVelocityBase,
    setOpacityScale,
    getOpacityScale,
    setGlowStrength,
    getGlowStrength,
    setBumpControl,
    getBumpControl,
    setSuperSampling,
    getSuperSampling,
    preprocessTempoMap,
    ticksToSeconds,
    setFamilyCustomization,
    resetFamilyCustomizations,
    exportConfiguration,
    importConfiguration,
    loadDefaultConfiguration,
    setInstrumentEnabled,
    getVisibleNotes,
    setVisibleSeconds,
    getVisibleSeconds,
    setAudioOffset,
    getAudioOffset,
    setHeightScale,
    getHeightScale,
    getHeightScaleConfig,
    restartPlayback,
    refreshPlaybackAnimation,
    FAMILY_LIST,
    computeDynamicBounds,
    computeDiamondBounds,
    setShapeExtension,
    getShapeExtension,
    getShapeExtensions,
  };
}
