# Manual administrativo (gerente e proprietário)

## Quem pode o quê
| | Proprietário | Gerente | Operador |
|---|---|---|---|
| Ver painel, saldos, relatórios | ✅ | ✅ | ❌ |
| Abrir/fechar o próprio turno e lançar vendas | ✅ | ✅ | ✅ |
| Lançar correções, cancelar movimentações, conferir turnos | ✅ | ✅ | ❌ |
| Boletos, contas, conciliação, a receber | ✅ | ✅ | ❌ |
| Criar acessos de **operador** / desativar operadores | ✅ | ✅ | ❌ |
| Criar acessos de gerente/proprietário, **mudar perfis** | ✅ | ❌ | ❌ |
| Ver auditoria | ✅ | ✅ | ❌ |

Ninguém altera o próprio perfil. O banco de dados — e não só a tela — impede isso.

## O menu (simples de propósito)
**Resumos · Caixa · Boletos · Equipe · Configurações.** Contas e saldos, conciliação, contas a receber, todos os relatórios, notificações e auditoria continuam existindo em **Configurações > Recursos avançados**.

## Rotina diária (gerente)
1. **Resumos:** veja o vendido (hoje, semana, mês, ano), boletos vencidos/a vencer e diferenças de caixa.
2. **Caixa > Todos os turnos:** abra cada turno fechado e use **Conferir este turno**.
3. **Boletos:** organizados por data (vencidos primeiro). Toque em **Pagar** só depois de conferir no banco.

## Rotina do proprietário (celular)
Abra o app instalado → **Resumos**: vendido por período e por forma de pagamento, boletos pagos, a pagar e vencidos, diferenças de caixa e dinheiro guardado. **Boletos** mostra o que vence em cada dia.

## O troco de R$ 150
Todo dia ficam R$ 150,00 na gaveta entre os turnos. No fechamento o sistema calcula o quanto retirar (o que passar do troco vai para o cofre). O valor do troco muda em **Configurações > Troco do caixa**.

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
