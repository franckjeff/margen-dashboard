import { useEffect, useId, useRef, type ReactNode } from "react";

// A window over the page, for a short task like adding a user. Built on the browser's <dialog>, which keeps
// keyboard focus inside and closes on Esc. Clicking outside it or on × closes it too. Shown while mounted.
export function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    // Test environments without showModal just show it in place.
    if (typeof dialog.showModal === "function") {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute("open", "");
    }
    return () => {
      if (typeof dialog.close === "function" && dialog.open) dialog.close();
    };
  }, []);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      // Esc: let the parent unmount it, rather than the browser closing it behind React's back.
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      // A click on the dark area around the window lands on the <dialog> itself.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="dialog-body">
        <div className="dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ghost dialog-close" aria-label="Close" onClick={onClose}>
            ×
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
