"use client";

import { useState } from "react";
import { Check, Copy, KeyRound, Pencil, ShieldCheck, UserCheck, UserMinus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ActionForm, Field, Input, Select } from "@/components/forms/ActionForm";
import { Modal, ModalButton } from "@/components/ui/Modal";
import { Alert, Button } from "@/components/ui/primitives";
import { cancelInvitationAction, inviteUserAction, resetPasswordAction, setUserActiveAction, setUserRoleAction, updateUserNameAction } from "@/app/actions/team";
import { roleLabel, type Role } from "@/lib/labels";

function Credentials({ email, password, onDone }: { email?: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-4">
      <Alert tone="warning" title="Anote agora — esta senha não será mostrada de novo">
        Entregue à pessoa por um canal seguro. No primeiro acesso ela será obrigada a criar uma senha própria.
      </Alert>
      <div className="space-y-2 rounded-xl bg-surface-2 p-4 text-sm">
        {email && <div className="flex justify-between gap-3"><span className="text-muted">E-mail</span><b>{email}</b></div>}
        <div className="flex items-center justify-between gap-3"><span className="text-muted">Senha provisória</span><code className="rounded-lg bg-surface px-2.5 py-1 text-base font-semibold tracking-wider">{password}</code></div>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={async () => { try { await navigator.clipboard.writeText(password); setCopied(true); toast.success("Senha copiada."); } catch { toast.error("Não foi possível copiar. Anote manualmente."); } }}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />} Copiar senha
        </Button>
        <Button onClick={onDone}>Pronto, anotei</Button>
      </div>
    </div>
  );
}

export function InviteUserButton({ roles }: { roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const done = () => { setOpen(false); setCreds(null); };
  return (
    <>
      <Button onClick={() => setOpen(true)}><UserPlus size={16} aria-hidden /> Novo acesso</Button>
      <Modal open={open} onClose={done} title={creds ? "Acesso criado" : "Novo acesso"} description={creds ? undefined : "Cada pessoa tem o seu login. Nunca compartilhe senhas."}>
        {creds ? <Credentials email={creds.email} password={creds.password} onDone={done} /> : (
          <ActionForm action={inviteUserAction} submit="Criar acesso" keepOpen onSuccess={(s) => { const d = s.data as { tempPassword?: string; email?: string } | undefined; if (d?.tempPassword) setCreds({ email: d.email ?? "", password: d.tempPassword }); else done(); }}>
            <Field label="Nome completo" name="full_name"><Input name="full_name" required minLength={2} maxLength={120} autoComplete="off" /></Field>
            <Field label="E-mail" name="email"><Input name="email" type="email" required autoComplete="off" /></Field>
            <Field label="Perfil de acesso" name="role" hint="Operador: só caixa. Gerente: operação e financeiro. Proprietário: tudo.">
              <Select name="role" defaultValue="cashier">{roles.map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</Select>
            </Field>
            <Field label="Como entregar o acesso" name="mode">
              <Select name="mode" defaultValue="temp_password"><option value="temp_password">Gerar senha provisória (recomendado)</option><option value="email_invite">Enviar convite por e-mail (exige e-mail configurado no Supabase)</option></Select>
            </Field>
          </ActionForm>
        )}
      </Modal>
    </>
  );
}

export function ResetPasswordButton({ id, name }: { id: string; name: string }) {
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState<string | null>(null);
  const done = () => { setOpen(false); setPw(null); };
  return (
    <>
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}><KeyRound size={14} aria-hidden /> Nova senha</Button>
      <Modal open={open} onClose={done} title={`Nova senha para ${name}`} description="A senha atual deixa de funcionar.">
        {pw ? <Credentials password={pw} onDone={done} /> : (
          <ActionForm action={resetPasswordAction} submit="Gerar senha provisória" keepOpen variant="primary" onSuccess={(s) => setPw((s.data as { tempPassword?: string })?.tempPassword ?? null)}>
            <input type="hidden" name="id" value={id} />
            <p className="text-sm text-muted">Será gerada uma senha provisória. {name} precisará trocá-la ao entrar.</p>
          </ActionForm>
        )}
      </Modal>
    </>
  );
}

export function ToggleActiveButton({ id, active, name }: { id: string; active: boolean; name: string }) {
  return (
    <ModalButton variant={active ? "danger-ghost" : "ghost"} size="sm" label={active ? "Desativar" : "Reativar"} icon={active ? <UserMinus size={14} aria-hidden /> : <UserCheck size={14} aria-hidden />}
      title={active ? `Desativar ${name}?` : `Reativar ${name}?`} description={active ? "A pessoa perde o acesso na hora. O histórico dela é mantido." : undefined}>
      <ActionForm action={setUserActiveAction} submit={active ? "Desativar acesso" : "Reativar acesso"} variant={active ? "danger" : "primary"}>
        <input type="hidden" name="id" value={id} /><input type="hidden" name="active" value={String(!active)} />
      </ActionForm>
    </ModalButton>
  );
}

export function ChangeRoleButton({ id, role, name }: { id: string; role: Role; name: string }) {
  return (
    <ModalButton variant="ghost" size="sm" label="Perfil" icon={<ShieldCheck size={14} aria-hidden />} title={`Perfil de ${name}`} description="Somente o proprietário altera níveis de acesso.">
      <ActionForm action={setUserRoleAction} submit="Salvar perfil" resetOnSuccess={false}>
        <input type="hidden" name="id" value={id} />
        <Field label="Perfil" name="role"><Select name="role" defaultValue={role}>{(Object.keys(roleLabel) as Role[]).map((r) => <option key={r} value={r}>{roleLabel[r]}</option>)}</Select></Field>
      </ActionForm>
    </ModalButton>
  );
}

export function RenameButton({ id, name }: { id: string; name: string }) {
  return (
    <ModalButton variant="ghost" size="sm" label="Nome" icon={<Pencil size={14} aria-hidden />} title="Editar nome">
      <ActionForm action={updateUserNameAction} submit="Salvar" resetOnSuccess={false}>
        <input type="hidden" name="id" value={id} />
        <Field label="Nome" name="full_name"><Input name="full_name" required minLength={2} maxLength={120} defaultValue={name} /></Field>
      </ActionForm>
    </ModalButton>
  );
}

export function CancelInvitationButton({ id }: { id: string }) {
  return (
    <ActionForm action={cancelInvitationAction} submit="Cancelar convite" variant="ghost" submitClassName="h-8 px-3 text-xs">
      <input type="hidden" name="id" value={id} />
    </ActionForm>
  );
}
