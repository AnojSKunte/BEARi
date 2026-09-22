import type { JSX } from 'react'

/**
 * Tiny inline SVG icon set — 24×24 viewBox, stroked with currentColor so
 * icons inherit text color everywhere. Rounded caps to match BEARi's soft look.
 */
const PATHS: Record<string, JSX.Element> = {
  home: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9.5V20a1 1 0 0 0 1 1H10v-5.5a2 2 0 0 1 4 0V21h3.5a1 1 0 0 0 1-1V9.5" />
    </>
  ),
  wand: (
    <>
      <path d="m14 7 3 3L7 20l-3-3L14 7Z" />
      <path d="M14 7l3 3" />
      <path d="M19 2.5v3M17.5 4h3M21.5 9.5v2M20.5 10.5h2M9.5 2v2M8.5 3h2" />
    </>
  ),
  notebook: (
    <>
      <path d="M6 3.5h11.5a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H6a1.5 1.5 0 0 1-1.5-1.5v-14A1.5 1.5 0 0 1 6 3.5Z" />
      <path d="M8.5 3.5v17M12 8h3.5M12 11.5h3.5" />
    </>
  ),
  chip: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="2.5" />
      <rect x="9.5" y="9.5" width="5" height="5" rx="1" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  sliders: (
    <>
      <path d="M4 7h9M17 7h3M4 12h3M11 12h9M4 17h9M17 17h3" />
      <circle cx="15" cy="7" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="15" cy="17" r="2" />
    </>
  ),
  heart: (
    <path d="M12 20.5s-7.5-4.6-9.3-9.3C1.5 8 3.6 4.9 6.8 4.9c2 0 3.7 1.1 4.5 2.7l.7 1.3.7-1.3c.8-1.6 2.5-2.7 4.5-2.7 3.2 0 5.3 3.1 4.1 6.3-1.8 4.7-9.3 9.3-9.3 9.3Z" />
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4.5 4.5" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  edit: (
    <>
      <path d="M14.5 5.5 18.5 9.5 8.5 19.5H4.5v-4L14.5 5.5Z" />
      <path d="m12.5 7.5 4 4" />
    </>
  ),
  trash: (
    <>
      <path d="M4.5 6.5h15M9.5 6V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V6" />
      <path d="M6.5 6.5 7.4 19a1.5 1.5 0 0 0 1.5 1.4h6.2A1.5 1.5 0 0 0 16.6 19l.9-12.5" />
      <path d="M10 10.5v6M14 10.5v6" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  eyeOff: (
    <>
      <path d="M4 4l16 16" />
      <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.9 3.7M6.6 6.7A16.2 16.2 0 0 0 2.5 12S6 18.5 12 18.5a9.3 9.3 0 0 0 4-.9" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
    </>
  ),
  spark: (
    <>
      <path d="M12 3.5 13.8 9 19.5 11 13.8 13 12 18.5 10.2 13 4.5 11 10.2 9 12 3.5Z" />
      <path d="M19 17.5v3M17.5 19h3" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z" />,
  chat: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H13l-4.5 3.5V17H6.5A2.5 2.5 0 0 1 4 14.5v-8Z" />
      <path d="M8.5 9.5h7M8.5 12.5h4.5" />
    </>
  ),
  palette: (
    <>
      <path d="M12 3a9 9 0 1 0 0 18c1.5 0 2-1 1.5-2-.6-1.3.2-2.5 1.7-2.5H17a4.5 4.5 0 0 0 4-4.5C21 7 17 3 12 3Z" />
      <circle cx="8" cy="10" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="16" cy="10" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  download: (
    <>
      <path d="M12 4v11M7.5 11 12 15.5 16.5 11" />
      <path d="M4.5 19.5h15" />
    </>
  ),
  power: (
    <>
      <path d="M12 3.5V11" />
      <path d="M6.8 6.5a8 8 0 1 0 10.4 0" />
    </>
  ),
  monitor: (
    <>
      <rect x="3" y="4.5" width="18" height="13" rx="2" />
      <path d="M9 21h6M12 17.5V21" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 2.5" />
    </>
  ),
  brain: (
    <>
      <path d="M9.5 4.5A2.8 2.8 0 0 0 6 7a3 3 0 0 0-2 3.5 3 3 0 0 0 .8 4.7A3 3 0 0 0 8 19.5c.8.8 2.4.8 3 0V6a2.6 2.6 0 0 0-1.5-1.5Z" />
      <path d="M14.5 4.5A2.8 2.8 0 0 1 18 7a3 3 0 0 1 2 3.5 3 3 0 0 1-.8 4.7A3 3 0 0 1 16 19.5c-.8.8-2.4.8-3 0V6a2.6 2.6 0 0 1 1.5-1.5Z" />
    </>
  ),
  cursor: (
    <>
      <path d="M5.5 4.5 19 10.5l-6 2-2 6L5.5 4.5Z" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 19.5 6v5.5c0 4.5-3 7.9-7.5 9.5-4.5-1.6-7.5-5-7.5-9.5V6L12 3Z" />
      <path d="m8.8 12 2.2 2.2 4.2-4.2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 12a8 8 0 1 1-2.3-5.7" />
      <path d="M20 4v4.5h-4.5" />
    </>
  ),
  pause: <path d="M8 5.5v13M16 5.5v13" />,
  play: <path d="M7 4.5v15l12-7.5L7 4.5Z" />,
  graph: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="8" r="2.5" />
      <circle cx="9" cy="18" r="2.5" />
      <circle cx="18" cy="17" r="2" />
      <path d="M8.2 7.2 15.6 8M7.3 8.3l1.2 7.2M16 9.8l1.5 5.2M11.4 17.6l4.7-.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
      <path d="M8 14h2M12 14h2M16 14h2M8 17h2M12 17h2" />
    </>
  ),
  rocket: (
    <>
      <path d="M14.5 3.5c3 0 6 3 6 6l-5 5-3 1-3-3 1-3 4-6Z" />
      <path d="M9.5 15.5 6 19M11.5 17.5 9 21M6.5 12.5 3 15" />
      <circle cx="15.5" cy="8.5" r="1.4" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1-4 4-6 7.5-6s6.5 2 7.5 6" />
    </>
  ),
  tag: (
    <>
      <path d="M3.5 12.5v-8a1 1 0 0 1 1-1h8L20.5 11.5l-8 8L3.5 12.5Z" />
      <circle cx="8" cy="8" r="1.3" fill="currentColor" stroke="none" />
    </>
  ),
  camera: (
    <>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2.3l1.4-2.2h5.6L16.2 7h2.3A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ),
  lightbulb: (
    <>
      <path d="M8.5 15.5A6 6 0 1 1 15.5 15.5c-.5.5-1 1.5-1 2.5h-5c0-1-.5-2-1-2.5Z" />
      <path d="M10 21h4" />
    </>
  )
}

export function Icon({ name, size = 17 }: { name: keyof typeof PATHS; size?: number }): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}

export type IconName = keyof typeof PATHS
