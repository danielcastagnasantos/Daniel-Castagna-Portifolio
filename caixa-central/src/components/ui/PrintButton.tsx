"use client";
import { Printer } from "lucide-react";
import { Button } from "./primitives";

export function PrintButton({ label = "Imprimir" }: { label?: string }) {
  return <Button variant="secondary" onClick={() => window.print()} className="no-print"><Printer size={16} aria-hidden /> {label}</Button>;
}
