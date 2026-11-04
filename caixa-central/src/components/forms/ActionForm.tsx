"use client";

import { createContext, useActionState, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, WifiOff } from "lucide-react";
import type { ActionState } from "@/lib/action";
import { Button, inputClass, type ButtonVariant } from "@/components/ui/primitives";
import { cn } from "@/components/ui/cn";
import { useOnline } from "@/components/shell/useOnline";
import { useModalClose } from "@/components/ui/Modal";

const FieldErrors = createContext<Record<string, string>>({});

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

/**
 * Formulário ligado a uma Server Action.
 *  - chave de idempotência (`request_id`) estável por tentativa: repetir após falha de rede NÃO duplica;
 *  - só mostra "salvo" quando o servidor devolve ok (isto é, o banco confirmou);
 *  - sem conexão, o envio é bloqueado e os dados digitados são preservados.
 */
export function ActionForm({
  action, children, submit, pendingLabel = "Salvando...", variant = "primary", className, resetOnSuccess = true,
  onSuccess, submitClassName, hideSubmit, confirm, keepOpen,
}: {
  action: Action; children: ReactNode; submit: ReactNode; pendingLabel?: string; variant?: ButtonVariant;
  className?: string; resetOnSuccess?: boolean; onSuccess?: (state: Extract<ActionState, { ok: true }>) => void;
  submitClassName?: string; hideSubmit?: boolean; confirm?: string; keepOpen?: boolean;
}) {
  // Uma chave por OPERAÇÃO: se a rede cair e a pessoa tentar de novo, a mesma chave é reenviada e o
  // servidor devolve o resultado original em vez de duplicar. Só muda depois de um sucesso confirmado.
  const requestIdRef = useRef<string | null>(null);
  const [state, formAction, pending] = useActionState(
    (prev: ActionState, formData: FormData) => {
      requestIdRef.current ??= crypto.randomUUID();
      formData.set("request_id", requestIdRef.current);
      return action(prev, formData);
    },
    null,
  );
  const online = useOnline();
  const router = useRouter();
  const close = useModalClose();
  const formRef = useRef<HTMLFormElement>(null);
  const handled = useRef<number>(0);

  useEffect(() => {
    if (!state || handled.current === state.at) return;
    handled.current = state.at;
    if (state.ok) {
      toast.success(state.message);
      requestIdRef.current = null;                // próxima operação => nova chave
      if (resetOnSuccess) formRef.current?.reset();
      onSuccess?.(state);
      if (!keepOpen) close?.();
      if (state.redirectTo) router.push(state.redirectTo);
      else router.refresh();
    } else {
      toast.error(state.error, { duration: 8000 });
    }
  }, [state, resetOnSuccess, onSuccess, close, router, keepOpen]);

  const errors = state && !state.ok ? state.fieldErrors ?? {} : {};
  return (
    <FieldErrors.Provider value={errors}>
      <form
        ref={formRef}
        action={formAction}
        className={cn("space-y-4", className)}
        onSubmit={(e) => {
          if (confirm && !window.confirm(confirm)) e.preventDefault();
        }}
      >
        {children}
        {state && !state.ok && !Object.keys(errors).length && (
          <p role="alert" className="rounded-xl bg-danger-soft px-3 py-2 text-sm text-danger">{state.error}</p>
        )}
        {!online && (
          <p className="flex items-center gap-2 rounded-xl bg-warning-soft px-3 py-2 text-xs text-warning">
            <WifiOff size={14} aria-hidden /> Sem conexão: não é possível salvar agora. Seus dados continuam na tela.
          </p>
        )}
        {!hideSubmit && (
          <Button type="submit" variant={variant} disabled={pending || !online} className={cn("w-full sm:w-auto", submitClassName)}>
            {pending && <Loader2 size={16} className="animate-spin" aria-hidden />}
            {pending ? pendingLabel : submit}
          </Button>
        )}
      </form>
    </FieldErrors.Provider>
  );
}

export function Field({
  label, name, hint, children, className,
}: { label: string; name: string; hint?: string; children: ReactNode; className?: string }) {
  const errors = useContext(FieldErrors);
  const err = errors[name];
  const id = useId();
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={`${id}-${name}`} className="block text-[13px] font-medium">{label}</label>
      <FieldIdContext.Provider value={{ id: `${id}-${name}`, invalid: !!err }}>{children}</FieldIdContext.Provider>
      {err ? <p className="text-xs text-danger" role="alert">{err}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
const FieldIdContext = createContext<{ id: string; invalid: boolean }>({ id: "", invalid: false });

export function Input(props: React.ComponentProps<"input">) {
  const f = useContext(FieldIdContext);
  return <input id={f.id} aria-invalid={f.invalid || undefined} {...props} className={cn(inputClass, f.invalid && "border-danger", props.className)} />;
}
export function Select(props: React.ComponentProps<"select">) {
  const f = useContext(FieldIdContext);
  return <select id={f.id} aria-invalid={f.invalid || undefined} {...props} className={cn(inputClass, "pr-8", f.invalid && "border-danger", props.className)} />;
}
export function Textarea(props: React.ComponentProps<"textarea">) {
  const f = useContext(FieldIdContext);
  return <textarea id={f.id} rows={3} aria-invalid={f.invalid || undefined} {...props} className={cn(inputClass, "h-auto py-2", f.invalid && "border-danger", props.className)} />;
}

/** Campo de valor em reais: texto (sem float), teclado numérico no celular, "1.234,56". */
export function MoneyInput({ name, defaultValue, placeholder = "0,00", required = true, allowNegative = false, autoFocus, onChange }: {
  name: string; defaultValue?: string; placeholder?: string; required?: boolean; allowNegative?: boolean; autoFocus?: boolean;
  onChange?: (value: string) => void;
}) {
  const f = useContext(FieldIdContext);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted">R$</span>
      <input
        id={f.id} name={name} defaultValue={defaultValue} placeholder={placeholder} required={required} autoFocus={autoFocus}
        onChange={onChange ? (e) => onChange(e.target.value) : undefined}
        inputMode={allowNegative ? "text" : "decimal"} autoComplete="off" pattern="-?[0-9.,\s]*"
        aria-invalid={f.invalid || undefined}
        className={cn(inputClass, "tabular pl-9 text-right", f.invalid && "border-danger")}
      />
    </div>
  );
}

export function Checkbox({ name, label, defaultChecked, required }: { name: string; label: string; defaultChecked?: boolean; required?: boolean }) {
  return (
    <label className="flex cursor-pointer items-start gap-2.5 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} required={required} className="mt-0.5 size-4 accent-[var(--primary)]" />
      <span>{label}</span>
    </label>
  );
}
