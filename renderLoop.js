// Motor de renderizado basado en requestAnimationFrame
// Proporciona una cola de eventos para noteOn/noteOff y un bucle principal
// que procesa eventos en batch y entrega dt sincronizado con requestAnimationFrame.

function createRenderState(maxBatch = 200) {
  return {
    activeNotes: new Map(),
    eventQueue: [],
    maxBatch,
    _rafId: null,
    _eventPool: [],
  };
}

function getPooledEvent(state) {
  return (
    state._eventPool.pop() || {
      type: '',
      note: 0,
      velocity: 0,
      start: 0,
      end: 0,
    }
  );
}

function releaseEvent(state, ev) {
  state._eventPool.push(ev);
}

function enqueueNoteOn(state, note, velocity, start, end) {
  const last = state.eventQueue[state.eventQueue.length - 1];
  if (last && last.type === 'noteon' && last.note === note) {
    // Colapsar ráfagas actualizando el último evento
    last.velocity = velocity;
    last.start = start;
    last.end = end;
    return;
  }
  const ev = getPooledEvent(state);
  ev.type = 'noteon';
  ev.note = note;
  ev.velocity = velocity;
  ev.start = start;
  ev.end = end;
  state.eventQueue.push(ev);
}

function enqueueNoteOff(state, note) {
  const last = state.eventQueue[state.eventQueue.length - 1];
  if (last && last.type === 'noteoff' && last.note === note) {
    // Evento duplicado, se omite
    return;
  }
  const ev = getPooledEvent(state);
  ev.type = 'noteoff';
  ev.note = note;
  state.eventQueue.push(ev);
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
    releaseEvent(state, ev);
    processed++;
  }
}

function startRenderLoop(state, render, handleEvent) {
  let last = performance.now();
  function frame(now) {
    const delta = now - last;
    let dt = 0;
    if (Number.isFinite(delta) && delta > 0) {
      dt = delta > 250 ? 250 : delta;
    }
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
