"use client";

import { useState } from "react";
import { Ban, Link2, Loader2, PlusCircle, Unlink } from "lucide-react";
import { ActionForm, Field, Input, Select } from "@/components/forms/ActionForm";
import { Button } from "@/components/ui/primitives";
import { Modal } from "@/components/ui/Modal";
import { entryFromLineAction, ignoreLineAction, reconcileAction, reconciliationCandidates, unreconcileAction } from "@/app/actions/finance";
import { formatBRL } from "@/lib/money";
import { formatDateBR } from "@/lib/dates";
import { natureLabel } from "@/lib/labels";

type Cand = { entry_id: number; occurred_on: string; amount_cents: number; description: string | null; nature: string; day_distance: number };
type Which = null | "match" | "create" | "ignore" | "undo";

export function LineActions({ lineId, amountCents, status, categories }: { lineId: string; amountCents: number; status: string; categories: Array<{ id: string; name: string }> }) {
  const [which, setWhich] = useState<Which>(null);
  const [cands, setCands] = useState<Cand[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const close = () => setWhich(null);

  function openMatch() {
    setWhich("match"); setCands(null); setErr(null);
    reconciliationCandidates(lineId).then((r) => { if (r.ok) setCands(r.rows); else setErr(r.error); });
  }

  if (status === "created") return <span className="text-xs text-muted">Gerou lançamento</span>;
  return (
    <>
      <div className="flex flex-wrap gap-1.5">
        {status === "unmatched" ? (
          <>
            <Button size="sm" variant="secondary" onClick={openMatch}><Link2 size={14} aria-hidden /> Conciliar</Button>
            <Button size="sm" variant="ghost" onClick={() => setWhich("create")}><PlusCircle size={14} aria-hidden /> Criar lançamento</Button>
            <Button size="sm" variant="ghost" onClick={() => setWhich("ignore")}><Ban size={14} aria-hidden /> Ignorar</Button>
          </>
        ) : <Button size="sm" variant="ghost" onClick={() => setWhich("undo")}><Unlink size={14} aria-hidden /> Desfazer</Button>}
      </div>

      <Modal open={which === "match"} onClose={close} title="Conciliar com lançamento" description="Mesmo valor, mesma conta, datas próximas e ainda não conciliados.">
        {err ? <p className="text-sm text-danger">{err}</p> : cands === null ? <p className="flex items-center gap-2 text-sm text-muted"><Loader2 size={15} className="animate-spin" aria-hidden /> Buscando sugestões...</p> : cands.length === 0 ? (
          <p className="text-sm text-muted">Nenhum lançamento com o mesmo valor ({formatBRL(amountCents)}) foi encontrado perto dessa data. Se for uma tarifa ou rendimento, use “Criar lançamento”.</p>
        ) : (
          <ActionForm action={reconcileAction} submit="Conciliar">
            <input type="hidden" name="line_id" value={lineId} />
            <fieldset className="space-y-2"><legend className="sr-only">Lançamentos</legend>
              {cands.map((c, i) => (
                <label key={c.entry_id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 text-sm has-[:checked]:border-primary has-[:checked]:bg-primary-soft">
                  <input type="radio" name="entry_id" value={c.entry_id} defaultChecked={i === 0} className="mt-1" />
                  <span><b className="tabular">{formatBRL(c.amount_cents)}</b> · {formatDateBR(c.occurred_on)} · {natureLabel[c.nature]}<br /><span className="text-xs text-muted">{c.description}{c.day_distance ? ` · ${c.day_distance} dia(s) de diferença` : " · mesmo dia"}</span></span>
                </label>
              ))}
            </fieldset>
          </ActionForm>
        )}
      </Modal>

      <Modal open={which === "create"} onClose={close} title="Criar lançamento a partir do extrato" description="Para o que está no banco mas não no sistema (tarifa, rendimento...).">
        <ActionForm action={entryFromLineAction} submit="Criar lançamento">
          <input type="hidden" name="line_id" value={lineId} />
          <Field label="Tipo" name="nature">
            <Select name="nature" defaultValue={amountCents < 0 ? "fee" : "other_income"}>
              {amountCents < 0 ? <><option value="fee">Tarifa / taxa bancária</option><option value="expense">Despesa</option></> : <option value="other_income">Outra entrada (rendimento, depósito)</option>}
              <option value="adjustment">Ajuste</option>
            </Select>
          </Field>
          {amountCents < 0 && <Field label="Categoria" name="category_id"><Select name="category_id" defaultValue=""><option value="">Sem categoria</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>}
          <Field label="Descrição (opcional)" name="description"><Input name="description" maxLength={250} /></Field>
        </ActionForm>
      </Modal>

      <Modal open={which === "ignore"} onClose={close} title="Ignorar linha do extrato">
        <ActionForm action={ignoreLineAction} submit="Ignorar" variant="secondary">
          <input type="hidden" name="id" value={lineId} />
          <Field label="Motivo" name="reason"><Input name="reason" required minLength={4} maxLength={250} placeholder="Ex.: pertence a outra conta" /></Field>
        </ActionForm>
      </Modal>
      <Modal open={which === "undo"} onClose={close} title="Desfazer">
        <ActionForm action={unreconcileAction} submit="Desfazer" variant="secondary">
          <input type="hidden" name="id" value={lineId} />
          <Field label="Motivo" name="reason"><Input name="reason" required minLength={4} maxLength={250} /></Field>
        </ActionForm>
      </Modal>
    </>
  );
}
