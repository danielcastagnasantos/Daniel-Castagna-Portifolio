import { AppShell } from "@/components/shell/AppShell";
import { InstallPrompt } from "@/components/shell/PwaClient";
import { getOrganization, requireAuth } from "@/lib/auth";
import { isAdmin } from "@/lib/permissions";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, profile } = await requireAuth();
  const org = await getOrganization();
  let unread = 0;
  if (isAdmin(profile.role)) {
    const { count } = await supabase
      .from("notification_feed")
      .select("id", { count: "exact", head: true })
      .is("resolved_at", null)
      .eq("is_read", false);
    unread = count ?? 0;
  }
  return (
    <AppShell role={profile.role} name={profile.full_name} orgName={org?.name ?? "Distribuidora"} unread={unread}>
      <InstallPrompt />
      {children}
    </AppShell>
  );
}
