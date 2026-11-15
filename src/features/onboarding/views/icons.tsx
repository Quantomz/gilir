// Stroke icons on a 24px grid. Every icon on screen sits beside a written word, so each one is hidden from
// assistive technology.
import type { ReactElement } from "react";

const paths = {
  alert: <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.5v.1" /></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  back: <path d="M15 5l-7 7 7 7" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  can: <><path d="M4 9h10v10H4z" /><path d="M14 11l5-3M19 8l1.5-.8M7 9V6.5a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2V9" /><path d="M21 11.5l-.2 1.2M20 14l-.3 1.2" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  down: <path d="M6 9l6 6 6-6" />,
  edit: <><path d="M4 20h4l11-11-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.4c-.7.3-1 .9-1 1.6v.6" /><path d="M12 17.2v.1" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.1" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  rain: <><path d="M7 15.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 15.5H7z" /><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2" /></>,
  refresh: <><path d="M20 11a8 8 0 1 0-2.3 5.7" /><path d="M20 4.5V11h-6.5" /></>,
  search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5L20 20" /></>,
  soil: <><path d="M3 15h18M3 19h18" /><path d="M12 15V9" /><path d="M12 10c0-2.8-2-4.8-5-4.8 0 2.9 2 4.8 5 4.8zM12 11.5c0-2.4 1.8-4 4.6-4 0 2.6-1.8 4-4.6 4z" /></>,
  sparkle: <path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z" />,
  speaker: <><path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5H4z" /><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18 6.5a8 8 0 0 1 0 11" /></>,
  sprout: <><path d="M12 21v-8" /><path d="M12 13c0-4-2.8-7-7.5-7 0 4.4 3 7 7.5 7z" /><path d="M12 15.5c0-3.4 2.5-5.8 7-5.8 0 3.9-2.7 5.8-7 5.8z" /></>,
  stop: <rect x="6.5" y="6.5" width="11" height="11" rx="2" />,
  textsize: <><path d="M3 18l4.5-12L12 18M4.6 14h5.8" /><path d="M14 18l3.2-8.4L20.5 18M15.1 15.3h4.3" /></>,
  wifioff: <><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.6M14.5 10.6A10 10 0 0 1 19 13M2 9.5a15 15 0 0 1 4.3-2.8M10 5.2A15 15 0 0 1 22 9.5" /><path d="M12 20h.01" /></>,
} satisfies Record<string, ReactElement>;

export type IconName = keyof typeof paths;

export function Icon(props: { readonly name: IconName }): ReactElement {
  return (
    <span className="i" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {paths[props.name]}
      </svg>
    </span>
  );
}

/** Gilir's mark: three fields turning around one centre. */
export function Mark(): ReactElement {
  return (
    <span className="i" aria-hidden="true">
      <svg viewBox="0 0 40 40" focusable="false">
        <path className="mark-1" d="M20 20 L20 2 A18 18 0 0 1 35.6 29 Z" />
        <path className="mark-2" d="M20 20 L35.6 29 A18 18 0 0 1 4.4 29 Z" />
        <path className="mark-3" d="M20 20 L4.4 29 A18 18 0 0 1 20 2 Z" />
        <path className="mark-lines" d="M20 2v18M20 20l15.6 9M20 20L4.4 29" />
        <circle className="mark-edge" cx="20" cy="20" r="18" />
      </svg>
    </span>
  );
}
