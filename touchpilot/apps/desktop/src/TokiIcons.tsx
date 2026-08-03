/**
 * Every icon Toki draws, as inline SVG.
 *
 * Inline rather than an icon font or a sprite file: nothing is fetched, so
 * nothing can fail to load, and the window's content security policy stays at
 * zero remote origins without an exception carved for assets.
 *
 * They share one drawing style so they read as a set — a 24-unit box, a 1.7
 * stroke, round caps and joins, and no fills. `currentColor` throughout, so a
 * button decides the colour and the icon never fights it. That matters more
 * than usual here: the interface is black and white, so an icon that brought
 * its own colour would be the only coloured thing on screen.
 */

type IconProps = { className?: string };

function Svg({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

/** Toki's mark: the inked ring, with the spray where the brush lands. */
export function MarkIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M16.9 4.9a8.6 8.6 0 1 0 3.6 5.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M17.1 4.7l1.2-2.1M18.8 5.6l2.2-1.1M18.1 7.5l2.3.2"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function MicIcon() {
  return (
    <Svg>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5.5 10.5a6.5 6.5 0 0 0 13 0M12 17v4.5" />
    </Svg>
  );
}

export function CameraIcon() {
  return (
    <Svg>
      <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6h1.7l1.1-1.8h5.4L14.8 6h3.7A2.5 2.5 0 0 1 21 8.5v8A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
      <circle cx="12" cy="12.5" r="3.4" />
    </Svg>
  );
}

export function PauseIcon() {
  return (
    <Svg>
      <path d="M9.5 5v14M14.5 5v14" />
    </Svg>
  );
}

export function PlayIcon() {
  return (
    <Svg>
      <path d="M7.5 4.8l11 7.2-11 7.2z" />
    </Svg>
  );
}

export function GearIcon() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="3.1" />
      <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.56V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.11-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.56V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.56 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </Svg>
  );
}

export function RefreshIcon() {
  return (
    <Svg>
      <path d="M20 11a8 8 0 1 0-.9 4.5M20 5.5V11h-5.5" />
    </Svg>
  );
}

// --- Settings window tabs ---------------------------------------------------

export function SlidersIcon() {
  return (
    <Svg>
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.1" />
      <circle cx="10" cy="17" r="2.1" />
    </Svg>
  );
}

export function PersonIcon() {
  return (
    <Svg>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </Svg>
  );
}

export function ShieldIcon() {
  return (
    <Svg>
      <path d="M12 2.8l7.2 2.9v5.6c0 4.4-3 8.4-7.2 9.9-4.2-1.5-7.2-5.5-7.2-9.9V5.7z" />
    </Svg>
  );
}

export function DownloadIcon() {
  return (
    <Svg>
      <path d="M12 3.5v11M7.5 10.5L12 15l4.5-4.5M4.5 19.5h15" />
    </Svg>
  );
}

/** Quit. The standard power glyph -- a broken ring with a stem through it. */
export function PowerIcon() {
  return (
    <Svg>
      <path d="M12 3.2v8.4" />
      <path d="M17.2 6.4a7.2 7.2 0 1 1-10.4 0" />
    </Svg>
  );
}

export type { IconProps };
