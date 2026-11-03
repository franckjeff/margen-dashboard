import type { FormEvent } from "react";

// A submitted form's fields as trimmed strings. Forms stay uncontrolled: the browser keeps
// what was typed, and the values are read once on submit.
export function formValues(event: FormEvent<HTMLFormElement>): Record<string, string> {
  event.preventDefault();
  return Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value).trim()]));
}

// An optional text field: empty becomes null.
export const orNull = (value: string | undefined) => value || null;

// The confirmation shown before deleting a record, with what goes with it.
export function deleteMessage(label: string, extras: (string | false)[] = []) {
  return [`Delete ${label}? This can't be undone.`, ...extras.filter(Boolean)].join("\n\n");
}
