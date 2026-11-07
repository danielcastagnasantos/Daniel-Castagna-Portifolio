"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { X } from "lucide-react";
import { Button, type ButtonVariant } from "./primitives";

const CloseCtx = createContext<(() => void) | null>(null);
/** Permite que um formulário dentro do modal o feche após salvar. */
export const useModalClose = () => useContext(CloseCtx);

export function Modal({ open, onClose, title, description, children }: {
  open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      className="modal"
      aria-labelledby="modal-title"
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
    >
      {open && (
        <div className="flex max-h-[calc(100dvh-24px)] flex-col">
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
            <div>
              <h2 id="modal-title" className="text-base font-semibold">{title}</h2>
              {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
            </div>
            <button type="button" onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted hover:bg-surface-2">
              <X size={18} aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto p-5">
            <CloseCtx.Provider value={onClose}>{children}</CloseCtx.Provider>
          </div>
        </div>
      )}
    </dialog>
  );
}

/** Botão que abre um modal com o conteúdo (formulário, confirmação...). */
export function ModalButton({
  label, title, description, variant = "secondary", size = "md", icon, children, className,
}: {
  label: ReactNode; title: string; description?: string; variant?: ButtonVariant; size?: "sm" | "md" | "lg";
  icon?: ReactNode; children: ReactNode; className?: string;
}) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)} className={className}>{icon}{label}</Button>
      <Modal open={open} onClose={close} title={title} description={description}>{children}</Modal>
    </>
  );
}
