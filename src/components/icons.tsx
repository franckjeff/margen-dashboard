import type { ReactNode } from "react";

export const SunIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);

export const MoonIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
  </svg>
);

export const ChevronIcon = () => (
  <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M9 6l6 6-6 6" />
  </svg>
);

// The icons in front of the main menu's top-level entries, by page name or group name. Outline icons that
// take the menu's text colour.
const MENU_ICON_PATHS: Record<string, ReactNode> = {
  dashboard: (
    <>
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.5" />
    </>
  ),
  "Custom Orders": <path d="M21 7.5l-9-4.5-9 4.5 9 4.5 9-4.5zM3 7.5v9l9 4.5 9-4.5v-9M12 12v9" />,
  leads: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.5" />
      <circle cx="12" cy="12" r="0.8" />
    </>
  ),
  contacts: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.6a6 6 0 0 1 3.5 5.4" />
    </>
  ),
  athletes: (
    <>
      <circle cx="12" cy="15" r="5.5" />
      <path d="M8.5 10.7L5 3h5l2 4.5L14 3h5l-3.5 7.7" />
    </>
  ),
  reports: <path d="M4 20.5h16M7 17v-5M12 17V6M17 17V9" />,
  Admin: (
    <>
      <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
      <circle cx="15" cy="6" r="2" />
      <circle cx="9" cy="12" r="2" />
      <circle cx="17" cy="18" r="2" />
    </>
  ),
  guide: <path d="M4 19.5V5a2 2 0 0 1 2-2h14v15H6a2 2 0 0 0-2 2zM6 21h14v-3M8 7.5h8M8 11h5" />,
};
MENU_ICON_PATHS["my-contacts"] = MENU_ICON_PATHS.contacts;

// Nothing for a name without an icon.
export const MenuIcon = ({ name }: { name: string }) =>
  MENU_ICON_PATHS[name] ? (
    <svg className="menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {MENU_ICON_PATHS[name]}
    </svg>
  ) : null;
