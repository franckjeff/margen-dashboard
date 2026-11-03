import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { ListPage, type ListRow } from "./ListPage";

const row = (key: string, name: string, filteredOut = false): ListRow => ({
  key,
  to: `/things/${key}`,
  search: name.toLowerCase(),
  filteredOut,
  cells: <td>{name}</td>,
});

function renderList(rows: ListRow[]) {
  render(
    <MemoryRouter>
      <ListPage
        title="Things"
        count={rows.length}
        newTo="/things/new"
        newLabel="New thing"
        placeholder="Search things"
        head={<th>Name</th>}
        rows={rows}
        loading={null}
      />
    </MemoryRouter>,
  );
}

describe("ListPage", () => {
  it("filters rows as you type without losing focus", async () => {
    renderList([row("1", "Outrigger"), row("2", "Puff")]);
    const search = screen.getByRole("searchbox", { name: "Search things" });
    await userEvent.type(search, "puf");
    expect(search).toHaveFocus();
    expect(screen.getByText("Outrigger").closest("tr")).not.toBeVisible();
    expect(screen.getByText("Puff").closest("tr")).toBeVisible();
    expect(screen.getByText("No matches.")).not.toBeVisible();
  });

  it("says when nothing matches, and keeps filtered-out rows hidden", async () => {
    renderList([row("1", "Outrigger", true)]);
    expect(screen.getByText("Outrigger").closest("tr")).not.toBeVisible();
    await userEvent.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No matches.")).toBeVisible();
  });
});
