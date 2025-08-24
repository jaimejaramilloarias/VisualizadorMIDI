// Motor de renderizado basado en requestAnimationFrame
// Proporciona una cola de eventos para noteOn/noteOff y un bucle principal
// que procesa eventos en batch y entrega dt clamped al callback de renderizado.

function createRenderState(maxBatch = 200) {
  return {
    activeNotes: new Map(),
    eventQueue: [],
    maxBatch,
    _rafId: null,
  };
}

function enqueueNoteOn(state, note, velocity, start, end) {
  state.eventQueue.push({ type: 'noteon', note, velocity, start, end });
}

function enqueueNoteOff(state, note) {
  state.eventQueue.push({ type: 'noteoff', note });
}

function processEventQueue(state, handler) {
  let processed = 0;
  while (state.eventQueue.length && processed < state.maxBatch) {
    const ev = state.eventQueue.shift();
    if (ev.type === 'noteon') {
      state.activeNotes.set(ev.note, {
        velocity: ev.velocity,
        start: ev.start,
        end: ev.end,
      });
      if (handler) handler(ev);
    } else if (ev.type === 'noteoff') {
      const note = state.activeNotes.get(ev.note);
      if (note) {
        state.activeNotes.delete(ev.note);
        if (handler) handler({ type: 'noteoff', note: ev.note, data: note });
      }
    }
    processed++;
  }
}

function startRenderLoop(state, render, handleEvent) {
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(Math.max(now - last, 8), 32);
    last = now;
    processEventQueue(state, handleEvent);
    if (render) render(dt, now, state);
    state._rafId = requestAnimationFrame(frame);
  }
  state._rafId = requestAnimationFrame(frame);
  return () => cancelAnimationFrame(state._rafId);
}

if (typeof module !== 'undefined') {
  module.exports = {
    createRenderState,
    enqueueNoteOn,
    enqueueNoteOff,
    processEventQueue,
    startRenderLoop,
  };
}
