import type { Tone } from "./primitives";

export const billTone: Record<string, Tone> = { open: "info", partial: "warning", paid: "success", cancelled: "neutral", overdue: "danger" };
export const reviewTone: Record<string, Tone> = { pending: "warning", approved: "success", flagged: "danger", rejected: "danger", not_required: "neutral" };
export const shiftTone: Record<string, Tone> = { open: "success", closed: "neutral" };
export const severityTone: Record<string, Tone> = { info: "info", warning: "warning", critical: "danger" };
