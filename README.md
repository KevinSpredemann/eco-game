# ECO — O passado também joga

Jogo de arena 2D (top-down) em que cada rodada deixa um **Eco**: um fantasma que repete, no mesmo ritmo, os movimentos gravados de cada jogador. Feito como **PWA**: roda no navegador do celular ou do computador, pode ser instalado na tela inicial e funciona offline depois do primeiro acesso.

## Como jogar
- **Celular:** analógico (arraste na metade esquerda da tela); à direita **ATIRAR**, habilidade do personagem, habilidade do equipamento, **ULT**, **IMPULSO**, **ITEM** e **PODER**. Tocar num botão usa na hora (mira automática); **arrastar** o botão mostra a prévia e mira; soltar usa. Para cancelar, solte em cima do "✕". Jogue na horizontal.
- **Computador (estilo MOBA, dá para trocar as teclas em Opções):** WASD/setas andam · mouse mira, clique atira (ou J) · **Q** habilidade do personagem · **E** habilidade do equipamento · **R** ultimate · **Shift** impulso · **Espaço** item (no Núcleo, impulso) · **F** poder do cristal · **Esc** cancela a mira ou pausa. Segure Q/E/R para ver a prévia (direção, área, alcance) e solte para usar; clique esquerdo confirma; botão direito ou Esc cancela sem gastar a recarga.
- Pegue energia (cristais verdes, até 3), entregue no **núcleo** (3 pontos por cristal), sobreviva (1 ponto) e cumpra o objetivo da rodada (1 ponto). 4 rodadas de 30 s; empate vai para um desempate de 15 s.
- Ao fim de cada rodada, todos viram Ecos. No máximo 3 gerações ficam ativas; as mais antigas piscam e somem. Encostar em um Eco (até no seu) tira 1 vida e derruba sua energia.
- **Rebobinando** (fim de cada rodada, ~2 s): a rodada volta no tempo; cada jogador vira um fantasma que refaz o caminho ao contrário e as ações gravadas (tiros, bombas, minas, entregas, impulsos, onde caiu) aparecem quando o tempo passa por elas. No fim, os fantasmas param onde o Eco vai começar. Um painel curto mostra o que cada um gravou (inclusive quem caiu: "Eco até ali") — sem pontos extras. **Espaço/Enter ou toque pula** (online: quando todos pedem). Efeitos reduzidos desligam as listras de fita.
- **Lendo os Ecos:** na preparação aparece a abertura da rota de cada Eco (6 s, com seta) e onde ele vai jogar bombas/minas; durante a rodada, uma linha curta mostra o próximo segundo do caminho e uma mira tracejada aparece antes de cada tiro gravado. A etiqueta diz de quem é e a rodada; anel cheio = pode te bloquear/machucar, tracejado cinza = aliado/inofensivo; perto de você fica vermelho com "−12" (ou "−1♥"). Desativado mostra um anel de contagem até voltar ("ECO VOLTOU"). Nada disso inventa ação: tudo vem da gravação.

## Conteúdo
| Personagem | Habilidade |
|---|---|
| Zephyr — O Equilibrado | Velocidade (turbo 2,5 s) |
| Kalypso — A Imprevisível | Invisibilidade (atravessa Ecos e perigos 2 s) |
| Bronzar — O Estrategista | Escudo (bloqueia 1 golpe, desfaz Ecos) |
| Vesper — A Caçadora | Teleporte (190 unidades) |
| Nova — A Sortuda | Explosão (empurra rivais, desfaz Ecos) + Sorte (20% energia em dobro) |
| Vortex — O Técnico | Clone (holograma que coleta energia; no combate atira) |
| Tenebris — A Sombra | Passo Sombrio (some e reaparece à frente) |
| Kron — O Robô | Torreta (monta uma torre que atira sozinha) |
| Aurora — A Curandeira | Cura (recupera vida/escudo) |
| Valkyra — A Muralha | Investida (avança e derruba quem estiver na frente) |
| Glacius — O Glacial | Muralha de Gelo (bloqueia tiros e passagem por 5 s) |
| Voltz — O Elétrico | Corrente Elétrica (raio que pula entre até 3 rivais) |
| Orbis — A Gravitacional | Vórtice (buraco negro que puxa rivais e energia) |
| Rivet — A Inventora | Gancho (puxa você até a parede ou o rival até você) |
| Nimbus — O Fantasma | Bomba de Fumaça (quem está dentro some; rivais ficam lentos) |

Zephyr, Kalypso e Bronzar vêm liberados; os outros são comprados com moedas ganhas jogando. Cada habilidade pode subir do nível 1 ao 5 com moedas (200, 350, 500, 700). Nos modos competitivos cada nível só tira 3% da recarga (no máximo 12%, sem duração extra); no cooperativo (Sobrevivência) também dá mais duração e força.

A escolha de personagem e de mapa é um carrossel: o personagem do meio aparece grande, em pose de ação usando o próprio poder; o mapa do meio aparece inclinado em 3D sobre o cenário do tema. Dá para trocar pelas setas, deslizando o dedo ou com as setas do teclado.

Todos os personagens são desenhados em vetor (nítidos em qualquer tela) e mudam de expressão durante o jogo: feliz ao pontuar, bravo ao atacar, com dor ao levar dano, assustado com pouca vida, e piscam.

Cenários: **Laboratório Sombrio** (portais), **Cidade Flutuante** (pontes que somem), **Templo Antigo** (feixes de fogo giratórios), **Fábrica Abandonada** (esteiras e pistões), **Floresta Neon** (arbustos de camuflagem), **Espaço Sideral** (gravidade baixa, buraco negro, lasers), **Vulcão Ardente** (lava e meteoros), **Montanha Gelada** (gelo escorregadio e rajadas de vento), **Metrô Neon** (trens que cruzam a pista), **Ruínas do Deserto** (areia movediça e tornado).

Modos:
- **Núcleo de Energia** — o modo original: pegar e entregar energia, você + 1 a 3 bots.
- **Duelo x1** — um contra um com armas, bombas e poderes; vence quem levar 3 rodadas. Os Ecos repetem os tiros também.
- **Combate** — até 4 jogadores, todos contra todos (eliminar = 2 pontos, último de pé = 3).
- **Captura a Bandeira** — times 2 contra 2; roube a bandeira rival e leve até a sua base. Quem cai renasce em 3 s.
- **Rei da Colina** — fique sozinho na zona da coroa para ganhar 1 ponto por segundo; a colina muda de lugar.
- **Sobrevivência** — cooperativo: você e aliados contra 5 ondas de robôs (drones, brutamontes e um chefão). Seus Ecos lutam do seu lado.
- **Batalha Real** — até 6 jogadores; a zona fecha e quem fica fora perde vida. O último de pé vence.
- **Caça ao Chefe** — 3 caçadores contra 1 jogador que vira o **Chefe** (veja abaixo).
- **Treino** — tutorial guiado contra o seu próprio Eco.

### Caça ao Chefe (3 contra 1)
- Pelo menos 4 participantes (pessoas + bots; até 5). Online dá para criar sala ou usar **Buscar partida**: entra numa sala aberta, mostra quem está pronto e começa quando lota, quando todos ficam prontos ou depois de 25 s (bots completam as vagas).
- O Chefe é escolhido em **rodízio**: quem foi Chefe menos vezes tem a vez (empate = sorteio). Contra bots você escolhe: Caçador, Chefe ou Sorteio justo.
- **Chefe:** vida = 1100 por caçador, maior e mais lento, quase imune a atordoar e empurrar. Arma própria (Rajada do Colosso) e golpes próprios, todos com **aviso no chão** antes de acertar: Q Impacto (área ao redor), E Barragem (espiral de projéteis), Shift Avanço Pesado (linha marcada), R Chuva de Rochas e F Muralha de Obsidiana (fase 2+).
- **Caçadores:** tiros nas **costas** do Chefe dão 50% a mais (ponto fraco brilhando). O time tem **vidas extras compartilhadas** (1 por caçador, renasce em 5 s).
- **Fases:** 1) aprender os padrões, com **pontos de recurso** (cura/escudo a cada 14 s) e **caixas de cobertura** que quebram; 2) com 2/3 da vida surgem **geradores** que deixam o Chefe protegido (60% menos dano) até serem destruídos, o Chefe libera R e F e chegam **criaturas** e um **Xamã**; 3) com 1/3, **fúria**: recargas 30% menores, **fendas de lava** cruzam a arena (com aviso), chegam Carapaça e Semeador e o Chefe fica **EXAUSTO** de tempos em tempos (3 s sem golpes, leva 50% a mais). Ele também fica exausto depois da Chuva de Rochas.
- **Criaturas** (no máximo 2 + 1 por caçador vivas ao mesmo tempo, com a função escrita em cima): **Rastejador** (RÁPIDO, salta com aviso), **Carapaça** (TANQUE, a casca da frente segura 85% dos tiros: acerte as costas ou use explosões), **Cuspidor** (ATIRADOR, carrega e cospe ácido), **Xamã** (CURANDEIRO, cura o Chefe em 40 e as criaturas em 25: derrube primeiro), **Semeador** (ÁCIDO, deixa poças com aviso antes de machucar).
- Cada habilidade e item mostra na descrição (passe o mouse no ícone) como funciona **contra o Chefe**.
- **Vitória:** caçadores vencem derrubando o Chefe; o Chefe vence eliminando o time sem vidas ou **resistindo até o tempo acabar** (3 min). Nunca empata.
- Pontos e moedas vêm de dano, geradores, curas, acertos nas costas e da vitória — não só de quem mata. O resultado mostra as estatísticas de cada um e a habilidade mais usada.

### Equipamento (antes da partida e entre rodadas)
Depois do mapa vem a tela de **Equipamento**, com números e barras de comparação:
- **Arma principal:** a do personagem ou uma padrão — Pistola (equilibrada), Fuzil Marcador (precisão/longo alcance), Espingarda Tática (curto alcance), Submetralhadora (disparo rápido, pouco dano por tiro), Lança-granadas (controle de área).
- **Item (Espaço):** Granadas, Minas, Granada de Gelo (deixa lento) ou Kit Médico. Não recarregam ao renascer.
- **Habilidade do equipamento (E):** Rolamento (esquiva com invulnerabilidade só durante o giro), Armadilha (visível para todos), Barreira, Dardo Marcador (alvo visível e leva +20%), Estímulo (cura em área).
- **Ultimate (R):** Meteoro (área marcada, cai em 1 s), Feixe Prismático (linha, paredes bloqueiam), Campo de Estase (lento e sem impulso), Sobrecarga (atira e corre mais + escudo). A ultimate carrega com o tempo, causando e levando dano.
- Algumas opções custam moedas, mas são opções diferentes, não mais fortes. Contra bots, dá para trocar no menu de pausa: vale a partir da próxima rodada (recargas não zeram). Online, o botão Equipamento fica na sala.

### Balanceamento
Todos os números ficam em `src/game/balance.ts` (vida, controle, escudo, habilidades Q/E/R, itens, Chefe) e `src/game/weapons.ts` (armas). Regras principais: **vida 150** com regeneração lenta (5/s) depois de 4 s sem levar dano; Ecos causam 40% do dano; granada 40, mina 35; armas principais com 25–55 de dano por segundo (mais dano = mais lenta, curta ou difícil); armas não atordoam; atordoamento máximo de 0,8 s e imunidade de 1,2 s depois; lentidão nunca passa de 55%; dá para andar a 60% da velocidade enquanto prepara um golpe; fase/sombra acabam ao atirar; escudo só devolve tiros vindos da frente (com 80% do dano, uma vez só); torretas têm vida; limites de projéteis (420 no total, 36 por Ecos) para não travar; números de dano somam golpes seguidos no mesmo alvo e têm cor pela origem (Eco, perigo, explosão, criatura); setas na borda mostram de onde veio o dano.

**Bots:** cada dificuldade tem erro de mira, previsão de movimento e tempo de reação próprios; atiram em rajadas com pausas, dividem os alvos, recuam para se curar com pouca vida e às vezes erram de propósito. Medição (andando devagar contra 2 bots): fácil ~30 s, normal ~19 s, difícil ~13 s até cair.

**Qualidade gráfica** (Ajustes): Alta, Média ou Baixa (menos resolução e sem a luz pintada) para celulares mais fracos.

Cada personagem tem a sua **arma principal** (ex.: Pulsador do Zephyr, Canhão de Energia do Bronzar, Rifle de Precisão da Vesper, Punhos de Impacto da Valkyra). A mira é uma linha tracejada com retícula que mostra exatamente para onde o tiro vai. O **escudo** do Bronzar devolve os tiros para quem atirou.

**Cristais de poder:** de tempos em tempos aparece um cristal com o símbolo de um personagem. Passe por cima para pegar a habilidade dele e use uma vez com o botão PODER (ou F / botão direito do mouse).

Armas e itens que caem na arena: metralhadora, escopeta, laser, lança-foguetes, raio congelante, bombas, minas, cura, vampiro e invisibilidade.

## Conta, moedas e loja
- Dá para jogar como **convidado** (progresso salvo no aparelho) ou criar conta com **apelido e senha** (progresso salvo no servidor, em qualquer aparelho). Ao criar a conta, as moedas do convidado vão junto.
- Toda partida dá moedas (vencer e jogar online dá mais). Na **Loja**: personagens, roupas (Noturno, Gelo, Neon, Camuflado, Chiclete, Oceano, Lava, Carbono, Sol, Galáxia, Ouro, Diamante) e rastros (Faíscas, Bolhas, Estrelas, Neve, Fogo, Corações, Raios, Arco-íris).

## Online com amigos
**Jogar online → Criar sala**: aparece um código de 4 letras para mandar aos amigos (botão Convidar). Eles entram em **Jogar online → Entrar numa sala**. O dono escolhe modo, mapa e bots e toca em Começar. Quem cai da conexão vira bot até o fim.
O servidor (`server/`) é autoritativo: roda a mesma simulação do jogo e manda o estado 20x por segundo.

## Sons
Todos os sons são sintetizados em tempo real com Web Audio (nenhum arquivo de terceiros, sem problema de licença): batida rítmica por cenário (acelera nos últimos 10 s), som de gravação, rebobinar invertido, timbre próprio para cada habilidade, avisos de perigo, vitória/derrota. A pasta `sons/` traz os mesmos sons exportados em `.wav` (35 efeitos + 7 trilhas em loop) para usar em edição, vídeo ou outro motor.
Volume geral, música, efeitos e "silenciar" ficam em Opções.

## Apps Android e iOS
O jogo vira app nativo com **Capacitor** (o mesmo código roda dentro do app). Os projetos já estão prontos em `android/` e `ios/`, com nome **ECO**, id `com.ecojogo.app`, ícone, tela de abertura, tela cheia, só na horizontal, tela sempre acesa e o botão "voltar" do Android pausando o jogo.

### Android — baixar pronto
No celular Android, abra **https://github.com/KevinSpredemann/eco-game/releases/latest/download/ECO-android.apk** e instale.

### Android — compilar você mesmo (sem instalar nada)
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

## Publicar no Render
O arquivo `render.yaml` configura tudo no plano gratuito:
- `eco-game` — o jogo (Static Site com HTTPS);
- `eco-server` — o servidor online (login, moedas, salas);
- banco das contas: Postgres grátis do **Neon** (neon.com), ligado pela variável `DATABASE_URL`.

1. Em render.com, entre com o GitHub.
2. **New → Blueprint** e escolha o repositório `eco-game` (ou, se já existe, abra o Blueprint e clique em **Sync**).
3. Confirme. A cada push no `main` o Render publica sozinho.

Na primeira vez o Render pede o valor de `DATABASE_URL`: cole a connection string do Neon (começa com `postgresql://`).
Limites do plano gratuito: o servidor "dorme" depois de 15 min sem uso e leva ~1 min para acordar na primeira conexão; o Neon grátis tem 1 GB e não expira. Sem `DATABASE_URL`, o servidor salva as contas num arquivo local (`DATA_FILE`).

Rodar o servidor no computador: `npm run build:server && npm start` (porta 8787); o jogo em `npm run dev` já usa `localhost:8787`.

## Testar o multiplayer no computador
```bash
npm install
npm run build:server && PORT=8787 node server/dist/index.mjs   # servidor (sem DATABASE_URL usa data/users.json)
VITE_SERVER_URL=http://localhost:8787 npm run dev               # jogo
```
Abra duas abas → Online → numa crie a sala (ou use **Buscar partida · Caça ao Chefe** nas duas).

## Rodar e publicar como site (PWA)
```bash
npm install
npm run dev      # desenvolvimento em http://localhost:5173
npm test         # testes (Ecos, pontuação, partidas completas, balanceamento, mira das habilidades, Caça ao Chefe)
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
  systems/echo/digest.ts   rota resumida + ações gravadas (Rebobinando, avisos e online)
  systems/scoring.ts       regras de pontuação puras
  game/                    simulação, personagens, arenas, IA dos bots (A* + leitura das gravações)
  render/                  desenho em canvas (personagens vetoriais, Ecos holográficos, efeitos)
  audio/                   sintetizador de música e efeitos + exportação .wav
  ui/                      controles, conta/loja, tela inicial animada, retratos vetoriais
  net/                     protocolo, cliente WebSocket e previsão do jogador local
server/                    servidor online (HTTP + WebSocket, contas, salas)
public/                    manifest, service worker, ícones, artes de menu
tests/                     Vitest
```
