import { Badge } from "@/components/ui/primitives";
import { Empty } from "@/components/ui/primitives";
import { formatBRL } from "@/lib/money";
import { formatDateTimeBR } from "@/lib/dates";
import { kindLabel, methodLabel, reviewLabel } from "@/lib/labels";
import { reviewTone } from "@/components/ui/tones";
import { cn } from "@/components/ui/cn";
import { ReceiptText } from "lucide-react";
import { CancelMovementButton, ReviewMovementButtons } from "./AdminActions";

export interface MovementRow {
  id: string; kind: string; direction: "in" | "out"; payment_method: string; amount_cents: number; description: string | null;
  status: string; review_status: string; created_at: string; created_by: string; cancel_reason: string | null; category?: string | null;
}

export function MovementList({ rows, isAdmin, canCancel, names, me }: {
  rows: MovementRow[]; isAdmin: boolean; canCancel: boolean; names: Record<string, string>; me: string;
}) {
  if (!rows.length) return <Empty icon={ReceiptText} title="Nenhuma movimentação neste turno" description="Os lançamentos aparecem aqui assim que forem registrados." />;
  return (
    <ul className="divide-y divide-border">
      {rows.map((m) => {
        const cancelled = m.status === "cancelled";
        const cashEffect = m.payment_method === "dinheiro";
        return (
          <li key={m.id} className={cn("flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-3 sm:px-5", cancelled && "opacity-60")}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={cn("text-sm font-medium", cancelled && "line-through")}>{kindLabel[m.kind]}</span>
                <Badge>{methodLabel[m.payment_method]}</Badge>
                {!cashEffect && <Badge tone="info">fora da gaveta</Badge>}
                {cancelled && <Badge tone="danger">cancelada</Badge>}
                {m.review_status !== "not_required" && <Badge tone={reviewTone[m.review_status]}>{reviewLabel[m.review_status]}</Badge>}
              </div>
              <p className="mt-0.5 text-xs text-muted">
                {formatDateTimeBR(m.created_at)} · {m.created_by === me ? "você" : names[m.created_by] ?? "Gerência"}
                {m.category ? ` · ${m.category}` : ""}{m.description ? ` · ${m.description}` : ""}
              </p>
              {cancelled && m.cancel_reason && <p className="text-xs text-danger">Motivo: {m.cancel_reason}</p>}
            </div>
            <div className="flex items-center gap-2">
              <span className={cn("tabular whitespace-nowrap text-sm font-semibold", m.direction === "in" ? "text-success" : "text-danger", cancelled && "line-through")}>
                {formatBRL(m.direction === "in" ? m.amount_cents : -m.amount_cents, { signed: true })}
              </span>
              {isAdmin && !cancelled && m.review_status === "pending" && <ReviewMovementButtons id={m.id} />}
              {isAdmin && canCancel && !cancelled && m.kind !== "bill_payment" && <CancelMovementButton id={m.id} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
