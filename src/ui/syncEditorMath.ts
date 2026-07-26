export interface AudioLandmark {
  time: number;
  strength: number;
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, value));

export const detectAudioLandmarks = (
  peaks: Float32Array | null,
  duration: number,
  maximumCount = 240,
): AudioLandmark[] => {
  if (!peaks || peaks.length < 6 || duration <= 0 || maximumCount <= 0) {
    return [];
  }
  const count = Math.floor(peaks.length / 2);
  const amplitudes = Array.from({ length: count }, (_, index) =>
    Math.max(
      Math.abs(peaks[index * 2] ?? 0),
      Math.abs(peaks[index * 2 + 1] ?? 0),
    ),
  );
  const mean =
    amplitudes.reduce((sum, value) => sum + value, 0) /
    Math.max(1, amplitudes.length);
  const variance =
    amplitudes.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
    Math.max(1, amplitudes.length);
  const threshold = Math.max(0.055, mean + Math.sqrt(variance) * 0.62);
  const candidates: AudioLandmark[] = [];

  for (let index = 1; index < count - 1; index += 1) {
    const strength = amplitudes[index];
    if (
      strength >= threshold &&
      strength >= amplitudes[index - 1] &&
      strength > amplitudes[index + 1]
    ) {
      candidates.push({
        time: (index / Math.max(1, count - 1)) * duration,
        strength,
      });
    }
  }

  const minimumGap = Math.max(0.025, (duration / count) * 2.5);
  const selected: AudioLandmark[] = [];
  [...candidates]
    .sort((left, right) => right.strength - left.strength)
    .some((candidate) => {
      if (
        selected.every(
          (landmark) => Math.abs(landmark.time - candidate.time) >= minimumGap,
        )
      ) {
        selected.push(candidate);
      }
      return selected.length >= maximumCount;
    });

  return selected.sort((left, right) => left.time - right.time);
};

export const snapToAudioLandmark = (
  time: number,
  landmarks: readonly AudioLandmark[],
  thresholdSeconds: number,
  enabled: boolean,
): number => {
  const safeTime = Math.max(0, Number.isFinite(time) ? time : 0);
  if (!enabled || landmarks.length === 0 || thresholdSeconds <= 0) {
    return safeTime;
  }
  let nearest = safeTime;
  let distance = thresholdSeconds;
  landmarks.forEach((landmark) => {
    const nextDistance = Math.abs(landmark.time - safeTime);
    if (nextDistance <= distance) {
      distance = nextDistance;
      nearest = landmark.time;
    }
  });
  return nearest;
};

export const resolveSyncViewport = (
  duration: number,
  zoom: number,
  requestedStart: number,
): { start: number; duration: number; zoom: number; maximumStart: number } => {
  const safeDuration = Math.max(0.001, Number.isFinite(duration) ? duration : 0);
  const safeZoom = clamp(Number.isFinite(zoom) ? zoom : 1, 1, 64);
  const viewportDuration = safeDuration / safeZoom;
  const maximumStart = Math.max(0, safeDuration - viewportDuration);
  return {
    start: clamp(
      Number.isFinite(requestedStart) ? requestedStart : 0,
      0,
      maximumStart,
    ),
    duration: viewportDuration,
    zoom: safeZoom,
    maximumStart,
  };
};
