import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { Layout } from "./Layout";
import { NoticeProvider } from "./Notice";

vi.mock("../auth/AuthProvider", () => ({
  useSignedIn: () => ({ email: "factory@example.com", role: "factory" }),
}));
vi.mock("../lib/supabase", () => ({ supabase: { auth: { signOut: vi.fn() } } }));
vi.mock("../data/queries", () => ({
  hasMenuCount: (page: string) => ["customs", "archived-orders", "my-contacts"].includes(page),
  useMenuCount: (page: string) => ({ data: { customs: 7, "archived-orders": 3, "my-contacts": 2 }[page] }),
}));

// jsdom has no media queries; pretend the window is wide, or narrow.
const setWide = (wide: boolean) => {
  window.matchMedia = ((query: string) => ({ matches: wide, media: query, addEventListener: () => {}, removeEventListener: () => {} })) as unknown as typeof window.matchMedia;
};

const renderLayout = () =>
  render(
    <NoticeProvider>
      <MemoryRouter initialEntries={["/orders"]}>
        <Layout />
      </MemoryRouter>
    </NoticeProvider>,
  );
const sidebar = () => document.querySelector(".sidebar")!;

beforeEach(() => {
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
    expect(screen.getByRole("link", { name: /Orders in progress/ })).toHaveTextContent("Orders in progress(7)");
    expect(screen.getByRole("link", { name: /Archived orders/ })).toHaveTextContent("Archived orders(3)");
    expect(screen.getByRole("link", { name: /Contacts/ })).toHaveTextContent("Contacts(2)");
  });
});
