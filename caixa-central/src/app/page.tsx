import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { profile } = await requireAuth();
  redirect(profile.role === "cashier" ? "/caixa" : "/painel");
}
