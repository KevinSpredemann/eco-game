# ECO — O passado também joga

Jogo de arena 2D (top-down) em que cada rodada deixa um **Eco**: um fantasma que repete, no mesmo ritmo, os movimentos gravados de cada jogador. Feito como **PWA**: roda no navegador do celular ou do computador, pode ser instalado na tela inicial e funciona offline depois do primeiro acesso.

## Como jogar
- **Celular:** analógico (arraste na metade esquerda da tela), botões **IMPULSO** e **HABILIDADE** à direita. Jogue na horizontal.
- **Teclado:** WASD/setas · Espaço = impulso · E ou Shift = habilidade · Esc = pausa.
- Pegue energia (cristais verdes, até 3), entregue no **núcleo** (3 pontos por cristal), sobreviva (1 ponto) e cumpra o objetivo da rodada (1 ponto). 4 rodadas de 30 s; empate vai para um desempate de 15 s.
- Ao fim de cada rodada, todos viram Ecos. No máximo 3 gerações ficam ativas; as mais antigas piscam e somem. Encostar em um Eco (até no seu) tira 1 vida e derruba sua energia.

## Conteúdo
| Personagem | Habilidade |
|---|---|
| Kael — O Equilibrado | Velocidade (turbo 2,5 s) |
| Luna — A Imprevisível | Invisibilidade (atravessa Ecos e perigos 2 s) |
| Bruno — O Estrategista | Escudo (bloqueia 1 golpe, desfaz Ecos) |
| Zoe — A Caçadora | Teleporte (190 unidades) |
| Maya — A Sortuda | Explosão (empurra rivais, desfaz Ecos) + Sorte (20% energia em dobro) |
| Zed — O Técnico | Clone (holograma que coleta energia) |

Cenários: **Laboratório Sombrio** (portais), **Cidade Flutuante** (pontes que somem), **Templo Antigo** (feixes de fogo giratórios), **Fábrica Abandonada** (esteiras e pistões), **Floresta Neon** (arbustos de camuflagem), **Espaço Sideral** (gravidade baixa, buraco negro, lasers).

Modos: **Núcleo de Energia** (você + 1 a 3 bots, 3 dificuldades) e **Treino solo** (tutorial guiado contra o seu próprio Eco).

## Sons
Todos os sons são sintetizados em tempo real com Web Audio (nenhum arquivo de terceiros, sem problema de licença): batida rítmica por cenário (acelera nos últimos 10 s), som de gravação, rebobinar invertido, timbre próprio para cada habilidade, avisos de perigo, vitória/derrota. A pasta `sons/` traz os mesmos sons exportados em `.wav` (35 efeitos + 7 trilhas em loop) para usar em edição, vídeo ou outro motor.
Volume geral, música, efeitos e "silenciar" ficam em Opções.

## Apps Android e iOS
O jogo vira app nativo com **Capacitor** (o mesmo código roda dentro do app). Os projetos já estão prontos em `android/` e `ios/`, com nome **ECO**, id `com.ecojogo.app`, ícone, tela de abertura, tela cheia, só na horizontal, tela sempre acesa e o botão "voltar" do Android pausando o jogo.

### Android — jeito mais fácil (sem instalar nada)
1. Crie um repositório no GitHub e envie esta pasta (pode ser pelo site: "Add file → Upload files").
2. Abra a aba **Actions**: a compilação "Android APK" roda sozinha (~5 min).
3. Entre na execução concluída e baixe **ECO-android** (contém `ECO-android.apk`).
4. Passe o APK para o celular e abra. O Android vai pedir para permitir "instalar apps desconhecidos" — aceite para esse arquivo.

### Android — pelo computador
Instale o Android Studio, depois:
```bash
npm install
npm run build && npx cap sync android
npx cap open android      # Android Studio abre o projeto → botão ▶ com o celular ligado no USB
```
Para a Play Store: Android Studio → Build → Generate Signed App Bundle (gera o `.aab`). Também dá para assinar pelo GitHub cadastrando os segredos `KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS` e `KEY_PASSWORD`.

### iOS (iPhone/iPad)
A Apple só permite compilar apps de iPhone em um **Mac com Xcode**.
```bash
npm install
npm run build && npx cap sync ios      # roda o pod install
npx cap open ios                       # abre no Xcode
```
No Xcode: selecione o alvo **App → Signing & Capabilities → Team** (sua conta Apple; a gratuita instala no seu próprio iPhone por 7 dias), ligue o iPhone e aperte ▶. Para App Store/TestFlight é preciso a conta Apple Developer (US$ 99/ano) e usar Product → Archive. O GitHub Actions "iOS build" confere que o projeto compila, mas não gera arquivo instalável (isso exige a assinatura da Apple).

Sempre que mudar o código do jogo: `npm run build && npx cap sync`.

## Rodar e publicar como site (PWA)
```bash
npm install
npm run dev      # desenvolvimento em http://localhost:5173
npm test         # testes (gravação/reprodução, limite de Ecos, pontuação, partida completa em cada arena)
npm run build    # gera dist/ com o service worker já listando todos os arquivos
```
Para instalar no celular, o conteúdo de `dist/` precisa estar em um endereço **HTTPS** (GitHub Pages, Netlify, Vercel, Cloudflare Pages…). Depois:
- **Android (Chrome):** abra o site → botão "Instalar app" no menu do jogo (ou menu ⋮ → Instalar app).
- **iPhone (Safari):** Compartilhar → "Adicionar à Tela de Início".

## Estrutura
```
src/
  shared/types.ts          tipos (RecordedFrame, EchoRecording) — prontos para um servidor
  systems/echo/recorder.ts gravação a 20 Hz + eventos; reprodução interpolada (sem atravessar teleportes)
  systems/echo/manager.ts  limite de 3 gerações de Ecos
  systems/scoring.ts       regras de pontuação puras
  game/                    simulação, personagens, arenas, IA dos bots (A* + leitura das gravações)
  render/                  desenho em canvas (personagens vetoriais, Ecos holográficos, efeitos)
  audio/                   sintetizador de música e efeitos + exportação .wav
  ui/                      controles de toque/teclado, opções salvas no aparelho
public/                    manifest, service worker, ícones, artes de menu
tests/                     Vitest
```

## Próximo passo (multiplayer online)
A simulação já está separada da renderização e recebe apenas "intenções" (`Input`) por jogador, como recomenda o documento de arquitetura. Para jogar com amigos em aparelhos diferentes, falta o servidor autoritativo (Node.js + Colyseus) rodando `Game.step` e salas privadas por código; isso exige hospedagem de servidor.
