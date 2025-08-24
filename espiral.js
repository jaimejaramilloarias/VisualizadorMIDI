// viz/espiral.js

// Compatible con entornos CommonJS y navegador mediante IIFE
(function (global) {
  function createEspiralRenderer({
    pitchToY = (p, H) => Math.round(H * 0.5 - (p - 69) * 5),
    rightMargin = 28,
  } = {}) {
    const notes = [];

    function spiralPoint(cx, cy, t) {
      const ang = t * 4 * Math.PI;
      const r = 4 + 20 * t;
      return { x: cx + r * Math.cos(ang), y: cy + r * Math.sin(ang) };
    }

    function drawSegment(ctx, a, b, s) {
      const maxW = 20;
      const minW = 2;
      const w = maxW + (minW - maxW) * s;
      ctx.strokeStyle = '#f1e6cb';
      ctx.lineWidth = w;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }

    function drawNote(ctx, W, y, progress) {
      const xR = W - rightMargin;
      const spiralSteps = 60;
      let prev = spiralPoint(xR, y, 0);
      for (let i = 1; i <= spiralSteps; i++) {
        const s = i / spiralSteps;
        const p = spiralPoint(xR, y, s * 0.6);
        drawSegment(ctx, prev, p, s * 0.5);
        prev = p;
      }
      const len = Math.max(20, progress * 180);
      const waveSteps = 120;
      for (let i = 1; i <= waveSteps; i++) {
        const s = i / waveSteps;
        const x = xR - len * s;
        const amp = (1 - s) * 12;
        const yy = y + Math.sin(s * 6 * Math.PI) * amp;
        drawSegment(ctx, prev, { x, y: yy }, 0.5 + s * 0.5);
        prev = { x, y: yy };
      }
    }

    return {
      noteOn({ id, pitch, startMs, durMs }) {
        notes.push({ id, pitch, startMs, durMs, endMs: null });
      },
      noteOff({ id, endMs }) {
        const n = notes.find((x) => x.id === id);
        if (n) n.endMs = endMs;
      },
      render(ctx, nowMs) {
        const W = ctx.canvas.width;
        const H = ctx.canvas.height;
        const list = [...notes].sort((a, b) => a.startMs - b.startMs);
        for (const n of list) {
          n.y ??= pitchToY(n.pitch, H);
          const end = n.endMs ?? nowMs;
          const prog = Math.max(0, Math.min(1, (end - n.startMs) / n.durMs));
          drawNote(ctx, W, n.y, prog);
        }
      },
    };
  }

  // Dibuja una versión simplificada de la figura "Espiral" alineada a la izquierda
  function drawEspiral(ctx, x, y, width, height) {
    const cx = x + height * 0.3;
    const cy = y + height / 2;
    const steps = 40;
    ctx.moveTo(cx, cy);
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const ang = t * 4 * Math.PI;
      const r = height * 0.4 * t;
      ctx.lineTo(cx + r * Math.cos(ang), cy + r * Math.sin(ang));
    }
    ctx.lineTo(x + width, cy);
    ctx.lineTo(x + width, cy + height * 0.15);
    ctx.lineTo(x, cy + height * 0.15);
    ctx.closePath();
  }

  const api = { createEspiralRenderer, drawEspiral };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    global.createEspiralRenderer = createEspiralRenderer;
    global.drawEspiral = drawEspiral;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);

