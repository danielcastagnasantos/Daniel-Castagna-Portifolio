"use client";

export function RetryButton() {
  return (
    <button type="button" onClick={() => window.location.assign("/")} className="inline-flex h-10 items-center rounded-xl bg-primary px-4 text-sm font-medium text-on-primary">
      Tentar novamente
    </button>
  );
}
