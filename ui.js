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

async function initializeFontSelector({ select, sizeInput, target }) {
  // Load available fonts using the Local Font Access API when possible
  let fonts = [];
  if (typeof navigator !== 'undefined' && navigator.fonts && navigator.fonts.query) {
    try {
      const fontData = await navigator.fonts.query();
      const families = new Set(fontData.map((f) => f.family));
      fonts = Array.from(families).sort();
    } catch (e) {
      // Ignore errors and fall back to default fonts
    }
  }
  if (fonts.length === 0) {
    fonts = ['Arial', 'Verdana', 'Times New Roman', 'Georgia', 'Courier New'];
  }
  fonts.forEach((font) => {
    const option = document.createElement('option');
    option.value = font;
    option.textContent = font;
    select.appendChild(option);
  });

  // Apply the font immediately when the selection changes
  select.addEventListener('change', () => {
    const font = select.value;
    if (font) {
      target.style.fontFamily = `'${font}', sans-serif`;
    }
  });

  // Handle font size changes with input and mouse drag
  if (sizeInput) {
    const applySize = () => {
      const size = parseInt(sizeInput.value, 10);
      if (!isNaN(size)) {
        target.style.setProperty('--global-font-size', `${size}px`);
      }
    };

    sizeInput.addEventListener('input', applySize);

    let dragging = false;
    let startY = 0;
    let startSize = 0;

    sizeInput.addEventListener('mousedown', (e) => {
      dragging = true;
      startY = e.clientY;
      startSize = parseInt(sizeInput.value, 10) || 16;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (dragging) {
        const delta = startY - e.clientY;
        const newSize = Math.max(8, Math.min(72, startSize + delta));
        sizeInput.value = newSize;
        applySize();
      }
    });

    window.addEventListener('mouseup', () => {
      dragging = false;
    });

    applySize();
  }

  return { select, sizeInput };
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
  module.exports = { initializeUI, initializeDeveloperMode, initializeFontSelector };
} else {
  window.ui = { initializeUI, initializeDeveloperMode, initializeFontSelector };
}
