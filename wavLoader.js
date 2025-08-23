(function (global) {
  async function loadWavFile(file, audioCtx) {
    if (!file) throw new Error('No se proporcionó archivo');
    const arrayBuffer = await file.arrayBuffer();
    const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    const channel = audioBuffer.getChannelData(0);
    const threshold = 0.001;
    let startIndex = 0;
    while (startIndex < channel.length && Math.abs(channel[startIndex]) < threshold) {
      startIndex++;
    }
    const trimOffset = startIndex / audioBuffer.sampleRate;
    return { audioBuffer, trimOffset };
  }

  const api = { loadWavFile };
  if (typeof module !== 'undefined') module.exports = api;
  else global.wavLoader = api;
})(typeof window !== 'undefined' ? window : global);
