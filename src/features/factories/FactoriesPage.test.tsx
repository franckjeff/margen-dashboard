import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { NoticeProvider } from "../../components/Notice";
import { FactoriesPage } from "./FactoriesPage";

vi.mock("../../data/queries", async (original) => ({
  ...(await original<typeof import("../../data/queries")>()),
  useFactories: () => ({ data: [{ id: "f1", name: "Ocean Factory", country: null, description: null, created_at: "2026-11-01", contacts: [] }], isPending: false, isError: false }),
  useOrders: () => ({ data: [], isPending: false, isError: false }),
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
});
