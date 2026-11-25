import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { NoticeProvider } from "../../components/Notice";
import { FactoriesPage } from "./FactoriesPage";

vi.mock("../../auth/AuthProvider", () => ({ useSignedIn: () => ({ userId: "me", role: "admin" }) }));
vi.mock("../../data/queries", async (original) => ({
  ...(await original<typeof import("../../data/queries")>()),
  useFactories: () => ({ data: [{ id: "f1", name: "Ocean Factory", country: null, description: null, created_at: "2026-11-01", contacts: [] }], isPending: false, isError: false }),
  useOrders: () => ({
    data: [{ id: "o1", margen_order_id: "2026_1_TEST", factory_id: "f1", order_status: "in_production", archived_at: null }],
    isPending: false,
    isError: false,
  }),
  useNotes: () => ({ data: [], isPending: false, isError: false }),
  useContacts: () => ({ data: [], isPending: false, isError: false }),
  useOrderItems: () => ({ data: [], isPending: false, isError: false }),
  useStatusColors: () => ({ data: {} }),
}));

const Where = () => <p data-testid="where">{useLocation().pathname}</p>;
const renderPage = (path: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NoticeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Where />
          <Routes>
            <Route path="/factories" element={<FactoriesPage />} />
            <Route path="/factories/new" element={<FactoriesPage id="new" />} />
            <Route path="/factories/f1" element={<FactoriesPage id="f1" />} />
          </Routes>
        </MemoryRouter>
      </NoticeProvider>
    </QueryClientProvider>,
  );

describe("Factories page", () => {
  it("adds a factory with Add, in a window over the list", () => {
    renderPage("/factories/new");
    expect(screen.getByRole("link", { name: "Add" })).toHaveAttribute("href", "/factories/new");
    const dialog = screen.getByRole("dialog", { name: "Add factory" });
    expect(dialog).toContainElement(screen.getByRole("button", { name: "Add factory" }));
    // The list stays underneath.
    expect(screen.getByRole("link", { name: "Ocean Factory" })).toBeInTheDocument();
  });

  it("closes the window with ×, back to the list", async () => {
    const user = userEvent.setup();
    renderPage("/factories/new");
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(screen.getByTestId("where")).toHaveTextContent("/factories");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("greys out Delete on a factory with orders, saying why", () => {
    renderPage("/factories/f1");
    const remove = screen.getByRole("button", { name: "Delete" });
    expect(remove).toBeDisabled();
    expect(remove).toHaveAttribute("title", "Ocean Factory has 1 order, so it can't be deleted. Assign those orders elsewhere first.");
  });
});
