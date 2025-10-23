(function (global) {
  const wavApi =
    typeof require !== 'undefined' ? require('./wavLoader.js') : global.wavLoader;

  const detectTrimOffset = wavApi?.detectTrimOffset || (() => 0);
  const normalizeAudioBuffer = wavApi?.normalizeAudioBuffer || ((buffer) => buffer);

  const DEFAULT_PIPED_INSTANCES = [
    'https://piped.video',
    'https://pipedapi.kavin.rocks',
    'https://piped.mha.fi',
  ];
  const DEFAULT_STREAM_PATTERNS = [
    '/api/v1/streams/{{id}}?local=true&client=android',
    '/api/v1/streams/{{id}}?local=true',
    '/api/v1/streams/{{id}}',
  ];
  const DEFAULT_API_BASES = DEFAULT_PIPED_INSTANCES.flatMap((instance) =>
    DEFAULT_STREAM_PATTERNS.map((pattern) => `${instance}${pattern}`),
  );
  const DEFAULT_API_BASE = DEFAULT_API_BASES[0];
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

  function createUrlBuilder(entry) {
    if (!entry) return null;
    if (typeof entry === 'function') return entry;

    if (typeof entry === 'object') {
      if (typeof entry.build === 'function') {
        return entry.build;
      }
      if (typeof entry.url === 'string') {
        return createUrlBuilder(entry.url);
      }
    }

    if (typeof entry !== 'string') return null;

    const trimmed = entry.trim();
    if (!trimmed) return null;

    if (trimmed.includes('{{id}}')) {
      return (videoId) =>
        trimmed.replace(/\{\{id\}\}/g, encodeURIComponent(videoId));
    }

    const normalized = trimmed.endsWith('/') ? trimmed : `${trimmed}/`;
    return (videoId) => `${normalized}${encodeURIComponent(videoId)}`;
  }

  function buildApiBaseList(options = {}, { allowFallbacks = true } = {}) {
    const provided = [];
    if (Array.isArray(options.apiBaseUrls)) {
      provided.push(...options.apiBaseUrls);
    }
    if (options.apiBaseUrl) {
      provided.push(options.apiBaseUrl);
    }
    if (provided.length === 0) {
      if (allowFallbacks) provided.push(...DEFAULT_API_BASES);
      else provided.push(DEFAULT_API_BASE);
    }

    const seen = new Set();
    const builders = [];
    for (const entry of provided) {
      const builder = createUrlBuilder(entry);
      if (!builder) continue;
      const key = builder(DEFAULT_API_VIDEO_ID_KEY);
      if (typeof key === 'string' && !seen.has(key)) {
        seen.add(key);
        builders.push(builder);
      }
    }
    return builders;
  }

  const DEFAULT_API_VIDEO_ID_KEY = '__YOUTUBE_VIDEO_ID_PLACEHOLDER__';

  function createFetchOptions() {
    return {
      mode: 'cors',
      credentials: 'omit',
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
      referrerPolicy: 'no-referrer',
    };
  }

  function createInvalidDataError(rawText) {
    const snippet = typeof rawText === 'string'
      ? rawText.replace(/\s+/g, ' ').trim().slice(0, 200)
      : '';
    const detail = snippet ? ` Respuesta: ${snippet}` : '';
    const error = new Error(`El servicio de YouTube devolvió datos no válidos.${detail}`);
    error.code = 'YOUTUBE_INVALID_DATA';
    return error;
  }

  function createFetchError(response) {
    const status = response?.status;
    const statusText = response?.statusText;
    const statusDetail = typeof status === 'number'
      ? ` Estado: ${status}${statusText ? ` ${statusText}` : ''}.`
      : '';
    const unauthorizedHint = status === 401 || status === 403
      ? ' Verifica que la instancia seleccionada permita accesos públicos o configura una instancia alternativa en las opciones de YouTube.'
      : '';
    const error = new Error(
      `No se pudo obtener la información del video de YouTube.${statusDetail}${unauthorizedHint}`,
    );
    error.code = 'YOUTUBE_FETCH_FAILED';
    return error;
  }

  async function fetchVideoInfo(fetcher, urlBuilder, videoId) {
    const targetUrl = urlBuilder(videoId);
    const response = await fetcher(targetUrl, createFetchOptions());
    if (!response || !response.ok) {
      throw createFetchError(response);
    }

    let rawText;
    if (typeof response.text === 'function') {
      try {
        rawText = await response.text();
      } catch (readErr) {
        const error = new Error('No se pudo leer la respuesta del servicio de YouTube.');
        error.code = 'YOUTUBE_READ_FAILED';
        error.cause = readErr;
        throw error;
      }

      if (!rawText) {
        throw createInvalidDataError(rawText);
      }

      try {
        return JSON.parse(rawText);
      } catch (parseErr) {
        const error = createInvalidDataError(rawText);
        error.cause = parseErr;
        throw error;
      }
    }

    if (typeof response.json === 'function') {
      try {
        return await response.json();
      } catch (parseErr) {
        const message = parseErr?.message
          ? ` Detalle: ${parseErr.message}`
          : '';
        const error = new Error(`El servicio de YouTube devolvió datos no válidos.${message}`);
        error.code = 'YOUTUBE_INVALID_DATA';
        error.cause = parseErr;
        throw error;
      }
    }

    const error = new Error('No se pudo interpretar la respuesta del servicio de YouTube.');
    error.code = 'YOUTUBE_UNSUPPORTED_RESPONSE';
    throw error;
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

    const usingCustomFetcher = Boolean(options.fetcher);
    const apiBases = buildApiBaseList(options, { allowFallbacks: !usingCustomFetcher });
    let info = null;
    let lastError = null;

    for (const base of apiBases) {
      try {
        info = await fetchVideoInfo(fetcher, base, videoId);
        break;
      } catch (err) {
        lastError = err;
      }
    }

    if (!info) {
      if (lastError) throw lastError;
      throw new Error('No se pudo obtener la información del video de YouTube.');
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
