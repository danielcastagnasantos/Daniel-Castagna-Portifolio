# Roteiro de aceite (antes de usar dinheiro real)

Faça com **dois dispositivos** (computador e celular) e pelo menos três usuários (proprietário, gerente, operador). Marque cada item. Use valores de teste e, ao terminar, **cancele/estorne** o que lançou (nada é apagado — isso faz parte do teste).

## A. Acesso
- [ ] `/setup` cria empresa + proprietário e depois recusa novo cadastro.
- [ ] Login do proprietário, do gerente e do operador funciona; senha errada mostra erro genérico.
- [ ] Operador criado com senha provisória é obrigado a trocar a senha no 1º acesso.
- [ ] Operador **não** vê Painel/Boletos/Contas/Relatórios/Equipe (digitar a URL volta ao Caixa).
- [ ] Gerente não consegue criar gerente/proprietário nem mudar perfil; só o proprietário consegue.
- [ ] Desativar um operador: ele é barrado imediatamente.
- [ ] Cadastro público está desativado no Supabase (tentar criar conta pela API não dá acesso).

## B. Caixa (o teste do enunciado)
- [ ] Operador A abre com **R$ 200,00**. Operador B tenta abrir: **recusado** (gaveta em uso).
- [ ] A lança **R$ 500 em dinheiro**, **R$ 300 no Pix**, **sangria R$ 100** (para o cofre).
- [ ] O esperado mostrado à gerência é **R$ 600,00**.
- [ ] A fecha contando **R$ 580,00** → diferença **−R$ 20,00**, exige justificativa; gera notificação.
- [ ] O Pix **não** entrou no dinheiro esperado. Em Contas: Pix = R$ 300; Cofre = R$ 100.
- [ ] B abre contando valor diferente de 580 → exige observação; gera alerta de passagem.
- [ ] Turno fechado não aceita novos lançamentos; gerente **confere** o turno; PDF do comprovante abre.
- [ ] Ligar **fechamento cego**: o operador não vê o esperado antes de informar a contagem.
- [ ] Clique duplo rápido em “Registrar” não duplica a venda.
- [ ] Desligar a internet do celular: botões de salvar bloqueiam e a faixa “Sem conexão” aparece; nada é salvo.

## C. Boletos
- [ ] Cadastrar boleto com PDF anexado; abrir o anexo (link expira em ~2 min).
- [ ] Parcelado 3× de R$ 100,00 gera R$ 33,34 + 33,33 + 33,33.
- [ ] Pagamento parcial; pagamento maior que o saldo é recusado; pagamento exige marcar a confirmação.
- [ ] Anexar comprovante; histórico mostra quem alterou o quê.
- [ ] Pagar um boleto em dinheiro **pela gaveta** reduz o esperado **uma vez**.
- [ ] Operador **não** consegue baixar/abrir anexos (nem por link direto).

## D. Contas e conciliação
- [ ] Transferência entre contas e liquidação de cartão **não** aumentam faturamento.
- [ ] Importar um extrato CSV/OFX real; reimportar o mesmo arquivo é recusado; linhas repetidas de outro arquivo são sinalizadas.
- [ ] Conciliar uma linha; criar lançamento de tarifa; desfazer com motivo.

## E. Relatórios e painel
- [ ] Painel bate com os lançamentos (entradas/saídas do dia, saldos separados).
- [ ] Exportar PDF, Excel e CSV de “Fechamento diário” e abrir cada um.
- [ ] Alertas: boleto vencendo/vencido e diferença de caixa aparecem em Notificações.

## F. Mobile e PWA
- [ ] Abrir no celular do proprietário e instalar na tela inicial; navegação inferior funciona com o polegar.
- [ ] Modo escuro e claro legíveis.

## G. Operação
- [ ] Rodar `scripts/backup-db.sh` e **restaurar em projeto de teste** conferindo totais.
- [ ] Conferir hoje o saldo do banco no sistema × extrato real (Conciliação).

Só comece a usar dinheiro real quando todos os itens estiverem marcados.
