const assert = require('assert');
const { loadYouTubeMedia, extractYouTubeId } = require('./youtubeLoader.js');

(async () => {
  assert.strictEqual(
    extractYouTubeId('https://www.youtube.com/watch?v=abcdefghijk'),
    'abcdefghijk',
  );
  assert.strictEqual(extractYouTubeId('https://youtu.be/abcdefghijk'), 'abcdefghijk');
  assert.strictEqual(extractYouTubeId('abcdefghijk'), 'abcdefghijk');
  assert.strictEqual(extractYouTubeId('https://example.com'), null);

  const samples = new Float32Array([0, 0, 0, 0.01, 0.02, -0.02, 0.01, 0]);
  const sampleRate = 10;
  const audioBuffer = {
    sampleRate,
    numberOfChannels: 1,
    duration: samples.length / sampleRate,
    getChannelData() {
      return samples;
    },
  };

  const fetcher = async (url) => {
    if (url === 'https://piped.video/api/v1/streams/abcdefghijk') {
      return {
        ok: true,
        json: async () => ({
          title: 'Demo track',
          uploader: 'Composer',
          duration: 12,
          audioStreams: [
            { url: 'https://cdn.example.com/audio-low', mimeType: 'audio/webm', bitrate: 64000 },
            { url: 'https://cdn.example.com/audio-high', mimeType: 'audio/mp4', bitrate: 128000 },
          ],
          videoStreams: [
            { url: 'https://cdn.example.com/video', mimeType: 'video/mp4', bitrate: 480000 },
          ],
          thumbnails: [{ url: 'https://cdn.example.com/thumb', width: 120 }],
        }),
      };
    }
    if (url === 'https://cdn.example.com/audio-high') {
      const buffer = new ArrayBuffer(samples.byteLength);
      new Float32Array(buffer).set(samples);
      return {
        ok: true,
        arrayBuffer: async () => buffer,
      };
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  class MockAudioContext {
    constructor() {
      this.decodeCalls = 0;
    }
    decodeAudioData(buffer) {
      this.decodeCalls += buffer.byteLength;
      return Promise.resolve(audioBuffer);
    }
  }

  const ctx = new MockAudioContext();
  const result = await loadYouTubeMedia('https://www.youtube.com/watch?v=abcdefghijk', {
    audioCtx: ctx,
    fetcher,
  });

  assert.strictEqual(result.videoId, 'abcdefghijk');
  assert.strictEqual(result.audioBuffer, audioBuffer);
  assert.strictEqual(result.audioStream.url, 'https://cdn.example.com/audio-high');
  assert.strictEqual(result.videoUrl, 'https://cdn.example.com/video');
  assert.strictEqual(result.title, 'Demo track');
  assert.strictEqual(result.author, 'Composer');
  assert.strictEqual(result.thumbnail, 'https://cdn.example.com/thumb');
  assert(
    Math.abs(result.trimOffset - 0.3) < 1e-6,
    'Debe detectar el inicio del audio tras el silencio inicial',
  );
  assert.strictEqual(Math.round(result.duration), 12);

  console.log('Pruebas de carga de YouTube completadas');
})();
