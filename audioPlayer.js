(function (global) {
  const { computeSeekOffset, canStartPlayback } =
    typeof require !== 'undefined' ? require('./utils.js') : global.utils;

  function createAudioPlayer({ createContext } = {}) {
    let audioCtx;
    let audioBuffer = null;
    let trimOffset = 0;
    let source = null;
    let isPlaying = false;
    let playStartTime = 0;
    let startOffset = 0;

    function getAudioContext() {
      if (!audioCtx) {
        audioCtx =
          (createContext && createContext()) ||
          new (global.AudioContext || global.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended' && audioCtx.resume) {
        audioCtx.resume();
      }
      return audioCtx;
    }

    function loadBuffer(buffer, trim = 0) {
      audioBuffer = buffer;
      trimOffset = trim;
      startOffset = 0;
    }

    function getAudioBuffer() {
      return audioBuffer;
    }

    function getTrimOffset() {
      return trimOffset;
    }

    function canStart(notes) {
      return canStartPlayback(audioBuffer, notes);
    }

    function start(notes, onEnded) {
      if (!canStart(notes)) return false;
      const ctx = getAudioContext();
      playStartTime = ctx.currentTime;
      if (audioBuffer) {
        source = ctx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(ctx.destination);
        source.onended = () => {
          isPlaying = false;
          source = null;
          startOffset = 0;
          if (onEnded) onEnded();
        };
        source.start(0, trimOffset + startOffset);
      } else {
        source = null;
      }
      isPlaying = true;
      return true;
    }

    function stop(preserveOffset = true) {
      if (!isPlaying) return;
      const ctx = getAudioContext();
      if (preserveOffset) {
        startOffset += ctx.currentTime - playStartTime;
      } else {
        startOffset = 0;
      }
      if (source) {
        source.onended = null;
        source.stop();
        source = null;
      }
      isPlaying = false;
    }

    function seek(delta, duration, trim = 0) {
      startOffset = computeSeekOffset(startOffset, delta, duration, trim);
      return startOffset;
    }

    function getStartOffset() {
      return startOffset;
    }

    function getCurrentTime() {
      return startOffset + (isPlaying ? getAudioContext().currentTime - playStartTime : 0);
    }

    function resetStartOffset() {
      startOffset = 0;
    }

    return {
      loadBuffer,
      start,
      stop,
      seek,
      canStart,
      isPlaying: () => isPlaying,
      getCurrentTime,
      getStartOffset,
      getAudioBuffer,
      getTrimOffset,
      getAudioContext,
      resetStartOffset,
    };
  }

  const api = { createAudioPlayer };
  if (typeof module !== 'undefined') module.exports = api;
  else global.audioPlayer = api;
})(typeof window !== 'undefined' ? window : global);
