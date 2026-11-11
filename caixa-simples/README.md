# Caixa Simples

App para lançar **entradas** e **saídas** do caixa, em **dinheiro** ou **cartão**, em qualquer data (caixas antigos e novos), com categoria e especificação. Mostra quanto tem de **dinheiro em caixa** (tudo desde o começo) e o cartão separado, mais o resumo de hoje, da semana, do mês, do ano ou de tudo.

Exemplo: hoje vendeu 340 de manhã; caixas dos últimos dias somam 860 → **1.200 em caixa**; saída de 800 em mercadoria → **sobram 400**. (Este exemplo é um dos testes automáticos.)

## Como usar
- **+ Entrada / − Saída**: informe o valor, a data (pode ser antiga), dinheiro ou cartão, a categoria (Venda, Caixa anterior, Mercadoria…) e a especificação (Manhã, Tarde, Fornecedor… ou texto livre).
- Toque em um lançamento para **editar** ou **excluir** (a exclusão pede confirmação e o registro continua guardado no banco).
- Cada dia mostra o **dinheiro no caixa no fim do dia**. **Baixar planilha** gera um CSV do período (abre no Excel).
- Sem internet nada é salvo e o app avisa; tentar de novo não duplica.

## Publicar (resumo)
1. **Supabase:** crie um projeto (pode reaproveitar o que você já tem), abra **SQL Editor** e rode `supabase/setup.sql` **uma vez**.
2. Libere as pessoas: `insert into public.acesso (email) values ('seu@email.com'), ('pai@email.com');` e crie o login de cada uma em **Authentication > Users > Add user** (e-mail + senha, marque "Auto Confirm User"). Desligue "Allow new users to sign up".
3. **Vercel:** novo projeto, Root Directory `caixa-simples`, variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (só a chave publicável; este app não usa a secret key).
4. No celular: abra o endereço → "Adicionar à tela inicial".

## Segurança
Só e-mails em `acesso` leem ou gravam algo (regra no banco, RLS). Ninguém apaga de verdade nem altera o autor. Valores em centavos inteiros (sem float).

## Testes
```bash
npm test            # 51: lógica (saldos, resumo, CSV, dinheiro/data) + 8 de banco em PostgreSQL real
npm run test:e2e    # 12 de navegador (Chromium) contra um servidor de teste que imita o Supabase
```
Os testes de banco precisam de um PostgreSQL local (`TEST_DATABASE_URL`, padrão `postgres://postgres:postgres@127.0.0.1:5432/postgres`). O e2e não usa o Supabase de verdade: o login real e o RLS real só são exercitados pelos testes de banco e pelo seu uso.
