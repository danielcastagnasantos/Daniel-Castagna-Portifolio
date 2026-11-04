import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "./cn";

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

const toneClass: Record<Tone, string> = {
  neutral: "bg-surface-2 text-muted",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  info: "bg-info-soft text-info",
  primary: "bg-primary-soft text-primary",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium", toneClass[tone], className)}>{children}</span>;
}

export function Card({ className, ...p }: ComponentProps<"section">) {
  return <section className={cn("print-card rounded-2xl border border-border bg-surface shadow-card", className)} {...p} />;
}
export function CardHeader({ title, description, action, icon: Icon }: { title: ReactNode; description?: ReactNode; action?: ReactNode; icon?: LucideIcon }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {Icon && <span className="mt-0.5 rounded-lg bg-primary-soft p-1.5 text-primary"><Icon size={16} aria-hidden /></span>}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold leading-6">{title}</h2>
          {description && <p className="text-xs text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}
export const CardBody = ({ className, ...p }: ComponentProps<"div">) => <div className={cn("p-4 sm:p-5", className)} {...p} />;

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3 fade-in">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone = "neutral", icon: Icon }: { label: string; value: ReactNode; hint?: ReactNode; tone?: Tone; icon?: LucideIcon }) {
  return (
    <div className="print-card rounded-2xl border border-border bg-surface p-4 shadow-card fade-in">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{label}</span>
        {Icon && <span className={cn("rounded-lg p-1.5", toneClass[tone])}><Icon size={15} aria-hidden /></span>}
      </div>
      <div className="tabular mt-2 text-xl font-semibold tracking-tight sm:text-2xl">{value}</div>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export function Empty({ icon: Icon, title, description, action }: { icon?: LucideIcon; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      {Icon && <span className="rounded-full bg-surface-2 p-3 text-muted"><Icon size={20} aria-hidden /></span>}
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="max-w-sm text-xs text-muted">{description}</p>}
      {action}
    </div>
  );
}

export function Alert({ tone = "info", title, children }: { tone?: Tone; title?: string; children?: ReactNode }) {
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl border px-3.5 py-3 text-sm", toneClass[tone], "border-current/15")}>
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={cn(title && "mt-0.5", "text-[13px] leading-5 opacity-95")}>{children}</div>}
    </div>
  );
}

const btn = {
  base: "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition active:scale-[.98] disabled:pointer-events-none disabled:opacity-50",
  size: { sm: "h-8 px-3", md: "h-10 px-4", lg: "h-12 px-5 text-base" },
  variant: {
    primary: "bg-primary text-on-primary hover:bg-primary-hover shadow-sm",
    secondary: "border border-border bg-surface hover:bg-surface-2",
    ghost: "hover:bg-surface-2",
    danger: "bg-danger text-white hover:opacity-90",
    "danger-ghost": "text-danger hover:bg-danger-soft",
  },
};
export type ButtonVariant = keyof typeof btn.variant;
export const buttonClass = (variant: ButtonVariant = "primary", size: keyof typeof btn.size = "md", extra?: string) =>
  cn(btn.base, btn.size[size], btn.variant[variant], extra);

export function Button({ variant = "primary", size = "md", className, type = "button", ...p }: ComponentProps<"button"> & { variant?: ButtonVariant; size?: keyof typeof btn.size }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...p} />;
}
export function LinkButton({ variant = "secondary", size = "md", className, ...p }: ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: keyof typeof btn.size }) {
  return <Link className={buttonClass(variant, size, className)} {...p} />;
}

export const inputClass =
  "h-10 w-full rounded-xl border border-border bg-surface px-3 text-sm placeholder:text-muted/70 focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30 disabled:opacity-60";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4", className)} aria-hidden />;
}
