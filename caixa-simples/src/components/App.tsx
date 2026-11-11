"use client";

import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Login } from "./Login";
import { Painel } from "./Painel";

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  useEffect(() => {
    const sb = supabase();
    void sb.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = sb.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  if (session === undefined) return <div className="grid min-h-dvh place-items-center text-muted"><Loader2 className="animate-spin" aria-label="Carregando" /></div>;
  if (!session) return <Login />;
  return <Painel email={session.user.email ?? ""} />;
}
