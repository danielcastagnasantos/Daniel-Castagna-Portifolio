import { WifiOff } from "lucide-react";
import { RetryButton } from "./RetryButton";

export const metadata = { title: "Sem conexão" };

export default function OfflinePage() {
  return (
    <main className="grid min-h-dvh place-items-center p-6 text-center">
      <div className="max-w-sm space-y-3">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-warning-soft text-warning"><WifiOff aria-hidden /></span>
        <h1 className="text-xl font-semibold">Você está sem internet</h1>
        <p className="text-sm text-muted">
          O Caixa Central só mostra e salva dados quando consegue falar com o servidor — assim nenhum valor aparece
          desatualizado nem é dado como salvo sem confirmação. Reconecte e tente de novo.
        </p>
        <RetryButton />
      </div>
    </main>
  );
}
