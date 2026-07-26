export type TransportShortcut =
  | 'toggle-playback'
  | 'seek-backward'
  | 'seek-forward';

export interface TransportShortcutInput {
  code: string;
  key: string;
  repeat: boolean;
  modified: boolean;
  editing: boolean;
  tapActive: boolean;
}

export const resolveTransportShortcut = ({
  code,
  key,
  repeat,
  modified,
  editing,
  tapActive,
}: TransportShortcutInput): TransportShortcut | null => {
  if (repeat || modified || editing) return null;
  if (code === 'Space') {
    return tapActive ? null : 'toggle-playback';
  }
  if (key === 'ArrowLeft') return 'seek-backward';
  if (key === 'ArrowRight') return 'seek-forward';
  return null;
};
