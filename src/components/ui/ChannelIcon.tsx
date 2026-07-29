import { siGithub, siInstagram, siWhatsapp } from "simple-icons";
import type { LinkKey } from "@/content/site.config";

/**
 * O simple-icons removeu a marca do LinkedIn a pedido do detentor, e e-mail não
 * é uma marca. Esses dois são desenhados aqui; os demais vêm do pacote.
 */
const LINKEDIN_PATH =
  "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z";

const EMAIL_PATH =
  "M1.5 5.25A2.25 2.25 0 0 1 3.75 3h16.5a2.25 2.25 0 0 1 2.25 2.25v13.5A2.25 2.25 0 0 1 20.25 21H3.75a2.25 2.25 0 0 1-2.25-2.25V5.25Zm2.4.75 8.1 6.075L20.1 6H3.9Zm-.9 1.575V18.6c0 .11.09.15.15.15h16.2c.06 0 .15-.04.15-.15V7.575l-7.86 5.895a.9.9 0 0 1-1.08 0L3 7.575Z";

const PATHS: Record<LinkKey, string> = {
  whatsapp: siWhatsapp.path,
  github: siGithub.path,
  instagram: siInstagram.path,
  linkedin: LINKEDIN_PATH,
  email: EMAIL_PATH,
};

export function ChannelIcon({ channel, className = "h-5 w-5" }: { channel: LinkKey; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d={PATHS[channel]} />
    </svg>
  );
}
