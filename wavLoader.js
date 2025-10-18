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

  function normalizeAudioBuffer(audioBuffer, targetDb = -0.1) {
    if (!audioBuffer) return audioBuffer;
    const targetAmplitude = Math.pow(10, targetDb / 20);
    if (!isFinite(targetAmplitude) || targetAmplitude <= 0) {
      return audioBuffer;
    }

    let peak = 0;
    for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex++) {
      const data = audioBuffer.getChannelData(channelIndex);
      for (let i = 0; i < data.length; i++) {
        const absSample = Math.abs(data[i]);
        if (absSample > peak) peak = absSample;
      }
    }

    if (peak === 0) return audioBuffer;

    const gain = targetAmplitude / peak;
    if (!isFinite(gain) || gain === 1) return audioBuffer;

    for (let channelIndex = 0; channelIndex < audioBuffer.numberOfChannels; channelIndex++) {
      const data = audioBuffer.getChannelData(channelIndex);
      for (let i = 0; i < data.length; i++) {
        data[i] *= gain;
      }
    }

    return audioBuffer;
  }

  async function loadWavFile(file, audioCtx) {
    if (!file) throw new Error('No se proporcionó archivo');
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    normalizeAudioBuffer(audioBuffer, -0.1);
    const channel = audioBuffer.getChannelData(0);
    const trimOffset = detectTrimOffset(channel, audioBuffer.sampleRate);
    return { audioBuffer, trimOffset };
  }

  const api = { loadWavFile, detectTrimOffset, normalizeAudioBuffer };
  if (typeof module !== 'undefined') module.exports = api;
  else global.wavLoader = api;
})(typeof window !== 'undefined' ? window : global);
