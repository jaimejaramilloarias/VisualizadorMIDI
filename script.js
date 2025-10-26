// Script inicial para preparar el canvas
// En esta etapa no se implementa funcionalidad adicional

// Importación de utilidades modulares para efectos visuales y cálculos
const {
  computeOpacity,
  computeBumpHeight,
  computeGlowAlpha,
  drawNoteShape,
  interpolateColor,
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
  getGlowStrengthConfig,
  setBumpControl,
  getBumpControl,
  getBumpControlConfig,
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
  setShapeExtensionsEnabled,
  getShapeExtension,
  getShapeExtensions,
  setShapeStretch,
  setShapeStretchEnabled,
  getShapeStretch,
  getShapeStretchConfig,
  setFamilyExtension,
  getFamilyExtension,
  getFamilyExtensionConfig,
  clearFamilyExtension,
  clearAllFamilyExtensions,
  setFamilyStretch,
  getFamilyStretch,
  getFamilyStretchConfig,
  clearFamilyStretch,
  clearAllFamilyStretch,
  isStretchEnabledForFamily,
  isExtensionEnabledForFamily,
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
  setOutlineSettings,
  getOutlineSettings,
  getOutlineSettingsConfig,
  clearFamilyOutlineSettings,
  resetOutlineSettings,
  sanitizeOutlineSettings,
  OUTLINE_MODES,
} = typeof require !== 'undefined' ? require('./utils.js') : window.utils;

// "setupHelpMessages" se declara globalmente en help.js. Para evitar conflictos
// de redeclaración en entornos donde los scripts comparten el ámbito global,
// renombramos la referencia local.
const { setupHelpMessages: initHelpMessages } =
  typeof require !== 'undefined' ? require('./help.js') : window.help;

// "initializeUI" e "initializeDeveloperMode" se declaran globalmente en ui.js cuando se
// carga en el navegador. Para evitar errores de "Identifier has already been declared"
// al importar estas funciones, renombramos las referencias locales.
const { initializeUI: initializeUIControls } =
  typeof require !== 'undefined' ? require('./ui.js') : window.ui;
const { loadMusicFile } =
  typeof require !== 'undefined' ? require('./midiLoader.js') : window.midiLoader;
const { loadWavFile } =
  typeof require !== 'undefined' ? require('./wavLoader.js') : window.wavLoader;
const { createAudioPlayer } =
  typeof require !== 'undefined' ? require('./audioPlayer.js') : window.audioPlayer;

// Utilidades de almacenamiento local para reducir lógica repetida
const storage = typeof localStorage !== 'undefined' ? localStorage : null;

const readStoredValue = (key) => (storage ? storage.getItem(key) : null);

const writeStoredValue = (key, value) => {
  if (!storage) return;
  storage.setItem(key, value);
};

const readStoredJSON = (key, fallback) => {
  const raw = readStoredValue(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`No se pudo parsear la configuración JSON para "${key}".`, error);
    return fallback;
  }
};

const writeStoredJSON = (key, value) => {
  if (value === undefined) return;
  writeStoredValue(key, JSON.stringify(value));
};

const readStoredNumber = (key, fallback, validator = () => true) => {
  const raw = readStoredValue(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && validator(parsed) ? parsed : fallback;
};

const writeStoredNumber = (key, value) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return;
  writeStoredValue(key, String(value));
};

// Estado de activación de instrumentos
const enabledInstruments = readStoredJSON('enabledInstruments', {}) || {};

// Parámetros de fluidez de animación
const FRAME_DT_MIN = 8;
const FRAME_DT_MAX = 32;
let superSampling = 2;

function setSuperSampling(val) {
  if (typeof val === 'number' && Number.isFinite(val) && val >= 1 && val <= 2) {
    superSampling = val;
  }
}

function getSuperSampling() {
  return superSampling;
}

function setInstrumentEnabled(inst, enabled) {
  enabledInstruments[inst] = enabled;
  writeStoredJSON('enabledInstruments', enabledInstruments);
}

let visibleSeconds = readStoredNumber('visibleSeconds', 8, (value) => value > 0);
let canvas = null;
let pixelsPerSecond = 0;
let audioOffsetMs = readStoredNumber('audioOffsetMs', 0);

function setVisibleSeconds(sec) {
  if (typeof sec !== 'number' || !Number.isFinite(sec) || sec <= 0) return;
  visibleSeconds = sec;
  writeStoredNumber('visibleSeconds', visibleSeconds);
  if (canvas) {
    pixelsPerSecond = canvas.width / visibleSeconds;
  }
}

function getVisibleSeconds() {
  visibleSeconds = readStoredNumber('visibleSeconds', visibleSeconds, (value) => value > 0);
  return visibleSeconds;
}

getVisibleSeconds();

function setAudioOffset(ms) {
  if (typeof ms !== 'number' || !Number.isFinite(ms)) return;
  audioOffsetMs = ms;
  writeStoredNumber('audioOffsetMs', audioOffsetMs);
}

function getAudioOffset() {
  audioOffsetMs = readStoredNumber('audioOffsetMs', audioOffsetMs);
  return audioOffsetMs;
}

getAudioOffset();

function isInstrumentEnabled(note) {
  return enabledInstruments[note.trackName ?? note.instrument] !== false;
}

function getVisibleNotes(allNotes) {
  return allNotes.filter(isInstrumentEnabled);
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
    const configureDrawingContext = (context) => {
      if (!context) return;
      if (typeof context.resetTransform === 'function') {
        context.resetTransform();
      } else if (typeof context.setTransform === 'function') {
        context.setTransform(1, 0, 0, 1, 0, 0);
      }
      context.imageSmoothingEnabled = false;
      context.lineCap = 'round';
      context.lineJoin = 'round';
    };
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

    configureDrawingContext(ctx);
    canvas.style.imageRendering = 'pixelated';
    // Sugerir al navegador que optimice transformaciones/opacidad del canvas
    canvas.style.willChange = 'transform, opacity';
    canvas.style.contain = 'paint';

    // Canvas offscreen para optimizar el renderizado de notas
    const offscreenCanvas = document.createElement('canvas');
    const offscreenCtx = offscreenCanvas.getContext('2d');
    const reconfigureCanvasContexts = () => {
      configureDrawingContext(ctx);
      configureDrawingContext(offscreenCtx);
    };
    if (offscreenCtx) {
      configureDrawingContext(offscreenCtx);
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
    const toggleFamilyPanelBtn = document.getElementById('toggle-family-panel');
    const familyPanel = document.getElementById('family-config-panel');
    const developerControls = document.getElementById('developer-controls');
    let globalSettingsContainer = null;
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
    let draggingMarkerId = null;
    let markerHandles = [];
    let hoveredHandleKey = null;
    let altKeyActive = false;
    let refreshFamilyControls = () => {};
    let backgroundImage = null;
    let backgroundImageUrl = null;
    let backgroundImageName = '';
    let backgroundImageOpacity = 0.6;
    const audioPlayer = createAudioPlayer();
    syncWaveformCanvasSize();

    if (familyPanel) {
      familyPanel.classList.add('active');
    }
    if (toggleFamilyPanelBtn) {
      toggleFamilyPanelBtn.textContent = '▲';
    }

    const DOUBLE_SHAPE_PATTERN = /double$/i;
    const isDoubleShapeName = (shape) =>
      typeof shape === 'string' && DOUBLE_SHAPE_PATTERN.test(shape);
    const NON_EXTENDABLE_SHAPES = new Set(['sixPointStar']);
    const isShapeExtendable = (shape) =>
      !!(shape && !isDoubleShapeName(shape) && !NON_EXTENDABLE_SHAPES.has(shape));
    const STRETCHABLE_SHAPES = SHAPE_OPTIONS.map((opt) => opt.value).filter((value) =>
      isShapeExtendable(value),
    );

    function requestImmediateRender() {
      if (typeof renderFrame === 'function') {
        renderFrame(lastTime);
      }
    }

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

    if (developerControls) {
      developerControls.classList.remove('hidden');
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

      globalSettingsContainer = document.createElement('div');
      globalSettingsContainer.id = 'global-visual-settings';
      globalSettingsContainer.className = 'dev-control-section';
      developerControls.appendChild(globalSettingsContainer);
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

    function updateTrackFamily(trackName, fam, { fromTime = 0 } = {}) {
      if (!trackName) return;
      const track = currentTracks.find((t) => t.name === trackName);
      if (!track) return;
      const targetFamily = fam || track.detectedFamily || track.family || fam;
      const preset =
        FAMILY_PRESETS[targetFamily] ||
        FAMILY_DEFAULTS[targetFamily] ||
        { shape: 'circle', color: '#ffa500', secondaryColor: '#000000' };
      track.family = targetFamily;
      const override = instrumentCustomizations[trackName] || null;
      if (!override || !override.shape) {
        track.shape = preset.shape;
      }
      if (!override || !override.color) {
        track.color = getInstrumentColor(preset);
      }
      track.secondaryColor = preset.secondaryColor || '#000000';
      if (override) {
        override.family = targetFamily;
      }
      const effectiveFrom = typeof fromTime === 'number' && fromTime > 0 ? fromTime : 0;
      notes.forEach((n) => {
        if ((n.trackName ?? n.instrument) !== trackName) return;
        if (n.start < effectiveFrom) return;
        n.family = targetFamily;
        if (!override || !override.shape) {
          n.shape = preset.shape;
        }
        if (!override || !override.color) {
          n.color = getInstrumentColor(preset);
        }
        n.secondaryColor = track.secondaryColor;
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
      if (globalSettingsContainer) {
        globalSettingsContainer.innerHTML = '';
      }

      const customizationContainer = document.createElement('div');
      customizationContainer.className = 'customization-sections';

      const scopeSelectorControl = document.createElement('div');
      scopeSelectorControl.className =
        'dev-control family-target-control scope-selector';
      const scopeLabel = document.createElement('label');
      scopeLabel.textContent = 'Aplicar cambios a:';
      scopeLabel.setAttribute('for', 'config-scope-select');
      const scopeSelect = document.createElement('select');
      scopeSelect.id = 'config-scope-select';
      [
        { value: 'instrumento', label: 'Instrumento' },
        { value: 'familia', label: 'Familia' },
        { value: 'global', label: 'Global' },
      ].forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        scopeSelect.appendChild(option);
      });
      scopeSelect.value = 'familia';
      scopeSelectorControl.appendChild(scopeLabel);
      scopeSelectorControl.appendChild(scopeSelect);

      const instrumentScopeSection = document.createElement('div');
      instrumentScopeSection.className = 'config-scope-section scope-instrumento';

      const familyScopeSection = document.createElement('div');
      familyScopeSection.className = 'config-scope-section scope-familia';

      const appendToGlobalSettings = (element) => {
        if (globalSettingsContainer) {
          globalSettingsContainer.appendChild(element);
        } else {
          familyPanel.appendChild(element);
        }
      };

      appendToGlobalSettings(scopeSelectorControl);
      customizationContainer.appendChild(instrumentScopeSection);
      customizationContainer.appendChild(familyScopeSection);
      familyPanel.appendChild(customizationContainer);

      let updateHeightControl = () => {};
      let updateGlowControl = () => {};
      let updateBumpControl = () => {};
      let updateOutlineControl = () => {};
      let updateExtensionControl = () => {};
      let updateStretchControl = () => {};
      let updateParameterControls = () => {};
      let updateInstrumentColorControl = () => {};
      let updateSecondaryColorControl = () => {};
      let refreshFamilyControls = () => {};
      let updateScopeVisibility = () => {};
      const paletteUpdaters = [];

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
        const container = document.createElement('div');
        container.className = 'family-target-selector';
        const buttons = [];
        let currentValue = '';

        const updateActiveButtons = () => {
          buttons.forEach((btn) => {
            const isActive = btn.dataset.value === currentValue;
            btn.classList.toggle('active', isActive);
            btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
          });
        };

        const setValue = (value, { triggerEvent = false } = {}) => {
          const normalized = typeof value === 'string' ? value : '';
          if (normalized === currentValue) return;
          currentValue = normalized;
          container.dataset.value = currentValue;
          updateActiveButtons();
          if (triggerEvent) {
            const changeEvent = new Event('change', { bubbles: true });
            container.dispatchEvent(changeEvent);
          }
        };

        const addButton = (value, label) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.dataset.value = value;
          button.textContent = label;
          button.className = 'family-target-button';
          button.setAttribute('aria-pressed', 'false');
          button.addEventListener('click', () => {
            if (button.disabled) return;
            setValue(value, { triggerEvent: true });
          });
          container.appendChild(button);
          buttons.push(button);
        };

        addButton('', 'Global');
        FAMILY_LIST.forEach((family) => {
          if (!FAMILY_PRESETS[family]) return;
          addButton(family, family);
        });

        Object.defineProperty(container, 'value', {
          get() {
            return currentValue;
          },
          set(value) {
            setValue(value);
          },
        });

        container.getButtons = () => buttons.slice();
        container.updateActiveButtons = updateActiveButtons;
        container.setValueSilently = (value) => setValue(value);

        setValue('', { triggerEvent: false });

        return container;
      };

      const createInstrumentFamilySelector = () => {
        const select = document.createElement('select');
        const autoOption = document.createElement('option');
        autoOption.value = '';
        autoOption.textContent = 'Familia detectada';
        select.appendChild(autoOption);
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

      const getEditStartTime = () => {
        if (audioPlayer && typeof audioPlayer.isPlaying === 'function') {
          if (audioPlayer.isPlaying()) {
            return 0;
          }
          if (typeof audioPlayer.getStartOffset === 'function') {
            const pausedOffset = audioPlayer.getStartOffset();
            const visualTime = pausedOffset + audioOffsetMs / 1000;
            if (Number.isFinite(visualTime)) {
              return Math.max(0, visualTime);
            }
          }
        }
        return Math.max(0, lastTime || 0);
      };

      const getEffectiveFamilyShape = (family) => {
        if (!family) return null;
        const preset = FAMILY_PRESETS[family] || FAMILY_DEFAULTS[family];
        return preset ? preset.shape : null;
      };

      const getColorState = (targetFamily) => {
        const families = familiesFromSelection(targetFamily);
        let baseColor = null;
        let mixed = false;
        families.forEach((family) => {
          const preset = FAMILY_PRESETS[family] || {};
          const color = preset.color || '#ffa500';
          if (baseColor === null) {
            baseColor = color;
          } else if (baseColor.toLowerCase() !== color.toLowerCase()) {
            mixed = true;
          }
        });
        if (baseColor === null) baseColor = '#ffa500';
        return { color: baseColor, mixed };
      };

      const getSecondaryColorState = (targetFamily) => {
        const families = familiesFromSelection(targetFamily);
        let baseColor = null;
        let mixed = false;
        families.forEach((family) => {
          const preset = FAMILY_PRESETS[family] || {};
          const color = (preset.secondaryColor || '#000000').toLowerCase();
          if (baseColor === null) {
            baseColor = color;
          } else if (baseColor !== color) {
            mixed = true;
          }
        });
        if (baseColor === null) baseColor = '#000000';
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

      const getHeightState = (targetFamily) => {
        const families = familiesFromSelection(targetFamily);
        let base = null;
        let mixed = false;
        families.forEach((family) => {
          const value = Math.round(getHeightScale(family) * 100);
          if (base === null) {
            base = value;
          } else if (Math.abs(base - value) > 0.5) {
            mixed = true;
          }
        });
        if (base === null) {
          base = Math.round(getHeightScale(null) * 100);
        }
        return { value: base, mixed };
      };

      const getGlowState = (targetFamily) => {
        const families = familiesFromSelection(targetFamily);
        let base = null;
        let mixed = false;
        families.forEach((family) => {
          const value = Math.round(getGlowStrength(family) * 100);
          if (base === null) {
            base = value;
          } else if (Math.abs(base - value) > 0.5) {
            mixed = true;
          }
        });
        if (base === null) {
          base = Math.round(getGlowStrength(null) * 100);
        }
        return { value: base, mixed };
      };

      const getBumpState = (targetFamily) => {
        const families = familiesFromSelection(targetFamily);
        let base = null;
        let mixed = false;
        families.forEach((family) => {
          const value = Math.round(getBumpControl(family) * 100);
          if (base === null) {
            base = value;
          } else if (Math.abs(base - value) > 0.5) {
            mixed = true;
          }
        });
        if (base === null) {
          base = Math.round(getBumpControl(null) * 100);
        }
        return { value: base, mixed };
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
          const defaults = getFamilyLineSettings('');
          enabled = defaults.enabled;
          opacity = defaults.opacity;
          width = defaults.width;
          travel = isTravelEffectEnabled();
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
      bgItem.className = 'dev-control';
      const bgLabel = document.createElement('label');
      bgLabel.textContent = 'Color del canvas';
      const bgInput = document.createElement('input');
      bgInput.type = 'color';
      bgInput.id = 'canvas-color-input';
      bgInput.value = toHex(canvas.style.backgroundColor);
      bgInput.addEventListener('change', () => {
        canvas.style.backgroundColor = bgInput.value;
        requestImmediateRender();
      });
      bgItem.appendChild(bgLabel);
      bgItem.appendChild(bgInput);
      appendToGlobalSettings(bgItem);

      const bgImageItem = document.createElement('div');
      bgImageItem.className = 'dev-control family-config-group';
      const bgImageLabel = document.createElement('label');
      bgImageLabel.textContent = 'Imagen de fondo:';
      const bgImageInfo = document.createElement('span');
      bgImageInfo.className = 'control-hint bg-image-info';
      const bgImageButtons = document.createElement('div');
      bgImageButtons.className = 'bg-image-buttons';
      const bgImageInput = document.createElement('input');
      bgImageInput.type = 'file';
      bgImageInput.accept = 'image/*';
      bgImageInput.style.display = 'none';
      const selectBgButton = document.createElement('button');
      selectBgButton.type = 'button';
      selectBgButton.textContent = 'Seleccionar imagen';
      const clearBgButton = document.createElement('button');
      clearBgButton.type = 'button';
      clearBgButton.textContent = 'Quitar imagen';

      const updateBackgroundImageControl = () => {
        if (backgroundImage && backgroundImageName) {
          bgImageInfo.textContent = backgroundImageName;
          bgImageInfo.classList.remove('hint-active');
          clearBgButton.disabled = false;
        } else {
          bgImageInfo.textContent = 'Sin imagen';
          bgImageInfo.classList.add('hint-active');
          clearBgButton.disabled = true;
        }
      };

      const loadBackgroundImageFromFile = (file) => {
        if (backgroundImageUrl) {
          URL.revokeObjectURL(backgroundImageUrl);
          backgroundImageUrl = null;
        }
        if (!file) {
          backgroundImage = null;
          backgroundImageName = '';
          updateBackgroundImageControl();
          requestImmediateRender();
          return;
        }
        const url = URL.createObjectURL(file);
        backgroundImageUrl = url;
        const img = new Image();
        img.onload = () => {
          backgroundImage = {
            element: img,
            width: img.naturalWidth,
            height: img.naturalHeight,
          };
          backgroundImageName = file.name || 'Imagen';
          URL.revokeObjectURL(url);
          backgroundImageUrl = null;
          updateBackgroundImageControl();
          requestImmediateRender();
        };
        img.onerror = () => {
          URL.revokeObjectURL(url);
          backgroundImageUrl = null;
          backgroundImage = null;
          backgroundImageName = '';
          updateBackgroundImageControl();
        };
        img.src = url;
      };

      selectBgButton.addEventListener('click', () => bgImageInput.click());
      clearBgButton.addEventListener('click', () => {
        if (backgroundImageUrl) {
          URL.revokeObjectURL(backgroundImageUrl);
          backgroundImageUrl = null;
        }
        backgroundImage = null;
        backgroundImageName = '';
        updateBackgroundImageControl();
        requestImmediateRender();
      });
      bgImageInput.addEventListener('change', (e) => {
        const file = e.target.files && e.target.files[0];
        if (file) {
          loadBackgroundImageFromFile(file);
        }
        e.target.value = '';
      });

      bgImageButtons.appendChild(selectBgButton);
      bgImageButtons.appendChild(clearBgButton);
      bgImageItem.appendChild(bgImageLabel);
      bgImageItem.appendChild(bgImageButtons);
      bgImageItem.appendChild(bgImageInfo);
      bgImageItem.appendChild(bgImageInput);
      appendToGlobalSettings(bgImageItem);

      const bgOpacityItem = document.createElement('div');
      bgOpacityItem.className = 'dev-control family-config-group';
      const bgOpacityLabel = document.createElement('label');
      bgOpacityLabel.textContent = 'Opacidad imagen (%):';
      const bgOpacityInput = document.createElement('input');
      bgOpacityInput.type = 'number';
      bgOpacityInput.min = '0';
      bgOpacityInput.max = '100';
      bgOpacityInput.step = '1';
      const bgOpacityHint = document.createElement('span');
      bgOpacityHint.className = 'control-hint';

      const updateBackgroundOpacityControl = () => {
        const value = Math.round(backgroundImageOpacity * 100);
        bgOpacityInput.value = String(value);
        bgOpacityHint.textContent = `${value}%`;
      };

      bgOpacityInput.addEventListener('change', () => {
        let value = parseFloat(bgOpacityInput.value);
        if (!isFinite(value)) {
          updateBackgroundOpacityControl();
          return;
        }
        value = Math.max(0, Math.min(100, value));
        backgroundImageOpacity = value / 100;
        updateBackgroundOpacityControl();
        requestImmediateRender();
      });

      bgOpacityItem.appendChild(bgOpacityLabel);
      bgOpacityItem.appendChild(bgOpacityInput);
      bgOpacityItem.appendChild(bgOpacityHint);
      appendToGlobalSettings(bgOpacityItem);

      updateBackgroundImageControl();
      updateBackgroundOpacityControl();

      const instSection = document.createElement('div');
      instSection.className = 'inst-section';
      const instTitle = document.createElement('h4');
      instTitle.textContent = 'Instrumentos activos';
      instSection.appendChild(instTitle);
      const instBtnWrap = document.createElement('div');
      instBtnWrap.className = 'inst-button-row';
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
        item.className = 'family-config-item family-checkbox-item';
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
      instrumentScopeSection.appendChild(instSection);

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

      const instrumentConfig = document.createElement('div');
      instrumentConfig.className = 'inst-config-section';
      const instrumentConfigTitle = document.createElement('h4');
      instrumentConfigTitle.textContent = 'Personalización de instrumento';
      instrumentConfig.appendChild(instrumentConfigTitle);

      const instrumentSelectControl = document.createElement('div');
      instrumentSelectControl.className = 'family-config-item family-config-group';
      const instrumentSelectLabel = document.createElement('label');
      instrumentSelectLabel.textContent = 'Instrumento:';
      instrumentSelectLabel.setAttribute('for', 'instrument-custom-select');
      const instrumentSelect = document.createElement('select');
      instrumentSelect.id = 'instrument-custom-select';
      const instrumentPlaceholder = document.createElement('option');
      instrumentPlaceholder.value = '';
      instrumentPlaceholder.textContent = 'Selecciona un instrumento';
      instrumentSelect.appendChild(instrumentPlaceholder);
      currentTracks.forEach((t) => {
        const option = document.createElement('option');
        option.value = t.name;
        option.textContent = t.name;
        instrumentSelect.appendChild(option);
      });
      instrumentSelectControl.appendChild(instrumentSelectLabel);
      instrumentSelectControl.appendChild(instrumentSelect);
      instrumentConfig.appendChild(instrumentSelectControl);

      const instrumentFamilyControl = document.createElement('div');
      instrumentFamilyControl.className = 'family-config-item family-config-group';
      const instrumentFamilyLabel = document.createElement('label');
      instrumentFamilyLabel.textContent = 'Familia destino:';
      const instrumentFamilySelect = createInstrumentFamilySelector();
      const instrumentFamilyHint = document.createElement('span');
      instrumentFamilyHint.className = 'control-hint';
      instrumentFamilyControl.appendChild(instrumentFamilyLabel);
      instrumentFamilyControl.appendChild(instrumentFamilySelect);
      instrumentFamilyControl.appendChild(instrumentFamilyHint);
      instrumentConfig.appendChild(instrumentFamilyControl);

      const instrumentColorControl = document.createElement('div');
      instrumentColorControl.className = 'family-config-item family-config-group';
      const instrumentColorLabel = document.createElement('label');
      instrumentColorLabel.textContent = 'Color del instrumento:';
      const instrumentColorPalette = document.createElement('div');
      instrumentColorPalette.className = 'color-palette';
      instrumentColorPalette.setAttribute('role', 'group');
      instrumentColorPalette.setAttribute('aria-label', 'Colores por instrumento');
      const instrumentColorHint = document.createElement('span');
      instrumentColorHint.className = 'control-hint';
      const instrumentSwatches = [];
      const applyInstrumentColor = (hex) => {
        if (typeof hex !== 'string') return;
        const trackName = instrumentSelect.value;
        if (!trackName) return;
        setInstrumentCustomization(
          trackName,
          { color: hex },
          currentTracks,
          notes,
          getEditStartTime(),
        );
        requestImmediateRender();
        updateInstrumentColorControl();
      };
      const instrumentPaletteColors = getToneShiftedPalette();
      instrumentPaletteColors.forEach((hex, index) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'color-swatch';
        swatch.dataset.index = String(index);
        swatch.dataset.color = hex.toLowerCase();
        swatch.style.setProperty('--swatch-color', hex);
        swatch.setAttribute('aria-label', `Color ${hex.toUpperCase()}`);
        swatch.title = hex.toUpperCase();
        swatch.setAttribute('aria-pressed', 'false');
        swatch.addEventListener('click', () => applyInstrumentColor(swatch.dataset.color));
        instrumentColorPalette.appendChild(swatch);
        instrumentSwatches.push(swatch);
      });
      const instrumentCustomPreview = document.createElement('div');
      instrumentCustomPreview.className = 'color-swatch custom-preview';
      instrumentCustomPreview.setAttribute('aria-hidden', 'true');
      instrumentCustomPreview.title = 'Color personalizado';
      instrumentColorPalette.appendChild(instrumentCustomPreview);
      const refreshInstrumentPaletteColors = () => {
        const palette = getToneShiftedPalette();
        instrumentSwatches.forEach((swatch, idx) => {
          const colorHex = palette[idx % palette.length];
          swatch.dataset.color = colorHex.toLowerCase();
          swatch.style.setProperty('--swatch-color', colorHex);
          swatch.title = colorHex.toUpperCase();
          swatch.setAttribute('aria-label', `Color ${colorHex.toUpperCase()}`);
        });
      };
      paletteUpdaters.push(refreshInstrumentPaletteColors);
      instrumentColorControl.appendChild(instrumentColorLabel);
      instrumentColorControl.appendChild(instrumentColorPalette);
      instrumentColorControl.appendChild(instrumentColorHint);
      instrumentConfig.appendChild(instrumentColorControl);

      const instrumentShapeControl = document.createElement('div');
      instrumentShapeControl.className = 'family-config-item family-config-group';
      const instrumentShapeLabel = document.createElement('label');
      instrumentShapeLabel.textContent = 'Figura del instrumento:';
      const instrumentShapeSelect = document.createElement('select');
      SHAPE_OPTIONS.forEach((opt) => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        instrumentShapeSelect.appendChild(option);
      });
      const instrumentShapeHint = document.createElement('span');
      instrumentShapeHint.className = 'control-hint';
      instrumentShapeControl.appendChild(instrumentShapeLabel);
      instrumentShapeControl.appendChild(instrumentShapeSelect);
      instrumentShapeControl.appendChild(instrumentShapeHint);
      instrumentConfig.appendChild(instrumentShapeControl);

      const instrumentOutlineControl = document.createElement('div');
      instrumentOutlineControl.className = 'family-config-item family-config-group instrument-outline-control';

      const instrumentOutlineHeader = document.createElement('div');
      instrumentOutlineHeader.className = 'outline-row instrument-outline-header';
      const instrumentOutlineToggleLabel = document.createElement('label');
      instrumentOutlineToggleLabel.className = 'outline-toggle-label';
      const instrumentOutlineToggle = document.createElement('input');
      instrumentOutlineToggle.type = 'checkbox';
      instrumentOutlineToggleLabel.appendChild(instrumentOutlineToggle);
      instrumentOutlineToggleLabel.appendChild(document.createTextNode(' Contorno activo'));
      const instrumentOutlineStatus = document.createElement('span');
      instrumentOutlineStatus.className = 'control-hint';
      instrumentOutlineHeader.appendChild(instrumentOutlineToggleLabel);
      instrumentOutlineHeader.appendChild(instrumentOutlineStatus);
      instrumentOutlineControl.appendChild(instrumentOutlineHeader);

      const instrumentOutlineModeRow = document.createElement('div');
      instrumentOutlineModeRow.className = 'outline-row';
      const instrumentOutlineModeLabel = document.createElement('label');
      instrumentOutlineModeLabel.textContent = 'Modo:';
      const instrumentOutlineModeSelect = document.createElement('select');
      OUTLINE_MODES.forEach((mode) => {
        const option = document.createElement('option');
        option.value = mode;
        option.textContent = OUTLINE_MODE_LABELS[mode] || mode;
        instrumentOutlineModeSelect.appendChild(option);
      });
      const instrumentOutlineModeHint = document.createElement('span');
      instrumentOutlineModeHint.className = 'control-hint';
      instrumentOutlineModeRow.appendChild(instrumentOutlineModeLabel);
      instrumentOutlineModeRow.appendChild(instrumentOutlineModeSelect);
      instrumentOutlineModeRow.appendChild(instrumentOutlineModeHint);
      instrumentOutlineControl.appendChild(instrumentOutlineModeRow);

      const instrumentOutlineWidthRow = document.createElement('div');
      instrumentOutlineWidthRow.className = 'outline-row';
      const instrumentOutlineWidthLabel = document.createElement('label');
      instrumentOutlineWidthLabel.textContent = 'Grosor (px):';
      const instrumentOutlineWidthInput = document.createElement('input');
      instrumentOutlineWidthInput.type = 'number';
      instrumentOutlineWidthInput.step = '0.1';
      instrumentOutlineWidthInput.min = '0.25';
      instrumentOutlineWidthInput.max = '40';
      const instrumentOutlineWidthHint = document.createElement('span');
      instrumentOutlineWidthHint.className = 'control-hint';
      instrumentOutlineWidthRow.appendChild(instrumentOutlineWidthLabel);
      instrumentOutlineWidthRow.appendChild(instrumentOutlineWidthInput);
      instrumentOutlineWidthRow.appendChild(instrumentOutlineWidthHint);
      instrumentOutlineControl.appendChild(instrumentOutlineWidthRow);

      const instrumentOutlineOpacityRow = document.createElement('div');
      instrumentOutlineOpacityRow.className = 'outline-row';
      const instrumentOutlineOpacityLabel = document.createElement('label');
      instrumentOutlineOpacityLabel.textContent = 'Opacidad (%):';
      const instrumentOutlineOpacityInput = document.createElement('input');
      instrumentOutlineOpacityInput.type = 'number';
      instrumentOutlineOpacityInput.min = '0';
      instrumentOutlineOpacityInput.max = '100';
      instrumentOutlineOpacityInput.step = '1';
      const instrumentOutlineOpacityHint = document.createElement('span');
      instrumentOutlineOpacityHint.className = 'control-hint';
      instrumentOutlineOpacityRow.appendChild(instrumentOutlineOpacityLabel);
      instrumentOutlineOpacityRow.appendChild(instrumentOutlineOpacityInput);
      instrumentOutlineOpacityRow.appendChild(instrumentOutlineOpacityHint);
      instrumentOutlineControl.appendChild(instrumentOutlineOpacityRow);

      const instrumentOutlineColorRow = document.createElement('div');
      instrumentOutlineColorRow.className = 'outline-row outline-color-row';
      const instrumentOutlineColorLabel = document.createElement('label');
      instrumentOutlineColorLabel.textContent = 'Color del contorno:';
      const instrumentOutlineColorInput = document.createElement('input');
      instrumentOutlineColorInput.type = 'color';
      instrumentOutlineColorInput.value = '#ffffff';
      const instrumentOutlineColorAutoLabel = document.createElement('label');
      instrumentOutlineColorAutoLabel.className = 'outline-color-auto';
      const instrumentOutlineColorAuto = document.createElement('input');
      instrumentOutlineColorAuto.type = 'checkbox';
      instrumentOutlineColorAuto.checked = true;
      instrumentOutlineColorAutoLabel.appendChild(instrumentOutlineColorAuto);
      instrumentOutlineColorAutoLabel.appendChild(document.createTextNode(' Usar color de la figura'));
      const instrumentOutlineColorHint = document.createElement('span');
      instrumentOutlineColorHint.className = 'control-hint';
      instrumentOutlineColorRow.appendChild(instrumentOutlineColorLabel);
      instrumentOutlineColorRow.appendChild(instrumentOutlineColorInput);
      instrumentOutlineColorRow.appendChild(instrumentOutlineColorAutoLabel);
      instrumentOutlineColorRow.appendChild(instrumentOutlineColorHint);
      instrumentOutlineControl.appendChild(instrumentOutlineColorRow);

      instrumentConfig.appendChild(instrumentOutlineControl);

      const applyInstrumentOutlineUpdate = (updates) => {
        const trackName = instrumentSelect.value;
        if (!trackName) return;
        setInstrumentCustomization(
          trackName,
          { outline: updates },
          currentTracks,
          notes,
          getEditStartTime(),
        );
        requestImmediateRender();
        updateInstrumentColorControl();
      };

      instrumentOutlineToggle.addEventListener('change', () => {
        applyInstrumentOutlineUpdate({ enabled: instrumentOutlineToggle.checked });
      });

      instrumentOutlineModeSelect.addEventListener('change', () => {
        const mode = instrumentOutlineModeSelect.value;
        if (!mode || !OUTLINE_MODES.includes(mode)) return;
        applyInstrumentOutlineUpdate({ mode });
      });

      instrumentOutlineWidthInput.addEventListener('change', () => {
        const raw = parseFloat(instrumentOutlineWidthInput.value);
        if (!Number.isFinite(raw)) {
          updateInstrumentColorControl();
          return;
        }
        const clamped = Math.max(0.25, Math.min(40, raw));
        const rounded = Math.round(clamped * 10) / 10;
        instrumentOutlineWidthInput.value = String(rounded);
        applyInstrumentOutlineUpdate({ width: rounded });
      });

      instrumentOutlineOpacityInput.addEventListener('change', () => {
        const raw = parseFloat(instrumentOutlineOpacityInput.value);
        if (!Number.isFinite(raw)) {
          updateInstrumentColorControl();
          return;
        }
        const clamped = Math.max(0, Math.min(100, raw));
        instrumentOutlineOpacityInput.value = String(Math.round(clamped));
        applyInstrumentOutlineUpdate({ opacity: clamp(clamped / 100, 0, 1) });
      });

      instrumentOutlineColorInput.addEventListener('input', () => {
        if (instrumentOutlineColorAuto.checked) return;
        const hex = instrumentOutlineColorInput.value;
        if (typeof hex !== 'string') return;
        applyInstrumentOutlineUpdate({ color: hex });
      });

      instrumentOutlineColorAuto.addEventListener('change', () => {
        if (instrumentOutlineColorAuto.checked) {
          instrumentOutlineColorInput.disabled = true;
          applyInstrumentOutlineUpdate({ color: null });
        } else {
          instrumentOutlineColorInput.disabled = false;
          applyInstrumentOutlineUpdate({ color: instrumentOutlineColorInput.value || '#ffffff' });
        }
      });

      const instrumentResetControl = document.createElement('div');
      instrumentResetControl.className = 'family-config-item family-config-group';
      const instrumentResetBtn = document.createElement('button');
      instrumentResetBtn.type = 'button';
      instrumentResetBtn.textContent = 'Restablecer instrumento';
      instrumentResetControl.appendChild(instrumentResetBtn);
      instrumentConfig.appendChild(instrumentResetControl);

      const setInstrumentControlsEnabled = (enabled) => {
        const disabled = !enabled;
        instrumentFamilySelect.disabled = disabled;
        instrumentShapeSelect.disabled = disabled;
        instrumentResetBtn.disabled = disabled;
        instrumentColorPalette.classList.toggle('palette-disabled', disabled);
        instrumentSwatches.forEach((swatch) => {
          swatch.disabled = disabled;
        });
        instrumentOutlineToggle.disabled = disabled;
        instrumentOutlineModeSelect.disabled = disabled;
        instrumentOutlineWidthInput.disabled = disabled;
        instrumentOutlineOpacityInput.disabled = disabled;
        instrumentOutlineColorAuto.disabled = disabled;
        instrumentOutlineColorInput.disabled = disabled || instrumentOutlineColorAuto.checked;
      };

      instrumentSelect.addEventListener('change', () => {
        updateInstrumentColorControl();
        syncFamilyTargetWithInstrument();
      });

      instrumentFamilySelect.addEventListener('change', () => {
        const trackName = instrumentSelect.value;
        if (!trackName) return;
        const selectedFamily = instrumentFamilySelect.value;
        const fromTime = getEditStartTime();
        updateTrackFamily(trackName, selectedFamily, { fromTime });
        if (selectedFamily) {
          assignedFamilies[trackName] = selectedFamily;
        } else {
          delete assignedFamilies[trackName];
        }
        saveAssignments();
        requestImmediateRender();
        updateInstrumentColorControl();
        updateColorControl();
        syncFamilyTargetWithInstrument();
      });

      instrumentShapeSelect.addEventListener('change', () => {
        const trackName = instrumentSelect.value;
        if (!trackName) return;
        const shape = instrumentShapeSelect.value;
        if (!shape) return;
        setInstrumentCustomization(
          trackName,
          { shape },
          currentTracks,
          notes,
          getEditStartTime(),
        );
        requestImmediateRender();
        updateInstrumentColorControl();
      });

      instrumentResetBtn.addEventListener('click', () => {
        const trackName = instrumentSelect.value;
        if (!trackName) return;
        clearInstrumentCustomization(
          trackName,
          currentTracks,
          notes,
          getEditStartTime(),
        );
        requestImmediateRender();
        updateInstrumentColorControl();
        updateColorControl();
      });

      updateInstrumentColorControl = () => {
        const trackName = instrumentSelect.value;
        if (!trackName) {
          setInstrumentControlsEnabled(false);
          instrumentColorHint.textContent = 'Selecciona un instrumento';
          instrumentColorHint.classList.add('hint-active');
          instrumentCustomPreview.classList.remove('visible');
          instrumentShapeHint.textContent = '';
          instrumentShapeHint.classList.add('hint-active');
          instrumentFamilyHint.textContent = '';
          instrumentFamilyHint.classList.add('hint-active');
          instrumentSwatches.forEach((swatch) => {
            swatch.classList.remove('selected');
            swatch.setAttribute('aria-pressed', 'false');
          });
          instrumentOutlineToggle.checked = false;
          instrumentOutlineStatus.textContent = 'Selecciona un instrumento';
          instrumentOutlineStatus.classList.add('hint-active');
          instrumentOutlineModeSelect.value = OUTLINE_MODES[0] || 'full';
          instrumentOutlineModeHint.textContent = '';
          instrumentOutlineModeHint.classList.add('hint-active');
          instrumentOutlineWidthInput.value = '0';
          instrumentOutlineWidthHint.textContent = '';
          instrumentOutlineWidthHint.classList.add('hint-active');
          instrumentOutlineOpacityInput.value = '0';
          instrumentOutlineOpacityHint.textContent = '';
          instrumentOutlineOpacityHint.classList.add('hint-active');
          instrumentOutlineColorAuto.checked = true;
          instrumentOutlineColorInput.value = '#ffffff';
          instrumentOutlineColorHint.textContent = '';
          instrumentOutlineColorHint.classList.add('hint-active');
          return;
        }
        setInstrumentControlsEnabled(true);
        const track = currentTracks.find((t) => t.name === trackName);
        const override = instrumentCustomizations[trackName] || {};
        const assignedFamily = assignedFamilies[trackName] || '';
        const detectedFamily = track ? track.detectedFamily || track.family : '';
        if (instrumentFamilySelect.value !== (assignedFamily || '')) {
          instrumentFamilySelect.value = assignedFamily || '';
        }
        if (assignedFamily) {
          instrumentFamilyHint.textContent = `Asignada: ${assignedFamily}`;
          instrumentFamilyHint.classList.remove('hint-active');
        } else if (detectedFamily) {
          instrumentFamilyHint.textContent = `Detectada: ${detectedFamily}`;
          instrumentFamilyHint.classList.add('hint-active');
        } else {
          instrumentFamilyHint.textContent = '';
          instrumentFamilyHint.classList.add('hint-active');
        }
        let color = override.color;
        if (!color && track) {
          color = track.color;
        }
        if (!color) {
          const preset = track
            ? FAMILY_PRESETS[track.family] || FAMILY_DEFAULTS[track.family]
            : null;
          color = preset ? preset.color : '#ffa500';
        }
        const normalized = (color || '#ffa500').toLowerCase();
        let matched = false;
        instrumentSwatches.forEach((swatch) => {
          const isMatch = swatch.dataset.color === normalized;
          swatch.classList.toggle('selected', isMatch);
          swatch.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
          if (isMatch) matched = true;
        });
        if (matched) {
          instrumentCustomPreview.classList.remove('visible');
          instrumentColorHint.textContent = color.toUpperCase();
          instrumentColorHint.classList.remove('hint-active');
        } else {
          instrumentCustomPreview.style.setProperty('--swatch-color', color);
          instrumentCustomPreview.classList.add('visible');
          instrumentColorHint.textContent = `Personalizado: ${color.toUpperCase()}`;
          instrumentColorHint.classList.remove('hint-active');
        }
        if (track) {
          const currentShape = override.shape || track.shape;
          if (currentShape) {
            instrumentShapeSelect.value = currentShape;
          }
          if (override.shape) {
            instrumentShapeHint.textContent = 'Figura personalizada';
            instrumentShapeHint.classList.remove('hint-active');
          } else {
            instrumentShapeHint.textContent = 'Usa figura de familia';
            instrumentShapeHint.classList.add('hint-active');
          }
        } else {
          instrumentShapeHint.textContent = '';
          instrumentShapeHint.classList.add('hint-active');
        }

        const outlineBase = track ? getOutlineSettings(track.family) : getOutlineSettings();
        const outlineOverride = override.outline || null;
        const effectiveOutline = outlineOverride
          ? mergeOutlineConfig(outlineBase, outlineOverride)
          : outlineBase;
        const outlineHas = (key) =>
          !!(outlineOverride && Object.prototype.hasOwnProperty.call(outlineOverride, key));
        const hasOutlineOverride = outlineOverride && Object.keys(outlineOverride).length > 0;
        if (hasOutlineOverride) {
          instrumentOutlineStatus.textContent = 'Contorno personalizado';
          instrumentOutlineStatus.classList.remove('hint-active');
        } else {
          instrumentOutlineStatus.textContent = 'Usa configuración de familia';
          instrumentOutlineStatus.classList.add('hint-active');
        }
        instrumentOutlineToggle.checked = !!effectiveOutline.enabled;
        if (instrumentOutlineModeSelect.querySelector(`option[value="${effectiveOutline.mode}"]`)) {
          instrumentOutlineModeSelect.value = effectiveOutline.mode;
        }
        if (outlineHas('mode')) {
          const label = OUTLINE_MODE_LABELS[instrumentOutlineModeSelect.value] || instrumentOutlineModeSelect.value;
          instrumentOutlineModeHint.textContent = `Personalizado: ${label}`;
          instrumentOutlineModeHint.classList.remove('hint-active');
        } else {
          instrumentOutlineModeHint.textContent = 'Usa modo de familia';
          instrumentOutlineModeHint.classList.add('hint-active');
        }
        const widthValue = Math.round((effectiveOutline.width || 0) * 10) / 10;
        instrumentOutlineWidthInput.value = String(widthValue);
        if (outlineHas('width')) {
          instrumentOutlineWidthHint.textContent = `${widthValue.toFixed(1)} px (personalizado)`;
          instrumentOutlineWidthHint.classList.remove('hint-active');
        } else {
          instrumentOutlineWidthHint.textContent = `${widthValue.toFixed(1)} px de familia`;
          instrumentOutlineWidthHint.classList.add('hint-active');
        }
        const opacityValue = Math.round((effectiveOutline.opacity || 0) * 100);
        instrumentOutlineOpacityInput.value = String(opacityValue);
        if (outlineHas('opacity')) {
          instrumentOutlineOpacityHint.textContent = `${opacityValue}% (personalizado)`;
          instrumentOutlineOpacityHint.classList.remove('hint-active');
        } else {
          instrumentOutlineOpacityHint.textContent = `${opacityValue}% de familia`;
          instrumentOutlineOpacityHint.classList.add('hint-active');
        }
        const effectiveColor = effectiveOutline.color || null;
        instrumentOutlineColorAuto.checked = effectiveColor === null;
        instrumentOutlineColorInput.disabled = instrumentOutlineColorAuto.checked;
        instrumentOutlineColorInput.value = effectiveColor || '#ffffff';
        if (outlineHas('color')) {
          if (outlineOverride.color === null) {
            instrumentOutlineColorHint.textContent = 'Forzado al color de la figura';
            instrumentOutlineColorHint.classList.remove('hint-active');
          } else {
            instrumentOutlineColorHint.textContent = `Personalizado: ${effectiveColor.toUpperCase()}`;
            instrumentOutlineColorHint.classList.remove('hint-active');
          }
        } else if (effectiveColor) {
          instrumentOutlineColorHint.textContent = `${effectiveColor.toUpperCase()} (familia)`;
          instrumentOutlineColorHint.classList.add('hint-active');
        } else {
          instrumentOutlineColorHint.textContent = 'Color de la figura (familia)';
          instrumentOutlineColorHint.classList.add('hint-active');
        }
      };

      instrumentScopeSection.appendChild(instrumentConfig);

      const familyTargetSelect = createFamilySelector();
      familyTargetSelect.id = 'family-target-select';
      familyTargetSelect.setAttribute('role', 'group');
      const dispatchFamilyTargetChange = () => {
        let evt = null;
        if (typeof window !== 'undefined' && typeof window.Event === 'function') {
          evt = new window.Event('change', { bubbles: true });
        } else if (typeof Event === 'function') {
          try {
            evt = new Event('change');
          } catch (err) {
            evt = null;
          }
        }
        if (!evt && typeof document !== 'undefined' && document.createEvent) {
          evt = document.createEvent('Event');
          evt.initEvent('change', true, true);
        }
        if (evt) {
          familyTargetSelect.dispatchEvent(evt);
        }
      };

      const syncFamilyTargetWithInstrument = () => {
        const scope = scopeSelect.value || 'familia';
        if (scope === 'global') {
          familyTargetSelect.value = '';
          dispatchFamilyTargetChange();
          return;
        }
        if (scope === 'familia' || scope === 'instrumento') {
          const selectedInstrument =
            instrumentSelect && instrumentSelect.value ? instrumentSelect.value : '';
          if (!selectedInstrument) {
            familyTargetSelect.value = '';
            dispatchFamilyTargetChange();
            return;
          }
          const track = currentTracks.find((t) => t.name === selectedInstrument);
          const assigned = assignedFamilies[selectedInstrument];
          const detected = track ? track.detectedFamily || track.family : '';
          const targetFamily = assigned || detected || '';
          familyTargetSelect.value = targetFamily;
          dispatchFamilyTargetChange();
        }
      };

      const toneControl = document.createElement('div');
      toneControl.className = 'family-config-item family-config-group';
      const toneLabel = document.createElement('label');
      toneLabel.textContent = 'Tono (°):';
      const toneSlider = document.createElement('input');
      toneSlider.type = 'range';
      toneSlider.min = '-180';
      toneSlider.max = '180';
      toneSlider.step = '1';
      toneSlider.value = String(getColorToneShift());
      const toneHint = document.createElement('span');
      toneHint.className = 'control-hint';

      const updateToneHint = () => {
        toneHint.textContent = `${getColorToneShift()}°`;
      };

      toneSlider.addEventListener('input', () => {
        const value = parseInt(toneSlider.value, 10);
        setColorToneShiftValue(Number.isFinite(value) ? value : 0);
        paletteUpdaters.forEach((fn) => fn());
        updateColorControl();
        updateInstrumentColorControl();
        updateToneHint();
      });

      updateToneHint();
      toneControl.appendChild(toneLabel);
      toneControl.appendChild(toneSlider);
      toneControl.appendChild(toneHint);
      familyScopeSection.appendChild(toneControl);

      const colorControl = document.createElement('div');
      colorControl.className = 'family-config-item family-config-group';
      const colorLabel = document.createElement('label');
      colorLabel.textContent = 'Color principal:';
      const colorPalette = document.createElement('div');
      colorPalette.className = 'color-palette';
      colorPalette.setAttribute('role', 'group');
      colorPalette.setAttribute('aria-label', 'Selección rápida de color');
      const colorHint = document.createElement('span');
      colorHint.className = 'control-hint';

      const swatches = [];

      const applyColor = (hex) => {
        if (typeof hex !== 'string') return;
        const targetFamilies = familiesFromSelection(familyTargetSelect.value);
        targetFamilies.forEach((family) =>
          setFamilyCustomization(
            family,
            { color: hex },
            currentTracks,
            notes,
            getEditStartTime(),
          ),
        );
        renderFrame(lastTime);
        updateColorControl();
        updateInstrumentColorControl();
      };

      const initialPalette = getToneShiftedPalette();
      initialPalette.forEach((hex, index) => {
        const swatch = document.createElement('button');
        swatch.type = 'button';
        swatch.className = 'color-swatch';
        swatch.dataset.index = String(index);
        swatch.dataset.color = hex.toLowerCase();
        swatch.style.setProperty('--swatch-color', hex);
        swatch.setAttribute('aria-label', `Color ${hex.toUpperCase()}`);
        swatch.title = hex.toUpperCase();
        swatch.setAttribute('aria-pressed', 'false');
        swatch.addEventListener('click', () => applyColor(swatch.dataset.color));
        colorPalette.appendChild(swatch);
        swatches.push(swatch);
      });

      const refreshPaletteColors = () => {
        const palette = getToneShiftedPalette();
        swatches.forEach((swatch, idx) => {
          const colorHex = palette[idx % palette.length];
          swatch.dataset.color = colorHex.toLowerCase();
          swatch.style.setProperty('--swatch-color', colorHex);
          swatch.title = colorHex.toUpperCase();
          swatch.setAttribute('aria-label', `Color ${colorHex.toUpperCase()}`);
        });
      };
      paletteUpdaters.push(refreshPaletteColors);

      const customPreview = document.createElement('div');
      customPreview.className = 'color-swatch custom-preview';
      customPreview.setAttribute('aria-hidden', 'true');
      customPreview.title = 'Color personalizado';
      colorPalette.appendChild(customPreview);

      const updateColorControl = () => {
        const { color, mixed } = getColorState(familyTargetSelect.value);
        const normalized = color.toLowerCase();
        let matched = false;
        swatches.forEach((swatch) => {
          const isMatch = !mixed && swatch.dataset.color === normalized;
          swatch.classList.toggle('selected', isMatch);
          swatch.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
          if (isMatch) matched = true;
        });
        if (!mixed && !matched) {
          customPreview.style.setProperty('--swatch-color', color);
          customPreview.classList.add('visible');
          colorHint.textContent = `Personalizado: ${color.toUpperCase()}`;
          colorHint.classList.remove('hint-active');
        } else {
          customPreview.classList.remove('visible');
          colorHint.textContent = mixed ? 'Valores variados' : color.toUpperCase();
          colorHint.classList.toggle('hint-active', mixed);
        }
      };

      colorControl.appendChild(colorLabel);
      colorControl.appendChild(colorPalette);
      colorControl.appendChild(colorHint);
      familyScopeSection.appendChild(colorControl);

      const secondaryControl = document.createElement('div');
      secondaryControl.className = 'family-config-item family-config-group';
      const secondaryLabel = document.createElement('label');
      secondaryLabel.textContent = 'Color secundario:';
      const secondaryInput = document.createElement('input');
      secondaryInput.type = 'color';
      secondaryInput.value = '#000000';
      const secondaryHint = document.createElement('span');
      secondaryHint.className = 'control-hint';

      updateSecondaryColorControl = () => {
        const { color, mixed } = getSecondaryColorState(familyTargetSelect.value);
        if (mixed) {
          secondaryInput.value = '#000000';
          secondaryHint.textContent = 'Valores variados';
          secondaryHint.classList.add('hint-active');
        } else {
          secondaryInput.value = color;
          secondaryHint.textContent = color.toUpperCase();
          secondaryHint.classList.remove('hint-active');
        }
      };

      secondaryInput.addEventListener('input', () => {
        const hex = secondaryInput.value;
        if (typeof hex !== 'string') return;
        const targetFamilies = familiesFromSelection(familyTargetSelect.value);
        targetFamilies.forEach((family) =>
          setFamilyCustomization(
            family,
            { secondaryColor: hex },
            currentTracks,
            notes,
            getEditStartTime(),
          ),
        );
        renderFrame(lastTime);
        updateSecondaryColorControl();
      });

      secondaryControl.appendChild(secondaryLabel);
      secondaryControl.appendChild(secondaryInput);
      secondaryControl.appendChild(secondaryHint);
      familyScopeSection.appendChild(secondaryControl);

      const shapeControl = document.createElement('div');
      shapeControl.className = 'family-config-item family-config-group';
      const shapeLabel = document.createElement('label');
      shapeLabel.textContent = 'Figura:';
      const shapeOptions = document.createElement('div');
      shapeOptions.className = 'shape-options';
      const shapeHint = document.createElement('span');
      shapeHint.className = 'control-hint';

      const shapeButtons = [];

      SHAPE_OPTIONS.forEach((opt) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'shape-option-button';
        button.dataset.value = opt.value;
        button.textContent = opt.label;
        button.setAttribute('aria-pressed', 'false');
        button.addEventListener('click', () => {
          if (button.disabled) return;
          const shape = button.dataset.value;
          familiesFromSelection(familyTargetSelect.value).forEach((family) =>
            setFamilyCustomization(
              family,
              { shape },
              currentTracks,
              notes,
              getEditStartTime(),
            ),
          );
          renderFrame(lastTime);
          updateShapeControl();
          updateParameterControls();
          updateInstrumentColorControl();
        });
        shapeOptions.appendChild(button);
        shapeButtons.push({ button, option: opt });
      });

      const updateShapeControl = () => {
        const { shape, mixed } = getShapeState(familyTargetSelect.value);
        const available = shapeButtons.find(({ button }) => button.dataset.value === shape);
        const fallback = shapeButtons[0] || null;
        const activeButton = !mixed && (available || fallback);
        const activeValue = activeButton ? activeButton.button.dataset.value : null;
        shapeButtons.forEach(({ button }) => {
          const isActive = !mixed && button.dataset.value === activeValue;
          button.classList.toggle('active', isActive);
          button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        });
        shapeOptions.classList.toggle('mixed', mixed);
        if (mixed) {
          shapeHint.textContent = 'Valores variados';
          shapeHint.classList.add('hint-active');
        } else {
          const option = (available || fallback)?.option;
          shapeHint.textContent = option ? option.label : '';
          shapeHint.classList.remove('hint-active');
        }
      };

      shapeControl.appendChild(shapeLabel);
      shapeControl.appendChild(shapeOptions);
      shapeControl.appendChild(shapeHint);
      familyScopeSection.appendChild(shapeControl);

      const heightControl = document.createElement('div');
      heightControl.className = 'family-config-item family-config-group';
      const heightLabel = document.createElement('label');
      heightLabel.textContent = 'Altura (%):';
      const heightInput = document.createElement('input');
      heightInput.type = 'number';
      heightInput.min = '10';
      heightInput.max = '300';
      heightInput.step = '1';
      const heightHint = document.createElement('span');
      heightHint.className = 'control-hint';

      updateHeightControl = () => {
        const { value, mixed } = getHeightState(familyTargetSelect.value);
        if (mixed) {
          heightInput.value = '';
          heightInput.placeholder = '—';
          heightHint.textContent = 'Valores variados';
          heightHint.classList.add('hint-active');
        } else {
          heightInput.placeholder = '';
          const rounded = Math.round(value);
          heightInput.value = String(rounded);
          heightHint.textContent = `${rounded}%`;
          heightHint.classList.remove('hint-active');
        }
      };

      heightInput.addEventListener('change', () => {
        let value = parseFloat(heightInput.value);
        if (!isFinite(value)) {
          updateHeightControl();
          return;
        }
        value = Math.max(10, Math.min(300, value));
        heightInput.value = String(Math.round(value));
        const target = familyTargetSelect.value;
        if (target) {
          setHeightScale(value / 100, target);
        } else {
          setHeightScale(value / 100);
        }
        requestImmediateRender();
        updateHeightControl();
      });

      heightControl.appendChild(heightLabel);
      heightControl.appendChild(heightInput);
      heightControl.appendChild(heightHint);
      familyScopeSection.appendChild(heightControl);

      const glowControl = document.createElement('div');
      glowControl.className = 'family-config-item family-config-group';
      const glowLabel = document.createElement('label');
      glowLabel.textContent = 'Glow (%):';
      const glowInput = document.createElement('input');
      glowInput.type = 'number';
      glowInput.min = '0';
      glowInput.max = '300';
      glowInput.step = '1';
      const glowHint = document.createElement('span');
      glowHint.className = 'control-hint';

      updateGlowControl = () => {
        const { value, mixed } = getGlowState(familyTargetSelect.value);
        if (mixed) {
          glowInput.value = '';
          glowInput.placeholder = '—';
          glowHint.textContent = 'Valores variados';
          glowHint.classList.add('hint-active');
        } else {
          glowInput.placeholder = '';
          const rounded = Math.round(value);
          glowInput.value = String(rounded);
          glowHint.textContent = `${rounded}%`;
          glowHint.classList.remove('hint-active');
        }
      };

      glowInput.addEventListener('change', () => {
        let value = parseFloat(glowInput.value);
        if (!isFinite(value)) {
          updateGlowControl();
          return;
        }
        value = Math.max(0, Math.min(300, value));
        glowInput.value = String(Math.round(value));
        const target = familyTargetSelect.value;
        if (target) {
          setGlowStrength(value / 100, target);
        } else {
          setGlowStrength(value / 100);
        }
        requestImmediateRender();
        updateGlowControl();
      });

      glowControl.appendChild(glowLabel);
      glowControl.appendChild(glowInput);
      glowControl.appendChild(glowHint);
      familyScopeSection.appendChild(glowControl);

      const bumpControl = document.createElement('div');
      bumpControl.className = 'family-config-item family-config-group';
      const bumpLabel = document.createElement('label');
      bumpLabel.textContent = 'Bump (%):';
      const bumpInput = document.createElement('input');
      bumpInput.type = 'number';
      bumpInput.min = '0';
      bumpInput.max = '300';
      bumpInput.step = '1';
      const bumpHint = document.createElement('span');
      bumpHint.className = 'control-hint';

      updateBumpControl = () => {
        const { value, mixed } = getBumpState(familyTargetSelect.value);
        if (mixed) {
          bumpInput.value = '';
          bumpInput.placeholder = '—';
          bumpHint.textContent = 'Valores variados';
          bumpHint.classList.add('hint-active');
        } else {
          bumpInput.placeholder = '';
          const rounded = Math.round(value);
          bumpInput.value = String(rounded);
          bumpHint.textContent = `${rounded}%`;
          bumpHint.classList.remove('hint-active');
        }
      };

      bumpInput.addEventListener('change', () => {
        let value = parseFloat(bumpInput.value);
        if (!isFinite(value)) {
          updateBumpControl();
          return;
        }
        value = Math.max(0, Math.min(300, value));
        bumpInput.value = String(Math.round(value));
        const target = familyTargetSelect.value;
        if (target) {
          setBumpControl(value / 100, target);
        } else {
          setBumpControl(value / 100);
        }
        requestImmediateRender();
        updateBumpControl();
      });

      bumpControl.appendChild(bumpLabel);
      bumpControl.appendChild(bumpInput);
      bumpControl.appendChild(bumpHint);
      familyScopeSection.appendChild(bumpControl);

      const outlineControl = document.createElement('div');
      outlineControl.className = 'family-config-item family-config-group outline-config';

      const outlineToggleLabel = document.createElement('label');
      outlineToggleLabel.className = 'outline-toggle-label';
      const outlineToggle = document.createElement('input');
      outlineToggle.type = 'checkbox';
      outlineToggleLabel.appendChild(outlineToggle);
      outlineToggleLabel.appendChild(document.createTextNode(' Contorno activo'));
      outlineControl.appendChild(outlineToggleLabel);

      const outlineModeControl = document.createElement('div');
      outlineModeControl.className = 'outline-row';
      const outlineModeLabel = document.createElement('label');
      outlineModeLabel.textContent = 'Modo:';
      const outlineModeSelect = document.createElement('select');
      OUTLINE_MODES.forEach((mode) => {
        const option = document.createElement('option');
        option.value = mode;
        option.textContent = OUTLINE_MODE_LABELS[mode] || mode;
        outlineModeSelect.appendChild(option);
      });
      const outlineModeHint = document.createElement('span');
      outlineModeHint.className = 'control-hint';
      outlineModeControl.appendChild(outlineModeLabel);
      outlineModeControl.appendChild(outlineModeSelect);
      outlineModeControl.appendChild(outlineModeHint);
      outlineControl.appendChild(outlineModeControl);

      const outlineWidthControl = document.createElement('div');
      outlineWidthControl.className = 'outline-row';
      const outlineWidthLabel = document.createElement('label');
      outlineWidthLabel.textContent = 'Grosor (px):';
      const outlineWidthInput = document.createElement('input');
      outlineWidthInput.type = 'number';
      outlineWidthInput.step = '0.1';
      outlineWidthInput.min = '0.25';
      outlineWidthInput.max = '40';
      const outlineWidthHint = document.createElement('span');
      outlineWidthHint.className = 'control-hint';
      outlineWidthControl.appendChild(outlineWidthLabel);
      outlineWidthControl.appendChild(outlineWidthInput);
      outlineWidthControl.appendChild(outlineWidthHint);
      outlineControl.appendChild(outlineWidthControl);

      const outlineOpacityControl = document.createElement('div');
      outlineOpacityControl.className = 'outline-row';
      const outlineOpacityLabel = document.createElement('label');
      outlineOpacityLabel.textContent = 'Opacidad (%):';
      const outlineOpacityInput = document.createElement('input');
      outlineOpacityInput.type = 'number';
      outlineOpacityInput.min = '0';
      outlineOpacityInput.max = '100';
      outlineOpacityInput.step = '1';
      const outlineOpacityHint = document.createElement('span');
      outlineOpacityHint.className = 'control-hint';
      outlineOpacityControl.appendChild(outlineOpacityLabel);
      outlineOpacityControl.appendChild(outlineOpacityInput);
      outlineOpacityControl.appendChild(outlineOpacityHint);
      outlineControl.appendChild(outlineOpacityControl);

      const outlineColorControl = document.createElement('div');
      outlineColorControl.className = 'outline-row outline-color-row';
      const outlineColorLabel = document.createElement('label');
      outlineColorLabel.textContent = 'Color del contorno:';
      const outlineColorInput = document.createElement('input');
      outlineColorInput.type = 'color';
      outlineColorInput.value = '#ffffff';
      const outlineColorAutoLabel = document.createElement('label');
      outlineColorAutoLabel.className = 'outline-color-auto';
      const outlineColorAuto = document.createElement('input');
      outlineColorAuto.type = 'checkbox';
      outlineColorAuto.checked = true;
      outlineColorAutoLabel.appendChild(outlineColorAuto);
      outlineColorAutoLabel.appendChild(document.createTextNode(' Usar color de la figura'));
      const outlineColorHint = document.createElement('span');
      outlineColorHint.className = 'control-hint';
      outlineColorControl.appendChild(outlineColorLabel);
      outlineColorControl.appendChild(outlineColorInput);
      outlineColorControl.appendChild(outlineColorAutoLabel);
      outlineColorControl.appendChild(outlineColorHint);
      outlineControl.appendChild(outlineColorControl);

      updateOutlineControl = () => {
        const target = familyTargetSelect.value;
        if (!target) {
          const settings = getOutlineSettings();
          outlineToggle.indeterminate = false;
          outlineToggle.checked = !!settings.enabled;
          outlineModeSelect.value = settings.mode;
          outlineModeHint.textContent = OUTLINE_MODE_LABELS[settings.mode] || settings.mode;
          outlineModeHint.classList.remove('hint-active');
          const widthValue = Math.round((settings.width || 0) * 10) / 10;
          outlineWidthInput.placeholder = '';
          outlineWidthInput.value = String(widthValue);
          outlineWidthHint.textContent = `${widthValue.toFixed(1)} px`;
          outlineWidthHint.classList.remove('hint-active');
          const opacityValue = Math.round((settings.opacity || 0) * 100);
          outlineOpacityInput.placeholder = '';
          outlineOpacityInput.value = String(opacityValue);
          outlineOpacityHint.textContent = `${opacityValue}%`;
          outlineOpacityHint.classList.remove('hint-active');
          const color = settings.color || null;
          outlineColorAuto.indeterminate = false;
          outlineColorAuto.checked = color === null;
          outlineColorInput.disabled = outlineColorAuto.checked;
          outlineColorInput.value = color || '#ffffff';
          if (color) {
            outlineColorHint.textContent = color.toUpperCase();
            outlineColorHint.classList.remove('hint-active');
          } else {
            outlineColorHint.textContent = 'Color de la figura';
            outlineColorHint.classList.add('hint-active');
          }
          return;
        }
        const families = familiesFromSelection(target);
        let enabledBase = null;
        let enabledMixed = false;
        let modeBase = null;
        let modeMixed = false;
        let widthBase = null;
        let widthMixed = false;
        let opacityBase = null;
        let opacityMixed = false;
        let colorBase = null;
        let colorMixed = false;
        let autoBase = null;
        let autoMixed = false;
        families.forEach((family) => {
          const settings = getOutlineSettings(family);
          const enabled = !!settings.enabled;
          if (enabledBase === null) enabledBase = enabled;
          else if (enabledBase !== enabled) enabledMixed = true;
          const mode = settings.mode;
          if (modeBase === null) modeBase = mode;
          else if (modeBase !== mode) modeMixed = true;
          const width = Math.round((settings.width || 0) * 10) / 10;
          if (widthBase === null) widthBase = width;
          else if (Math.abs(widthBase - width) > 0.001) widthMixed = true;
          const opacity = Math.round((settings.opacity || 0) * 100);
          if (opacityBase === null) opacityBase = opacity;
          else if (Math.abs(opacityBase - opacity) > 0.5) opacityMixed = true;
          const isAuto = settings.color === null;
          if (autoBase === null) autoBase = isAuto;
          else if (autoBase !== isAuto) autoMixed = true;
          if (!isAuto) {
            const normalized = (settings.color || '').toLowerCase();
            if (colorBase === null) colorBase = normalized;
            else if (colorBase !== normalized) colorMixed = true;
          }
        });
        outlineToggle.indeterminate = enabledMixed;
        outlineToggle.checked = enabledMixed ? !!enabledBase : !!enabledBase;
        const effectiveMode = modeMixed ? outlineModeSelect.value : modeBase || OUTLINE_MODES[0];
        if (outlineModeSelect.querySelector(`option[value="${effectiveMode}"]`)) {
          outlineModeSelect.value = effectiveMode;
        }
        outlineModeHint.textContent = modeMixed
          ? 'Valores variados'
          : OUTLINE_MODE_LABELS[outlineModeSelect.value] || outlineModeSelect.value;
        outlineModeHint.classList.toggle('hint-active', modeMixed);
        if (widthMixed) {
          outlineWidthInput.value = '';
          outlineWidthInput.placeholder = '—';
          outlineWidthHint.textContent = 'Valores variados';
          outlineWidthHint.classList.add('hint-active');
        } else {
          const value = widthBase ?? 3;
          outlineWidthInput.placeholder = '';
          outlineWidthInput.value = String(value);
          outlineWidthHint.textContent = `${Number(value).toFixed(1)} px`;
          outlineWidthHint.classList.remove('hint-active');
        }
        if (opacityMixed) {
          outlineOpacityInput.value = '';
          outlineOpacityInput.placeholder = '—';
          outlineOpacityHint.textContent = 'Valores variados';
          outlineOpacityHint.classList.add('hint-active');
        } else {
          const value = opacityBase ?? 0;
          outlineOpacityInput.placeholder = '';
          outlineOpacityInput.value = String(value);
          outlineOpacityHint.textContent = `${value}%`;
          outlineOpacityHint.classList.remove('hint-active');
        }
        const mixedColorState = colorMixed || autoMixed;
        outlineColorAuto.indeterminate = mixedColorState;
        outlineColorAuto.checked = mixedColorState ? false : !!autoBase;
        outlineColorInput.disabled = outlineColorAuto.checked || outlineColorAuto.indeterminate;
        if (mixedColorState) {
          outlineColorHint.textContent = 'Valores variados';
          outlineColorHint.classList.add('hint-active');
        } else if (outlineColorAuto.checked) {
          outlineColorHint.textContent = 'Color de la figura';
          outlineColorHint.classList.add('hint-active');
        } else {
          outlineColorInput.value = colorBase || '#ffffff';
          outlineColorHint.textContent = (colorBase || '#ffffff').toUpperCase();
          outlineColorHint.classList.remove('hint-active');
        }
      };

      const applyOutlineUpdate = (updates) => {
        const target = familyTargetSelect.value;
        if (!target) {
          setOutlineSettings(updates);
        } else {
          familiesFromSelection(target).forEach((family) => setOutlineSettings(updates, family));
        }
        requestImmediateRender();
        updateOutlineControl();
      };

      outlineToggle.addEventListener('change', () => {
        outlineToggle.indeterminate = false;
        applyOutlineUpdate({ enabled: outlineToggle.checked });
      });

      outlineModeSelect.addEventListener('change', () => {
        const mode = outlineModeSelect.value;
        if (!mode || !OUTLINE_MODES.includes(mode)) return;
        applyOutlineUpdate({ mode });
      });

      outlineWidthInput.addEventListener('change', () => {
        const raw = parseFloat(outlineWidthInput.value);
        if (!Number.isFinite(raw)) {
          updateOutlineControl();
          return;
        }
        const clamped = Math.max(0.25, Math.min(40, raw));
        const rounded = Math.round(clamped * 10) / 10;
        outlineWidthInput.value = String(rounded);
        applyOutlineUpdate({ width: rounded });
      });

      outlineOpacityInput.addEventListener('change', () => {
        const raw = parseFloat(outlineOpacityInput.value);
        if (!Number.isFinite(raw)) {
          updateOutlineControl();
          return;
        }
        const clamped = Math.max(0, Math.min(100, raw));
        outlineOpacityInput.value = String(Math.round(clamped));
        applyOutlineUpdate({ opacity: clamp(clamped / 100, 0, 1) });
      });

      outlineColorInput.addEventListener('input', () => {
        if (outlineColorAuto.checked || outlineColorAuto.indeterminate) return;
        const hex = outlineColorInput.value;
        if (typeof hex !== 'string') return;
        applyOutlineUpdate({ color: hex });
      });

      outlineColorAuto.addEventListener('change', () => {
        outlineColorAuto.indeterminate = false;
        if (outlineColorAuto.checked) {
          applyOutlineUpdate({ color: null });
        } else {
          applyOutlineUpdate({ color: outlineColorInput.value || '#ffffff' });
        }
      });

      familyScopeSection.appendChild(outlineControl);

      const extensionControl = document.createElement('div');
      extensionControl.className = 'family-config-item family-config-group';
      const extensionLabel = document.createElement('label');
      extensionLabel.className = 'extension-toggle-label';
      const extensionToggle = document.createElement('input');
      extensionToggle.type = 'checkbox';
      extensionToggle.className = 'extension-toggle-input';
      extensionLabel.appendChild(extensionToggle);
      extensionLabel.appendChild(document.createTextNode(' Extensión dinámica'));
      const extensionHint = document.createElement('span');
      extensionHint.className = 'control-hint';

      updateExtensionControl = () => {
        const target = familyTargetSelect.value;
        if (!target) {
          const stretchConfig = getShapeStretchConfig();
          const stretchableShapes = STRETCHABLE_SHAPES.filter(
            (shape) => stretchConfig[shape] !== false,
          );
          const hasStretchOverrides = Object.keys(getFamilyStretchConfig()).length > 0;
          if (stretchableShapes.length === 0) {
            extensionToggle.checked = false;
            extensionToggle.disabled = true;
            extensionToggle.indeterminate = false;
            extensionHint.textContent = hasStretchOverrides
              ? 'Extensión desactivada por configuraciones de familia'
              : 'Extensión desactivada en todas las figuras';
            extensionHint.classList.add('hint-active');
            return;
          }
          const config = getShapeExtensions();
          const values = stretchableShapes.map((shape) => config[shape] !== false);
          const allTrue = values.length > 0 && values.every(Boolean);
          const allFalse = values.every((val) => !val);
          const hasOverrides = Object.keys(getFamilyExtensionConfig()).length > 0;
          extensionToggle.disabled = false;
          extensionToggle.checked = allTrue;
          extensionToggle.indeterminate = hasOverrides || (!allTrue && !allFalse);
          if (hasOverrides) {
            extensionHint.textContent = 'Con personalizaciones por familia';
            extensionHint.classList.add('hint-active');
          } else {
            extensionHint.textContent = allTrue
              ? 'Activa en todas las figuras con extensión'
              : allFalse
              ? 'Desactivada globalmente'
              : 'Valores variados';
            extensionHint.classList.toggle('hint-active', !allTrue && !allFalse);
          }
        } else {
          extensionToggle.indeterminate = false;
          const shape = getEffectiveFamilyShape(target);
          if (!shape) {
            extensionToggle.checked = false;
            extensionToggle.disabled = true;
            extensionHint.textContent = 'Sin figura asociada';
            extensionHint.classList.add('hint-active');
          } else if (!isShapeExtendable(shape)) {
            extensionToggle.checked = false;
            extensionToggle.disabled = true;
            extensionHint.textContent = 'Extensión no disponible para esta figura';
            extensionHint.classList.add('hint-active');
          } else if (!isStretchEnabledForFamily(shape, target)) {
            extensionToggle.checked = false;
            extensionToggle.disabled = true;
            const override = getFamilyStretch(target);
            extensionHint.textContent =
              typeof override === 'boolean'
                ? 'Extensión desactivada para esta familia'
                : 'Extensión desactivada globalmente';
            extensionHint.classList.add('hint-active');
          } else {
            extensionToggle.disabled = false;
            const override = getFamilyExtension(target);
            const globalEnabled = getShapeExtension(shape);
            const enabled = isExtensionEnabledForFamily(shape, target);
            extensionToggle.checked = !!enabled;
            extensionHint.textContent =
              typeof override === 'boolean'
                ? override
                  ? 'Personalizado: activado'
                  : 'Personalizado: desactivado'
                : globalEnabled
                ? 'Usa valor global (activado)'
                : 'Usa valor global (desactivado)';
            extensionHint.classList.toggle('hint-active', typeof override !== 'boolean');
          }
        }
      };

      extensionToggle.addEventListener('change', () => {
        const target = familyTargetSelect.value;
        const enabled = extensionToggle.checked;
        extensionToggle.indeterminate = false;
        if (!target) {
          clearAllFamilyExtensions();
          setShapeExtensionsEnabled(enabled);
        } else {
          const shape = getEffectiveFamilyShape(target);
          if (!shape || !isShapeExtendable(shape)) {
            clearFamilyExtension(target);
            updateExtensionControl();
            return;
          }
          const globalEnabled = getShapeExtension(shape);
          if (enabled === globalEnabled) {
            clearFamilyExtension(target);
          } else {
            setFamilyExtension(target, enabled);
          }
        }
        requestImmediateRender();
        updateExtensionControl();
      });

      extensionControl.appendChild(extensionLabel);
      extensionControl.appendChild(extensionHint);
      familyScopeSection.appendChild(extensionControl);

      const stretchControl = document.createElement('div');
      stretchControl.className = 'family-config-item family-config-group';
      const stretchLabel = document.createElement('label');
      stretchLabel.className = 'extension-toggle-label';
      const stretchToggle = document.createElement('input');
      stretchToggle.type = 'checkbox';
      stretchToggle.className = 'extension-toggle-input';
      stretchLabel.appendChild(stretchToggle);
      stretchLabel.appendChild(document.createTextNode(' Alargamiento'));
      const stretchHint = document.createElement('span');
      stretchHint.className = 'control-hint';

      updateStretchControl = () => {
        const target = familyTargetSelect.value;
        if (!target) {
          const config = getShapeStretchConfig();
          const values = STRETCHABLE_SHAPES.map((shape) => config[shape] !== false);
          const allTrue = values.length > 0 && values.every(Boolean);
          const allFalse = values.every((val) => !val);
          const hasOverrides = Object.keys(getFamilyStretchConfig()).length > 0;
          stretchToggle.disabled = STRETCHABLE_SHAPES.length === 0;
          stretchToggle.checked = allTrue && !stretchToggle.disabled;
          stretchToggle.indeterminate =
            hasOverrides || (!allTrue && !allFalse && !stretchToggle.disabled);
          if (stretchToggle.disabled) {
            stretchHint.textContent = 'Sin figuras compatibles con el alargamiento';
            stretchHint.classList.add('hint-active');
          } else if (hasOverrides) {
            stretchHint.textContent = 'Con personalizaciones por familia';
            stretchHint.classList.add('hint-active');
          } else {
            stretchHint.textContent = allTrue
              ? 'Activa en todas las figuras'
              : allFalse
              ? 'Desactivada globalmente'
              : 'Valores variados';
            stretchHint.classList.toggle('hint-active', !allTrue && !allFalse);
          }
        } else {
          stretchToggle.indeterminate = false;
          const shape = getEffectiveFamilyShape(target);
          if (!shape) {
            stretchToggle.checked = false;
            stretchToggle.disabled = true;
            stretchHint.textContent = 'Sin figura asociada';
            stretchHint.classList.add('hint-active');
          } else if (!isShapeExtendable(shape)) {
            stretchToggle.checked = false;
            stretchToggle.disabled = true;
            stretchHint.textContent = 'Alargamiento no disponible para esta figura';
            stretchHint.classList.add('hint-active');
          } else {
            stretchToggle.disabled = false;
            const override = getFamilyStretch(target);
            const globalEnabled = getShapeStretch(shape);
            const enabled = isStretchEnabledForFamily(shape, target);
            stretchToggle.checked = !!enabled;
            stretchHint.textContent =
              typeof override === 'boolean'
                ? override
                  ? 'Personalizado: activado'
                  : 'Personalizado: desactivado'
                : globalEnabled
                ? 'Usa valor global (activado)'
                : 'Usa valor global (desactivado)';
            stretchHint.classList.toggle('hint-active', typeof override !== 'boolean');
          }
        }
      };

      stretchToggle.addEventListener('change', () => {
        const target = familyTargetSelect.value;
        const enabled = stretchToggle.checked;
        stretchToggle.indeterminate = false;
        if (!target) {
          clearAllFamilyStretch();
          setShapeStretchEnabled(enabled);
        } else {
          const shape = getEffectiveFamilyShape(target);
          if (!shape || !isShapeExtendable(shape)) {
            clearFamilyStretch(target);
            updateStretchControl();
            updateExtensionControl();
            return;
          }
          const globalEnabled = getShapeStretch(shape);
          if (enabled === globalEnabled) {
            clearFamilyStretch(target);
          } else {
            setFamilyStretch(target, enabled);
          }
        }
        requestImmediateRender();
        updateStretchControl();
        updateExtensionControl();
      });

      stretchControl.appendChild(stretchLabel);
      stretchControl.appendChild(stretchHint);
      familyScopeSection.appendChild(stretchControl);

      updateParameterControls = () => {
        updateHeightControl();
        updateGlowControl();
        updateBumpControl();
        updateOutlineControl();
        updateStretchControl();
        updateExtensionControl();
      };

      const lineControl = document.createElement('div');
      lineControl.className = 'family-config-item family-line-item';
      const lineHeader = document.createElement('div');
      lineHeader.className = 'family-line-header';
      const lineHeaderTitle = document.createElement('span');
      lineHeaderTitle.className = 'family-line-title';
      lineHeaderTitle.textContent = 'Líneas de conexión';
      lineHeader.appendChild(lineHeaderTitle);
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
        document.createTextNode(' Viaje desde NOTE ON'),
      );
      lineControl.appendChild(travelToggleLabel);

      const updateLineControl = () => {
        const state = getLineState(familyTargetSelect.value);
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

      lineToggle.addEventListener('change', () => {
        const enabled = lineToggle.checked;
        lineToggle.indeterminate = false;
        familiesFromSelection(familyTargetSelect.value).forEach((family) =>
          updateFamilyLineSettings(family, { enabled }),
        );
        renderFrame(lastTime);
        updateLineControl();
      });
      lineOpacity.addEventListener('input', () => {
        const value = parseFloat(lineOpacity.value);
        familiesFromSelection(familyTargetSelect.value).forEach((family) =>
          updateFamilyLineSettings(family, { opacity: value }),
        );
        renderFrame(lastTime);
        updateLineControl();
      });
      lineWidth.addEventListener('input', () => {
        const value = parseFloat(lineWidth.value);
        familiesFromSelection(familyTargetSelect.value).forEach((family) =>
          updateFamilyLineSettings(family, { width: value }),
        );
        renderFrame(lastTime);
        updateLineControl();
      });
      travelToggle.addEventListener('change', () => {
        const enabled = travelToggle.checked;
        travelToggle.indeterminate = false;
        familiesFromSelection(familyTargetSelect.value).forEach((family) =>
          setTravelEffectEnabled(family, enabled),
        );
        renderFrame(lastTime);
        updateLineControl();
      });

      familyScopeSection.appendChild(lineControl);

      familyTargetSelect.addEventListener('change', () => {
        updateColorControl();
        updateSecondaryColorControl();
        updateShapeControl();
        updateParameterControls();
        updateLineControl();
      });

      refreshFamilyControls = () => {
        updateBackgroundImageControl();
        updateBackgroundOpacityControl();
        updateColorControl();
        updateSecondaryColorControl();
        updateShapeControl();
        updateParameterControls();
        updateLineControl();
        updateInstrumentColorControl();
      };

      refreshFamilyControls();

      const resetBtn = document.createElement('button');
      resetBtn.id = 'reset-family-defaults';
      resetBtn.textContent = 'Restablecer predeterminados';
      resetBtn.addEventListener('click', () => {
        resetFamilyCustomizations(currentTracks, notes);
        buildFamilyPanel();
      });
      resetBtn.style.gridColumn = '1 / -1';
      familyScopeSection.appendChild(resetBtn);

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
          buildFamilyPanel();
        };
        reader.readAsText(file);
      });
      importBtn.addEventListener('click', () => importInput.click());

      exportBtn.style.gridColumn = '1 / -1';
      importBtn.style.gridColumn = '1 / -1';
      familyScopeSection.appendChild(exportBtn);
      familyScopeSection.appendChild(importBtn);
      familyScopeSection.appendChild(importInput);

      updateScopeVisibility = (forceRefresh = false) => {
        const scope = scopeSelect.value || 'familia';
        instrumentScopeSection.classList.toggle('hidden', scope !== 'instrumento');
        familyScopeSection.classList.toggle('hidden', scope === 'instrumento');
        syncFamilyTargetWithInstrument();
        familyScopeSection.classList.toggle('scope-mode-global', scope === 'global');

        if (scope === 'global') {
          if (familyTargetSelect.value !== '') {
            familyTargetSelect.value = '';
            dispatchFamilyTargetChange();
          } else if (forceRefresh) {
            refreshFamilyControls();
          }
        } else if (scope === 'familia') {
          if (forceRefresh) {
            refreshFamilyControls();
          }
        } else if (scope === 'instrumento' && forceRefresh) {
          updateInstrumentColorControl();
        }
      };

      scopeSelect.addEventListener('change', () => updateScopeVisibility(true));

      updateScopeVisibility(true);
    }

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
      buildFamilyPanel();
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
      reconfigureCanvasContexts();
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
      instrumentCustomizations = {};
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
              color: track.color || '#ffa500',
              shape: track.shape || 'circle',
              secondaryColor: track.secondaryColor || '#000000',
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
      if (backgroundImage && backgroundImage.element) {
        const img = backgroundImage.element;
        const imgWidth = backgroundImage.width || img.naturalWidth || img.width;
        const imgHeight = backgroundImage.height || img.naturalHeight || img.height;
        if (imgWidth > 0 && imgHeight > 0 && backgroundImageOpacity > 0) {
          const scale = Math.max(
            canvas.width / imgWidth,
            canvas.height / imgHeight,
          );
          const drawWidth = imgWidth * scale;
          const drawHeight = imgHeight * scale;
          const drawX = (canvas.width - drawWidth) / 2;
          const drawY = (canvas.height - drawHeight) / 2;
          offscreenCtx.save();
          offscreenCtx.globalAlpha = Math.max(
            0,
            Math.min(1, backgroundImageOpacity),
          );
          offscreenCtx.drawImage(img, drawX, drawY, drawWidth, drawHeight);
          offscreenCtx.restore();
        }
      }

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

      const snapHalf = (value) => Math.round(value * 2) / 2;
      const computeLayoutAt = (note, time) => {
        const { sizeFactor, bump } = getFamilyModifiers(note.family);
        let baseHeight = noteHeight * sizeFactor * getHeightScale(note.family);
        baseHeight = computeVelocityHeight(baseHeight, note.velocity || velocityBase);
        const { xStart: rawXStart, width: rawWidth } = computeDynamicBounds(
          note,
          time,
          canvas.width,
          pixelsPerSecond,
          baseHeight,
          note.shape,
        );
        const clamped = Math.min(Math.max(note.noteNumber, NOTE_MIN), NOTE_MAX);
        const height = computeBumpHeight(
          baseHeight,
          time,
          note.start,
          note.end,
          bump,
          note.family,
          rawXStart,
          canvas.width,
        );
        const bumpScale = baseHeight > 0 ? height / baseHeight : 1;
        const scaledWidth = rawWidth * bumpScale;
        const scaledXStart = rawXStart;
        const y =
          canvas.height - (clamped - NOTE_MIN + 1) * noteHeight -
          (height - noteHeight) / 2;
        const snappedXStart = snapHalf(scaledXStart);
        const snappedWidth = Math.max(0.5, snapHalf(scaledWidth));
        const snappedXEnd = snappedXStart + snappedWidth;
        const snappedY = snapHalf(y);
        const snappedHeight = Math.max(0.5, snapHalf(height));
        const alpha = computeOpacity(snappedXStart, snappedXEnd, canvas.width);
        const centerX = snappedXStart + snappedWidth / 2;
        const centerY = snappedY + snappedHeight / 2;
        const alignmentX = snappedXStart;
        const alignmentY = centerY;
        return {
          xStart: snappedXStart,
          xEnd: snappedXEnd,
          width: snappedWidth,
          height: snappedHeight,
          y: snappedY,
          alpha,
          centerX,
          centerY,
          alignmentX,
          alignmentY,
          activationX: rawXStart,
        };
      };

      for (let i = startIndex; i < endIndex; i++) {
        const note = notes[i];
        if (enabledInstruments[note.trackName ?? note.instrument] === false) continue;
        const metrics = computeLayoutAt(note, currentSec);
        if (metrics.xEnd < -margin || metrics.xStart > canvas.width + margin) continue;

        const layout = {
          note,
          metrics,
          released: currentSec >= note.end,
          outline: resolveOutlineConfig(note),
        };
        layouts.push(layout);

        const lineConfig = getFamilyLineSettings(note.family);
        if (lineConfig.enabled) {
          const trackKey = note.trackName ?? note.instrument;
          const group = trackSegments.get(trackKey);
          if (group) group.push(layout);
          else trackSegments.set(trackKey, [layout]);
        }

        const travelEnabled = isTravelEffectEnabled(note.family);
        if (travelEnabled && note.next && note.next.start > note.start) {
          const travelDuration = note.next.start - note.start;
          if (travelDuration > 0) {
            const travelProgress = (currentSec - note.start) / travelDuration;
            if (travelProgress >= 0) {
              layout.released = currentSec >= note.end;
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
          const controlX =
            (current.metrics.alignmentX + next.metrics.alignmentX) / 2;
          const controlY = (current.metrics.centerY + next.metrics.centerY) / 2;
          offscreenCtx.save();
          offscreenCtx.strokeStyle = current.note.color;
          offscreenCtx.lineWidth = config.width;
          offscreenCtx.globalAlpha = lineAlpha;
          offscreenCtx.beginPath();
          offscreenCtx.moveTo(
            current.metrics.alignmentX,
            current.metrics.alignmentY,
          );
          if (typeof offscreenCtx.quadraticCurveTo === 'function') {
            offscreenCtx.quadraticCurveTo(
              controlX,
              controlY,
              next.metrics.alignmentX,
              next.metrics.alignmentY,
            );
          } else {
            offscreenCtx.lineTo(
              next.metrics.alignmentX,
              next.metrics.alignmentY,
            );
          }
          offscreenCtx.stroke();
          offscreenCtx.restore();
        }
      });

      for (const layout of layouts) {
        const { note, metrics, released } = layout;
        const alpha = metrics.alpha;
        if (alpha <= 0) continue;

        const fillAlpha = released ? alpha * 0.4 : alpha;
        if (fillAlpha > 0) {
          offscreenCtx.save();
          offscreenCtx.globalAlpha = fillAlpha;
          offscreenCtx.fillStyle = note.color;
          drawNoteShape(
            offscreenCtx,
            note.shape,
            metrics.xStart,
            metrics.y,
            metrics.width,
            metrics.height,
            false,
            undefined,
            { secondaryColor: note.secondaryColor },
          );
          offscreenCtx.restore();
        }

        const glowAlpha = !released
          ? computeGlowAlpha(
              currentSec,
              note.start,
              0.2,
              note.family,
              metrics.activationX ?? metrics.xStart,
              canvas.width,
            )
          : 0;
        if (glowAlpha > 0) {
          applyGlowEffect(
            offscreenCtx,
            note.shape,
            metrics.xStart,
            metrics.y,
            metrics.width,
            metrics.height,
            glowAlpha,
            note.family,
          );
        }

        renderOutline(
          offscreenCtx,
          note,
          layout.outline,
          metrics.xStart,
          metrics.y,
          metrics.width,
          metrics.height,
          fillAlpha,
          currentSec,
        );
      }

      activeTravels.forEach(({ note, progress, layout }) => {
        const duration = note.next.start - note.start;
        if (duration <= 0) return;
        const clamped = Math.min(Math.max(progress, 0), 1);
        const startLayout = computeLayoutAt(note, note.start);
        const targetLayout = computeLayoutAt(note.next, note.next.start);
        const startShift = (currentSec - note.start) * pixelsPerSecond;
        const targetShift = (currentSec - note.next.start) * pixelsPerSecond;
        const startLeft = startLayout.alignmentX - startShift;
        const startY = startLayout.alignmentY;
        const endLeft = targetLayout.alignmentX - targetShift;
        const endY = targetLayout.alignmentY;
        const posLeft = startLeft + (endLeft - startLeft) * clamped;
        const posY = startY + (endY - startY) * clamped;
        const scale = Math.max(0, 1 - clamped);
        if (scale <= 0) return;
        const width = Math.max(0.0001, layout.metrics.width * scale);
        const height = Math.max(0.0001, layout.metrics.height * scale);
        const baseAlpha = Math.max(layout.metrics.alpha, 0);
        const alpha = Math.max(0, Math.min(1, baseAlpha * scale));
        if (alpha <= 0) return;
        const drawX = posLeft;
        const drawY = posY - height / 2;
        if (drawX > canvas.width || drawX + width < 0) return;

        const isReleased = currentSec >= note.end;

        const travelAlpha = isReleased ? alpha * 0.4 : alpha;
        if (travelAlpha > 0) {
          offscreenCtx.save();
          offscreenCtx.globalAlpha = travelAlpha;
          offscreenCtx.fillStyle = note.color;
          drawNoteShape(
            offscreenCtx,
            note.shape,
            drawX,
            drawY,
            width,
            height,
            false,
            undefined,
            { secondaryColor: note.secondaryColor },
          );
          offscreenCtx.restore();
        }

        renderOutline(
          offscreenCtx,
          note,
          layout.outline,
          drawX,
          drawY,
          width,
          height,
          travelAlpha,
          currentSec,
        );
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
      const loopFn = (dt, _now, forcedCurrentSec) => {
        const currentSec =
          typeof forcedCurrentSec === 'number'
            ? forcedCurrentSec
            : audioPlayer.getCurrentTime() + audioOffsetMs / 1000;
        adjustSupersampling(dt);
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
  'Maderas de timbre "redondo"': {
    shape: 'roundedSquare',
    color: '#0000ff',
    secondaryColor: '#000000',
  },
  'Dobles cañas': { shape: 'sixPointStar', color: '#8a2be2', secondaryColor: '#000000' },
  'Saxofones': { shape: 'fourPointStar', color: '#a0522d', secondaryColor: '#000000' },
  Metales: { shape: 'roundedSquare', color: '#ffff00', secondaryColor: '#000000' },
  Cornos: { shape: 'roundedSquareDouble', color: '#ffff00', secondaryColor: '#000000' },
  'Percusión menor': { shape: 'square', color: '#808080', secondaryColor: '#000000' },
  Tambores: { shape: 'circle', color: '#808080', secondaryColor: '#000000' },
  Platillos: { shape: 'circleDouble', color: '#808080', secondaryColor: '#000000' },
  Placas: { shape: 'diamondDouble', color: '#ff0000', secondaryColor: '#000000' },
  Auxiliares: { shape: 'roundedSquareDouble', color: '#4b0082', secondaryColor: '#000000' },
  'Cuerdas frotadas': { shape: 'diamond', color: '#ffa500', secondaryColor: '#000000' },
  'Cuerdas pulsadas': { shape: 'triangle', color: '#008000', secondaryColor: '#000000' },
  Voces: { shape: 'squareDouble', color: '#808080', secondaryColor: '#000000' },
  'Custom 1': { shape: 'square', color: '#ffffff', secondaryColor: '#000000' },
  'Custom 2': { shape: 'square', color: '#ffffff', secondaryColor: '#000000' },
  'Custom 3': { shape: 'square', color: '#ffffff', secondaryColor: '#000000' },
  'Custom 4': { shape: 'square', color: '#ffffff', secondaryColor: '#000000' },
  'Custom 5': { shape: 'square', color: '#ffffff', secondaryColor: '#000000' },
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
    if (cfg.secondaryColor) {
      preset.secondaryColor = cfg.secondaryColor;
    } else if (!preset.secondaryColor) {
      preset.secondaryColor = '#000000';
    }
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
    FAMILY_PRESETS[fam] = {
      shape: preset.shape,
      color: preset.color,
      secondaryColor: preset.secondaryColor,
    };
    familyCustomizations[fam] = {
      color: preset.color,
      shape: preset.shape,
      secondaryColor: preset.secondaryColor,
    };
  });
}

let instrumentCustomizations = {};

const BASE_COLOR_SWATCHES = [
  '#1abc9c',
  '#2ecc71',
  '#3498db',
  '#9b59b6',
  '#34495e',
  '#16a085',
  '#27ae60',
  '#2980b9',
  '#8e44ad',
  '#2c3e50',
  '#f1c40f',
  '#e67e22',
  '#e74c3c',
  '#ecf0f1',
  '#95a5a6',
  '#ff6f61',
  '#ff9f1c',
  '#ffbe0b',
  '#8338ec',
  '#3a86ff',
  '#00b4d8',
  '#48cae4',
  '#6d597a',
  '#4cc9f0',
];

let colorToneShift = 0;

const OUTLINE_MODE_LABELS = {
  full: 'Completo',
  pre: 'Antes del NOTE ON',
  post: 'Después del NOTE OFF',
};

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function sanitizeOutlineOverride(updates = {}) {
  const result = {};
  if (Object.prototype.hasOwnProperty.call(updates, 'enabled')) {
    if (typeof updates.enabled === 'boolean') {
      result.enabled = updates.enabled;
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'mode')) {
    const mode = updates.mode;
    if (typeof mode === 'string' && OUTLINE_MODES.includes(mode)) {
      result.mode = mode;
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'width')) {
    const width = parseFloat(updates.width);
    if (Number.isFinite(width)) {
      result.width = Math.max(0.25, width);
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'opacity')) {
    const opacity = parseFloat(updates.opacity);
    if (Number.isFinite(opacity)) {
      result.opacity = clamp(opacity, 0, 1);
    }
  }
  if (Object.prototype.hasOwnProperty.call(updates, 'color')) {
    if (updates.color === null) {
      result.color = null;
    } else if (typeof updates.color === 'string') {
      const hex = updates.color.trim();
      if (/^#([0-9a-f]{3}){1,2}$/i.test(hex)) {
        result.color = hex.toLowerCase();
      }
    }
  }
  return result;
}

function mergeOutlineConfig(baseConfig = {}, override = {}) {
  const merged = { ...baseConfig };
  if (override && typeof override === 'object') {
    if (Object.prototype.hasOwnProperty.call(override, 'enabled')) {
      merged.enabled = override.enabled;
    }
    if (Object.prototype.hasOwnProperty.call(override, 'mode')) {
      merged.mode = override.mode;
    }
    if (Object.prototype.hasOwnProperty.call(override, 'width')) {
      merged.width = override.width;
    }
    if (Object.prototype.hasOwnProperty.call(override, 'opacity')) {
      merged.opacity = override.opacity;
    }
    if (Object.prototype.hasOwnProperty.call(override, 'color')) {
      merged.color = override.color;
    }
  }
  return merged;
}

function resolveOutlineConfig(note) {
  if (!note) return { ...getOutlineSettings() };
  const base = getOutlineSettings(note.family);
  const override = instrumentCustomizations[note.trackName ?? note.instrument];
  if (override && override.outline) {
    return mergeOutlineConfig(base, override.outline);
  }
  return base;
}

function shouldRenderOutline(outlineConfig, currentSec, note) {
  if (!outlineConfig || !outlineConfig.enabled || !note) return false;
  const now = typeof currentSec === 'number' ? currentSec : 0;
  if (outlineConfig.mode === 'pre') {
    return now < note.start;
  }
  if (outlineConfig.mode === 'post') {
    return now >= note.end;
  }
  return true;
}

function renderOutline(
  ctx,
  note,
  outlineConfig,
  x,
  y,
  width,
  height,
  baseAlpha,
  currentSec,
) {
  if (!ctx || !note || !outlineConfig || !shouldRenderOutline(outlineConfig, currentSec, note)) {
    return;
  }
  const opacity = typeof outlineConfig.opacity === 'number' ? outlineConfig.opacity : 1;
  const intensity = clamp(baseAlpha * opacity, 0, 1);
  if (!(intensity > 0)) return;
  const strokeColor = outlineConfig.color || note.color || '#ffffff';
  const strokeWidth =
    typeof outlineConfig.width === 'number' && Number.isFinite(outlineConfig.width)
      ? outlineConfig.width
      : undefined;
  ctx.save();
  ctx.globalAlpha = intensity;
  ctx.strokeStyle = strokeColor;
  drawNoteShape(ctx, note.shape, x, y, width, height, true, strokeWidth);
  ctx.restore();
}

function loadColorToneShift() {
  if (typeof localStorage === 'undefined') return;
  const stored = localStorage.getItem('colorToneShift');
  if (!stored) return;
  const value = parseInt(stored, 10);
  if (!Number.isNaN(value)) {
    colorToneShift = Math.min(180, Math.max(-180, value));
  }
}

function saveColorToneShift() {
  if (typeof localStorage === 'undefined') return;
  localStorage.setItem('colorToneShift', String(colorToneShift));
}

function setColorToneShiftValue(value) {
  const numeric = Number.isFinite(value) ? Math.round(value) : 0;
  colorToneShift = Math.min(180, Math.max(-180, numeric));
  saveColorToneShift();
}

function getColorToneShift() {
  return colorToneShift;
}

function hexToRgb(hex) {
  const normalized = hex.replace('#', '');
  const num = parseInt(normalized, 16);
  return {
    r: (num >> 16) & 0xff,
    g: (num >> 8) & 0xff,
    b: num & 0xff,
  };
}

function rgbToHsl(r, g, b) {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case rn:
        h = (gn - bn) / d + (gn < bn ? 6 : 0);
        break;
      case gn:
        h = (bn - rn) / d + 2;
        break;
      default:
        h = (rn - gn) / d + 4;
        break;
    }
    h *= 60;
  }
  return { h, s, l };
}

function hslToRgb(h, s, l) {
  const hue = ((h % 360) + 360) % 360;
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const segment = hue / 60;
  const x = chroma * (1 - Math.abs((segment % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (segment >= 0 && segment < 1) {
    r = chroma;
    g = x;
  } else if (segment >= 1 && segment < 2) {
    r = x;
    g = chroma;
  } else if (segment >= 2 && segment < 3) {
    g = chroma;
    b = x;
  } else if (segment >= 3 && segment < 4) {
    g = x;
    b = chroma;
  } else if (segment >= 4 && segment < 5) {
    r = x;
    b = chroma;
  } else {
    r = chroma;
    b = x;
  }
  const m = l - chroma / 2;
  const to255 = (val) => Math.round((val + m) * 255);
  return {
    r: to255(r),
    g: to255(g),
    b: to255(b),
  };
}

function rgbToHex({ r, g, b }) {
  const clamp = (val) => Math.min(255, Math.max(0, Math.round(val)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g)
    .toString(16)
    .padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function shiftHexHue(hex, shiftDegrees) {
  const rgb = hexToRgb(hex);
  const { h, s, l } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const shifted = hslToRgb(h + shiftDegrees, s, l);
  return rgbToHex(shifted);
}

function getToneShiftedPalette() {
  return BASE_COLOR_SWATCHES.map((hex) => shiftHexHue(hex, colorToneShift));
}

loadColorToneShift();

function saveFamilyCustomizations() {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('familyCustomizations', JSON.stringify(familyCustomizations));
  }
}

function setFamilyCustomization(
  family,
  { color, shape, secondaryColor, colorBright, colorDark } = {},
  tracks = [],
  notes = [],
  fromTime = 0,
) {
  const basePreset =
    FAMILY_PRESETS[family] || { shape: 'circle', color: '#ffa500', secondaryColor: '#000000' };
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
  if (secondaryColor) {
    preset.secondaryColor = secondaryColor;
  } else if (!preset.secondaryColor) {
    preset.secondaryColor = '#000000';
  }
  FAMILY_PRESETS[family] = {
    shape: preset.shape,
    color: preset.color,
    secondaryColor: preset.secondaryColor,
  };
  familyCustomizations[family] = {
    color: preset.color,
    shape: preset.shape,
    secondaryColor: preset.secondaryColor,
  };
  saveFamilyCustomizations();
  tracks.forEach((t) => {
    if (t.family === family) {
      t.shape = preset.shape;
      t.color = getInstrumentColor(preset);
      t.secondaryColor = preset.secondaryColor;
    }
  });
  const effectiveFrom = typeof fromTime === 'number' && fromTime > 0 ? fromTime : 0;
  notes.forEach((n) => {
    if (n.family !== family) return;
    if (n.start < effectiveFrom) return;
    const override = instrumentCustomizations[n.trackName ?? n.instrument] || {};
    if (shape && !override.shape) {
      n.shape = preset.shape;
    }
    if (resolvedColor && !override.color) {
      n.color = getInstrumentColor(preset);
    }
    n.secondaryColor = preset.secondaryColor;
  });
}

function setInstrumentCustomization(
  trackName,
  options = {},
  tracks = [],
  notes = [],
  fromTime = 0,
) {
  if (!trackName) return;
  const track = tracks.find((t) => t.name === trackName);
  if (!track) return;
  const existing = instrumentCustomizations[trackName] || {};
  const next = { ...existing };
  const { color, shape, outline } = options || {};
  if (typeof color === 'string') {
    next.color = color;
    track.color = color;
  }
  if (typeof shape === 'string') {
    next.shape = shape;
    track.shape = shape;
  }
  if (options && Object.prototype.hasOwnProperty.call(options, 'outline')) {
    if (outline === null) {
      delete next.outline;
    } else if (outline && typeof outline === 'object') {
      const normalized = sanitizeOutlineOverride(outline);
      if (Object.keys(normalized).length > 0) {
        next.outline = { ...(next.outline || {}), ...normalized };
      }
    }
  }
  instrumentCustomizations[trackName] = next;
  const effectiveFrom = typeof fromTime === 'number' && fromTime > 0 ? fromTime : 0;
  notes.forEach((note) => {
    if ((note.trackName ?? note.instrument) !== trackName) return;
    if (note.start < effectiveFrom) return;
    if (typeof color === 'string') {
      note.color = color;
    }
    if (typeof shape === 'string') {
      note.shape = shape;
    }
    note.secondaryColor = track.secondaryColor || '#000000';
  });
}

function clearInstrumentCustomization(
  trackName,
  tracks = [],
  notes = [],
  fromTime = 0,
) {
  if (!trackName) return;
  const track = tracks.find((t) => t.name === trackName);
  if (!track) return;
  delete instrumentCustomizations[trackName];
  const preset =
    FAMILY_PRESETS[track.family] ||
    FAMILY_DEFAULTS[track.family] ||
    { shape: 'circle', color: '#ffa500', secondaryColor: '#000000' };
  track.shape = preset.shape;
  track.color = getInstrumentColor(preset);
  track.secondaryColor = preset.secondaryColor || '#000000';
  const effectiveFrom = typeof fromTime === 'number' && fromTime > 0 ? fromTime : 0;
  notes.forEach((note) => {
    if ((note.trackName ?? note.instrument) !== trackName) return;
    if (note.start < effectiveFrom) return;
    note.shape = preset.shape;
    note.color = getInstrumentColor(preset);
    note.secondaryColor = track.secondaryColor;
  });
}

function resetFamilyCustomizations(tracks = [], notes = []) {
  Object.keys(FAMILY_DEFAULTS).forEach((fam) => {
    FAMILY_PRESETS[fam] = { ...FAMILY_DEFAULTS[fam] };
  });
  familyCustomizations = {};
  instrumentCustomizations = {};
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('familyCustomizations');
  }
  resetFamilyLineSettings();
  resetTravelEffectSettings();
  resetOutlineSettings();
  tracks.forEach((t) => {
    const preset =
      FAMILY_PRESETS[t.family] || { shape: 'circle', color: '#ffa500', secondaryColor: '#000000' };
    t.shape = preset.shape;
    t.color = getInstrumentColor(preset);
    t.secondaryColor = preset.secondaryColor || '#000000';
  });
  notes.forEach((n) => {
    const preset =
      FAMILY_PRESETS[n.family] || { shape: 'circle', color: '#ffa500', secondaryColor: '#000000' };
    n.shape = preset.shape;
    n.color = getInstrumentColor(preset);
    n.secondaryColor = preset.secondaryColor || '#000000';
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
    glowStrength: getGlowStrengthConfig(),
    bumpControl: getBumpControlConfig(),
    visibleSeconds: getVisibleSeconds(),
    heightScale: getHeightScaleConfig(),
    shapeStretch: getShapeStretchConfig(),
    shapeExtensions: getShapeExtensions(),
    familyExtensions: getFamilyExtensionConfig(),
    familyStretch: getFamilyStretchConfig(),
    familyLineSettings: getAllFamilyLineSettings(),
    familyTravelSettings: getTravelEffectSettings(),
    outlineSettings: getOutlineSettingsConfig(),
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
  resetOutlineSettings();
  if (data.outlineSettings && typeof data.outlineSettings === 'object') {
    if (data.outlineSettings.global && typeof data.outlineSettings.global === 'object') {
      setOutlineSettings(data.outlineSettings.global);
    }
    if (data.outlineSettings.families && typeof data.outlineSettings.families === 'object') {
      Object.entries(data.outlineSettings.families).forEach(([family, cfg]) => {
        if (cfg && typeof cfg === 'object') setOutlineSettings(cfg, family);
      });
    }
  }
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
  } else if (data.glowStrength && typeof data.glowStrength === 'object') {
    if (typeof data.glowStrength.global === 'number') {
      setGlowStrength(data.glowStrength.global);
    }
    if (data.glowStrength.families && typeof data.glowStrength.families === 'object') {
      Object.entries(data.glowStrength.families).forEach(([fam, val]) => {
        if (typeof val === 'number') setGlowStrength(val, fam);
      });
    }
  }
  if (typeof data.bumpControl === 'number') {
    setBumpControl(data.bumpControl);
  } else if (data.bumpControl && typeof data.bumpControl === 'object') {
    if (typeof data.bumpControl.global === 'number') {
      setBumpControl(data.bumpControl.global);
    }
    if (data.bumpControl.families && typeof data.bumpControl.families === 'object') {
      Object.entries(data.bumpControl.families).forEach(([fam, val]) => {
        if (typeof val === 'number') setBumpControl(val, fam);
      });
    }
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

  if (data.shapeStretch && typeof data.shapeStretch === 'object') {
    Object.entries(data.shapeStretch).forEach(([shape, enabled]) => {
      setShapeStretch(shape, enabled);
    });
  }

  if (data.familyExtensions && typeof data.familyExtensions === 'object') {
    clearAllFamilyExtensions();
    Object.entries(data.familyExtensions).forEach(([fam, enabled]) => {
      if (typeof enabled === 'boolean') {
        setFamilyExtension(fam, enabled);
      }
    });
  }

  if (data.familyStretch && typeof data.familyStretch === 'object') {
    clearAllFamilyStretch();
    Object.entries(data.familyStretch).forEach(([fam, enabled]) => {
      if (typeof enabled === 'boolean') {
        setFamilyStretch(fam, enabled);
      }
    });
  }

  Object.keys(FAMILY_DEFAULTS).forEach((fam) => {
    FAMILY_PRESETS[fam] = { ...FAMILY_DEFAULTS[fam] };
  });
  Object.entries(famCustoms).forEach(([fam, cfg]) => {
    if (!FAMILY_PRESETS[fam]) return;
    const preset = { ...FAMILY_PRESETS[fam] };
    if (cfg.shape) preset.shape = cfg.shape;
    if (cfg.secondaryColor) {
      preset.secondaryColor = cfg.secondaryColor;
    } else if (!preset.secondaryColor) {
      preset.secondaryColor = '#000000';
    }
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
    FAMILY_PRESETS[fam] = {
      shape: preset.shape,
      color: preset.color,
      secondaryColor: preset.secondaryColor,
    };
    familyCustomizations[fam] = {
      color: preset.color,
      shape: preset.shape,
      secondaryColor: preset.secondaryColor,
    };
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
      FAMILY_PRESETS[fam] || { shape: 'circle', color: '#ffa500', secondaryColor: '#000000' };
    t.shape = preset.shape;
    t.color = getInstrumentColor(preset);
    t.secondaryColor = preset.secondaryColor || '#000000';
  });
  notes.forEach((n) => {
    const key = n.trackName ?? n.instrument;
    const fam = assignedFamilies[key] || n.family;
    n.family = fam;
    const preset =
      FAMILY_PRESETS[fam] || { shape: 'circle', color: '#ffa500', secondaryColor: '#000000' };
    n.shape = preset.shape;
    n.color = getInstrumentColor(preset);
    n.secondaryColor = preset.secondaryColor || '#000000';
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
    const preset =
      FAMILY_PRESETS[family] || { shape: 'circle', color: '#ffa500', secondaryColor: '#000000' };
    const color = getInstrumentColor(preset);
    return {
      ...t,
      instrument,
      family,
      shape: preset.shape,
      color,
      secondaryColor: preset.secondaryColor || '#000000',
      detectedFamily: family,
      detectedShape: preset.shape,
      detectedColor: color,
    };
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
    startAutoFPSLoop,
    computeVelocityHeight,
    setVelocityBase,
    getVelocityBase,
    setOpacityScale,
    getOpacityScale,
    setGlowStrength,
    getGlowStrength,
    getGlowStrengthConfig,
    setBumpControl,
    getBumpControl,
    getBumpControlConfig,
    sanitizeOutlineOverride,
    mergeOutlineConfig,
    resolveOutlineConfig,
    shouldRenderOutline,
    renderOutline,
    setSuperSampling,
    getSuperSampling,
    preprocessTempoMap,
    ticksToSeconds,
    setFamilyCustomization,
    setInstrumentCustomization,
    clearInstrumentCustomization,
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
    setShapeExtensionsEnabled,
    getShapeExtension,
    getShapeExtensions,
    setShapeStretch,
    setShapeStretchEnabled,
    getShapeStretch,
    getShapeStretchConfig,
    setFamilyExtension,
    getFamilyExtension,
    getFamilyExtensionConfig,
    clearFamilyExtension,
    clearAllFamilyExtensions,
    setFamilyStretch,
    getFamilyStretch,
    getFamilyStretchConfig,
    clearFamilyStretch,
    clearAllFamilyStretch,
    isStretchEnabledForFamily,
    isExtensionEnabledForFamily,
  };
}
