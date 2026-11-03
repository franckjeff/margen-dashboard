import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type Notice = { type: "error" | "success"; text: string };

type NoticeApi = {
  notice: Notice | null;
  // keep: the notice survives the next navigation, for messages that announce it ("Added …").
  notify: (type: Notice["type"], text: string, options?: { keep?: boolean }) => void;
  clear: () => void;
  // Called on every navigation: drops the notice unless it was kept for this one.
  navigated: () => void;
};

const NoticeContext = createContext<NoticeApi | null>(null);

export function NoticeProvider({ children }: { children: ReactNode }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const keep = useRef(false);

  const notify = useCallback<NoticeApi["notify"]>((type, text, options) => {
    keep.current = options?.keep ?? false;
    setNotice({ type, text });
  }, []);
  const clear = useCallback(() => setNotice(null), []);
  const navigated = useCallback(() => {
    if (keep.current) keep.current = false;
    else setNotice(null);
  }, []);

  const api = useMemo(() => ({ notice, notify, clear, navigated }), [notice, notify, clear, navigated]);
  return <NoticeContext.Provider value={api}>{children}</NoticeContext.Provider>;
}

export function useNotice() {
  const api = useContext(NoticeContext);
  if (!api) throw new Error("useNotice must be used inside NoticeProvider");
  return api;
}

export function NoticeBar() {
  const { notice, clear } = useNotice();
  if (!notice) return null;
  return (
    <div className={`notice ${notice.type}`} role="status">
      <span>{notice.text}</span>
      <button type="button" className="icon-btn" onClick={clear} aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
