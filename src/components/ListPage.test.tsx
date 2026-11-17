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

function renderList(rows: ListRow[], selectable = false) {
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
        selection={selectable ? { noun: "thing", summary: (keys) => `keys ${keys.join(",")}` } : undefined}
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

  it("selects rows like a spreadsheet and totals them at the bottom", async () => {
    // One user, so keys held down carry over from one step to the next.
    const user = userEvent.setup();
    renderList([row("1", "A"), row("2", "B"), row("3", "C"), row("4", "D")], true);
    const status = () => screen.getByRole("status");
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    // A click selects just that row, replacing the selection.
    await user.click(screen.getByText("B"));
    await user.click(screen.getByText("A"));
    expect(status()).toHaveTextContent("1 thing selected · keys 1");
    // Shift selects the range from the row clicked first.
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("C"));
    await user.keyboard("{/Shift}");
    expect(status()).toHaveTextContent("3 things selected · keys 1,2,3");
    // Ctrl adds a row, and Ctrl on a selected row removes it.
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("D"));
    await user.click(screen.getByText("B"));
    await user.keyboard("{/Control}");
    expect(status()).toHaveTextContent("3 things selected · keys 1,3,4");
    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(status()).not.toHaveTextContent("selected");
  });

  it("selects a range by dragging, and clears with Escape", async () => {
    const user = userEvent.setup();
    renderList([row("1", "A"), row("2", "B"), row("3", "C"), row("4", "D")], true);
    await user.pointer([
      { keys: "[MouseLeft>]", target: screen.getByText("B") },
      { target: screen.getByText("C") },
      { target: screen.getByText("D") },
      { keys: "[/MouseLeft]" },
    ]);
    expect(screen.getByRole("status")).toHaveTextContent("3 things selected · keys 2,3,4");
    // Moving over rows after letting go selects nothing more.
    await user.hover(screen.getByText("A"));
    expect(screen.getByRole("status")).toHaveTextContent("3 things selected");
    await user.keyboard("{Escape}");
    expect(screen.getByRole("status")).not.toHaveTextContent("selected");
  });

  it("splits rows into grids, and selects across them", async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <ListPage
          title="Things"
          count={3}
          placeholder="Search things"
          head={<th>Name</th>}
          rows={[{ ...row("1", "A"), group: "late" }, { ...row("2", "B"), group: "early" }, { ...row("3", "C"), group: "late" }]}
          loading={null}
          groups={[
            { key: "early", title: "Early" },
            { key: "late", title: "Late" },
            { key: "never", title: "Never", empty: "No things." },
          ]}
          selection={{ noun: "thing", summary: (keys) => `keys ${keys.join(",")}` }}
        />
      </MemoryRouter>,
    );
    const grid = (name: string) => screen.getByRole("region", { name });
    expect(grid("Early")).toHaveTextContent("B");
    expect(grid("Late")).toHaveTextContent("AC");
    expect(grid("Never")).toHaveTextContent("No things.");
    // A range runs down the screen: from B in the first grid to A in the second.
    await user.click(screen.getByText("B"));
    await user.keyboard("{Shift>}");
    await user.click(screen.getByText("A"));
    await user.keyboard("{/Shift}");
    expect(screen.getByRole("status")).toHaveTextContent("2 things selected · keys 2,1");
    // A collapsed grid hides its rows, and they drop out of the selection.
    await user.click(screen.getByRole("button", { name: /Late/ }));
    expect(screen.getByRole("button", { name: /Late/ })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("A")).not.toBeVisible();
    expect(screen.getByRole("status")).toHaveTextContent("1 thing selected · keys 2");
    await user.click(screen.getByRole("button", { name: /Late/ }));
    expect(screen.getByText("A")).toBeVisible();
    localStorage.clear();
  });

  it("counts only the selected rows still shown", async () => {
    const user = userEvent.setup();
    renderList([row("1", "Outrigger"), row("2", "Puff")], true);
    await user.click(screen.getByText("Outrigger"));
    await user.keyboard("{Control>}");
    await user.click(screen.getByText("Puff"));
    await user.keyboard("{/Control}");
    await user.type(screen.getByRole("searchbox"), "puf");
    expect(screen.getByRole("status")).toHaveTextContent("1 thing selected · keys 2");
  });
});
