import { Suspense, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import logo from "../assets/margen-logo.svg";
import { useSignedIn } from "../auth/AuthProvider";
import { hasMenuCount, useMenuCount } from "../data/queries";
import { ROLE_LABELS, visiblePages, type Page } from "../lib/constants";
import { supabase } from "../lib/supabase";
import { useTheme } from "../lib/theme";
import { useUiState } from "../lib/uiState";
import { ErrorBoundary } from "./ErrorBoundary";
import { ChevronIcon, MenuIcon, MoonIcon, SunIcon } from "./icons";
import { NoticeBar, useNotice } from "./Notice";

// The primary logo always sits on navy, as the brand guidelines show it.
export const Logo = () => <img src={logo} alt="MARGEN" className="logo" />;

type MenuEntry = Page | { group: string; pages: Page[] };

// How many records a menu item's page lists, beside it. Nothing shows until it has loaded.
function MenuCount({ page }: { page: Page }) {
  const { role } = useSignedIn();
  const count = useMenuCount(page.name, role);
  if (count.data === undefined) return null;
  return <span className="tab-count">({count.data})</span>;
}

// Whether the menu is folded away, remembered in this browser. Storage can be blocked, so it's optional.
const MENU_KEY = "menu-collapsed";
function useMenuCollapsed() {
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(MENU_KEY) === "1";
    } catch {
      return false;
    }
  });
  const set = (next: boolean) => {
    setCollapsed(next);
    try {
      if (next) localStorage.setItem(MENU_KEY, "1");
      else localStorage.removeItem(MENU_KEY);
    } catch {
      // Not remembered; it still works for this visit.
    }
  };
  return [collapsed, set] as const;
}

export function Layout() {
  const { email, role } = useSignedIn();
  const { pathname } = useLocation();
  const { navigated } = useNotice();
  const { theme, toggle } = useTheme();
  // Menu group name -> open (true) or closed (false), once the user toggles it.
  const [menuGroups, setMenuGroups] = useUiState<Record<string, boolean>>("menuGroups", {});
  const [menuCollapsed, setMenuCollapsed] = useMenuCollapsed();
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

  // Top-level entries have an icon in front; the pages inside a group don't.
  const tab = (p: Page, topLevel = false) => (
    <NavLink key={p.name} to={`/${p.name}`} className={({ isActive }) => `tab${isActive ? " active" : ""}`}>
      {topLevel && <MenuIcon name={p.name} />}
      {p.label}
      {hasMenuCount(p.name) && <MenuCount page={p} />}
    </NavLink>
  );

  const themeLabel = theme === "dark" ? "Switch to light mode" : "Switch to dark mode";

  return (
    <div className={`app-shell${menuCollapsed ? " menu-collapsed" : ""}`}>
      {/* Double-clicking the menu's background (not a link or button) folds it to a thin strip. */}
      <aside
        className={`sidebar${menuCollapsed ? " collapsed" : ""}`}
        onDoubleClick={(e) => {
          if (menuCollapsed || (e.target as HTMLElement).closest("a, button, input, select, textarea")) return;
          if (!window.matchMedia("(min-width: 861px)").matches) return;
          window.getSelection()?.removeAllRanges();
          setMenuCollapsed(true);
        }}
      >
        <button
          type="button"
          className="menu-expand"
          onClick={() => setMenuCollapsed(false)}
          aria-label="Show the menu"
          title="Show the menu"
        >
          <ChevronIcon />
        </button>
        <Link to={`/${pages[0].name}`} className="brand" aria-label="MARGEN Dashboard home">
          <Logo />
        </Link>
        <nav className="tabs" aria-label="Main menu">
          {entries.map((entry) => {
            if (!("pages" in entry)) return tab(entry, true);
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
                  <span className="tab-group-name">
                    <MenuIcon name={entry.group} />
                    {entry.group}
                  </span>
                  <ChevronIcon />
                </button>
                <div className="tab-group-pages" id={id}>
                  {entry.pages.map((p) => tab(p))}
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
          </div>
          <div className="user-links">
            <Link to="/account">Change password</Link>
            <button type="button" className="link-button" onClick={() => supabase.auth.signOut()}>
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="page">
        <NoticeBar />
        {/* Shown while a page's code downloads the first time it's opened. */}
        {/* Moving to another page clears the crash message. */}
        <ErrorBoundary resetOn={pathname}>
          <Suspense fallback={<p className="empty">Loading…</p>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
