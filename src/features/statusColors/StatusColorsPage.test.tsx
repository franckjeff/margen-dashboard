import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { NoticeBar, NoticeProvider } from "../../components/Notice";
import { StatusColorsPage } from "./StatusColorsPage";

// One color already saved: Shipped is dark green.
vi.mock("../../data/queries", async (original) => ({
  ...(await original<typeof import("../../data/queries")>()),
  useStatusColors: () => ({ data: { "order:shipped": "#006400" }, isPending: false, isError: false }),
}));

// Records what the page writes to the database.
const writes: unknown[] = [];
vi.mock("../../lib/supabase", async (original) => ({
  ...(await original<typeof import("../../lib/supabase")>()),
  supabase: {
    from: (table: string) => ({
      upsert: async (rows: unknown) => (writes.push({ table, upsert: rows }), { error: null }),
      delete: () => ({
        eq: (_k: string, kind: string) => ({ eq: async (_s: string, status: string) => (writes.push({ table, delete: `${kind}:${status}` }), { error: null }) }),
      }),
    }),
  },
}));

const renderPage = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NoticeProvider>
        <MemoryRouter>
          <NoticeBar />
          <StatusColorsPage />
        </MemoryRouter>
      </NoticeProvider>
    </QueryClientProvider>,
  );

describe("Status colors page", () => {
  it("previews new colors, then saves them and resets others to built-in", async () => {
    const user = userEvent.setup();
    renderPage();
    const save = screen.getByRole("button", { name: "Save colors" });
    expect(save).toBeDisabled();
    expect(screen.getByTestId("badge-order:shipped")).toHaveStyle({ backgroundColor: "#006400", color: "#ffffff" });

    // Pick a color for Received: the badge previews it with readable text.
    fireEvent.change(screen.getByLabelText("Color for order status Received"), { target: { value: "#ffe066" } });
    expect(screen.getByTestId("badge-order:received")).toHaveStyle({ backgroundColor: "#ffe066", color: "#000c1c" });
    expect(screen.getByText("1 change not saved yet.")).toBeInTheDocument();

    // Set Shipped back to its built-in color.
    await user.click(screen.getByRole("button", { name: "Use the built-in color for order status Shipped" }));
    expect(screen.getByTestId("badge-order:shipped").style.backgroundColor).toBe("");

    await user.click(save);
    await waitFor(() => expect(screen.getByText("Saved the status colors. Everyone sees them now.")).toBeInTheDocument());
    expect(writes).toEqual([
      { table: "status_colors", upsert: [expect.objectContaining({ kind: "order", status: "received", background: "#ffe066" })] },
      { table: "status_colors", delete: "order:shipped" },
    ]);
    expect(save).toBeDisabled();
  });
});
