import { Suspense, useEffect } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import logo from "../assets/margen-logo.svg";
import { useSignedIn } from "../auth/AuthProvider";
import { ROLE_LABELS, visiblePages, type Page } from "../lib/constants";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useUiState } from "../lib/uiState";
import { ChevronIcon, MoonIcon, SunIcon } from "./icons";
import { NoticeBar, useNotice } from "./Notice";

// The primary logo always sits on navy, as the brand guidelines show it.
export const Logo = () => <img src={logo} alt="MARGEN" className="logo" />;

type MenuEntry = Page | { group: string; pages: Page[] };

export function Layout() {
  const { email, role } = useSignedIn();
  const { pathname } = useLocation();
  const { navigated } = useNotice();
  const { theme, toggle } = useTheme();
  // Menu group name -> open (true) or closed (false), once the user toggles it.
  const [menuGroups, setMenuGroups] = useUiState<Record<string, boolean>>("menuGroups", {});
  const page = pathname.split("/")[1];

  // A notice is dropped on navigation, except the one that announced the navigation itself.
  useEffect(() => {
    navigated();
    window.scrollTo(0, 0);
  }, [pathname, navigated]);

  // Gather consecutive pages of the same group under one heading.
  const pages = visiblePages(role);
  const entries: MenuEntry[] = [];
  for (const p of pages) {
    const last = entries[entries.length - 1];
    if (p.group && last && "pages" in last && last.group === p.group) last.pages.push(p);
    else entries.push(p.group ? { group: p.group, pages: [p] } : p);
  }

  const tab = (p: Page) => (
    <NavLink key={p.name} to={`/${p.name}`} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
      {p.label}
    </NavLink>
  );

  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link to={`/${pages[0].name}`} className="brand" aria-label="MARGEN Dashboard home">
          <Logo />
        </Link>
        <nav className="tabs" aria-label="Main menu">
          {entries.map((entry) => {
            if (!("pages" in entry)) return tab(entry);
            // Groups start closed; the one holding the current page opens unless the user closed it.
            const holdsPage = entry.pages.some((p) => p.name === page);
            const open = menuGroups[entry.group] ?? holdsPage;
            const id = `menu-${entry.group.toLowerCase()}`;
            return (
              <div key={entry.group} className={`tab-group${open ? " open" : ""}`}>
                <button
                  type="button"
                  className={`tab-group-label${holdsPage ? " active" : ""}`}
                  aria-expanded={open}
                  aria-controls={id}
                  onClick={() => setMenuGroups((groups) => ({ ...groups, [entry.group]: !open }))}
                >
                  {entry.group}
                  <ChevronIcon />
                </button>
                <div className="tab-group-pages" id={id}>
                  {entry.pages.map(tab)}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="user">
          <span className="user-email">{email}</span>
          <div className="user-actions">
            <span className="role">{ROLE_LABELS[role]}</span>
            <button type="button" className="icon-btn theme-toggle" onClick={toggle} aria-label={themeLabel} title={themeLabel}>
              {theme === "dark" ? <SunIcon /> : <MoonIcon />}
            </button>
            <button type="button" className="ghost" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="page">
        <NoticeBar />
        {/* Shown while a page's code downloads the first time it's opened. */}
        <Suspense fallback={<p className="empty">Loading…</p>}>
          <Outlet />
        </Suspense>
      </main>
    </div>
  );
}
