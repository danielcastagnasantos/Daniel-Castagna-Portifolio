"use client";

import { Ban, CheckCircle2, ClipboardCheck, ThumbsDown, ThumbsUp } from "lucide-react";
import { ActionForm, Field, Input, Select, Textarea } from "@/components/forms/ActionForm";
import { ModalButton } from "@/components/ui/Modal";
import { cancelMovementAction, reviewMovementAction, reviewShiftAction } from "@/app/actions/cash";

export function CancelMovementButton({ id }: { id: string }) {
  return (
    <ModalButton variant="danger-ghost" size="sm" label="Cancelar" icon={<Ban size={14} aria-hidden />} title="Cancelar movimentação"
      description="O valor sai do caixa por um estorno registrado. O lançamento original permanece no histórico.">
      <ActionForm action={cancelMovementAction} submit="Confirmar cancelamento" variant="danger">
        <input type="hidden" name="id" value={id} />
        <Field label="Motivo (obrigatório)" name="reason"><Input name="reason" required minLength={5} maxLength={300} placeholder="Ex.: lançado em duplicidade" /></Field>
      </ActionForm>
    </ModalButton>
  );
}

export function ReviewMovementButtons({ id }: { id: string }) {
  return (
    <span className="inline-flex gap-1.5">
      <ModalButton variant="secondary" size="sm" label="Aprovar" icon={<ThumbsUp size={14} aria-hidden />} title="Aprovar movimentação">
        <ActionForm action={reviewMovementAction} submit="Aprovar" resetOnSuccess>
          <input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value="approve" />
          <Field label="Observação (opcional)" name="note"><Input name="note" maxLength={300} /></Field>
        </ActionForm>
      </ModalButton>
      <ModalButton variant="danger-ghost" size="sm" label="Recusar" icon={<ThumbsDown size={14} aria-hidden />} title="Recusar movimentação"
        description="O dinheiro já saiu da gaveta, por isso o lançamento permanece; ele fica sinalizado como recusado para apuração.">
        <ActionForm action={reviewMovementAction} submit="Recusar" variant="danger">
          <input type="hidden" name="id" value={id} /><input type="hidden" name="decision" value="reject" />
          <Field label="Motivo (obrigatório)" name="note"><Input name="note" required minLength={4} maxLength={300} /></Field>
        </ActionForm>
      </ModalButton>
    </span>
  );
}

export function ReviewShiftButton({ id }: { id: string }) {
  return (
    <ModalButton variant="primary" label="Conferir este turno" icon={<ClipboardCheck size={16} aria-hidden />} title="Conferência do turno"
      description="Registre que você conferiu o fechamento (ou aponte o problema encontrado).">
      <ActionForm action={reviewShiftAction} submit={<><CheckCircle2 size={16} aria-hidden /> Salvar conferência</>}>
        <input type="hidden" name="id" value={id} />
        <Field label="Resultado" name="status">
          <Select name="status" defaultValue="approved"><option value="approved">Conferido — está tudo certo</option><option value="flagged">Com problema — precisa de apuração</option></Select>
        </Field>
        <Field label="Observação" name="note" hint="Obrigatória quando há problema."><Textarea name="note" rows={3} maxLength={500} /></Field>
      </ActionForm>
    </ModalButton>
  );
}
