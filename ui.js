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
  onAspect169,
  onAspect916,
  onFullScreen,
}) {
  const playBtn = document.getElementById('play-stop');
  const forwardBtn = document.getElementById('seek-forward');
  const backwardBtn = document.getElementById('seek-backward');
  const restartBtn = document.getElementById('restart');
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
  restartBtn.addEventListener('click', () => onRestart());
  aspect169Btn.addEventListener('click', () => onAspect169());
  aspect916Btn.addEventListener('click', () => onAspect916());
  fullScreenBtn.addEventListener('click', () => onFullScreen());

  return {
    playBtn,
    forwardBtn,
    backwardBtn,
    restartBtn,
    aspect169Btn,
    aspect916Btn,
    fullScreenBtn,
  };
}

function initializeDeveloperMode({ button, panel }) {
  let active = false;
  button.addEventListener('click', () => {
    active = !active;
    panel.classList.toggle('hidden', !active);
  });
  return {
    isActive: () => active,
    button,
    panel,
  };
}

if (typeof module !== 'undefined') {
  module.exports = { initializeUI, initializeDeveloperMode };
} else {
  window.ui = { initializeUI, initializeDeveloperMode };
}
