import type { Session } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Role } from "../lib/constants";
import { supabase } from "../lib/supabase";
import { resetUiState } from "../lib/uiState";

// undefined = still checking, null = signed out.
const SessionContext = createContext<Session | null | undefined>(undefined);

// True while someone who followed a password-reset link chooses a new password.
type Recovery = { recovering: boolean; finish: () => void };
const RecoveryContext = createContext<Recovery>({ recovering: false, finish: () => {} });

// The app sends no other sign-in links, so a ?code=… in the address comes from a reset email.
// Read before the Supabase client takes the code out of the address.
const openedFromResetLink = new URLSearchParams(window.location.search).has("code");

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const [recovering, setRecovering] = useState(openedFromResetLink);
  const userId = useRef<string | undefined>(undefined);

  useEffect(() => {
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === "PASSWORD_RECOVERY") setRecovering(true);
      if (event === "SIGNED_OUT") setRecovering(false);
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

  return (
    <SessionContext.Provider value={session}>
      <RecoveryContext.Provider value={{ recovering, finish: () => setRecovering(false) }}>{children}</RecoveryContext.Provider>
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
export const useRecovery = () => useContext(RecoveryContext);

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
