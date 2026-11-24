/**
 * Diagnóstico do ambiente: `npm run doctor` (offline) ou `npm run doctor -- --online` (confere as chaves
 * com chamadas GRATUITAS) e `--baixar-navegador` (baixa o Chrome do Remotion agora).
 */
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { ensureBrowser } from "@remotion/renderer";
import { BrandRegistry } from "../core/brands";
import { loadConfig, loadEnvFile, type AppConfig } from "../core/config";
import { TelegramClient } from "../core/integrations/telegramClient";
import { Ffmpeg } from "../core/media/ffmpeg";
import { scanLibrary } from "../core/providers/visual/library";
import { request, wrapHttpError, HttpStatusError } from "../core/util/http";

const { values } = parseArgs({ options: { online: { type: "boolean", default: false }, "baixar-navegador": { type: "boolean", default: false } } });

let problems = 0;
const ok = (m: string) => console.log(`  \x1b[32m✔\x1b[0m ${m}`);
const warn = (m: string) => console.log(`  \x1b[33m!\x1b[0m ${m}`);
const bad = (m: string) => {
  problems++;
  console.log(`  \x1b[31m✘\x1b[0m ${m}`);
};
const h = (t: string) => console.log(`\n\x1b[1m${t}\x1b[0m`);

async function main() {
  loadEnvFile();
  let config: AppConfig;
  try {
    config = loadConfig();
  } catch (e) {
    console.log(`\n\x1b[31m✘ ${(e as Error).message}\x1b[0m`);
    process.exit(1);
  }

  h("Sistema");
  const major = Number(process.versions.node.split(".")[0]);
  major >= 22 ? ok(`Node ${process.versions.node}`) : bad(`Node ${process.versions.node} — precisa da versão 22 ou mais nova (https://nodejs.org).`);
  ok(`Plataforma: ${process.platform} ${process.arch}`);
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    fs.accessSync(config.dataDir, fs.constants.W_OK);
    const st = fs.statfsSync(config.dataDir);
    const freeGb = (st.bavail * st.bsize) / 1e9;
    freeGb > 5 ? ok(`Pasta de dados gravável: ${config.dataDir} (${freeGb.toFixed(0)} GB livres)`) : warn(`Pouco espaço livre (${freeGb.toFixed(1)} GB) em ${config.dataDir}. Cada vídeo ocupa ~50–300 MB.`);
  } catch (e) {
    bad(`Não consigo gravar em ${config.dataDir}: ${(e as Error).message}`);
  }

  h("FFmpeg (medição de áudio, verificação e prévia)");
  const v = await new Ffmpeg(config.ffmpegPath, config.ffprobePath).versions();
  v.ffmpeg ? ok(v.ffmpeg.slice(0, 60)) : bad("ffmpeg não encontrado. Windows: `winget install Gyan.FFmpeg` e reabra o terminal (ou defina FFMPEG_PATH no .env).");
  v.ffprobe ? ok(v.ffprobe.slice(0, 60)) : bad("ffprobe não encontrado (vem junto com o FFmpeg).");

  h("Navegador do Remotion (renderização)");
  if (config.browserExecutable) {
    fs.existsSync(config.browserExecutable) ? ok(`BROWSER_EXECUTABLE: ${config.browserExecutable}`) : bad(`BROWSER_EXECUTABLE aponta para um arquivo que não existe: ${config.browserExecutable}`);
  } else if (values["baixar-navegador"]) {
    console.log("  baixando o Chrome Headless Shell (~100 MB)…");
    try {
      await ensureBrowser();
      ok("Navegador pronto.");
    } catch (e) {
      bad(`Falha ao baixar o navegador: ${(e as Error).message}`);
    }
  } else {
    warn("O Remotion baixa o Chrome Headless Shell sozinho na 1ª renderização (precisa de internet). Para baixar agora: npm run doctor -- --baixar-navegador");
  }

  h("Marcas e arquivos");
  try {
    const brands = new BrandRegistry(config.configDir);
    for (const b of brands.list()) {
      const missing = Object.values(b.fonts.files).filter((f) => !fs.existsSync(path.join(config.publicDir, f)));
      missing.length ? bad(`${b.name}: fontes ausentes em public/: ${missing.join(", ")}`) : ok(`${b.name}: fontes ok${b.implemented ? "" : " (modo ainda não implementado)"}`);
      if (b.music.file) fs.existsSync(path.join(config.assetsDir, b.music.file)) ? ok(`${b.name}: trilha ${b.music.file}`) : warn(`${b.name}: trilha "${b.music.file}" não existe em assets/`);
      else warn(`${b.name}: sem trilha sonora (music.file vazio) — vídeos ao vivo saem sem música. Em modo de teste usa uma trilha sintética.`);
      for (const [n, f] of Object.entries(b.sfx.library)) if (!fs.existsSync(path.join(config.assetsDir, f))) warn(`${b.name}: efeito "${n}" (${f}) não existe em assets/`);
      if (!b.voice.voiceId && !config.elevenlabs.voiceId) warn(`${b.name}: sem voz definida (voice.voiceId ou ELEVENLABS_VOICE_ID) — necessário no modo ao vivo.`);
    }
  } catch (e) {
    bad((e as Error).message);
  }
  const lib = scanLibrary(path.join(config.assetsDir, "library"));
  ok(`Biblioteca de mídia: ${lib.filter((i) => i.kind === "image").length} imagem(ns), ${lib.filter((i) => i.kind === "video").length} vídeo(s)`);

  h("Chaves de API (.env)");
  const keys: [string, boolean, string][] = [
    ["ANTHROPIC_API_KEY (roteiros)", Boolean(config.anthropic.apiKey), "obrigatória no modo ao vivo"],
    ["ELEVENLABS_API_KEY (narração)", Boolean(config.elevenlabs.apiKey), "obrigatória no modo ao vivo"],
    ["ELEVENLABS_VOICE_ID", Boolean(config.elevenlabs.voiceId), "obrigatório no modo ao vivo (ou voice.voiceId na marca)"],
    ["RUNWAYML_API_SECRET (imagens/vídeos)", Boolean(config.runway.apiKey), "opcional"],
    ["TELEGRAM_BOT_TOKEN", Boolean(config.telegram.botToken), "opcional"],
    ["TELEGRAM_CHAT_ID", Boolean(config.telegram.chatId), "opcional (rode com --online após mandar /start ao bot)"],
    ["WEBHOOK_URL (n8n)", Boolean(config.webhook.url), "opcional"],
  ];
  for (const [name, set, note] of keys) set ? ok(`${name} definido`) : warn(`${name} não definido — ${note}`);
  console.log(`  Modo padrão de novos projetos: ${config.defaultTestMode ? "TESTE (sem custo)" : "AO VIVO (gera custo)"}`);

  if (values.online) {
    h("Conferindo as chaves online (chamadas gratuitas)");
    if (config.anthropic.apiKey) {
      try {
        const client = new Anthropic({ apiKey: config.anthropic.apiKey, maxRetries: 1 });
        await client.models.list({ limit: 1 });
        ok(`Claude: chave válida (modelo configurado: ${config.anthropic.model})`);
      } catch (e) {
        bad(`Claude: ${(e as Error).message}`);
      }
    }
    if (config.elevenlabs.apiKey) {
      try {
        const res = await request(fetch, "https://api.elevenlabs.io/v1/user", { headers: { "xi-api-key": config.elevenlabs.apiKey }, timeoutMs: 20_000 });
        const u = (await res.json()) as { subscription?: { tier?: string; character_count?: number; character_limit?: number } };
        const s = u.subscription;
        ok(`ElevenLabs: chave válida${s ? ` — plano ${s.tier ?? "?"}, ${s.character_count ?? "?"}/${s.character_limit ?? "?"} caracteres usados` : ""}`);
      } catch (e) {
        try {
          wrapHttpError("ElevenLabs", e);
        } catch (w) {
          const hint = e instanceof HttpStatusError && e.status === 401 && /missing_permissions/.test(e.body) ? " (a chave pode ter permissões restritas; a geração de áudio ainda pode funcionar)" : "";
          bad(`${(w as Error).message}${hint}`);
        }
      }
    }
    if (config.runway.apiKey) {
      try {
        const res = await request(fetch, "https://api.dev.runwayml.com/v1/organization", {
          headers: { authorization: `Bearer ${config.runway.apiKey}`, "x-runway-version": "2024-11-06" },
          timeoutMs: 20_000,
        });
        const o = (await res.json()) as { creditBalance?: number };
        ok(`Runway: chave válida — ${o.creditBalance ?? "?"} créditos`);
      } catch (e) {
        try {
          wrapHttpError("Runway", e);
        } catch (w) {
          bad((w as Error).message);
        }
      }
    }
    if (config.telegram.botToken) {
      try {
        const tg = new TelegramClient(config.telegram.botToken);
        const me = await tg.getMe();
        ok(`Telegram: bot @${me.username ?? me.id}`);
        const updates = await tg.getUpdates(0, 0);
        const chats = new Set(updates.flatMap((u) => [u.message?.chat.id, u.callback_query?.message?.chat.id]).filter((x): x is number => x !== undefined));
        chats.size
          ? ok(`Chats que falaram com o bot: ${[...chats].join(", ")} → use um deles em TELEGRAM_CHAT_ID`)
          : warn("Nenhuma mensagem recente. Abra o bot no Telegram, mande /start e rode este comando de novo para ver seu chat_id.");
      } catch (e) {
        bad(`Telegram: ${(e as Error).message}`);
      }
    }
  } else {
    console.log("\n  (use `npm run doctor -- --online` para conferir as chaves com chamadas gratuitas)");
  }

  console.log(problems ? `\n\x1b[31m${problems} problema(s) a resolver.\x1b[0m\n` : "\n\x1b[32mTudo pronto para produzir em modo de teste.\x1b[0m\n");
  process.exit(problems ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
