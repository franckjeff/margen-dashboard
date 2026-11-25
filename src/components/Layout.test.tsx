import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { resetUiState } from "../lib/uiState";
import { Layout } from "./Layout";
import { NoticeProvider } from "./Notice";

let role = "factory";
vi.mock("../auth/AuthProvider", () => ({
  useSignedIn: () => ({ email: `${role}@example.com`, role }),
}));
vi.mock("../lib/supabase", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("../data/queries", () => ({
  hasMenuCount: (page: string) => ["customs", "production-orders", "shipped-orders", "archived-orders", "my-contacts"].includes(page),
  useMenuCount: (page: string) => ({ data: { customs: 7, "production-orders": 4, "shipped-orders": 5, "archived-orders": 3, "my-contacts": 2 }[page] }),
}));

// jsdom has no media queries; pretend the window is wide, or narrow.
const setWide = (wide: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: wide, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
};

const renderLayout = (path = "/orders") =>
  render(
    <NoticeProvider>
      <MemoryRouter initialEntries={[path]}>
        <Layout />
      </MemoryRouter>
    </NoticeProvider>,
  );
const sidebar = () => document.querySelector(".sidebar")!;

beforeEach(() => {
  role = "factory";
  resetUiState();
  localStorage.clear();
  setWide(true);
});

describe("folding the menu", () => {
  it("folds on a double-click of the menu's background and opens from the strip", async () => {
    const user = userEvent.setup();
    const { unmount } = renderLayout();
    expect(sidebar()).not.toHaveClass("collapsed");

    await user.dblClick(sidebar());
    expect(sidebar()).toHaveClass("collapsed");
    expect(localStorage.getItem("menu-collapsed")).toBe("1");

    // Remembered on the next visit.
    unmount();
    renderLayout();
    expect(sidebar()).toHaveClass("collapsed");

    await user.click(screen.getByRole("button", { name: "Show the menu" }));
    expect(sidebar()).not.toHaveClass("collapsed");
    expect(localStorage.getItem("menu-collapsed")).toBeNull();
  });

  it("keeps the logo's green strokes and each entry's icon, named on hover; a group's icon opens the menu", async () => {
    role = "admin";
    const user = userEvent.setup();
    renderLayout();
    await user.dblClick(sidebar());
    expect(sidebar()).toHaveClass("collapsed");
    expect(document.querySelector(".logo-mark")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Dashboard" })).toHaveAttribute("title", "Dashboard");
    expect(screen.getByRole("link", { name: "Dashboard" }).querySelector(".menu-icon")).toBeInTheDocument();
    const admin = screen.getByRole("button", { name: "Admin" });
    expect(admin).toHaveAttribute("title", "Admin");

    await user.click(admin);
    expect(sidebar()).not.toHaveClass("collapsed");
    expect(screen.getByRole("button", { name: "Admin" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Dashboard" })).not.toHaveAttribute("title");
  });

  it("ignores double-clicks on the menu's links and buttons", async () => {
    const user = userEvent.setup();
    renderLayout();
    await user.dblClick(screen.getByRole("link", { name: "Dashboard" }));
    await user.dblClick(screen.getByRole("button", { name: "Sign out" }));
    expect(sidebar()).not.toHaveClass("collapsed");
  });

  it("never folds the top bar on small screens", async () => {
    setWide(false);
    const user = userEvent.setup();
    renderLayout();
    await user.dblClick(sidebar());
    expect(sidebar()).not.toHaveClass("collapsed");
  });
});

describe("the menu counts", () => {
  it("show beside the menu items that have one", () => {
    renderLayout();
    expect(screen.getByRole("link", { name: /^New/ })).toHaveTextContent("New(7)");
    expect(screen.getByRole("link", { name: /In Production/ })).toHaveTextContent("In Production(4)");
    expect(screen.getByRole("link", { name: /Shipped/ })).toHaveTextContent("Shipped(5)");
    expect(screen.getByRole("link", { name: /Cancelled & Archived/ })).toHaveTextContent("Cancelled & Archived(3)");
    expect(screen.getByRole("link", { name: /Contacts/ })).toHaveTextContent("Contacts(2)");
  });
});

describe("the Email pages in the Admin menu", () => {
  it("sit under an Email heading, as Settings and Logs, open when one of them is showing", () => {
    role = "admin";
    renderLayout("/email-settings");
    const heading = screen.getByRole("button", { name: "Email" });
    expect(heading).toHaveClass("tab-heading", "active");
    expect(heading).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveAttribute("href", "/email-settings");
    expect(screen.getByRole("link", { name: "Settings" })).toHaveClass("sub", "active");
    expect(screen.getByRole("link", { name: "Logs" })).toHaveAttribute("href", "/emails");
    // Its two pages sit inside the part it opens and closes.
    const pages = document.getElementById(heading.getAttribute("aria-controls")!)!;
    expect(pages).toHaveTextContent("SettingsLogs");
  });
  it("opens and closes on a click, and starts closed on other pages", async () => {
    role = "admin";
    const user = userEvent.setup();
    renderLayout("/users");
    const heading = screen.getByRole("button", { name: "Email" });
    expect(heading).toHaveAttribute("aria-expanded", "false");
    expect(heading.parentElement).not.toHaveClass("open");
    await user.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "true");
    expect(heading.parentElement).toHaveClass("open");
    // The Admin group around it stays open.
    expect(screen.getByRole("button", { name: "Admin" })).toHaveAttribute("aria-expanded", "true");
    await user.click(heading);
    expect(heading).toHaveAttribute("aria-expanded", "false");
  });
});
