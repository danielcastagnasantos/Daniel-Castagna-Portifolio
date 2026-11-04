"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ExternalLink, Loader2, Paperclip, Upload } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { registerFileAction, signedFileUrl } from "@/app/actions/bills";
import { useOnline } from "@/components/shell/useOnline";

const ALLOWED = ["application/pdf", "image/png", "image/jpeg"];
const MAX = 10 * 1024 * 1024;

export function validateFile(f: File): string | null {
  if (!ALLOWED.includes(f.type)) return "Envie um PDF, PNG ou JPG.";
  if (f.size > MAX) return "O arquivo deve ter até 10 MB.";
  if (f.size === 0) return "Arquivo vazio.";
  return null;
}

/** Envia ao bucket privado (protegido por RLS) e só então pede ao servidor para registrar. */
export async function uploadBillFile(opts: { orgId: string; billId: string; paymentId?: string | null; kind: "boleto" | "receipt"; file: File }) {
  const err = validateFile(opts.file);
  if (err) throw new Error(err);
  const supabase = createBrowserSupabase();
  const bucket = opts.kind === "boleto" ? "boletos" : "comprovantes";
  const safe = opts.file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
  const path = `${opts.orgId}/${opts.billId}/${crypto.randomUUID()}-${safe}`;
  const up = await supabase.storage.from(bucket).upload(path, opts.file, { upsert: false, contentType: opts.file.type });
  if (up.error) throw new Error(`Falha no envio do arquivo: ${up.error.message}`);
  const fd = new FormData();
  fd.set("bill_id", opts.billId); fd.set("kind", opts.kind); fd.set("path", path); fd.set("filename", opts.file.name);
  if (opts.paymentId) fd.set("payment_id", opts.paymentId);
  const res = await registerFileAction(null, fd);
  if (!res?.ok) {
    await supabase.storage.from(bucket).remove([path]).catch(() => {}); // remove órfão (permitido pela política)
    throw new Error(res && !res.ok ? res.error : "Não foi possível registrar o anexo.");
  }
}

export function FileUploadButton({ orgId, billId, paymentId, kind, label }: {
  orgId: string; billId: string; paymentId?: string; kind: "boleto" | "receipt"; label: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const online = useOnline();
  const router = useRouter();
  return (
    <>
      <input ref={ref} type="file" accept="application/pdf,image/png,image/jpeg" className="sr-only" aria-label={label}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            await uploadBillFile({ orgId, billId, paymentId, kind, file });
            toast.success(kind === "boleto" ? "Boleto anexado." : "Comprovante anexado.");
            router.refresh();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Falha ao anexar o arquivo.");
          } finally {
            setBusy(false);
            if (ref.current) ref.current.value = "";
          }
        }} />
      <Button variant="secondary" size="sm" disabled={busy || !online} onClick={() => ref.current?.click()}>
        {busy ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Upload size={14} aria-hidden />}{label}
      </Button>
    </>
  );
}

export function OpenFileButton({ fileId, filename }: { fileId: string; filename: string }) {
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending} className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline disabled:opacity-60"
      onClick={() => start(async () => {
        const r = await signedFileUrl(fileId);
        if (r.ok) window.open(r.url, "_blank", "noopener,noreferrer");
        else toast.error(r.error);
      })}>
      {pending ? <Loader2 size={14} className="animate-spin" aria-hidden /> : <Paperclip size={14} aria-hidden />}
      <span className="max-w-56 truncate">{filename}</span><ExternalLink size={12} aria-hidden />
    </button>
  );
}
