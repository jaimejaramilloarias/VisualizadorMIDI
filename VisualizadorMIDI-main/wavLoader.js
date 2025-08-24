 (function (global) {
  function detectTrimOffset(channel, sampleRate, threshold = 0.001, windowSec = 0.01) {
    const windowSize = Math.max(1, Math.floor(sampleRate * windowSec));
    for (let i = 0; i < channel.length; i++) {
      let sum = 0;
      for (let j = 0; j < windowSize && i + j < channel.length; j++) {
        const s = channel[i + j];
        sum += s * s;
      }
      const rms = Math.sqrt(sum / windowSize);
      if (rms >= threshold) {
        return i / sampleRate;
      }
    }
    return 0;
  }

  async function loadWavFile(file, audioCtx) {
    if (!file) throw new Error('No se proporcionó archivo');
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const trimOffset = detectTrimOffset(channel, audioBuffer.sampleRate);
    return { audioBuffer, trimOffset };
  }

  const api = { loadWavFile, detectTrimOffset };
  if (typeof module !== 'undefined') module.exports = api;
  else global.wavLoader = api;
})(typeof window !== 'undefined' ? window : global);
