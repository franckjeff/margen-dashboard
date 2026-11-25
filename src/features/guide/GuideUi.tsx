import type { ReactNode } from "react";

// Pieces shared by the user guides.

// One numbered section of a guide, listed in its contents.
export type Section = { id: string; title: string; body: ReactNode };

// The name of something on screen: a button, link, menu entry or field.
export const Ui = ({ children }: { children: ReactNode }) => <b className="ui-name">{children}</b>;
