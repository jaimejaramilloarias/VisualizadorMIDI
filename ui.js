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
