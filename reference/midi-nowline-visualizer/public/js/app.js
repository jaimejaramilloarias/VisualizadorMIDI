(() => {
  "use strict";

  const PITCH_MIN = 21;
  const PITCH_MAX = 108;
  const PITCH_COUNT = 88;
  const NOTE_ON_BUMP_SECONDS = 0.18;
  const NOTE_RELEASE_GLOW_SECONDS = 0.12;

  const canvas = document.getElementById("visualizer");
  const ctx = canvas.getContext("2d", { alpha: false });
  const audio = document.getElementById("audioElement");

  const playButton = document.getElementById("playButton");
  const restartButton = document.getElementById("restartButton");
  const midiInput = document.getElementById("midiInput");
  const audioInput = document.getElementById("audioInput");
  const windowSlider = document.getElementById("windowSlider");
  const glowSlider = document.getElementById("glowSlider");
  const bumpSlider = document.getElementById("bumpSlider");
  const offsetSlider = document.getElementById("offsetSlider");
  const windowValue = document.getElementById("windowValue");
  const glowValue = document.getElementById("glowValue");
  const bumpValue = document.getElementById("bumpValue");
  const offsetValue = document.getElementById("offsetValue");
  const statusText = document.getElementById("statusText");
  const timeReadout = document.getElementById("timeReadout");
  const noteReadout = document.getElementById("noteReadout");

  const state = {
    notes: makeDemoTimeline(),
    playing: false,
    internalTime: 0,
    startedAt: 0,
    pausedAt: 0,
    secondsVisible: 8,
    glowAmount: 1,
    bumpAmount: 1,
    syncOffset: 0,
    activeCount: 0,
    dpr: 1,
    cssWidth: 0,
    cssHeight: 0
  };

  const channelStyles = {
    1: {
      family: "strings",
      color: "#d58cff",
      accent: "#ffe6ff",
      behavior: "slow-wave",
      height: 0.62,
      glow: 0.72,
      compact: 4.8,
      bounce: 0.22
    },
    2: {
      family: "horns",
      color: "#ffbf63",
      accent: "#fff0b8",
      behavior: "warm-pulse",
      height: 0.82,
      glow: 0.95,
      compact: 5.2,
      bounce: 0.34
    },
    3: {
      family: "brass",
      color: "#ff6c4a",
      accent: "#fff4cc",
      behavior: "bright-flare",
      height: 0.72,
      glow: 1.08,
      compact: 5,
      bounce: 0.48
    },
    4: {
      family: "doubleReeds",
      color: "#c178ff",
      accent: "#ffd7ff",
      behavior: "nervous",
      height: 0.48,
      glow: 0.5,
      compact: 3.7,
      bounce: 0.42
    },
    5: {
      family: "woodwinds",
      color: "#72e5ff",
      accent: "#e8fbff",
      behavior: "air",
      height: 0.52,
      glow: 0.46,
      compact: 4.1,
      bounce: 0.24
    },
    10: {
      family: "percussion",
      color: "#65f2ca",
      accent: "#f0fff9",
      behavior: "impact",
      height: 0.95,
      glow: 1.2,
      compact: 3.1,
      bounce: 0.36
    }
  };

  const familyStyles = {
    strings: channelStyles[1],
    horns: channelStyles[2],
    brass: channelStyles[3],
    doubleReeds: channelStyles[4],
    woodwinds: channelStyles[5],
    percussion: channelStyles[10],
    saxophones: {
      family: "saxophones",
      color: "#ce8767",
      accent: "#ffe2c9",
      behavior: "warm-pulse",
      height: 0.62,
      glow: 0.66,
      compact: 4.4,
      bounce: 0.32
    },
    pluckedStrings: {
      family: "pluckedStrings",
      color: "#7ee7da",
      accent: "#eafffb",
      behavior: "bright-flare",
      height: 0.58,
      glow: 0.62,
      compact: 3.8,
      bounce: 0.44
    },
    voices: {
      family: "voices",
      color: "#bebebe",
      accent: "#ffffff",
      behavior: "slow-wave",
      height: 0.7,
      glow: 0.58,
      compact: 4.8,
      bounce: 0.2
    },
    auxiliary: {
      family: "auxiliary",
      color: "#80d8d2",
      accent: "#efffff",
      behavior: "warm-pulse",
      height: 0.62,
      glow: 0.5,
      compact: 4.2,
      bounce: 0.25
    }
  };

  const pitchClassColors = [
    "#ff5f6d",
    "#ff9966",
    "#ffd166",
    "#c9f56a",
    "#7df0ba",
    "#5be7c4",
    "#69d8ff",
    "#72a7ff",
    "#a48cff",
    "#d17cff",
    "#ff7ad9",
    "#ff7aa2"
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function lerp(a, b, amount) {
    return a + (b - a) * amount;
  }

  function smoothstep(edge0, edge1, value) {
    const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
    return x * x * (3 - 2 * x);
  }

  function easeOutCubic(value) {
    const x = clamp(value, 0, 1);
    return 1 - Math.pow(1 - x, 3);
  }

  function normalizeAccents(name) {
    if (typeof name !== "string") {
      return "";
    }
    try {
      return decodeURIComponent(escape(name)).normalize("NFC");
    } catch (error) {
      return name.normalize("NFC");
    }
  }

  function normalizeInstrumentName(name) {
    return normalizeAccents(name)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\(.*?\)/g, "")
      .replace(/\b[ivx]+\b/g, "")
      .replace(/\d+/g, "")
      .replace(/[^a-zñ\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  const instrumentFamilyRules = [
    { match: ["violin", "viola", "violonchelo", "cello", "contrabajo", "bass"], family: "strings" },
    { match: ["corno", "horn"], family: "horns" },
    { match: ["trompeta", "trumpet", "trombon", "tuba", "bombardino", "euphonium"], family: "brass" },
    { match: ["oboe", "fagot", "bassoon", "corno ingles", "english horn"], family: "doubleReeds" },
    { match: ["flauta", "flautin", "piccolo", "clarinete", "clarinet"], family: "woodwinds" },
    { match: ["saxofon", "saxophone", "saxo"], family: "saxophones" },
    { match: ["arpa", "harp", "guitarra", "guitar", "pizzicato"], family: "pluckedStrings" },
    { match: ["voz", "voice", "coro", "choir"], family: "voices" },
    { match: ["percusion", "percussion", "timbal", "drum", "conga", "clave", "platillo", "cymbal"], family: "percussion" },
    { match: ["piano", "celesta", "campana", "bells", "xilofono", "marimba", "vibrafono"], family: "auxiliary" }
  ];

  function detectInstrumentFamily(name, channel) {
    if (channel === 10) {
      return "percussion";
    }

    const normalized = normalizeInstrumentName(name);
    for (const rule of instrumentFamilyRules) {
      if (rule.match.some((token) => normalized.includes(token))) {
        return rule.family;
      }
    }

    return null;
  }

  function getStyleForNote(note) {
    if (note && note.family && familyStyles[note.family]) {
      return familyStyles[note.family];
    }
    return channelStyles[note.channel] || channelStyles[((note.channel - 1) % 3) + 1];
  }

  function summarizeFamilies(notes) {
    const counts = new Map();
    for (const note of notes) {
      const family = note.family || "unknown";
      counts.set(family, (counts.get(family) || 0) + 1);
    }
    return [...counts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([family, count]) => `${family}:${count}`)
      .join(" · ");
  }

  function detectTrimOffset(channel, sampleRate, threshold = 0.001, windowSec = 0.01) {
    const windowSize = Math.max(1, Math.floor(sampleRate * windowSec));
    for (let i = 0; i < channel.length; i += 1) {
      let sum = 0;
      for (let j = 0; j < windowSize && i + j < channel.length; j += 1) {
        const sample = channel[i + j];
        sum += sample * sample;
      }
      const rms = Math.sqrt(sum / windowSize);
      if (rms >= threshold) {
        return i / sampleRate;
      }
    }
    return 0;
  }

  async function estimateAudioTrimOffset(file) {
    if (!file || (!window.AudioContext && !window.webkitAudioContext)) {
      return 0;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContextClass();
    try {
      const buffer = await file.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
      const channel = audioBuffer.getChannelData(0);
      return detectTrimOffset(channel, audioBuffer.sampleRate);
    } catch (error) {
      return 0;
    } finally {
      if (audioContext.close) {
        audioContext.close();
      }
    }
  }

  function resizeCanvas() {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));

    if (state.cssWidth === width && state.cssHeight === height && state.dpr === dpr) {
      return;
    }

    state.cssWidth = width;
    state.cssHeight = height;
    state.dpr = dpr;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function getNow() {
    if (audio.src) {
      return Math.max(0, audio.currentTime + state.syncOffset);
    }

    if (state.playing) {
      return Math.max(0, (performance.now() - state.startedAt) / 1000 + state.syncOffset);
    }

    return Math.max(0, state.pausedAt + state.syncOffset);
  }

  function setTransportTime(seconds) {
    const cleanSeconds = Math.max(0, seconds);
    state.pausedAt = cleanSeconds;
    if (audio.src) {
      audio.currentTime = cleanSeconds;
    }
    if (state.playing) {
      state.startedAt = performance.now() - cleanSeconds * 1000;
    }
  }

  async function togglePlay() {
    if (state.playing) {
      state.playing = false;
      state.pausedAt = getNow() - state.syncOffset;
      audio.pause();
      playButton.textContent = "Play";
      return;
    }

    state.playing = true;
    if (audio.src) {
      try {
        await audio.play();
      } catch (error) {
        state.playing = false;
        statusText.textContent = "Audio blocked";
        return;
      }
    } else {
      state.startedAt = performance.now() - state.pausedAt * 1000;
    }
    playButton.textContent = "Pause";
  }

  function restart() {
    setTransportTime(0);
    if (audio.src && state.playing) {
      audio.play();
    }
  }

  function makeDemoTimeline() {
    const notes = [];
    const demoFamilies = {
      1: "strings",
      2: "horns",
      3: "brass",
      4: "doubleReeds",
      5: "woodwinds",
      10: "percussion"
    };
    const add = (pitch, start, duration, velocity, channel) => {
      const family = demoFamilies[channel] || "strings";
      notes.push({
        pitch,
        start,
        end: start + duration,
        duration,
        velocity,
        channel,
        track: 0,
        trackName: family,
        instrument: family,
        family
      });
    };

    for (let bar = 0; bar < 28; bar += 1) {
      const t = bar * 1.6;
      const root = [45, 48, 43, 50, 41, 53, 48][bar % 7];
      add(root, t, 1.35, 0.78, 1);
      add(root + 7, t + 0.04, 1.2, 0.62, 1);
      add(root + 12, t + 0.08, 1.05, 0.56, 1);

      add(72 + ((bar * 5) % 12), t + 0.2, 0.34, 0.88, 2);
      add(76 + ((bar * 3) % 9), t + 0.62, 0.28, 0.72, 2);
      add(67 + ((bar * 7) % 14), t + 1.02, 0.42, 0.8, 2);

      add(58 + ((bar * 5) % 15), t + 0.18, 0.46, 0.76, 3);
      add(63 + ((bar * 6) % 18), t + 0.82, 0.52, 0.66, 3);
      add(69 + ((bar * 4) % 16), t + 1.18, 0.34, 0.82, 3);

      add(61 + ((bar * 4) % 17), t + 0.38, 0.62, 0.64, 4);
      add(66 + ((bar * 6) % 19), t + 1.14, 0.48, 0.52, 4);

      add(83 + ((bar * 3) % 13), t + 0.12, 0.3, 0.58, 5);
      add(88 + ((bar * 5) % 12), t + 0.72, 0.34, 0.68, 5);

      for (let step = 0; step < 4; step += 1) {
        add(36 + (step % 2) * 7, t + step * 0.4, 0.08, step === 0 ? 1 : 0.58, 10);
      }

      if (bar % 2 === 0) {
        add(84 + ((bar * 2) % 12), t + 1.22, 0.5, 0.72, 5);
      }
    }

    return notes.sort((a, b) => a.start - b.start);
  }

  function parseMidi(arrayBuffer) {
    const view = new DataView(arrayBuffer);
    let offset = 0;
    const trackInfo = [];

    const readString = (length) => {
      let value = "";
      for (let i = 0; i < length; i += 1) {
        value += String.fromCharCode(view.getUint8(offset));
        offset += 1;
      }
      return value;
    };

    const readUint16 = () => {
      const value = view.getUint16(offset);
      offset += 2;
      return value;
    };

    const readUint32 = () => {
      const value = view.getUint32(offset);
      offset += 4;
      return value;
    };

    const readVariableLength = () => {
      let value = 0;
      let byte = 0;
      do {
        byte = view.getUint8(offset);
        offset += 1;
        value = (value << 7) + (byte & 0x7f);
      } while (byte & 0x80);
      return value;
    };

    const decodeMidiText = (start, length) => {
      const bytes = new Uint8Array(view.buffer, view.byteOffset + start, length);
      try {
        return new TextDecoder("utf-8").decode(bytes).trim();
      } catch (error) {
        let value = "";
        for (let i = 0; i < length; i += 1) {
          value += String.fromCharCode(view.getUint8(start + i));
        }
        return value.trim();
      }
    };

    if (readString(4) !== "MThd") {
      throw new Error("Invalid MIDI header");
    }

    const headerLength = readUint32();
    const headerEnd = offset + headerLength;
    readUint16();
    const trackCount = readUint16();
    const division = readUint16();
    offset = headerEnd;

    if (division & 0x8000) {
      throw new Error("SMPTE MIDI timing is not supported yet");
    }

    const ticksPerQuarter = division;
    const rawEvents = [];

    for (let track = 0; track < trackCount; track += 1) {
      if (readString(4) !== "MTrk") {
        throw new Error("Invalid MIDI track");
      }

      const trackLength = readUint32();
      const trackEnd = offset + trackLength;
      let tick = 0;
      let runningStatus = null;
      let trackName = `Track ${track}`;
      let instrumentName = trackName;

      while (offset < trackEnd) {
        tick += readVariableLength();
        let status = view.getUint8(offset);

        if (status & 0x80) {
          offset += 1;
          runningStatus = status;
        } else if (runningStatus !== null) {
          status = runningStatus;
        } else {
          throw new Error("Missing MIDI running status");
        }

        if (status === 0xff) {
          const type = view.getUint8(offset);
          offset += 1;
          const length = readVariableLength();
          const metaStart = offset;
          if (type === 0x51 && length === 3) {
            const microsecondsPerQuarter =
              (view.getUint8(offset) << 16) |
              (view.getUint8(offset + 1) << 8) |
              view.getUint8(offset + 2);
            rawEvents.push({ type: "tempo", tick, microsecondsPerQuarter });
          } else if (type === 0x03 && length > 0) {
            trackName = decodeMidiText(metaStart, length) || trackName;
          } else if (type === 0x04 && length > 0) {
            instrumentName = decodeMidiText(metaStart, length) || instrumentName;
          }
          offset += length;
          continue;
        }

        if (status === 0xf0 || status === 0xf7) {
          const length = readVariableLength();
          offset += length;
          continue;
        }

        const command = status & 0xf0;
        const channel = (status & 0x0f) + 1;
        const data1 = view.getUint8(offset);
        offset += 1;
        const hasSecondByte = command !== 0xc0 && command !== 0xd0;
        const data2 = hasSecondByte ? view.getUint8(offset) : 0;
        if (hasSecondByte) {
          offset += 1;
        }

        if (command === 0x90 && data2 > 0) {
          rawEvents.push({
            type: "noteOn",
            tick,
            pitch: data1,
            velocity: data2 / 127,
            channel,
            track,
            trackName,
            instrumentName
          });
        } else if (command === 0x80 || (command === 0x90 && data2 === 0)) {
          rawEvents.push({ type: "noteOff", tick, pitch: data1, channel, track });
        }
      }

      trackInfo[track] = { trackName, instrumentName };
      offset = trackEnd;
    }

    rawEvents.sort((a, b) => a.tick - b.tick);

    let currentTick = 0;
    let currentSeconds = 0;
    let tempo = 500000;
    const tickToSeconds = new Map();

    for (const event of rawEvents) {
      const deltaTicks = event.tick - currentTick;
      currentSeconds += (deltaTicks * tempo) / ticksPerQuarter / 1000000;
      currentTick = event.tick;
      tickToSeconds.set(event, currentSeconds);
      if (event.type === "tempo") {
        tempo = event.microsecondsPerQuarter;
      }
    }

    const active = new Map();
    const notes = [];

    for (const event of rawEvents) {
      const eventSeconds = tickToSeconds.get(event);
      if (event.type === "noteOn") {
        const key = `${event.track}:${event.channel}:${event.pitch}`;
        if (!active.has(key)) {
          active.set(key, []);
        }
        active.get(key).push(event);
      } else if (event.type === "noteOff") {
        const key = `${event.track}:${event.channel}:${event.pitch}`;
        const stack = active.get(key);
        const startEvent = stack && stack.shift();
        if (!startEvent) {
          continue;
        }

        const start = tickToSeconds.get(startEvent);
        const end = Math.max(start + 0.03, eventSeconds);
        if (startEvent.pitch >= PITCH_MIN && startEvent.pitch <= PITCH_MAX) {
          const info = trackInfo[startEvent.track] || {};
          const trackName = startEvent.trackName || info.trackName || `Track ${startEvent.track}`;
          const instrument = startEvent.instrumentName || info.instrumentName || trackName;
          const family =
            detectInstrumentFamily(instrument, startEvent.channel) ||
            detectInstrumentFamily(trackName, startEvent.channel) ||
            getStyleForNote(startEvent).family;
          notes.push({
            pitch: startEvent.pitch,
            start,
            end,
            duration: end - start,
            velocity: startEvent.velocity,
            channel: startEvent.channel,
            track: startEvent.track,
            trackName,
            instrument,
            family
          });
        }
      }
    }

    return notes.sort((a, b) => a.start - b.start);
  }

  function getVisibleNotes(now) {
    const startLimit = now - state.secondsVisible / 2 - 1;
    const endLimit = now + state.secondsVisible / 2 + 1;
    return state.notes.filter((note) => note.end >= startLimit && note.start <= endLimit);
  }

  function colorForNote(note, style) {
    return style.color || pitchClassColors[note.pitch % 12];
  }

  function drawBackground(width, height) {
    const gradient = ctx.createRadialGradient(width / 2, height * 0.5, 0, width / 2, height * 0.5, width * 0.62);
    gradient.addColorStop(0, "#101116");
    gradient.addColorStop(0.52, "#08090c");
    gradient.addColorStop(1, "#050609");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function getNowLineImpact(visibleNotes, now) {
    let impact = 0;
    for (const note of visibleNotes) {
      const attackAge = now - note.start;
      if (attackAge < -0.03 || attackAge > 0.24) {
        continue;
      }

      const preAttack = attackAge < 0 ? smoothstep(-0.03, 0, attackAge) * 0.22 : 0;
      const decay = attackAge >= 0 ? 1 - smoothstep(0, 0.24, attackAge) : 0;
      impact += (preAttack + decay) * lerp(0.42, 1, note.velocity);
    }

    return clamp(impact, 0, 1.85);
  }

  function drawGrid(width, height) {
    const cellHeight = height / PITCH_COUNT;
    ctx.save();
    ctx.lineWidth = 1;
    for (let row = 0; row <= PITCH_COUNT; row += 1) {
      const pitch = PITCH_MAX - row;
      const y = Math.round(row * cellHeight) + 0.5;
      const isOctave = pitch % 12 === 0;
      ctx.strokeStyle = isOctave ? "rgba(255,255,255,0.09)" : "rgba(255,255,255,0.028)";
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawNowLine(width, height, now, impact) {
    const nowX = width / 2;
    const energy = clamp(impact, 0, 1);
    const glowWidth = 44 + energy * 72;
    const shake = Math.min(5.5, impact * state.bumpAmount * 4.2);
    const lineAlpha = 0.18 + energy * 0.18;

    ctx.save();
    const glow = ctx.createLinearGradient(nowX - glowWidth, 0, nowX + glowWidth, 0);
    glow.addColorStop(0, "rgba(255,204,102,0)");
    glow.addColorStop(0.5, `rgba(255,204,102,${0.035 + energy * 0.075})`);
    glow.addColorStop(1, "rgba(255,204,102,0)");
    ctx.fillStyle = glow;
    ctx.fillRect(nowX - glowWidth, 0, glowWidth * 2, height);

    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = "#ffdf8a";
    ctx.shadowBlur = 8 + energy * 22;
    ctx.strokeStyle = `rgba(255,236,184,${lineAlpha})`;
    ctx.lineWidth = 1.4 + energy * 1.6;
    ctx.beginPath();
    for (let y = 0; y <= height; y += 14) {
      const wave =
        Math.sin(now * 95 + y * 0.055) * shake +
        Math.sin(now * 53 + y * 0.024) * shake * 0.46;
      const x = nowX + wave + 0.5;
      if (y === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = `rgba(255,246,220,${0.075 + energy * 0.095})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(nowX + 0.5, 0);
    ctx.lineTo(nowX + 0.5, height);
    ctx.stroke();
    ctx.restore();
  }

  function roundRectPath(context, x, y, width, height, radius) {
    const r = Math.min(radius, Math.abs(width) / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
  }

  function diamondPath(context, x, y, width, height) {
    const notch = Math.min(height * 0.58, Math.max(8, width * 0.18));
    context.beginPath();
    context.moveTo(x + notch, y);
    context.lineTo(x + width - notch, y);
    context.lineTo(x + width, y + height / 2);
    context.lineTo(x + width - notch, y + height);
    context.lineTo(x + notch, y + height);
    context.lineTo(x, y + height / 2);
    context.closePath();
  }

  function orbPath(context, x, y, width, height) {
    const radius = height / 2;
    const left = x + radius;
    const right = x + Math.max(radius, width - radius);
    context.beginPath();
    context.arc(left, y + radius, radius, Math.PI / 2, Math.PI * 1.5);
    context.arc(right, y + radius, radius, Math.PI * 1.5, Math.PI / 2);
    context.closePath();
  }

  function circlePath(context, x, y, width, height) {
    context.beginPath();
    context.ellipse(x + width / 2, y + height / 2, Math.max(width / 2, 1), height / 2, 0, 0, Math.PI * 2);
  }

  function trianglePath(context, x, y, width, height) {
    const tip = Math.min(Math.max(height * 0.84, 8), Math.max(width * 0.42, 8));
    const tail = Math.max(0, width - tip);
    context.beginPath();
    if (tail < height * 0.42) {
      context.moveTo(x, y + height);
      context.lineTo(x + width, y + height / 2);
      context.lineTo(x, y);
    } else {
      context.moveTo(x, y + height * 0.18);
      context.lineTo(x + tail, y + height * 0.18);
      context.lineTo(x + width, y + height / 2);
      context.lineTo(x + tail, y + height * 0.82);
      context.lineTo(x, y + height * 0.82);
    }
    context.closePath();
  }

  function shapePath(context, shape, x, y, width, height) {
    if (shape === "diamond") {
      diamondPath(context, x, y, width, height);
    } else if (shape === "circle") {
      circlePath(context, x, y, width, height);
    } else if (shape === "triangle") {
      trianglePath(context, x, y, width, height);
    } else if (shape === "orb") {
      orbPath(context, x, y, width, height);
    } else {
      roundRectPath(context, x, y, width, height, height / 2);
    }
  }

  function getStretchGeometry(note, now, width, cellHeight, style) {
    const nowX = width / 2;
    const pxPerSecond = width / state.secondsVisible;
    const compactWidth = clamp(cellHeight * (style.compact || 4.2), 16, 46);
    let xLeft = nowX + (note.start - now) * pxPerSecond;
    let xRight = nowX + (note.end - now) * pxPerSecond;

    if (now > note.end) {
      const releaseAge = now - note.end;
      const bounceStrength = (style.bounce || 0.25) * compactWidth;
      const bounce = Math.sin(releaseAge * 34) * Math.exp(-releaseAge * 8) * bounceStrength;
      xRight += bounce;
    }

    const noteWidth = xRight - xLeft;

    return {
      xLeft,
      xRight,
      noteWidth,
      compactWidth
    };
  }

  function brassBeamPath(context, x, y, width, height) {
    const flare = Math.min(Math.max(height * 1.1, 10), Math.max(width * 0.22, 10));
    context.beginPath();
    context.moveTo(x, y + height / 2);
    context.lineTo(x + flare, y);
    context.lineTo(x + width, y + height * 0.18);
    context.lineTo(x + width, y + height * 0.82);
    context.lineTo(x + flare, y + height);
    context.closePath();
  }

  function fillFamilyShape(style, xLeft, y, noteWidth, noteHeight, color, accent, alpha, glow) {
    const gradient = ctx.createLinearGradient(xLeft, 0, xLeft + noteWidth, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0.05)");
    gradient.addColorStop(0.16, color);
    gradient.addColorStop(0.5, accent);
    gradient.addColorStop(0.84, color);
    gradient.addColorStop(1, "rgba(255,255,255,0.04)");

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = 9 + glow * 20;
    ctx.globalAlpha = clamp(alpha * 0.22 + glow * 0.08, 0, 0.44);
    shapePath(ctx, "capsule", xLeft, y, noteWidth, noteHeight);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha;
    shapePath(ctx, "capsule", xLeft, y, noteWidth, noteHeight);
    ctx.fillStyle = gradient;
    ctx.fill();
    ctx.restore();
  }

  function drawStringsNote(note, now, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow) {
    fillFamilyShape(null, xLeft, y + noteHeight * 0.16, noteWidth, noteHeight * 0.68, color, accent, alpha * 0.46, glow * 0.5);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (let strand = -1; strand <= 1; strand += 1) {
      const strandY = centerY + strand * noteHeight * 0.18;
      const phase = note.pitch * 0.17 + strand * 0.9;
      ctx.beginPath();
      for (let x = xLeft; x <= xLeft + noteWidth; x += 26) {
        const wave = Math.sin(x * 0.022 + now * 0.8 + phase) * noteHeight * 0.045;
        if (x === xLeft) {
          ctx.moveTo(x, strandY + wave);
        } else {
          ctx.lineTo(x, strandY + wave);
        }
      }
      ctx.strokeStyle = strand === 0 ? accent : color;
      ctx.globalAlpha = alpha * (strand === 0 ? 0.58 : 0.28);
      ctx.lineWidth = Math.max(1.25, noteHeight * (strand === 0 ? 0.13 : 0.075));
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawHornsNote(note, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow, bump) {
    fillFamilyShape(null, xLeft, y, noteWidth, noteHeight, color, accent, alpha * 0.82, glow);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1.2, noteHeight * 0.1);
    ctx.globalAlpha = alpha * 0.2;
    ctx.beginPath();
    ctx.ellipse(xLeft + noteHeight * 0.55, centerY, noteHeight * (0.72 + bump * 0.25), noteHeight * 0.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = alpha * (0.1 + bump * 0.18);
    ctx.beginPath();
    ctx.ellipse(xLeft + noteHeight * 0.8, centerY, noteHeight * (1.05 + bump * 0.45), noteHeight * 0.68, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawBrassNote(note, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow, bump) {
    const gradient = ctx.createLinearGradient(xLeft, 0, xLeft + noteWidth, 0);
    gradient.addColorStop(0, "rgba(255,255,255,0.1)");
    gradient.addColorStop(0.2, accent);
    gradient.addColorStop(0.62, "#ff9a54");
    gradient.addColorStop(1, "rgba(255,255,255,0.08)");

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 + glow * 20;
    ctx.globalAlpha = clamp(alpha * 0.24 + bump * 0.16, 0, 0.52);
    brassBeamPath(ctx, xLeft, y, noteWidth, noteHeight);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = "source-over";
    ctx.globalAlpha = alpha * 0.86;
    brassBeamPath(ctx, xLeft, y, noteWidth, noteHeight);
    ctx.fillStyle = gradient;
    ctx.fill();

    ctx.globalCompositeOperation = "lighter";
    ctx.strokeStyle = accent;
    ctx.globalAlpha = alpha * 0.32;
    ctx.lineWidth = Math.max(1, noteHeight * 0.09);
    ctx.beginPath();
    ctx.moveTo(xLeft + noteHeight * 0.8, y + noteHeight * 0.16);
    ctx.lineTo(xLeft + noteWidth, y + noteHeight * 0.3);
    ctx.stroke();
    ctx.restore();
  }

  function drawDoubleReedsNote(note, now, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = 5 + glow * 10;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    diamondPath(ctx, xLeft, y + noteHeight * 0.22, noteWidth, noteHeight * 0.56);
    ctx.globalAlpha = alpha * 0.46;
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1.1, noteHeight * 0.1);
    ctx.globalAlpha = alpha * 0.42;
    ctx.beginPath();
    ctx.moveTo(xLeft + noteHeight * 0.5, centerY);
    ctx.lineTo(xLeft + noteWidth - noteHeight * 0.5, centerY);
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.2;
    ctx.lineWidth = Math.max(1, noteHeight * 0.07);
    const markerX = xLeft + Math.min(noteWidth - noteHeight * 0.35, noteHeight * 1.4);
    ctx.beginPath();
    ctx.moveTo(markerX, centerY - noteHeight * 0.26);
    ctx.lineTo(markerX + noteHeight * 0.42, centerY);
    ctx.lineTo(markerX, centerY + noteHeight * 0.26);
    ctx.stroke();
    ctx.restore();
  }

  function drawWoodwindsNote(note, now, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = 6 + glow * 12;

    fillFamilyShape(null, xLeft, y + noteHeight * 0.34, noteWidth, noteHeight * 0.32, color, accent, alpha * 0.25, glow * 0.35);

    const dotCount = Math.max(2, Math.min(5, Math.floor(noteWidth / 42)));
    for (let i = 0; i < dotCount; i += 1) {
      const amount = dotCount === 1 ? 0.5 : i / (dotCount - 1);
      const x = lerp(xLeft + noteHeight * 0.7, xLeft + noteWidth - noteHeight * 0.7, amount);
      const wobble = Math.sin(now * 1.8 + i * 1.7 + note.pitch) * noteHeight * 0.12;
      const radius = Math.max(1.4, noteHeight * lerp(0.08, 0.13, 1 - amount * 0.4));
      ctx.globalAlpha = alpha * lerp(0.28, 0.15, amount);
      ctx.fillStyle = i === 0 ? accent : color;
      ctx.beginPath();
      ctx.arc(x, centerY + wobble, radius, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPercussionNote(note, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow, bump) {
    const hitX = xLeft + Math.min(noteWidth * 0.5, noteHeight * 0.55);
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.shadowColor = color;
    ctx.shadowBlur = 8 + glow * 18;
    ctx.globalAlpha = alpha * 0.58;
    circlePath(ctx, xLeft, y, Math.max(noteHeight, Math.min(noteWidth, noteHeight * 1.8)), noteHeight);
    ctx.fillStyle = color;
    ctx.fill();

    ctx.strokeStyle = accent;
    ctx.lineWidth = Math.max(1, noteHeight * 0.11);
    ctx.globalAlpha = alpha * (0.24 + bump * 0.3);
    ctx.beginPath();
    ctx.arc(hitX, centerY, noteHeight * (0.66 + bump * 0.7), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawFamilyNote(note, now, style, xLeft, y, noteWidth, noteHeight, centerY, color, alpha, glow, bump) {
    const accent = style.accent || "#ffffff";
    if (style.family === "strings") {
      drawStringsNote(note, now, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow);
    } else if (style.family === "horns") {
      drawHornsNote(note, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow, bump);
    } else if (style.family === "brass") {
      drawBrassNote(note, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow, bump);
    } else if (style.family === "doubleReeds") {
      drawDoubleReedsNote(note, now, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow);
    } else if (style.family === "woodwinds") {
      drawWoodwindsNote(note, now, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow);
    } else if (style.family === "percussion") {
      drawPercussionNote(note, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha, glow, bump);
    } else if (style.family === "saxophones") {
      drawHornsNote(note, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha * 0.78, glow * 0.7, bump * 0.7);
    } else if (style.family === "pluckedStrings") {
      drawBrassNote(note, xLeft, y, noteWidth, noteHeight * 0.78, centerY, color, accent, alpha * 0.72, glow * 0.55, bump);
    } else if (style.family === "voices") {
      drawStringsNote(note, now, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha * 0.68, glow * 0.62);
    } else if (style.family === "auxiliary") {
      drawWoodwindsNote(note, now, xLeft, y, noteWidth, noteHeight, centerY, color, accent, alpha * 0.86, glow * 0.8);
    } else {
      fillFamilyShape(style, xLeft, y, noteWidth, noteHeight, color, accent, alpha, glow);
    }
  }

  function drawNote(note, now, width, height) {
    const nowX = width / 2;
    const row = PITCH_MAX - note.pitch;
    const cellHeight = height / PITCH_COUNT;
    const centerY = row * cellHeight + cellHeight / 2;
    const style = getStyleForNote(note);
    const { xLeft, xRight, noteWidth, compactWidth } = getStretchGeometry(note, now, width, cellHeight, style);

    if (xRight < -80 || xLeft > width + 80 || noteWidth <= 0.5) {
      return false;
    }

    const distanceToSegment = xLeft > nowX ? xLeft - nowX : nowX > xRight ? nowX - xRight : 0;
    const centerFactor = 1 - smoothstep(0, width * 0.42, distanceToSegment);
    const attackAge = now - note.start;
    const releaseAge = now - note.end;
    const attackEnvelope =
      attackAge >= 0 && attackAge <= NOTE_ON_BUMP_SECONDS
        ? Math.sin((1 - attackAge / NOTE_ON_BUMP_SECONDS) * Math.PI * 0.5)
        : 0;
    const releaseEnvelope =
      releaseAge >= 0 && releaseAge <= NOTE_RELEASE_GLOW_SECONDS
        ? 1 - smoothstep(0, NOTE_RELEASE_GLOW_SECONDS, releaseAge)
        : 0;

    const pulse =
      style.behavior.includes("pulse") && now >= note.start && now <= note.end
        ? (Math.sin((now - note.start) * Math.PI * 7) + 1) * 0.035
        : 0;
    const stretchFactor = clamp((noteWidth - compactWidth) / Math.max(width * 0.3, 1), 0, 1);
    const bump = attackEnvelope * state.bumpAmount;
    const noteHeight = cellHeight * clamp(style.height + bump * 0.42 + pulse - stretchFactor * 0.08, 0.2, 1.65);
    const y = centerY - noteHeight / 2;
    const color = colorForNote(note, style);
    const brightness = clamp(0.2 + centerFactor * 0.8 + bump * 0.5 + releaseEnvelope * 0.16, 0, 1.35);
    const alpha = clamp((0.1 + brightness * 0.82) * lerp(0.58, 1, note.velocity), 0, 1);
    const glow = (centerFactor * style.glow + bump * 1.45 + releaseEnvelope * 0.55) * state.glowAmount;

    drawFamilyNote(note, now, style, xLeft, y, noteWidth, noteHeight, centerY, color, alpha, glow, bump);

    if (bump > 0.01) {
      const ringRadius = lerp(noteHeight * 0.32, noteHeight * 1.6, easeOutCubic(1 - attackAge / NOTE_ON_BUMP_SECONDS));
      ctx.save();
      ctx.globalCompositeOperation = "lighter";
      ctx.globalAlpha = clamp(bump * 0.28, 0, 0.5);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5 + bump * 2;
      ctx.beginPath();
      ctx.arc(nowX, centerY, ringRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    return true;
  }

  function render() {
    resizeCanvas();
    const width = state.cssWidth;
    const height = state.cssHeight;
    const now = getNow();
    const visibleNotes = getVisibleNotes(now);

    drawBackground(width, height);
    drawGrid(width, height);

    let drawn = 0;
    for (const note of visibleNotes) {
      if (drawNote(note, now, width, height)) {
        drawn += 1;
      }
    }

    state.activeCount = visibleNotes.filter((note) => note.start <= now && note.end >= now).length;
    timeReadout.textContent = `${now.toFixed(2)}s`;
    noteReadout.textContent = `${state.activeCount} active / ${drawn} drawn`;

    requestAnimationFrame(render);
  }

  async function loadMidiFile(file) {
    try {
      const buffer = await file.arrayBuffer();
      const notes = parseMidi(buffer);
      if (!notes.length) {
        throw new Error("No playable notes found");
      }
      state.notes = notes;
      setTransportTime(0);
      const familySummary = summarizeFamilies(notes);
      statusText.textContent = familySummary
        ? `${file.name} · ${notes.length} notes · ${familySummary}`
        : `${file.name} · ${notes.length} notes`;
    } catch (error) {
      statusText.textContent = `MIDI error: ${error.message}`;
    }
  }

  async function loadAudioFile(file) {
    if (audio.src) {
      URL.revokeObjectURL(audio.src);
    }
    audio.src = URL.createObjectURL(file);
    audio.load();
    setTransportTime(0);
    statusText.textContent = `${file.name}`;

    const trimOffset = await estimateAudioTrimOffset(file);
    if (trimOffset > 0.015) {
      const clampedTrim = clamp(trimOffset, 0, Math.abs(Number(offsetSlider.min) || 2));
      offsetSlider.value = String(-clampedTrim);
      syncControls();
      statusText.textContent = `${file.name} · trim ${trimOffset.toFixed(3)}s`;
    }
  }

  function syncControls() {
    state.secondsVisible = Number(windowSlider.value);
    state.glowAmount = Number(glowSlider.value);
    state.bumpAmount = Number(bumpSlider.value);
    state.syncOffset = Number(offsetSlider.value);

    windowValue.textContent = `${state.secondsVisible}s`;
    glowValue.textContent = state.glowAmount.toFixed(2);
    bumpValue.textContent = state.bumpAmount.toFixed(2);
    offsetValue.textContent = `${state.syncOffset.toFixed(2)}s`;
  }

  playButton.addEventListener("click", togglePlay);
  restartButton.addEventListener("click", restart);
  midiInput.addEventListener("change", () => {
    const file = midiInput.files && midiInput.files[0];
    if (file) {
      loadMidiFile(file);
    }
  });
  audioInput.addEventListener("change", () => {
    const file = audioInput.files && audioInput.files[0];
    if (file) {
      loadAudioFile(file);
    }
  });
  audio.addEventListener("ended", () => {
    state.playing = false;
    state.pausedAt = 0;
    playButton.textContent = "Play";
  });

  [windowSlider, glowSlider, bumpSlider, offsetSlider].forEach((input) => {
    input.addEventListener("input", syncControls);
  });

  window.addEventListener("resize", resizeCanvas);
  syncControls();
  render();
})();
