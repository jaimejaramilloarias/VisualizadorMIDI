/// <reference lib="webworker" />

import { runAutomaticAlignment } from '../core/alignment/alignAudioToMidi';
import type {
  AlignmentWorkerRequest,
  AlignmentWorkerResponse,
} from '../core/alignment/types';

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener(
  'message',
  (event: MessageEvent<AlignmentWorkerRequest>) => {
    const message = event.data;
    if (message.type !== 'align') return;

    try {
      let lastPhase = '';
      let lastProgress = -1;
      let lastSentAt = 0;
      const result = runAutomaticAlignment(
        message.audio,
        message.midi,
        (progress) => {
          const now = performance.now();
          const phaseChanged = progress.phase !== lastPhase;
          const completed = progress.progress >= 1;
          if (
            !phaseChanged &&
            !completed &&
            now - lastSentAt < 60 &&
            progress.progress - lastProgress < 0.025
          ) {
            return;
          }
          lastPhase = progress.phase;
          lastProgress = progress.progress;
          lastSentAt = now;
          const response: AlignmentWorkerResponse = {
            type: 'progress',
            requestId: message.requestId,
            progress,
          };
          worker.postMessage(response);
        },
      );
      const response: AlignmentWorkerResponse = {
        type: 'result',
        requestId: message.requestId,
        result,
      };
      worker.postMessage(response);
    } catch (error) {
      const response: AlignmentWorkerResponse = {
        type: 'error',
        requestId: message.requestId,
        message:
          error instanceof Error
            ? error.message
            : 'La alineación automática se detuvo.',
      };
      worker.postMessage(response);
    }
  },
);
