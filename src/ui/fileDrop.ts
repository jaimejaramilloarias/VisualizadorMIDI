const AUDIO_FILE_EXTENSIONS = [
  '.wav',
  '.mp3',
  '.m4a',
  '.aac',
  '.ogg',
  '.flac',
  '.aif',
  '.aiff',
] as const;

const MIDI_MIME_TYPES = new Set([
  'audio/midi',
  'audio/x-midi',
  'application/midi',
  'application/x-midi',
]);

type DroppedFileDescriptor = Pick<File, 'name' | 'type'>;

export const isMidiFile = (file: DroppedFileDescriptor): boolean => {
  const lowerName = file.name.toLowerCase();
  return (
    lowerName.endsWith('.mid') ||
    lowerName.endsWith('.midi') ||
    MIDI_MIME_TYPES.has(file.type.toLowerCase())
  );
};

export const isAudioFile = (file: DroppedFileDescriptor): boolean => {
  if (isMidiFile(file)) return false;
  const lowerName = file.name.toLowerCase();
  return (
    file.type.toLowerCase().startsWith('audio/') ||
    AUDIO_FILE_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
  );
};

export const selectDroppedMedia = <FileType extends DroppedFileDescriptor>(
  files: readonly FileType[],
): { midiFile: FileType | null; audioFile: FileType | null } => {
  let midiFile: FileType | null = null;
  let audioFile: FileType | null = null;

  files.forEach((file) => {
    if (!midiFile && isMidiFile(file)) {
      midiFile = file;
      return;
    }
    if (!audioFile && isAudioFile(file)) audioFile = file;
  });

  return { midiFile, audioFile };
};
