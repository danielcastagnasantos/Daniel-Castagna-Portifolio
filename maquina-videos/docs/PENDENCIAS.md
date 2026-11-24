# Pendências, perguntas e próximos passos

## ❓ Perguntas para você (Daniel) — respostas mudam o resultado

1. **Identidade visual real.** Usei cores/fontes **provisórias** (Versão X: azul-marinho + âmbar, Montserrat; Hipótese X: roxo + rosa, Anton). Você tem paleta, logotipo, fonte e marca d’água oficiais de cada perfil? (Edite `config/brands/*.json` e coloque fontes `.woff2` em `public/fonts/`; para logotipo em imagem eu adiciono o suporte — hoje a marca d’água é texto.)
2. **Voz.** Qual voz da ElevenLabs para cada perfil (ID da voz)? Ela precisa falar bem **pt-BR**. Sugiro ouvir 2–3 vozes no painel da ElevenLabs e definir `ELEVENLABS_VOICE_ID` (ou `voice.voiceId` por marca).
3. **Trilha e efeitos.** Quais músicas/efeitos você tem **licença** para usar? Coloque em `assets/library/music|sfx` e aponte em `config/brands/*.json` (exemplo em `assets/library/README.md`). Sem isso, vídeos ao vivo saem sem trilha.
4. **Origem dos visuais** no dia a dia: só gráficos animados? Biblioteca própria? Runway? Isso define o que priorizar (hoje: os três funcionam; Runway é o menos testado).
5. **Estilo do roteiro.** O guia de estilo de cada marca (`script.styleGuide`) é um primeiro rascunho meu. Se você tem exemplos de vídeos que acha *bons* (suas referências autorizadas), cole-os no campo “Referências” e/ou me diga o tom exato (formal, irônico, didático…), palavras proibidas, bordões.
6. **Duração padrão e cadência.** Quais durações e quantos vídeos por semana? (Define o n8n e o custo mensal.)
7. **Plataformas de destino** (Reels, TikTok, Shorts)? O formato é o mesmo, mas há zonas de interface (legendas a ~63% da altura; barra de progresso no topo). Posso ajustar margens seguras por plataforma e/ou incluir publicação automática (API de cada uma, com aprovação).
8. **Hipótese X** — veja a seção abaixo; preciso das respostas para modelar a série.
9. **Windows:** rode `instalar.bat` e me conte qualquer erro de instalação/renderização (não pude testar em Windows).
10. **Licença do Remotion** (empresa com mais de 3 funcionários exige licença paga) — veja o README.

## ✅ Primeiros passos sugeridos (30 min)
1. `instalar.bat` → `iniciar.bat` → faça um vídeo em **modo de teste** e confira a qualidade visual no seu PC.
2. Preencha o `.env` com `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY` e `ELEVENLABS_VOICE_ID` → `npm run doctor -- --online` → crie um projeto **ao vivo** curto (15–30 s) com visuais em **gráficos** (o mais barato: só Claude + ElevenLabs).
3. Ouça a voz, ajuste `voice.*` na marca (estabilidade, velocidade).
4. (Opcional) Telegram: crie um bot no @BotFather, preencha `TELEGRAM_BOT_TOKEN`, mande `/start` ao bot, rode `npm run doctor -- --online` para ver o chat_id.

## ⬜ Modo Hipótese X — o que falta (projeto de especificação)

Já existe: perfil visual/voz/estilo (`config/brands/hipotese-x.json`, `implemented: false`) e bloqueio explícito (“ainda não implementado”) para nunca produzir algo errado por engano. O campo `Project.series` está reservado.

Desenho proposto (encaixa no pipeline atual sem reescrever nada):

- **Série** (`data/series/<id>/series.json`): nome, premissa, tom, regras do mundo e a **bíblia persistente**: personagens (nome, aparência fixa para prompts de imagem, voz/ElevenLabs, objetivos, relações), locais, linha do tempo de fatos já ocorridos.
- **Episódio** = um `Project` com `series: {seriesId, episodeNumber}`. O prompt de roteiro recebe a bíblia + resumo dos episódios anteriores + **a opção vencedora confirmada**; a saída inclui `poll: {pergunta, opçãoA, opçãoB}` e um resumo do episódio.
- **Consistência visual:** `visual.prompt` herda a descrição fixa de cada personagem; com Runway, usar imagens de referência por personagem (`referenceImages` do `text_to_image`).
- **Enquete (regra inviolável):** o resultado só entra por `POST …/poll-result {optionId, votes?, confirm:true}` **feito por uma pessoa** (interface ou botão no Telegram). Gerar o episódio seguinte **falha** se o resultado do anterior não estiver confirmado. Nenhuma lógica escolhe vencedor por contagem, aleatoriedade ou IA. O registro guarda quem/quando/fonte e é imutável (correções viram novo registro).
- **Atualização da bíblia:** a IA **propõe** mudanças (novos fatos/personagens); só valem depois da sua aprovação.
- **UI:** tela “Séries” (bíblia editável, lista de episódios, registrar resultado da votação), cartão final com as duas opções.

Perguntas para modelar: formato das enquetes (onde acontecem? contagem manual? comentários?), quantos personagens por episódio, se haverá imagens fixas por personagem (referência) e se o vídeo é animado (Runway) ou ilustrado/gráfico.

## 🔧 Melhorias técnicas conhecidas (não bloqueiam o uso)
- Logotipo em imagem na marca d’água/cartão final.
- Legendas: destaque por *palavra enfatizada* (hoje destaca a palavra falada); presets de estilo por marca além dos parâmetros atuais.
- Efeitos sonoros por palavra-chave (hoje: por transição e por cena, manual em `scene.sfx`).
- Retomada **dentro** do render (hoje o render recomeça do zero se interrompido).
- Publicação automática nas plataformas (com aprovação).
- Normalização de loudness (EBU R128) do mix final com `loudnorm`.
- SQLite no lugar de JSON se o histórico crescer muito (a interface `ProjectStore` já isola isso).
- Testes de interface automatizados (hoje a UI foi validada com um navegador real em script manual, não como teste permanente).
- Geração de imagens por IA além da Runway (OpenAI, etc.) — basta implementar `VisualProvider`.

## ⚠ Riscos a ter em mente
- **Custo:** o modo ao vivo gasta créditos (Claude, ElevenLabs, Runway). O app só gera narração/visuais pagos **após** a aprovação do roteiro e reaproveita tudo que não mudou, mas edições e “Retomar” repetidos podem gerar chamadas novas.
- **Direitos autorais:** referências (só texto colado por você), músicas e imagens são responsabilidade sua.
- **Qualidade do alinhamento da voz:** as legendas dependem do alinhamento da ElevenLabs; a verificação mede a sincronia e avisa se estiver fora, mas a primeira conferência com voz real deve ser sua.
