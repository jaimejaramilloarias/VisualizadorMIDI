import type { SVGProps } from 'react';

export type IconName =
  | 'audio'
  | 'canvas'
  | 'chevron-left'
  | 'chevron-right'
  | 'download'
  | 'folder'
  | 'gauge'
  | 'info'
  | 'layers'
  | 'music'
  | 'motion'
  | 'palette'
  | 'pause'
  | 'piano'
  | 'play'
  | 'plus'
  | 'restart'
  | 'settings'
  | 'sparkles'
  | 'sync'
  | 'trash'
  | 'upload'
  | 'volume'
  | 'volume-off';

export function Icon({
  name,
  ...props
}: { name: IconName } & SVGProps<SVGSVGElement>) {
  const paths: Record<IconName, React.ReactNode> = {
    audio: (
      <>
        <path d="M4 9v6" />
        <path d="M8 6v12" />
        <path d="M12 3v18" />
        <path d="M16 7v10" />
        <path d="M20 10v4" />
      </>
    ),
    canvas: (
      <>
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <path d="M7 16h10" />
      </>
    ),
    'chevron-left': <path d="m15 18-6-6 6-6" />,
    'chevron-right': <path d="m9 18 6-6-6-6" />,
    download: (
      <>
        <path d="M12 3v12" />
        <path d="m7 10 5 5 5-5" />
        <path d="M5 21h14" />
      </>
    ),
    folder: (
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5h4l2 2H19a2 2 0 0 1 2 2v8.5a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5Z" />
    ),
    gauge: (
      <>
        <path d="M4 17a8 8 0 1 1 16 0" />
        <path d="m12 17 4-5" />
        <path d="M6 17h12" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <path d="M12 8h.01" />
      </>
    ),
    layers: (
      <>
        <path d="m12 3-9 5 9 5 9-5Z" />
        <path d="m3 12 9 5 9-5" />
        <path d="m3 16 9 5 9-5" />
      </>
    ),
    music: (
      <>
        <path d="M9 18V5l10-2v13" />
        <circle cx="6" cy="18" r="3" />
        <circle cx="16" cy="16" r="3" />
      </>
    ),
    motion: (
      <>
        <path d="M3 8h7" />
        <path d="M3 12h12" />
        <path d="M3 16h17" />
        <path d="m17 9 4 3-4 3" />
      </>
    ),
    palette: (
      <>
        <path d="M12 3a9 9 0 1 0 0 18h1.5a2 2 0 0 0 0-4H12a2 2 0 0 1 0-4h4a5 5 0 0 0 0-10Z" />
        <circle cx="7.5" cy="9" r=".8" />
        <circle cx="10.5" cy="6.5" r=".8" />
        <circle cx="14" cy="6.5" r=".8" />
      </>
    ),
    pause: (
      <>
        <path d="M9 5v14" />
        <path d="M15 5v14" />
      </>
    ),
    piano: (
      <>
        <rect x="3" y="5" width="18" height="14" rx="2" />
        <path d="M7 5v10M12 5v10M17 5v10" />
        <path d="M5 15h14" />
      </>
    ),
    play: <path d="m8 5 11 7-11 7Z" />,
    plus: (
      <>
        <path d="M12 5v14" />
        <path d="M5 12h14" />
      </>
    ),
    restart: (
      <>
        <path d="M4 12a8 8 0 1 0 2.3-5.7L4 8" />
        <path d="M4 3v5h5" />
      </>
    ),
    settings: (
      <>
        <circle cx="12" cy="12" r="3" />
        <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2Z" />
        <path d="m18.5 14 .7 2.3 2.3.7-2.3.7-.7 2.3-.7-2.3-2.3-.7 2.3-.7Z" />
        <path d="m5 13 .8 2.2L8 16l-2.2.8L5 19l-.8-2.2L2 16l2.2-.8Z" />
      </>
    ),
    sync: (
      <>
        <path d="M20 7h-6V1" />
        <path d="M4 17h6v6" />
        <path d="M5.5 9a7.5 7.5 0 0 1 12.8-3L20 7" />
        <path d="M18.5 15a7.5 7.5 0 0 1-12.8 3L4 17" />
      </>
    ),
    trash: (
      <>
        <path d="M4 7h16" />
        <path d="M9 3h6l1 4H8Z" />
        <path d="m6 7 1 14h10l1-14" />
        <path d="M10 11v6M14 11v6" />
      </>
    ),
    upload: (
      <>
        <path d="M12 21V9" />
        <path d="m7 14 5-5 5 5" />
        <path d="M5 3h14" />
      </>
    ),
    volume: (
      <>
        <path d="M11 5 6 9H3v6h3l5 4Z" />
        <path d="M15.5 8.5a5 5 0 0 1 0 7" />
        <path d="M18 6a8.5 8.5 0 0 1 0 12" />
      </>
    ),
    'volume-off': (
      <>
        <path d="M11 5 6 9H3v6h3l5 4Z" />
        <path d="m16 9 5 5" />
        <path d="m21 9-5 5" />
      </>
    ),
  };

  return (
    <svg
      aria-hidden="true"
      fill="none"
      height="24"
      viewBox="0 0 24 24"
      width="24"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
