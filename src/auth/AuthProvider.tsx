import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Role } from "../lib/constants";
import { supabase } from "../lib/supabase";
import { resetUiState } from "../lib/uiState";

// undefined = still checking, null = signed out.
const SessionContext = createContext<Session | null | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const userId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      // A different person (or nobody) must never see the previous user's cached data or screens.
      if (next?.user.id !== userId.current) {
        userId.current = next?.user.id;
        queryClient.clear();
        resetUiState();
      }
      setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, [queryClient]);

  return <SessionContext.Provider value={session}>{children}</SessionContext.Provider>;
}

export const useSession = () => useContext(SessionContext);

export type SignedIn = { session: Session; userId: string; email: string; role: Role; firstName: string | null };
const SignedInContext = createContext<SignedIn | null>(null);

// Everything inside has a signed-in user with an access level.
export function SignedInProvider({ value, children }: { value: SignedIn; children: ReactNode }) {
  return <SignedInContext.Provider value={value}>{children}</SignedInContext.Provider>;
}

export function useSignedIn() {
  const value = useContext(SignedInContext);
  if (!value) throw new Error("useSignedIn must be used inside SignedInProvider");
  return value;
}
