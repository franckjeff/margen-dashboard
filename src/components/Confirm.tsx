import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { Dialog } from "./Dialog";

// "Are you sure?" in the app's own window instead of the browser's grey box. ask(message) shows the window and
// resolves to true when the button is clicked, false on Cancel, ×, Esc or a click outside it.
//
// The message's first paragraph is the window's title ("Delete 3 athletes? This can't be undone."); the paragraphs
// after it (split by a blank line) are its text. The button is named after the action, its first word: Delete,
// Remove, Disable or Clear, in red. Anything else gets OK.
type Ask = (message: string) => Promise<boolean>;

const DANGER = ["Delete", "Remove", "Disable", "Clear"];

// Outside the provider (in some tests) it falls back to the browser's own box.
const ConfirmContext = createContext<Ask>((message) => Promise.resolve(window.confirm(message)));

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<{ message: string; answer: (yes: boolean) => void } | null>(null);
  const ask = useCallback<Ask>((message) => new Promise((resolve) => setPending({ message, answer: resolve })), []);
  const answer = (yes: boolean) => {
    pending?.answer(yes);
    setPending(null);
  };

  const [title, ...paragraphs] = pending ? pending.message.split("\n\n") : [""];
  const action = title.split(" ")[0];
  const danger = DANGER.includes(action);

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {pending && (
        <Dialog title={title} onClose={() => answer(false)}>
          <div className="confirm-text">
            {paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="form-actions">
            <button type="button" className={danger ? "danger" : "primary"} onClick={() => answer(true)}>
              {danger ? action : "OK"}
            </button>
            {/* Cancel has the focus, so Enter doesn't delete by accident. */}
            <button type="button" data-autofocus onClick={() => answer(false)}>
              Cancel
            </button>
          </div>
        </Dialog>
      )}
    </ConfirmContext.Provider>
  );
}

export const useConfirm = () => useContext(ConfirmContext);
