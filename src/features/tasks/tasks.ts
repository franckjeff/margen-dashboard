// How My tasks groups tasks, like Asana: by when they're due. Done tasks go under Completed.

export type DueGroup = "overdue" | "today" | "week" | "later" | "none" | "done";

export const DUE_GROUPS: Record<DueGroup, string> = {
  overdue: "Overdue",
  today: "Today",
  week: "Next 7 days",
  later: "Later",
  none: "No due date",
  done: "Completed",
};

// Today as "YYYY-MM-DD" where the user is, like the due dates.
export const localDay = (date = new Date()) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

const addDays = (day: string, days: number) => {
  const date = new Date(`${day}T00:00:00`);
  date.setDate(date.getDate() + days);
  return localDay(date);
};

type Groupable = { status: string; due_date: string | null };

export function dueGroup(task: Groupable, today = localDay()): DueGroup {
  if (task.status === "done") return "done";
  if (!task.due_date) return "none";
  if (task.due_date < today) return "overdue";
  if (task.due_date === today) return "today";
  if (task.due_date <= addDays(today, 7)) return "week";
  return "later";
}

export const isOverdue = (task: Groupable, today = localDay()) => dueGroup(task, today) === "overdue";

// The tasks in each group, in the groups' order. Each group keeps the order it was given (due soonest first).
export function groupTasks<T extends Groupable>(tasks: T[], today = localDay()) {
  const groups = Object.keys(DUE_GROUPS) as DueGroup[];
  return groups.map((group) => ({ group, tasks: tasks.filter((t) => dueGroup(t, today) === group) }));
}

// A person's name for a task: first and last name, or their email.
export const personName = (p: { first_name: string | null; last_name: string | null; email: string | null } | null) =>
  p ? [p.first_name, p.last_name].filter(Boolean).join(" ").trim() || p.email || "Someone" : "Nobody";
