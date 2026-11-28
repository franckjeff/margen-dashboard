import { dueGroup, groupTasks, personName } from "./tasks";

const today = "2026-11-26";
const task = (due_date: string | null, status = "todo") => ({ due_date, status });

describe("Grouping My tasks by when they're due", () => {
  it("puts each task in its group", () => {
    expect(dueGroup(task("2026-11-25"), today)).toBe("overdue");
    expect(dueGroup(task("2026-11-26"), today)).toBe("today");
    expect(dueGroup(task("2026-11-27"), today)).toBe("week");
    expect(dueGroup(task("2026-12-03"), today)).toBe("week");
    expect(dueGroup(task("2026-12-04"), today)).toBe("later");
    expect(dueGroup(task(null), today)).toBe("none");
  });

  it("puts done tasks under Completed, however late they were", () => {
    expect(dueGroup(task("2026-11-01", "done"), today)).toBe("done");
  });

  it("lists the groups in order, keeping each group's tasks in the order given", () => {
    const tasks = [task(null), task("2026-11-30"), task("2026-11-20"), task("2026-11-28"), task("2026-11-26", "done")];
    expect(groupTasks(tasks, today).map((g) => [g.group, g.tasks.length])).toEqual([
      ["overdue", 1],
      ["today", 0],
      ["week", 2],
      ["later", 0],
      ["none", 1],
      ["done", 1],
    ]);
    expect(groupTasks(tasks, today)[2].tasks.map((t) => t.due_date)).toEqual(["2026-11-30", "2026-11-28"]);
  });
});

describe("A person's name on a task", () => {
  it("uses their name, else their email", () => {
    expect(personName({ first_name: "Ana", last_name: "Lopes", email: "ana@example.com" })).toBe("Ana Lopes");
    expect(personName({ first_name: null, last_name: null, email: "ana@example.com" })).toBe("ana@example.com");
    expect(personName(null)).toBe("Nobody");
  });
});
