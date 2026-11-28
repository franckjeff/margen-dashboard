import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { NoticeProvider } from "../../components/Notice";
import { resetUiState } from "../../lib/uiState";
import { localDay } from "./tasks";
import { TasksPage } from "./TasksPage";

const signedIn = vi.hoisted(() => ({ userId: "me", role: "admin" }));
const update = vi.hoisted(() => vi.fn());

vi.mock("../../auth/AuthProvider", () => ({ useSignedIn: () => signedIn }));
vi.mock("../../lib/supabase", async (original) => ({
  ...(await original<typeof import("../../lib/supabase")>()),
  supabase: {
    from: () => ({
      update: (row: object) => ({
        eq: (_: string, id: string) => ({
          select: async () => {
            update(id, row);
            return { data: [{ id }], error: null };
          },
        }),
      }),
    }),
  },
}));

const day = (offset: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return localDay(d);
};
const base = {
  description: null,
  order_id: null,
  order: null,
  created_by: "boss",
  created_by_name: "Sam Boss",
  completed_at: null,
  created_at: "2026-11-20T10:00:00Z",
  updated_at: "2026-11-20T10:00:00Z",
};
const me = { first_name: "Me", last_name: "Myself", email: "me@example.com" };
const tasks = [
  { ...base, id: "t1", title: "Send size chart", status: "todo", due_date: day(-2), assignee_id: "me", assignee: me },
  { ...base, id: "t2", title: "Call the factory", status: "in_progress", due_date: day(0), assignee_id: "me", assignee: me },
  { ...base, id: "t3", title: "Old thing", status: "done", due_date: day(-9), assignee_id: "me", assignee: me },
  {
    ...base,
    id: "t4",
    title: "Someone else's",
    status: "todo",
    due_date: null,
    assignee_id: "other",
    assignee: { first_name: "Ana", last_name: "Lopes", email: null },
  },
];

vi.mock("../../data/queries", async (original) => ({
  ...(await original<typeof import("../../data/queries")>()),
  useTasks: () => ({ data: tasks, isPending: false, isError: false }),
  useNotes: () => ({ data: [], isPending: false, isError: false }),
  useUsers: () => ({ data: [], isPending: false, isError: false }),
  useFactories: () => ({ data: [], isPending: false, isError: false }),
  useOrders: () => ({ data: [], isPending: false, isError: false }),
}));

const renderPage = (path = "/tasks", id?: string) =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NoticeProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/tasks" element={<TasksPage />} />
            <Route path="/tasks/new" element={<TasksPage id="new" />} />
            <Route path="/tasks/:id" element={<TasksPage id={id} />} />
          </Routes>
        </MemoryRouter>
      </NoticeProvider>
    </QueryClientProvider>,
  );

beforeEach(() => {
  resetUiState();
  update.mockReset();
  signedIn.role = "admin";
});

describe("My tasks", () => {
  it("groups my own tasks by when they're due, with Completed folded away", async () => {
    const user = userEvent.setup();
    renderPage();
    expect(screen.getByRole("heading", { name: /Overdue/ })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /Today/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Send size chart" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Someone else's" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old thing" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Completed/ }));
    expect(screen.getByRole("link", { name: "Old thing" })).toBeInTheDocument();
  });

  it("marks a task done with its round tick", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "Mark Send size chart done" }));
    expect(update).toHaveBeenCalledWith("t1", { status: "done" });
  });

  it("shows admins everyone's tasks under All tasks", async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole("button", { name: "All tasks" }));
    const row = screen.getByRole("link", { name: "Someone else's" }).closest("tr")!;
    expect(within(row).getByText("Ana Lopes")).toBeInTheDocument();
  });

  it("gives factory users only their own tasks, with no Add or All tasks", () => {
    signedIn.role = "factory";
    renderPage();
    expect(screen.queryByRole("button", { name: "All tasks" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Add" })).not.toBeInTheDocument();
  });
});

describe("A task's page", () => {
  it("lets a factory user change the status but not edit or delete", () => {
    signedIn.role = "factory";
    renderPage("/tasks/t1", "t1");
    expect(screen.getByRole("heading", { name: /Send size chart/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Mark done" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Task status" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Edit" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });
});
