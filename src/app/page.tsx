"use client";

import { useAuth } from "@/components/AuthProvider";
import { Home } from "@/components/Home";
import { Login } from "@/components/Login";
import { SetupNotice } from "@/components/SetupNotice";
import { isConfigured } from "@/lib/supabase";

export default function Page() {
  const { session, loading } = useAuth();
  if (!isConfigured) return <SetupNotice />;
  if (loading) return null;
  return session ? <Home /> : <Login />;
}
