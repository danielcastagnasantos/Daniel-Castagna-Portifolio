# Publicação em produção (Supabase + Vercel)

Tempo estimado: 1–2 horas. Você precisa de: conta Supabase, conta Vercel, acesso ao repositório, e (opcional) domínio e conta Resend para e‑mail.

> **Este guia não foi executado por mim contra contas reais** (sem acesso às suas contas). Cada passo abaixo é o procedimento exato; as etapas que dependem de você estão marcadas com 👤.

## 1. Supabase
1. 👤 Crie um projeto em https://supabase.com/dashboard. Região **South America (São Paulo)**. Guarde a senha do banco num gerenciador de senhas. Ative **MFA** na sua conta Supabase.
2. 👤 Instale o [Supabase CLI](https://supabase.com/docs/guides/cli) e, na pasta `caixa-central`:
   ```bash
   supabase login
   supabase link --project-ref SEU_REF
   supabase db push          # aplica supabase/migrations/0001…0009 (NÃO aplica seed.sql)
   ```
   Alternativa sem CLI: no **SQL Editor** execute, em ordem, cada arquivo de `supabase/migrations/`.
3. 👤 **Authentication > Providers > Email:** desmarque **“Allow new users to sign up”** (sem cadastro público); senha mínima 10; ative “Secure password change”.
4. 👤 **Authentication > URL Configuration:** *Site URL* = sua URL de produção; adicione `https://SEU-DOMINIO/auth/confirm` em *Redirect URLs*.
5. 👤 **Authentication > Email Templates:** cole o conteúdo de `supabase/templates/invite.html` (Invite user) e `recovery.html` (Reset password). Sem isso, convites/recuperação por e‑mail não funcionam com a sessão no servidor. (A criação de acesso com **senha provisória** funciona sem e‑mail.)
6. 👤 **Authentication > SMTP Settings (recomendado):** configure um SMTP próprio. O e‑mail embutido do Supabase é limitado a poucos envios por hora.
7. 👤 **Storage:** os buckets privados `boletos` e `comprovantes` já são criados pela migration `0008`. Confira que ambos aparecem como **Private**.
8. 👤 **Project Settings > API:** copie a URL, a *publishable key* e a *service_role / secret key*. **A secret key nunca vai para o navegador nem para o Git.**
9. 👤 **Database > Backups:** veja [BACKUP.md](BACKUP.md). Para dinheiro real, use plano com backups diários (e idealmente PITR).

## 2. Vercel
1. 👤 **Add New > Project** → importe o repositório. Em **Root Directory** escolha `caixa-central` (o repositório também contém o portfólio na raiz — são projetos separados).
2. 👤 **Environment Variables** (Production):
   | Nome | Valor |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | URL do projeto |
   | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | chave publicável |
   | `SUPABASE_SERVICE_ROLE_KEY` | chave secreta (marque como *Sensitive*) |
   | `NEXT_PUBLIC_APP_URL` | `https://SEU-DOMINIO` |
   | `SETUP_TOKEN` | `openssl rand -hex 16` |
   | `CRON_SECRET` | `openssl rand -hex 32` |
   | `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM` | opcionais (e‑mail de alertas) |
3. 👤 **Deploy.** O arquivo `vercel.json` já agenda `GET /api/cron/notifications` diariamente às 11:00 UTC (08:00 de Brasília) e fixa a região `gru1` (São Paulo). A Vercel envia `Authorization: Bearer $CRON_SECRET` automaticamente.
4. 👤 (Opcional) Domínio próprio em **Settings > Domains** e HTTPS (automático).

## 3. Cadastro inicial
1. Abra `https://SEU-DOMINIO/setup`.
2. Informe o **código de instalação** (`SETUP_TOKEN`), o nome da distribuidora e os dados do **proprietário** (o pai). Só funciona **uma vez** e só enquanto não existir nenhum usuário.
3. Entre → **Equipe** → crie o acesso do gerente (perfil Gerente exige estar logado como proprietário) e dos operadores.
4. **Configurações:** confira *Caixas*, *para onde vai cada forma de pagamento* e regras. **Contas e saldos:** cadastre as contas reais (banco, Pix) com o **saldo inicial** real.
5. Depois do cadastro, pode remover `SETUP_TOKEN` (a tela deixa de aceitar cadastro de qualquer forma).

## 4. E‑mail de alertas (opcional)
1. 👤 Crie conta em https://resend.com, verifique seu domínio e gere uma API key.
2. Defina `EMAIL_PROVIDER=resend`, `RESEND_API_KEY` e `EMAIL_FROM` na Vercel e faça novo deploy.
3. Cada gerente/proprietário recebe um resumo diário dos alertas (liga/desliga em **Configurações > Meus alertas**). Sem essa configuração nada é enviado e nenhum erro aparece — os alertas ficam dentro do sistema.
4. Para testar: `curl -H "Authorization: Bearer $CRON_SECRET" https://SEU-DOMINIO/api/cron/notifications`.

> Plano gratuito da Vercel (Hobby) só permite cron diário. Para alertas a cada hora use o plano Pro ou um agendador externo chamando a mesma URL.

## 5. Depois de publicar
- Execute o [roteiro de aceite](ROTEIRO-DE-ACEITE.md) **antes** de lançar dinheiro real.
- Instale no celular do proprietário: abra a URL no navegador → “Adicionar à tela inicial” (iPhone: Safari > Compartilhar).
- Agende um teste de restauração de backup ([BACKUP.md](BACKUP.md)).
- Mantenha dependências atualizadas (`npm audit`; hoje há avisos *moderados* apenas em ferramentas de desenvolvimento e numa dependência de exportação Excel — veja SEGURANCA.md).
