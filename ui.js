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
  onToggleFPS,
  onMidiLearn,
  onRangeChange,
}) {
  const playBtn = document.getElementById('play-stop');
  const forwardBtn = document.getElementById('seek-forward');
  const backwardBtn = document.getElementById('seek-backward');
  const restartBtn = document.getElementById('restart');
  const aspect169Btn = document.getElementById('aspect-16-9');
  const aspect916Btn = document.getElementById('aspect-9-16');
  const fullScreenBtn = document.getElementById('full-screen');
  const toggleFPSBtn = document.getElementById('toggle-fps');
  const midiLearnBtn = document.getElementById('midi-learn');
  const tempoRangeInput = document.getElementById('tempo-range');

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
  if (toggleFPSBtn && onToggleFPS) {
    toggleFPSBtn.addEventListener('click', () => onToggleFPS());
  }
  if (midiLearnBtn && onMidiLearn) {
    midiLearnBtn.addEventListener('click', () => onMidiLearn());
  }
  if (tempoRangeInput && onRangeChange) {
    tempoRangeInput.addEventListener('input', (e) =>
      onRangeChange(parseFloat(e.target.value))
    );
  }

  return {
    playBtn,
    forwardBtn,
    backwardBtn,
    restartBtn,
    aspect169Btn,
    aspect916Btn,
    fullScreenBtn,
    toggleFPSBtn,
    midiLearnBtn,
    tempoRangeInput,
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
