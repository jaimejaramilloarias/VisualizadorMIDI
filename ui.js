/**
 * Module to initialize UI controls for playback and layout.
 */
function initializeUI({
  isPlaying,
  onPlay,
  onStop,
  onForward,
  onBackward,
  onRestart,
  onRefresh,
  onAspect169,
  onAspect916,
  onFullScreen,
  fpsMode,
  fpsValue,
  onFPSModeChange,
  onFPSValueChange,
}) {
  const playBtn = document.getElementById('play-stop');
  const forwardBtn = document.getElementById('seek-forward');
  const backwardBtn = document.getElementById('seek-backward');
  const forwardArrowBtn = document.getElementById('seek-forward-arrow');
  const backwardArrowBtn = document.getElementById('seek-backward-arrow');
  const restartBtn = document.getElementById('restart');
  const refreshBtn = document.getElementById('refresh-animation');
  const aspect169Btn = document.getElementById('aspect-16-9');
  const aspect916Btn = document.getElementById('aspect-9-16');
  const fullScreenBtn = document.getElementById('full-screen');
  const fpsModeSelect = document.getElementById('fps-mode');
  const fpsValueInput = document.getElementById('fps-value');

  const updateFPSAvailability = () => {
    if (fpsValueInput) {
      const fixedSelected = fpsModeSelect && fpsModeSelect.value === 'fixed';
      fpsValueInput.disabled = !fixedSelected;
    }
  };

  if (fpsModeSelect) {
    if (typeof fpsMode === 'string') {
      const option = fpsModeSelect.querySelector(`option[value="${fpsMode}"]`);
      if (option) {
        fpsModeSelect.value = fpsMode;
      }
    }
    updateFPSAvailability();
    fpsModeSelect.addEventListener('change', () => {
      const selected = fpsModeSelect.value === 'fixed' ? 'fixed' : 'auto';
      let nextMode = selected;
      if (typeof onFPSModeChange === 'function') {
        const result = onFPSModeChange(selected);
        if (typeof result === 'string') {
          nextMode = result;
        }
      }
      const option = fpsModeSelect.querySelector(`option[value="${nextMode}"]`);
      if (option) {
        fpsModeSelect.value = nextMode;
      }
      updateFPSAvailability();
    });
  }

  if (fpsValueInput) {
    if (typeof fpsValue === 'number' && Number.isFinite(fpsValue)) {
      fpsValueInput.value = String(fpsValue);
    }
    updateFPSAvailability();
    fpsValueInput.addEventListener('change', () => {
      if (typeof onFPSValueChange === 'function') {
        const parsed = Number(fpsValueInput.value);
        const result = onFPSValueChange(parsed);
        if (typeof result === 'number' && Number.isFinite(result)) {
          fpsValueInput.value = String(result);
        }
      }
    });
  }

  playBtn.addEventListener('click', () => {
    if (isPlaying()) {
      onStop();
    } else {
      onPlay();
    }
  });

  forwardBtn.addEventListener('click', () => onForward());
  backwardBtn.addEventListener('click', () => onBackward());
  if (forwardArrowBtn) {
    forwardArrowBtn.addEventListener('click', () => onForward());
  }
  if (backwardArrowBtn) {
    backwardArrowBtn.addEventListener('click', () => onBackward());
  }
  restartBtn.addEventListener('click', () => onRestart());
  if (refreshBtn && onRefresh) {
    refreshBtn.addEventListener('click', () => onRefresh());
  }
  aspect169Btn.addEventListener('click', () => onAspect169());
  aspect916Btn.addEventListener('click', () => onAspect916());
  fullScreenBtn.addEventListener('click', () => onFullScreen());
  return {
    playBtn,
    forwardBtn,
    backwardBtn,
    forwardArrowBtn,
    backwardArrowBtn,
    restartBtn,
    refreshBtn,
    aspect169Btn,
    aspect916Btn,
    fullScreenBtn,
    fpsModeSelect,
    fpsValueInput,
    refreshFPSControls: (mode, value) => {
      if (fpsModeSelect && typeof mode === 'string') {
        const option = fpsModeSelect.querySelector(`option[value="${mode}"]`);
        if (option) {
          fpsModeSelect.value = mode;
        }
      }
      if (fpsValueInput && typeof value === 'number' && Number.isFinite(value)) {
        fpsValueInput.value = String(value);
      }
      updateFPSAvailability();
    },
  };
}

function initializeDeveloperMode({ button, panel, onToggle } = {}) {
  let active = false;

  const updateState = (next) => {
    active = !!next;
    if (panel) {
      panel.classList.toggle('hidden', !active);
    }
    if (button) {
      button.classList.toggle('active', active);
    }
    if (typeof onToggle === 'function') {
      onToggle(active);
    }
  };

  if (button) {
    button.addEventListener('click', () => {
      updateState(!active);
    });
  }

  return {
    isActive: () => active,
    setActive: (value) => updateState(value),
    button,
    panel,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { initializeUI, initializeDeveloperMode };
} else {
  window.ui = { initializeUI, initializeDeveloperMode };
}
