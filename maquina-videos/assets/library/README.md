# Biblioteca de mídia (sua)

Coloque aqui arquivos que **você tem direito de usar**:

```
assets/library/images/   .jpg .jpeg .png .webp   (vertical 9:16 fica melhor; qualquer proporção funciona, é recortada)
assets/library/videos/   .mp4 .webm .mov
assets/library/music/    trilhas (.mp3 / .wav) — referencie em config/brands/<marca>.json → music.file
assets/library/sfx/      efeitos (.wav / .mp3)  — referencie em config/brands/<marca>.json → sfx.library
```

## Como as imagens/vídeos são escolhidos
No projeto, escolha **“Minha biblioteca”** como fonte dos visuais. Para cada cena o app procura o arquivo
cujas **palavras-chave** mais combinam com: as palavras-chave da cena, o texto na tela e a descrição visual.

As palavras-chave vêm do **nome do arquivo** (`mercado-dinheiro-01.jpg` → `mercado`, `dinheiro`) e, opcionalmente,
de um arquivo `assets/library/library.json`:

```json
[
  { "file": "images/mercado.jpg", "tags": ["mercado", "compras", "economia"] },
  { "file": "videos/chuva.mp4",   "tags": ["chuva", "clima"] }
]
```

Sem correspondência, a cena usa um gráfico animado da marca (nunca fica sem visual).

## Trilha e efeitos (exemplo)
Em `config/brands/versao-x.json`:

```json
"music": { "file": "library/music/minha-trilha.mp3", "volume": 0.14, "duckedVolume": 0.05, "fadeInSec": 1, "fadeOutSec": 1.5 },
"sfx":   { "volume": 0.5, "onTransition": "whoosh", "library": { "whoosh": "library/sfx/whoosh.wav", "pop": "library/sfx/pop.wav" } }
```

A trilha **abaixa sozinha** quando a narração fala (“ducking”). Em modo de teste o app usa uma trilha e efeitos sintéticos.

> Os arquivos desta pasta não vão para o Git (veja `.gitignore`) — direitos autorais são responsabilidade sua.
