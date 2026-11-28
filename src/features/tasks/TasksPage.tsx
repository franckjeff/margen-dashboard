import type { ReactNode } from "react";
import { Link, useNavigate } from "react-router";
import { useSignedIn } from "../../auth/AuthProvider";
import { useConfirm } from "../../components/Confirm";
import { Dialog } from "../../components/Dialog";
import { ListPage, SortHeader } from "../../components/ListPage";
import { useNotice } from "../../components/Notice";
import { BackLink, Count, Dash, FormButtons, Missing, Optional, Options, PanelHead, QueryGate, loadingState } from "../../components/ui";
import { expectRows, useDbAction, useDeleteRecord, useDeleteRecords, useSaveRecord } from "../../data/mutations";
import { useFactories, useNotes, useOrders, useTasks, useUsers, type Task } from "../../data/queries";
import { TASK_STATUSES, TASK_TONES } from "../../lib/constants";
import { formatDate, formatDateTime, formatDay, plural } from "../../lib/format";
import { deleteManyMessage, deleteMessage, formValues, orNull } from "../../lib/forms";
import { supabase, unwrap } from "../../lib/supabase";
import { useUiState } from "../../lib/uiState";
import { NotesSection } from "../notes/NotesSection";
import { DUE_GROUPS, groupTasks, isOverdue, personName } from "./tasks";

// Tasks, Asana style: admins give tasks to each other and to factory users. My tasks lists the signed-in
// user's own, grouped by when they're due; admins also have All tasks. A factory user only sees and works
// on their own: they change the status and add notes, nothing else (the database enforces it).

export const TaskBadge = ({ status }: { status: string }) => (
  <span className={`status tone-${TASK_TONES[status]}`}>{TASK_STATUSES[status]}</span>
);

const DueDate = ({ task }: { task: Task }) =>
  task.due_date ? (
    <span className={isOverdue(task) ? "due overdue" : "due"}>{formatDay(task.due_date)}</span>
  ) : (
    <Dash />
  );

// Marks a task done, or back to do.
function useToggleDone() {
  return useDbAction({
    tables: ["tasks"],
    run: async (task: Task) =>
      expectRows(
        unwrap(
          await supabase
            .from("tasks")
            .update({ status: task.status === "done" ? "todo" : "done" })
            .eq("id", task.id)
            .select("id"),
        ),
        `"${task.title}" wasn't changed. You may not have permission.`,
      ),
    success: (task) => (task.status === "done" ? `"${task.title}" is open again.` : `"${task.title}" is done.`),
    failure: (task) => `Couldn't change "${task.title}"`,
  });
}

// The round tick in front of a task.
function DoneTick({ task, toggle }: { task: Task; toggle: ReturnType<typeof useToggleDone> }) {
  const done = task.status === "done";
  return (
    <button
      type="button"
      className={done ? "task-tick done" : "task-tick"}
      aria-pressed={done}
      aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} done`}
      title={done ? "Reopen" : "Mark done"}
      disabled={toggle.isPending}
      onClick={() => toggle.mutate(task)}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 12.5l3.2 3.2L17 9" />
      </svg>
    </button>
  );
}

function TaskForm({ task }: { task?: Task }) {
  const { userId } = useSignedIn();
  const save = useSaveRecord("tasks");
  const { notify } = useNotice();
  const users = useUsers();
  const factories = useFactories();
  const orders = useOrders();
  const back = task ? `/tasks/${task.id}` : "/tasks";

  // Admins and factory users with an active account; the one it's given to now stays in the list.
  const people = (users.data ?? []).filter(
    (u) => (u.role === "admin" || u.role === "factory") && (!u.disabled_at || u.id === task?.assignee_id),
  );
  const factoryName = (id: string | null) => factories.data?.find((f) => f.id === id)?.name;
  const label = (u: (typeof people)[number]) =>
    `${personName(u)}${u.id === userId ? " (you)" : ""} · ${u.role === "admin" ? "Admin" : (factoryName(u.factory_id) ?? "Factory")}`;
  const admins = people.filter((u) => u.role === "admin");
  const factoryUsers = people.filter((u) => u.role === "factory");
  // Orders not shipped or cancelled yet, and the one the task is about.
  const orderChoices = (orders.data ?? []).filter(
    (o) => o.id === task?.order_id || (!o.archived_at && !["shipped", "cancelled"].includes(o.order_status)),
  );

  return (
    <>
      {task && <PanelHead title="Edit task" close={back} />}
      <form
        className="stack"
        onSubmit={(event) => {
          const v = formValues(event);
          if (!v.title) return notify("error", "The task needs a title.");
          const row = {
            title: v.title,
            description: orNull(v.description),
            assignee_id: orNull(v.assignee_id),
            due_date: orNull(v.due_date),
            order_id: orNull(v.order_id),
            ...(task ? { status: v.status } : {}),
          };
          save.mutate({ row, id: task?.id, label: `"${v.title}"` });
        }}
      >
        <label>
          Task
          <input name="title" required autoFocus autoComplete="off" defaultValue={task?.title} placeholder="What needs doing?" />
        </label>
        <div className="field-row">
          <label>
            Assigned to
            {/* Drawn again once the people have loaded, so it starts on the right one. */}
            <select
              key={users.isPending ? "loading" : "ready"}
              name="assignee_id"
              defaultValue={task ? (task.assignee_id ?? "") : userId}
              disabled={users.isPending}
            >
              <option value="">Nobody yet</option>
              <optgroup label="Admins">
                {admins.map((u) => (
                  <option key={u.id} value={u.id}>
                    {label(u)}
                  </option>
                ))}
              </optgroup>
              {factoryUsers.length > 0 && (
                <optgroup label="Factory users">
                  {factoryUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {label(u)}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
          </label>
          <label>
            <Optional>Due date</Optional>
            <input type="date" name="due_date" defaultValue={task?.due_date ?? ""} />
          </label>
        </div>
        <div className="field-row">
          <label>
            <Optional>Order</Optional>
            <select key={orders.isPending ? "loading" : "ready"} name="order_id" defaultValue={task?.order_id ?? ""} disabled={orders.isPending}>
              <option value="">Not about an order</option>
              {orderChoices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.margen_order_id}
                  {o.factory ? ` · ${o.factory.name}` : ""}
                </option>
              ))}
            </select>
          </label>
          {task && (
            <label>
              Status
              <select name="status" defaultValue={task.status}>
                <Options labels={TASK_STATUSES} />
              </select>
            </label>
          )}
        </div>
        <label>
          <Optional>Description</Optional>
          <textarea name="description" rows={4} defaultValue={task?.description ?? ""} placeholder="Details, links, what done looks like…" />
        </label>
        <p className="muted small">The person you give it to gets an email, unless it's you.</p>
        <FormButtons label={task ? "Save changes" : "Add task"} cancel={back} busy={save.isPending} />
      </form>
    </>
  );
}

// Adding a task happens in a window over the list (#/tasks/new); it opens the new one's page.
function AddTask() {
  const navigate = useNavigate();
  return (
    <Dialog title="Add task" onClose={() => navigate("/tasks")}>
      <TaskForm />
    </Dialog>
  );
}

export function TasksPage({ id, editing = false }: { id?: string; editing?: boolean }) {
  const tasks = useTasks();
  const { role } = useSignedIn();

  if (id && id !== "new") {
    return (
      <QueryGate queries={[tasks]}>
        {() => {
          const task = tasks.data!.find((t) => t.id === id);
          return task ? <TaskPage task={task} editing={editing && role === "admin"} /> : <Missing back="/tasks" backLabel="Tasks" what="task" />;
        }}
      </QueryGate>
    );
  }
  return (
    <>
      {id === "new" && role === "admin" && <AddTask />}
      <TaskLists />
    </>
  );
}

type View = "mine" | "all";

// My tasks and, for admins, All tasks.
function TaskLists() {
  const { role } = useSignedIn();
  const [chosen, setView] = useUiState<View>("tasksView", "mine");
  const view = role === "admin" ? chosen : "mine";
  const switcher =
    role === "admin" ? (
      <div className="view-switch" role="group" aria-label="Show">
        {(["mine", "all"] as const).map((v) => (
          <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)}>
            {v === "mine" ? "My tasks" : "All tasks"}
          </button>
        ))}
      </div>
    ) : null;
  return view === "mine" ? <MyTasks switcher={switcher} /> : <AllTasks switcher={switcher} />;
}

// The signed-in user's tasks, grouped by when they're due. Completed ones are folded away.
function MyTasks({ switcher }: { switcher: ReactNode }) {
  const { role, userId } = useSignedIn();
  const tasks = useTasks();
  const toggle = useToggleDone();
  const [showDone, setShowDone] = useUiState("tasksShowDone", false);
  const mine = (tasks.data ?? []).filter((t) => t.assignee_id === userId);
  const open = mine.filter((t) => t.status !== "done").length;
  const waiting = loadingState([tasks]);

  return (
    <>
      <div className="page-head">
        <h1>
          Tasks <Count n={open} />
        </h1>
        {switcher}
        {role === "admin" && (
          <Link to="/tasks/new" className="button primary">
            Add
          </Link>
        )}
      </div>
      {waiting ?? (
        <section className="card section my-tasks">
          {mine.length === 0 && (
            <p className="empty">{role === "admin" ? "No tasks for you. Add one, or give one to someone else." : "No tasks for you yet."}</p>
          )}
          {groupTasks(mine).map(({ group, tasks: inGroup }) => {
            if (!inGroup.length) return null;
            const folded = group === "done" && !showDone;
            return (
              <div key={group} className={`task-group task-group-${group}`}>
                <h2>
                  {group === "done" ? (
                    <button type="button" className="link-button" aria-expanded={!folded} onClick={() => setShowDone(!showDone)}>
                      {DUE_GROUPS[group]} <Count n={inGroup.length} />
                    </button>
                  ) : (
                    <>
                      {DUE_GROUPS[group]} <Count n={inGroup.length} />
                    </>
                  )}
                </h2>
                {!folded && (
                  <ul className="task-list">
                    {inGroup.map((t) => (
                      <li key={t.id} className={t.status === "done" ? "task-row done" : "task-row"}>
                        <DoneTick task={t} toggle={toggle} />
                        <Link to={`/tasks/${t.id}`} className="task-title">
                          {t.title}
                        </Link>
                        <span className="task-meta">
                          {t.status === "in_progress" && <TaskBadge status={t.status} />}
                          {t.order && <span className="muted">{t.order.margen_order_id}</span>}
                          {t.created_by !== userId && t.created_by_name && <span className="muted">from {t.created_by_name}</span>}
                          {t.due_date && <DueDate task={t} />}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </section>
      )}
    </>
  );
}

// Every task, for admins: the usual list, with ticks to delete, sorting and a filter by status.
function AllTasks({ switcher }: { switcher: ReactNode }) {
  const ask = useConfirm();
  const tasks = useTasks();
  const notes = useNotes();
  const toggle = useToggleDone();
  const removeMany = useDeleteRecords("tasks", "tasks");
  const [status, setStatus] = useUiState("tasksStatusFilter", "open");
  const all = tasks.data ?? [];
  const shown = (t: Task) => status === "" || (status === "open" ? t.status !== "done" : t.status === status);

  return (
    <ListPage
      title="Tasks"
      count={all.filter(shown).length}
      newTo="/tasks/new"
      newLabel="Add"
      placeholder="Search tasks"
      sortKey="All tasks"
      empty="No tasks yet."
      loading={loadingState([tasks])}
      filters={
        <>
          {switcher}
          <select className="filter" aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="open">Not done</option>
            <Options labels={TASK_STATUSES} />
            <option value="">All statuses</option>
          </select>
        </>
      }
      deletion={{
        nouns: "tasks",
        busy: removeMany.isPending,
        onDelete: async (ids, done) => {
          const picked = all.filter((t) => ids.includes(t.id));
          const noteCount = (notes.data ?? []).filter((n) => n.task_id && ids.includes(n.task_id)).length;
          const message = deleteManyMessage(
            picked.map((t) => t.title),
            "tasks",
            [noteCount > 0 && `${plural(noteCount, "note")} will be deleted too.`],
          );
          if (await ask(message)) removeMany.mutate(picked.map((t) => ({ id: t.id, label: `"${t.title}"` })), { onSettled: done });
        },
      }}
      head={
        <>
          <th className="tick-cell" aria-label="Done" />
          <SortHeader column="title">Task</SortHeader>
          <SortHeader column="assignee">Assigned to</SortHeader>
          <SortHeader column="status">Status</SortHeader>
          <SortHeader column="due">Due</SortHeader>
          <SortHeader column="order" className="hide-sm">
            Order
          </SortHeader>
        </>
      }
      rows={all.map((t) => ({
        key: t.id,
        to: `/tasks/${t.id}`,
        label: t.title,
        filteredOut: !shown(t),
        sort: {
          title: t.title,
          assignee: personName(t.assignee),
          status: Object.keys(TASK_STATUSES).indexOf(t.status),
          due: t.due_date,
          order: t.order?.margen_order_id ?? null,
        },
        search: `${t.title} ${personName(t.assignee)} ${t.order?.margen_order_id ?? ""} ${TASK_STATUSES[t.status]}`.toLowerCase(),
        cells: (
          <>
            <td className="tick-cell">
              <DoneTick task={t} toggle={toggle} />
            </td>
            <td>
              <Link to={`/tasks/${t.id}`} className={t.status === "done" ? "strong task-done-title" : "strong"}>
                {t.title}
              </Link>
            </td>
            <td>{t.assignee ? personName(t.assignee) : <Dash />}</td>
            <td>
              <TaskBadge status={t.status} />
            </td>
            <td>
              <DueDate task={t} />
            </td>
            <td className="hide-sm">{t.order ? t.order.margen_order_id : <Dash />}</td>
          </>
        ),
      }))}
    />
  );
}

// One task: what it is, who it's for, and its notes. Admins edit and delete it; the person it's for
// changes its status.
function TaskPage({ task, editing }: { task: Task; editing: boolean }) {
  const ask = useConfirm();
  const { role, userId } = useSignedIn();
  const isAdmin = role === "admin";
  const remove = useDeleteRecord("tasks");
  const toggle = useToggleDone();
  const notes = useNotes();
  const noteCount = (notes.data ?? []).filter((n) => n.task_id === task.id).length;
  const label = `"${task.title}"`;
  const setStatus = useDbAction({
    tables: ["tasks"],
    run: async (status: string) =>
      expectRows(
        unwrap(await supabase.from("tasks").update({ status }).eq("id", task.id).select("id")),
        `${label} wasn't changed. You may not have permission.`,
      ),
    success: (status) => `${label} is now ${TASK_STATUSES[status]}.`,
    failure: () => `Couldn't change ${label}`,
  });

  const detail = (term: string, value: ReactNode, wide = false) => (
    <div className={wide ? "wide" : undefined}>
      <dt>{term}</dt>
      <dd>{value}</dd>
    </div>
  );
  const assignee = task.assignee_id === userId ? "You" : task.assignee ? personName(task.assignee) : "Nobody yet";

  return (
    <>
      <BackLink to="/tasks">Tasks</BackLink>
      <div className="page-head">
        <div className="title-block">
          <h1>
            {task.title} <TaskBadge status={task.status} />
          </h1>
          <p className="muted">
            {[`For ${assignee === "You" ? "you" : assignee}`, task.due_date && `due ${formatDay(task.due_date)}`].filter(Boolean).join(", ")}
          </p>
        </div>
        {!editing && (
          <>
            <button type="button" className={task.status === "done" ? undefined : "primary"} disabled={toggle.isPending} onClick={() => toggle.mutate(task)}>
              {task.status === "done" ? "Reopen" : "Mark done"}
            </button>
            <label className="inline-select">
              Status
              <select aria-label="Task status" value={task.status} disabled={setStatus.isPending} onChange={(e) => setStatus.mutate(e.target.value)}>
                <Options labels={TASK_STATUSES} />
              </select>
            </label>
            {isAdmin && (
              <>
                <Link to={`/tasks/${task.id}/edit`} className="button">
                  Edit
                </Link>
                <button
                  type="button"
                  className="danger"
                  disabled={remove.isPending}
                  onClick={async () =>
                    (await ask(deleteMessage(label, [noteCount > 0 && `Its ${plural(noteCount, "note")} will be deleted too.`]))) &&
                    remove.mutate({ id: task.id, label })
                  }
                >
                  Delete
                </button>
              </>
            )}
          </>
        )}
      </div>
      <div className="detail-grid stacked">
        <section className="card section">
          {editing ? (
            <TaskForm task={task} />
          ) : (
            <>
              <h2>Details</h2>
              <dl className="details across">
                {detail("Assigned to", assignee)}
                {detail("Due", <DueDate task={task} />)}
                {detail(
                  "Order",
                  task.order && task.order_id ? <Link to={`/customs/${task.order_id}`}>{task.order.margen_order_id}</Link> : <Dash />,
                )}
                {detail("Created by", task.created_by === userId ? "You" : (task.created_by_name ?? <Dash />))}
                {detail("Created", formatDate(task.created_at))}
                {task.completed_at && detail("Completed", formatDateTime(task.completed_at))}
                {detail("Description", task.description ? <p className="notes">{task.description}</p> : <Dash />, true)}
              </dl>
            </>
          )}
        </section>
        <section className="card section">
          <NotesSection subject={{ task_id: task.id }} placeholder="Add a note: an update, a question, what's left to do…" />
        </section>
      </div>
    </>
  );
}
