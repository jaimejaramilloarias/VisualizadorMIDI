(function (global) {
  const wavApi =
    typeof require !== 'undefined' ? require('./wavLoader.js') : global.wavLoader;

  const detectTrimOffset = wavApi?.detectTrimOffset || (() => 0);
  const normalizeAudioBuffer = wavApi?.normalizeAudioBuffer || ((buffer) => buffer);

  const DEFAULT_API_BASE = 'https://piped.video/api/v1/streams/';
  const DEFAULT_AUDIO_MIME_PREFERENCE = ['audio/mp4', 'audio/webm'];
  const DEFAULT_VIDEO_MIME_PREFERENCE = ['video/mp4', 'video/webm'];

  function extractYouTubeId(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (trimmed.length === 11 && /^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
      return trimmed;
    }

    const patterns = [
      /(?:youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i,
      /[?&]v=([A-Za-z0-9_-]{11})/i,
    ];

    for (const pattern of patterns) {
      const match = trimmed.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }
    return null;
  }

  function rankByMime(stream, preferredMimeTypes) {
    if (!stream || !stream.mimeType) return preferredMimeTypes.length;
    const mime = String(stream.mimeType).toLowerCase();
    const index = preferredMimeTypes.findIndex((candidate) =>
      mime.includes(candidate.toLowerCase()),
    );
    return index === -1 ? preferredMimeTypes.length : index;
  }

  function selectStream(streams, { preferredMimeTypes = [] } = {}) {
    if (!Array.isArray(streams) || streams.length === 0) return null;
    const scored = streams
      .map((stream) => ({
        stream,
        priority: rankByMime(stream, preferredMimeTypes),
        bitrate: stream.bitrate || stream.averageBitrate || stream.quality || 0,
      }))
      .filter((entry) => entry.priority < preferredMimeTypes.length + 1);
    if (scored.length === 0) return null;
    scored.sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return (b.bitrate || 0) - (a.bitrate || 0);
    });
    return scored[0].stream;
  }

  async function decodeAudioData(audioCtx, arrayBuffer) {
    if (!audioCtx || typeof audioCtx.decodeAudioData !== 'function') {
      throw new Error('No se proporcionó un contexto de audio válido.');
    }
    if (audioCtx.decodeAudioData.length === 1) {
      return audioCtx.decodeAudioData(arrayBuffer);
    }
    return new Promise((resolve, reject) => {
      audioCtx.decodeAudioData(arrayBuffer, resolve, reject);
    });
  }

  function resolveThumbnail(info) {
    if (!info) return null;
    if (typeof info.thumbnail === 'string') return info.thumbnail;
    if (typeof info.thumbnailUrl === 'string') return info.thumbnailUrl;
    if (typeof info.thumbnailURL === 'string') return info.thumbnailURL;
    if (Array.isArray(info.thumbnails) && info.thumbnails.length > 0) {
      const sorted = [...info.thumbnails].sort((a, b) => (b.width || 0) - (a.width || 0));
      return sorted[0].url || sorted[0].src || null;
    }
    return null;
  }

  async function loadYouTubeMedia(inputUrl, options = {}) {
    const videoId = extractYouTubeId(inputUrl);
    if (!videoId) {
      throw new Error('No se pudo extraer el identificador del video de YouTube.');
    }

    let fetcher = options.fetcher;
    if (!fetcher && typeof fetch !== 'undefined') {
      fetcher = (input, init) => fetch(input, init);
    }
    if (typeof fetcher !== 'function') {
      throw new Error('No hay una función fetch disponible para cargar YouTube.');
    }

    const apiBase = options.apiBaseUrl || DEFAULT_API_BASE;
    const infoResponse = await fetcher(`${apiBase}${videoId}`);
    if (!infoResponse || !infoResponse.ok) {
      throw new Error('No se pudo obtener la información del video de YouTube.');
    }
    let info;
    let textSource = null;
    if (infoResponse && typeof infoResponse.text === 'function') {
      textSource = infoResponse;
    } else if (infoResponse && typeof infoResponse.clone === 'function') {
      try {
        const clone = infoResponse.clone();
        if (clone && typeof clone.text === 'function') {
          textSource = clone;
        }
      } catch (cloneErr) {
        console.warn('No se pudo clonar la respuesta de YouTube:', cloneErr);
      }
    }

    if (textSource) {
      const rawText = await textSource.text();
      if (!rawText) {
        throw new Error('El servicio de YouTube devolvió una respuesta vacía.');
      }
      try {
        info = JSON.parse(rawText);
      } catch (parseErr) {
        const snippet = rawText.replace(/\s+/g, ' ').trim().slice(0, 200);
        const detail = snippet ? ` Respuesta: ${snippet}` : '';
        throw new Error(
          `El servicio de YouTube devolvió datos no válidos.${detail}`,
        );
      }
    } else if (typeof infoResponse?.json === 'function') {
      try {
        info = await infoResponse.json();
      } catch (parseErr) {
        const detail = parseErr?.message ? ` Detalle: ${parseErr.message}` : '';
        throw new Error(
          `El servicio de YouTube devolvió datos no válidos.${detail}`,
        );
      }
    } else {
      throw new Error('No se pudo interpretar la respuesta del servicio de YouTube.');
    }

    if (!info || typeof info !== 'object') {
      throw new Error('La respuesta del servicio de YouTube no contiene datos válidos.');
    }

    const audioStream = selectStream(info?.audioStreams, {
      preferredMimeTypes: options.preferredAudioMimeTypes || DEFAULT_AUDIO_MIME_PREFERENCE,
    });
    if (!audioStream || !audioStream.url) {
      throw new Error('El video no proporciona un flujo de audio compatible.');
    }

    const audioResponse = await fetcher(audioStream.url);
    if (!audioResponse || !audioResponse.ok || typeof audioResponse.arrayBuffer !== 'function') {
      throw new Error('No se pudo descargar el audio del video de YouTube.');
    }
    const audioData = await audioResponse.arrayBuffer();

    const audioCtx = options.audioCtx || (options.createAudioContext && options.createAudioContext());
    if (!audioCtx) {
      throw new Error('No hay contexto de audio disponible para decodificar el audio.');
    }

    const audioBuffer = await decodeAudioData(audioCtx, audioData);
    normalizeAudioBuffer(audioBuffer, -0.1);
    const channel = audioBuffer.numberOfChannels ? audioBuffer.getChannelData(0) : null;
    const trimOffset = channel
      ? detectTrimOffset(channel, audioBuffer.sampleRate)
      : 0;

    const videoStream = selectStream(info?.videoStreams, {
      preferredMimeTypes: options.preferredVideoMimeTypes || DEFAULT_VIDEO_MIME_PREFERENCE,
    });

    return {
      source: 'youtube',
      videoId,
      title: info?.title || info?.name || '',
      author: info?.uploader || info?.author || info?.owner || '',
      duration: info?.duration || info?.lengthSeconds || audioBuffer.duration || 0,
      thumbnail: resolveThumbnail(info),
      audioBuffer,
      trimOffset,
      audioStream,
      videoUrl: videoStream?.url || null,
      videoStream,
    };
  }

  const api = { loadYouTubeMedia, extractYouTubeId, selectStream };
  if (typeof module !== 'undefined') module.exports = api;
  else global.youtubeLoader = api;
})(typeof window !== 'undefined' ? window : global);
