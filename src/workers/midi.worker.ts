/// <reference lib="webworker" />

import { parseMidiFile } from '../core/midi/parseMidi';

interface ParseMessage {
  type: 'parse';
  requestId: number;
  fileName: string;
  buffer: ArrayBuffer;
}

const worker = self as DedicatedWorkerGlobalScope;

worker.addEventListener('message', (event: MessageEvent<ParseMessage>) => {
  const message = event.data;
  if (message.type !== 'parse') return;

  try {
    const project = parseMidiFile(message.buffer, message.fileName);
    const transfer = [
      project.notes.starts.buffer,
      project.notes.ends.buffer,
      project.notes.pitches.buffer,
      project.notes.velocities.buffer,
      project.notes.channels.buffer,
      project.notes.tracks.buffer,
      project.notes.families.buffer,
    ];
    worker.postMessage(
      { type: 'parsed', requestId: message.requestId, project },
      transfer,
    );
  } catch (error) {
    worker.postMessage({
      type: 'error',
      requestId: message.requestId,
      message: error instanceof Error ? error.message : 'No fue posible leer el MIDI.',
    });
  }
});
