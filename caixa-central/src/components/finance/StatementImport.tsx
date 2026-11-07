"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, FileUp } from "lucide-react";
import { ActionForm, Field } from "@/components/forms/ActionForm";
import { Alert, Badge, Card, CardBody, CardHeader } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { importStatementAction, previewStatementAction } from "@/app/actions/finance";

interface PreviewLine { posted_on: string; amount_cents: number; description: string; fitid: string | null; key: string; duplicate: boolean }
interface Preview { accountId: string; filename: string; format: "csv" | "ofx"; fileHash: string; lines: PreviewLine[]; skipped: Array<{ row: number; reason: string }> }

export function StatementImport({ accounts, selected }: { accounts: Array<{ id: string; name: string }>; selected?: string }) {
  const [preview, setPreview] = useState<Preview | null>(null);
  const [force, setForce] = useState<Set<string>>(new Set());
  const dupes = preview?.lines.filter((l) => l.duplicate) ?? [];

  const payload = useMemo(() => {
    if (!preview) return "";
    return JSON.stringify(preview.lines.filter((l) => !l.duplicate || force.has(l.key)).map((l) => ({
      posted_on: l.posted_on, amount_cents: l.amount_cents, description: l.description, fitid: l.fitid, key: l.key, force: l.duplicate && force.has(l.key),
    })));
  }, [preview, force]);
  const count = preview ? preview.lines.length - dupes.length + force.size : 0;

  return (
    <Card className="mb-5">
      <CardHeader icon={FileUp} title="Importar extrato" description="Arquivo CSV ou OFX baixado do internet banking (até 3 MB). Nada é lançado no razão: as linhas servem para conferir." />
      <CardBody className="space-y-4">
        <ActionForm action={previewStatementAction} submit="Ler arquivo" pendingLabel="Lendo..." resetOnSuccess={false}
          onSuccess={(s) => { setPreview(s.data as unknown as Preview); setForce(new Set()); }}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Conta do extrato" name="account_id">
              <select name="account_id" required defaultValue={selected ?? ""} className="h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm">
                <option value="" disabled>Escolha...</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </Field>
            <Field label="Arquivo (.csv ou .ofx)" name="file">
              <input name="file" type="file" required accept=".csv,.ofx,.txt,text/csv" className="block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-surface-2 file:px-3 file:py-2 file:text-sm" />
            </Field>
          </div>
          <p className="text-xs text-muted">CSV: precisa das colunas Data, Descrição e Valor (ou Crédito/Débito), separadas por ; ou ,.</p>
        </ActionForm>

        {preview && (
          <div className="space-y-3 border-t border-border pt-4">
            <p className="text-sm"><b>{preview.filename}</b> · {preview.lines.length} lançamento(s) · formato {preview.format.toUpperCase()}</p>
            {preview.skipped.length > 0 && <Alert tone="warning" title={`${preview.skipped.length} linha(s) ignoradas`}>{preview.skipped.slice(0, 5).map((s) => `linha ${s.row}: ${s.reason}`).join("; ")}{preview.skipped.length > 5 ? "…" : ""}</Alert>}
            {dupes.length > 0 && (
              <Alert tone="warning" title={`${dupes.length} possível(is) duplicidade(s)`}>
                Estas linhas já existem em um extrato importado antes. Por padrão não são importadas. Marque as que forem lançamentos diferentes de verdade (ex.: duas tarifas iguais no mesmo dia).
              </Alert>
            )}
            <div className="max-h-72 overflow-auto rounded-xl border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted"><tr><th className="px-3 py-2">Data</th><th className="px-3 py-2">Descrição</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">Situação</th></tr></thead>
                <tbody>
                  {preview.lines.slice(0, 300).map((l) => (
                    <tr key={l.key} className="border-t border-border/60">
                      <td className="whitespace-nowrap px-3 py-1.5">{formatDateBR(l.posted_on)}</td><td className="px-3 py-1.5">{l.description}</td>
                      <td className={`tabular whitespace-nowrap px-3 py-1.5 text-right ${l.amount_cents < 0 ? "text-danger" : "text-success"}`}>{formatBRL(l.amount_cents, { signed: true })}</td>
                      <td className="px-3 py-1.5">{l.duplicate ? (
                        <label className="flex items-center gap-1.5 text-xs"><input type="checkbox" checked={force.has(l.key)} onChange={(e) => setForce((f) => { const n = new Set(f); if (e.target.checked) n.add(l.key); else n.delete(l.key); return n; })} /><AlertTriangle size={13} className="text-warning" aria-hidden /> duplicada — incluir</label>
                      ) : <Badge tone="success">nova</Badge>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {preview.lines.length > 300 && <p className="text-xs text-muted">Mostrando as 300 primeiras; todas serão importadas.</p>}
            <ActionForm action={importStatementAction} submit={`Importar ${count} linha(s)`} pendingLabel="Importando..." resetOnSuccess={false} onSuccess={() => setPreview(null)}>
              <input type="hidden" name="account_id" value={preview.accountId} /><input type="hidden" name="filename" value={preview.filename} />
              <input type="hidden" name="format" value={preview.format} /><input type="hidden" name="file_hash" value={preview.fileHash} />
              <input type="hidden" name="payload" value={payload} />
            </ActionForm>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
