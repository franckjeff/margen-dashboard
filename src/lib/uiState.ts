import { useCallback, useSyncExternalStore } from "react";

// Screen choices that should survive moving between pages (open menu groups, list and report
// filters, an order import being checked) but not a sign-out. Kept in memory for this tab.
const values = new Map<string, unknown>();
const listeners = new Set<() => void>();

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const emit = () => listeners.forEach((listener) => listener());

export function useUiState<T>(key: string, initial: T): [T, (next: T | ((previous: T) => T)) => void] {
  if (!values.has(key)) values.set(key, initial);
  const value = useSyncExternalStore(subscribe, () => values.get(key) as T);
  const setValue = useCallback(
    (next: T | ((previous: T) => T)) => {
      const previous = values.get(key) as T;
      values.set(key, typeof next === "function" ? (next as (p: T) => T)(previous) : next);
      emit();
    },
    [key],
  );
  return [value, setValue];
}

// Forgets every choice, e.g. when another user signs in.
export function resetUiState() {
  values.clear();
  emit();
}
