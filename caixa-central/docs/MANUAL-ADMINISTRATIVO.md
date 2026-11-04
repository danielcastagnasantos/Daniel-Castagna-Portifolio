# Manual administrativo (gerente e proprietário)

## Quem pode o quê
| | Proprietário | Gerente | Operador |
|---|---|---|---|
| Ver painel, saldos, relatórios | ✅ | ✅ | ❌ |
| Abrir/fechar o próprio turno e lançar vendas | ✅ | ✅ | ✅ |
| Lançar correções, cancelar movimentações, conferir turnos | ✅ | ✅ | ❌ |
| Boletos, fornecedores, contas, conciliação, a receber | ✅ | ✅ | ❌ |
| Criar acessos de **operador** / desativar operadores | ✅ | ✅ | ❌ |
| Criar acessos de gerente/proprietário, **mudar perfis** | ✅ | ❌ | ❌ |
| Ver auditoria | ✅ | ✅ | ❌ |

Ninguém altera o próprio perfil. O banco de dados — e não só a tela — impede isso.

## Rotina diária (gerente)
1. **Painel:** veja caixas abertos, vencimentos de hoje e alertas.
2. **Caixa > Turnos:** abra cada turno fechado e use **Conferir este turno** (ou aponte o problema). Confira também **movimentações aguardando conferência** (aprovar/recusar).
3. **Boletos:** registre os novos e pague o que vence — **só marque pago depois de conferir no banco**.
4. **Conciliação (semanal):** importe o extrato (CSV/OFX), concilie as linhas e crie lançamentos para tarifas/rendimentos.
5. **Contas e saldos:** registre a **liquidação do cartão** quando o dinheiro cair no banco (não é receita nova) e transferências entre contas.

## Rotina do proprietário (celular)
Abra o app instalado → **Painel**: entradas/saídas do dia, saldos separados (em espécie, banco, cartão a receber), contas a pagar e atrasadas, diferenças de caixa, caixas abertos agora. Em **Boletos > Agenda** veja os próximos 7/15/30 dias. **Notificações** reúne os alertas.

## Conceitos importantes
- **Faturamento ≠ dinheiro.** Venda no cartão é faturamento, mas só vira dinheiro no banco na liquidação. Por isso “Cartão a receber” é uma conta à parte.
- **Dinheiro esperado na gaveta** = abertura + entradas em dinheiro − saídas em dinheiro. Pix/cartão não entram.
- **Estorno, não exclusão.** Cancelar gera um lançamento inverso e fica no histórico. Turno fechado não se altera: a correção entra como lançamento no turno atual, marcado com o turno de referência.
- **Transferência não é receita nem despesa.** Boleto pago da gaveta gera **uma** saída (não duas).
- **Ajuste manual** (Contas) existe para corrigir saldo, exige motivo (10+ caracteres) e fica na auditoria.

## Equipe
**Equipe > Novo acesso:** informe nome, e‑mail e perfil. O sistema gera uma **senha provisória mostrada uma única vez** — anote e entregue com segurança; no primeiro acesso a pessoa é obrigada a trocá‑la. Para quem saiu: **Desativar** (perde acesso na hora; histórico preservado; não é possível desativar quem tem turno aberto). **Nova senha** gera outra provisória.

## Configurações
- **Fechamento cego:** operador só vê o esperado depois de contar.
- **Conferência obrigatória a partir de:** valor de sangria/suprimento/despesa de operador que exige aprovação.
- **Alerta de diferença** e **caixa aberto há mais de N horas.**
- **Caixas, categorias e para onde vai cada forma de pagamento** (Pix, cartão, transferência).

## Relatórios e exportação
Relatórios > escolha o relatório, o período, funcionário/tipo > **PDF**, **Excel** ou **CSV**. O CSV usa `;` e abre direto no Excel em português.

## Notificações por e‑mail
Opcional. Exige configurar o provedor e o agendador (veja [PRODUCAO.md](PRODUCAO.md)). Sem isso os alertas aparecem apenas dentro do sistema.

## Se algo parecer errado
1. Não apague nem “refaça” lançamentos: cancele com motivo.
2. Compare com o extrato do banco (Conciliação).
3. Consulte **Auditoria** para ver quem fez o quê e quando.
