// F3's own small icon set, in the same 24px stroke style as F1's, which is private to F1. Always aria-hidden: an icon
// never carries meaning without the words beside it.
import type { ReactElement } from "react";
import type { IconName } from "../model/blocks";

const paths: Record<IconName, ReactElement> = {
  alert: <><path d="M12 3.5l9.5 16.5h-19z" /><path d="M12 10v4.5M12 17.5v.1" /></>,
  back: <path d="M15 5l-7 7 7 7" />,
  calendar: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  download: <path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14" />,
  drop: <path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z" />,
  edit: <><path d="M4 20h4l11-11-4-4L4 16z" /><path d="M13.5 6.5l4 4" /></>,
  grid: (
    <>
      <rect x="4" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.5" />
      <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.5" />
    </>
  ),
  heat: <><path d="M10 14.5V5a2 2 0 0 1 4 0v9.5a4 4 0 1 1-4 0z" /><path d="M12 9v7" /></>,
  info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5v.1" /></>,
  minus: <path d="M5 12h14" />,
  plan: <><path d="M4 6h16M4 12h10M4 18h13" /><circle cx="19" cy="12" r="1.6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  rain: <><path d="M7 15.5a4.5 4.5 0 0 1-.6-9 6 6 0 0 1 11.4 1.6A3.8 3.8 0 0 1 17.5 15.5H7z" /><path d="M8.5 18.5l-1 2M12.5 18.5l-1 2M16.5 18.5l-1 2" /></>,
  save: <><path d="M5 4h11l3 3v13H5z" /><path d="M8.5 4v4.5h6V4M8 20v-6h8v6" /></>,
  swap: <path d="M7 4L3 8l4 4M3 8h14M17 12l4 4-4 4M21 16H7" />,
  undo: <><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></>,
};

export function Icon(props: { readonly name: IconName }): ReactElement {
  return (
    <span className="i" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {paths[props.name]}
      </svg>
    </span>
  );
}
