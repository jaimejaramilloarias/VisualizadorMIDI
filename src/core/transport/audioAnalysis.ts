export const detectInitialSilence = (
  channels: readonly Float32Array[],
  sampleRate: number,
  threshold = 0.001,
  windowSeconds = 0.01,
): number => {
  if (
    channels.length === 0 ||
    !Number.isFinite(sampleRate) ||
    sampleRate <= 0 ||
    !Number.isFinite(threshold) ||
    threshold <= 0
  ) {
    return 0;
  }

  const frameCount = Math.min(...channels.map((channel) => channel.length));
  if (frameCount <= 0) return 0;
  const windowSize = Math.max(
    1,
    Math.floor(
      sampleRate *
        (Number.isFinite(windowSeconds) && windowSeconds > 0
          ? windowSeconds
          : 0.01),
    ),
  );
  const thresholdSquared = threshold * threshold;

  for (let start = 0; start < frameCount; start += windowSize) {
    const end = Math.min(frameCount, start + windowSize);
    let energy = 0;
    for (let frame = start; frame < end; frame += 1) {
      for (const channel of channels) {
        const sample = channel[frame] ?? 0;
        energy += sample * sample;
      }
    }
    const meanEnergy = energy / Math.max(1, (end - start) * channels.length);
    if (meanEnergy < thresholdSquared) continue;

    for (let frame = start; frame < end; frame += 1) {
      let frameEnergy = 0;
      for (const channel of channels) {
        const sample = channel[frame] ?? 0;
        frameEnergy += sample * sample;
      }
      if (frameEnergy / channels.length >= thresholdSquared) {
        return frame / sampleRate;
      }
    }
    return start / sampleRate;
  }

  return 0;
};
