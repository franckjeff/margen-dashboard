import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { resetUiState } from "../lib/uiState";
import { ListPage, SortHeader, type ListRow } from "./ListPage";

const people = [
  { id: "a", name: "Bea", pieces: 5 },
  { id: "b", name: "Al", pieces: 20 },
  { id: "c", name: "Cy", pieces: 0 },
];

const rows = (blocked: string[]): ListRow[] =>
  people.map((p) => ({
    key: p.id,
    to: `/people/${p.id}`,
    label: p.name,
    search: p.name.toLowerCase(),
    sort: { name: p.name, pieces: p.pieces },
    blocker: blocked.includes(p.id) ? `${p.name} has orders.` : null,
    cells: (
      <>
        <td>{p.name}</td>
        <td>{p.pieces}</td>
      </>
    ),
  }));

// The names in the order the rows are shown (the first cell is the tick box).
const names = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getAllByRole("cell")[1].textContent);

function renderList(onDelete = vi.fn(), blocked: string[] = []) {
  render(
    <MemoryRouter>
      <ListPage
        title="People"
        count={people.length}
        placeholder="Search people"
        loading={null}
        deletion={{ nouns: "people", busy: false, onDelete }}
        head={
          <>
            <SortHeader column="name">Name</SortHeader>
            <SortHeader column="pieces" firstDescending>
              Pieces
            </SortHeader>
          </>
        }
        rows={rows(blocked)}
      />
    </MemoryRouter>,
  );
  return onDelete;
}

beforeEach(() => resetUiState());

describe("Sorting a list", () => {
  it("keeps the page's order until a column is clicked, then sorts by it and reverses on a second click", async () => {
    const user = userEvent.setup();
    renderList();
    expect(names()).toEqual(["Bea", "Al", "Cy"]);
    await user.click(screen.getByRole("button", { name: /Name/ }));
    expect(names()).toEqual(["Al", "Bea", "Cy"]);
    expect(screen.getByRole("columnheader", { name: /Name/ })).toHaveAttribute("aria-sort", "ascending");
    await user.click(screen.getByRole("button", { name: /Name/ }));
    expect(names()).toEqual(["Cy", "Bea", "Al"]);
  });

  it("starts numbers biggest first", async () => {
    const user = userEvent.setup();
    renderList();
    await user.click(screen.getByRole("button", { name: /Pieces/ }));
    expect(names()).toEqual(["Al", "Bea", "Cy"]);
  });
});

describe("Ticking rows to delete them", () => {
  it("deletes the ticked rows with Delete, and the header box ticks every one that can be deleted", async () => {
    const user = userEvent.setup();
    const onDelete = renderList(vi.fn(), ["c"]);
    const remove = screen.getByRole("button", { name: "Delete" });
    expect(remove).toBeDisabled();

    await user.click(screen.getByRole("checkbox", { name: "Select Bea" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    await user.click(remove);
    expect(onDelete).toHaveBeenLastCalledWith(["a"], expect.any(Function));

    await user.click(screen.getByRole("checkbox", { name: "Select all people shown that can be deleted" }));
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await user.click(remove);
    expect(onDelete).toHaveBeenLastCalledWith(["a", "b"], expect.any(Function));
  });

  it("greys out the box of a row that can't be deleted, saying why", () => {
    renderList(vi.fn(), ["c"]);
    const box = screen.getByRole("checkbox", { name: "Select Cy" });
    expect(box).toBeDisabled();
    expect(box).toHaveAttribute("title", "Cy has orders.");
  });
});
