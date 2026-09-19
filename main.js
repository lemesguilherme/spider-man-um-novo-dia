/* ==========================================================================
   Spider-Man — Um Novo Dia
   Animações de rolagem com GSAP.

   - ScrollSmoother  → rolagem suave da página inteira
   - ScrollTrigger   → a Hero fica pinnada enquanto a animação acontece
   - SplitText       → troca de sinopse letra a letra, em ordem aleatória

   A Hero fica pinnada durante dois atos, os dois na MESMA timeline:

     ATO 1 → a sequência de frames roda no .stage enquanto as três sinopses
             se trocam letra a letra. As duas animações ocupam o ato inteiro,
             de 0 a ACT_1, então têm exatamente o mesmo início e o mesmo fim.

     ATO 2 → uma máscara preta abre do centro e revela o trailer, empurrando
             o logo para a esquerda e a sinopse para a direita.
   ========================================================================== */

gsap.registerPlugin(ScrollTrigger, ScrollSmoother, SplitText);

/* ==========================================================================
   0 — MODOS
   Três arranjos, decididos por duas media queries que espelham exatamente os
   @media do style.css. Divergir entre os dois arquivos é o pior dos mundos:
   CSS mostrando um layout que o JS não está animando, ou o contrário.

     ESTÁTICO   "reduzir movimento" ligado. Sem pin, sem scrub, sem
                ScrollSmoother: tudo em fluxo e visível de saída. É o único
                fallback sem coreografia.

     RETRATO    tela estreita. A coreografia CONTINUA — ela é o ponto do
                site — mas readaptada: a máscara do trailer abre no eixo
                vertical e empurra título e sinopse para cima e para baixo,
                em vez de para os lados.

     DESKTOP    o arranjo original.

   As duas seções seguem o mesmo modo: em retrato, tanto a revelação do
   trailer quanto o revezamento do elenco continuam pinnados e com scrub,
   cada um readaptado ao formato em pé.

   "reduzir movimento" não muda com a página aberta; largura muda toda vez
   que o aparelho gira. Por isso o modo é reaplicado por applyMode(), na
   seção 5, que escuta as duas viradas.
   ========================================================================== */
const REDUCED_MQ = window.matchMedia("(prefers-reduced-motion: reduce)");
const NARROW_MQ  = window.matchMedia("(max-width: 700px)");

let isStatic   = false;   // sem coreografia nenhuma, tudo em fluxo
let isPortrait = false;   // coreografia adaptada ao formato em pé

function readMode() {
  isStatic   = REDUCED_MQ.matches;
  isPortrait = !isStatic && NARROW_MQ.matches;
}
readMode();

/* A barra de endereço do celular entra e sai durante a rolagem e muda a
   altura da viewport. Para o ScrollTrigger isso é um resize, e recalcular o
   pin no meio do movimento faz a seção saltar. Esta flag manda ignorar
   resizes que mexem só na altura — que é exatamente o caso da barra.
   O par disso no CSS é usar 100svh em vez de 100dvh. */
ScrollTrigger.config({ ignoreMobileResize: true });


/* ==========================================================================
   1 — ROLAGEM SUAVE
   Criada e destruída junto com as timelines (ver applyMode): rolagem com
   inércia é movimento, e no modo estático ela não deve existir.
   ========================================================================== */
const SMOOTHER_OPTIONS = {
  wrapper: "#smooth-wrapper",
  content: "#smooth-content",
  smooth: 2,          // segundos que a página leva para "alcançar" a rolagem
  effects: true,
  normalizeScroll: true
};

let smoother = null;


/* ==========================================================================
   2 — SEQUÊNCIA DE FRAMES (o "vídeo" do plano de fundo do .stage)
   ========================================================================== */
/* Dois conjuntos do mesmo take.

   O original tem 59 quadros a 1920x1080. Decodificados, são 8,3 MB de bitmap
   cada — 467 MB se o navegador segurar todos — e cada tick de rolagem reduz
   um par deles para os ~360px do canvas. Num celular isso é caro à toa: o
   canvas nunca passa de uns 360x200.

   O conjunto leve tem metade dos quadros a 720x405: 33 MB decodificados e
   ~0,7 MB de download. Metade dos quadros funciona porque o render() já
   interpola entre vizinhos (o playhead é fracionário) — a suavidade vem do
   crossfade, não da contagem.

   A escolha é pela MENOR dimensão da tela do aparelho, não pela largura da
   janela: um celular continua sendo um celular deitado, e assim o conjunto é
   decidido uma vez só, sem recarregar nada quando o aparelho gira. */
const USE_LIGHT_FRAMES = Math.min(screen.width, screen.height) <= 700;

const FRAME_SET = USE_LIGHT_FRAMES
  ? { count: 30, src: i => `assets/frames-mobile/frame-${String(i).padStart(3, "0")}.jpg` }
  : { count: 59, src: i => `assets/frames/ezgif-frame-${String(i).padStart(3, "0")}.jpg` };

const FRAME_COUNT = FRAME_SET.count;
const LAST_FRAME  = FRAME_COUNT - 1;

/* O enquadramento vertical repete o antigo background-position: 50% 66.9% */
const FOCUS_X = 0.5;
const FOCUS_Y = 0.669;

const canvas = document.querySelector(".stage__canvas");
const ctx    = canvas.getContext("2d", { alpha: false });

/* Objeto tweenado pelo GSAP. Guarda um valor fracionário (ex.: 12.4) para que
   dê pra fazer o crossfade entre dois frames vizinhos — é isso que deixa a
   reprodução suave mesmo com só 59 imagens. */
const playhead = { frame: 0 };

const frames = [];
for (let i = 1; i <= FRAME_COUNT; i++) {
  const img = new Image();
  img.decoding = "async";
  img.src = FRAME_SET.src(i);
  /* redesenha assim que cada imagem chega, para o canvas nunca ficar vazio */
  img.addEventListener("load", render, { once: true });
  frames.push(img);
}

/* Desenha a imagem cobrindo o canvas (equivalente a background-size: cover) */
function drawCover(img, alpha) {
  if (!img || !img.naturalWidth) return;

  const cw = canvas.width;
  const ch = canvas.height;
  const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
  const w = img.naturalWidth * scale;
  const h = img.naturalHeight * scale;

  ctx.globalAlpha = alpha;
  ctx.drawImage(img, (cw - w) * FOCUS_X, (ch - h) * FOCUS_Y, w, h);
  ctx.globalAlpha = 1;
}

function render() {
  if (!canvas.width || !canvas.height) return;

  const i    = Math.min(Math.floor(playhead.frame), LAST_FRAME);
  const frac = playhead.frame - i;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawCover(frames[i], 1);

  /* mistura o frame seguinte por cima, na proporção da fração */
  if (frac > 0.001 && i < LAST_FRAME) drawCover(frames[i + 1], frac);
}

/* O canvas é dimensionado em CSS (100% do .stage); aqui ajustamos o buffer
   interno para a densidade de pixels da tela. */
function resizeCanvas() {
  const dpr  = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();

  canvas.width  = Math.round(rect.width  * dpr);
  canvas.height = Math.round(rect.height * dpr);

  render();
}


/* ==========================================================================
   3 — TIMELINE MESTRE: frames + troca de textos
   ========================================================================== */

/* Durações em "unidades de timeline". O valor absoluto não importa (o scrub
   normaliza tudo), elas só servem para posicionar uma coisa em relação à
   outra. A Hero fica pinnada durante as duas fases.

     ATO 1 → sequência de frames + troca das três sinopses
     ATO 2 → máscara preta abre do centro e revela o trailer,
             empurrando o logo e a sinopse para os lados

   SCROLL_PER_UNIT converte tudo em distância de rolagem: 15 unidades a 40%
   da altura da tela = 600% (seis telas de rolagem com a Hero travada). */
const ACT_1 = 10;
const ACT_2 = 5;
const TL_DURATION = ACT_1 + ACT_2;
const SCROLL_PER_UNIT = 40;

/* O ato 1 do retrato é mais curto que o do desktop: ele tem só a sequência de
   frames (a troca de sinopse é a etapa C) e o conjunto leve tem metade dos
   quadros, então esticá-lo até 10u faria cada quadro segurar tempo demais.
   7u dão ~79px de rolagem por quadro, quase o mesmo do desktop. */
const ACT_1_PORTRAIT = 7;

/* Quanto tempo cada letra leva para sumir/aparecer... */
const CHAR_FADE = 0.5;
/* ...e em quanto tempo o sorteio das letras se espalha (stagger total). */
const CHAR_SPREAD = 1.5;

/* Duração de um bloco completo de fade (última letra termina aqui) */
const FADE_BLOCK = CHAR_FADE + CHAR_SPREAD;
/* O texto que entra começa antes de o anterior sumir por completo */
const OVERLAP = FADE_BLOCK * 0.6;

const textEls = gsap.utils.toArray(".movie__desc");
const textBox = document.querySelector(".movie__texts");
const title   = document.querySelector(".movie__title");
const badge   = document.querySelector(".scroll-badge");
const ring    = document.querySelector(".scroll-badge__ring");
const stage   = document.querySelector(".stage");
const reveal  = document.querySelector(".reveal");
const hero    = document.querySelector(".hero");

let splits = [];
let master = null;


/* --------------------------------------------------------------------------
   O EMPURRÃO
   A máscara cresce a partir do centro, então sua borda esquerda está sempre
   em (centro - largura/2). Enquanto essa borda não alcança o logo, nada se
   move; a partir do encontro, o logo anda colado nela. Mesma coisa do outro
   lado com a sinopse. É isso que dá a sensação de estar sendo empurrado.
   -------------------------------------------------------------------------- */
const rv = { w: 0, h: 0 };

const setTitleX = gsap.quickSetter(title, "x", "px");
const setTextsX = gsap.quickSetter(textBox, "x", "px");
const setTitleY = gsap.quickSetter(title, "y", "px");
const setTextsY = gsap.quickSetter(textBox, "y", "px");

/* Deitado: do centro até a borda DIREITA do logo / ESQUERDA da sinopse.
   Em pé:   do centro até a borda de BAIXO do logo / de CIMA da sinopse. */
let titleGap = 0;
let textsGap = 0;
let pushPad  = 0;   // folga entre a borda da máscara e o conteúdo

/* Guardadas aqui para o ato 2 não depender de window.innerWidth/Height, que
   no celular muda com a barra de endereço. O .hero é 100svh: altura estável. */
let heroW = 0;
let heroH = 0;

/* Até onde a máscara precisa crescer no eixo do empurrão para cobrir a tela
   inteira. Deitado é a largura do hero. Em pé é o dobro da maior distância
   entre a origem e as bordas — porque em retrato a origem NÃO é o centro
   geométrico (ver measurePush), e crescer simetricamente a partir de um ponto
   descentrado deixaria uma faixa de fora. */
let revealSpan = 0;

/* Medido com x/y = 0, senão as medidas saem contaminadas pelo próprio empurrão */
function measurePush() {
  /* A máscara nasce no centro do .hero (é filha dele). No desktop isso é o
     mesmo que o centro do .stage, que tem inset simétrico. */
  const box = hero.getBoundingClientRect();

  heroW = box.width;
  heroH = box.height;

  if (isPortrait) {
    /* A máscara abre na COSTURA entre o título e a sinopse, não no meio da
       tela. Empilhado, o meio da tela cai dentro da faixa de imagem, acima do
       título — e aí o título já nasceria empurrado, porque a borda de cima da
       máscara estaria além dele desde o primeiro quadro.

       Abrindo na costura, as duas folgas nascem iguais e positivas, e a
       cortina se parte exatamente onde o conteúdo se separa. */
    const titleBox = title.getBoundingClientRect();
    const textsBox = textBox.getBoundingClientRect();
    const seamY    = (titleBox.bottom + textsBox.top) / 2;

    reveal.style.top = (seamY - box.top) + "px";

    /* O frame fica centrado na máscara, e a máscara agora está na costura —
       então com tudo aberto o vídeo apareceria abaixo do meio da tela. Este
       deslocamento devolve o vídeo ao centro do .hero, sem mexer na origem
       da cortina. */
    reveal.style.setProperty(
      "--frame-shift", (box.top + box.height / 2 - seamY) + "px"
    );

    titleGap = seamY - titleBox.bottom;
    textsGap = textsBox.top - seamY;

    /* Zero, e não uma folga como no desktop. Lá o conteúdo está a centenas de
       pixels do centro, e a folga só evita que ele encoste na máscara. Aqui o
       título e a sinopse estão a 8px da costura: qualquer folga maior que isso
       já os empurraria com a cortina ainda fechada. Com 0, eles ficam parados
       até a máscara alcançá-los — que é o que faz o empurrão parecer causado
       pela cortina, e não um deslocamento solto. */
    pushPad  = 0;

    revealSpan = 2 * Math.max(seamY - box.top, box.bottom - seamY);
  } else {
    const centerX = box.left + box.width / 2;

    reveal.style.removeProperty("top");   // volta para o 50% do CSS
    reveal.style.removeProperty("--frame-shift");

    titleGap = centerX - title.getBoundingClientRect().right;
    textsGap = textBox.getBoundingClientRect().left - centerX;
    pushPad  = box.width * (40 / 1856);   // 40u de respiro

    revealSpan = box.width;
  }

  /* O frame do trailer precisa nascer já com a altura final — é o que faz o
     vídeo ficar parado enquanto a máscara abre. Medir o .hero é mais
     confiável do que ler window.innerHeight, que no celular muda quando a
     barra de endereço aparece. Em retrato o CSS ignora isto e usa 16/9. */
  reveal.style.setProperty("--frame-h", box.height + "px");
}

function applyReveal() {
  reveal.style.width  = rv.w + "px";
  reveal.style.height = rv.h + "px";

  /* A máscara cresce a partir do centro, então a borda de cima está sempre em
     (centro - altura/2) — ou a da esquerda em (centro - largura/2), deitado.
     Enquanto essa borda não alcança o conteúdo, nada se move; a partir do
     encontro, o conteúdo anda colado nela. É isso que dá o empurrão. */
  if (isPortrait) {
    const half = rv.h / 2 + pushPad;
    setTitleY(-Math.max(0, half - titleGap));
    setTextsY( Math.max(0, half - textsGap));
  } else {
    const half = rv.w / 2 + pushPad;
    setTitleX(-Math.max(0, half - titleGap));
    setTextsX( Math.max(0, half - textsGap));
  }
}


/* --------------------------------------------------------------------------
   PLAYER
   Dois modos: "prévia" (mudo, em loop, com overlay — o que roda enquanto a
   máscara abre) e "assistindo" (do começo, com som e com os controles).
   -------------------------------------------------------------------------- */
const player = (() => {
  const root    = document.querySelector(".player");
  const frame   = document.querySelector(".reveal__frame");
  const video   = document.querySelector(".reveal__video");
  const overlay = document.querySelector(".reveal__overlay");

  const bigBtn  = root.querySelector(".player__big");
  const toggle  = root.querySelector(".player__toggle");
  const seek    = root.querySelector(".player__seek");
  const fill    = root.querySelector(".player__fill");
  const nowEl   = root.querySelector(".player__now");
  const totalEl = root.querySelector(".player__total");
  const muteBtn = root.querySelector(".player__mute");
  const fullBtn = root.querySelector(".player__full");

  let watching = false;
  let seeking  = false;
  let armed    = false;   // a prévia já está rodando (e o arquivo, baixando)

  const fmt = s => {
    if (!isFinite(s) || s < 0) return "0:00";
    return Math.floor(s / 60) + ":" + String(Math.floor(s % 60)).padStart(2, "0");
  };

  /* ---------- modos ---------- */
  function preview() {
    armed = true;

    video.loop = true;
    video.muted = true;
    video.currentTime = 0;
    video.play().catch(() => {});   // navegador pode recusar; mudo costuma passar
  }

  function reset() {
    if (!watching) return;
    watching = false;

    root.classList.remove("is-playing", "is-paused", "is-muted");
    preview();
    gsap.to(overlay, { opacity: 1, duration: .3, overwrite: true });
  }

  function watch() {
    watching = true;

    root.classList.add("is-playing");
    root.classList.remove("is-paused", "is-muted");

    video.loop = false;
    video.muted = false;
    video.currentTime = 0;      // volta do início, como pedido
    video.play().catch(() => {});

    gsap.to(overlay, { opacity: 0, duration: .4, overwrite: true });
  }

  function setReady(open) { root.classList.toggle("is-ready", open); }

  /* ---------- progresso ---------- */
  function sync() {
    const d = video.duration;
    const p = (isFinite(d) && d > 0) ? video.currentTime / d : 0;

    fill.style.width = (p * 100) + "%";
    nowEl.textContent = fmt(video.currentTime);
    seek.setAttribute("aria-valuenow", Math.round(p * 100));
  }

  function seekToX(clientX) {
    if (!isFinite(video.duration)) return;
    const r = seek.getBoundingClientRect();
    video.currentTime = gsap.utils.clamp(0, 1, (clientX - r.left) / r.width) * video.duration;
    sync();
  }

  /* ---------- eventos ---------- */
  bigBtn.addEventListener("click", watch);

  toggle.addEventListener("click", () => {
    if (video.ended) video.currentTime = 0;
    video.paused ? video.play() : video.pause();
  });

  video.addEventListener("play",  () => root.classList.remove("is-paused"));
  video.addEventListener("pause", () => { if (watching) root.classList.add("is-paused"); });
  video.addEventListener("ended", () => root.classList.add("is-paused"));
  video.addEventListener("timeupdate", () => { if (!seeking) sync(); });

  function readMeta() {
    totalEl.textContent = fmt(video.duration);
    sync();
  }
  video.addEventListener("loadedmetadata", readMeta);
  video.addEventListener("durationchange", readMeta);
  /* Se o vídeo veio do cache, "loadedmetadata" já pode ter passado antes
     daqui — nesse caso lemos a duração na hora. */
  if (video.readyState >= 1) readMeta();

  seek.addEventListener("pointerdown", e => {
    seeking = true;
    seek.setPointerCapture(e.pointerId);
    seekToX(e.clientX);
  });
  seek.addEventListener("pointermove", e => { if (seeking) seekToX(e.clientX); });
  seek.addEventListener("pointerup", e => {
    seeking = false;
    seek.releasePointerCapture(e.pointerId);
  });

  seek.addEventListener("keydown", e => {
    const step = e.key === "ArrowLeft" ? -5 : e.key === "ArrowRight" ? 5 : 0;
    if (!step || !isFinite(video.duration)) return;
    e.preventDefault();
    video.currentTime = gsap.utils.clamp(0, video.duration, video.currentTime + step);
    sync();
  });

  muteBtn.addEventListener("click", () => {
    video.muted = !video.muted;
    root.classList.toggle("is-muted", video.muted);
    muteBtn.setAttribute("aria-label", video.muted ? "Ativar som" : "Desativar som");
  });

  fullBtn.addEventListener("click", () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else frame.requestFullscreen().catch(() => {});
  });

  /* Enquanto o player está aberto, a barra de espaço deve pausar o trailer
     em vez de rolar a página. */
  root.addEventListener("keydown", e => {
    if (e.key === " " && watching) { e.preventDefault(); toggle.click(); }
  });

  /* Prévia em loop é movimento contínuo na tela e 18 MB que o visitante não
     pediu — no celular, com dados móveis, ainda pior. No modo estático o
     trailer fica parado, esperando o clique no play. Quem escolhe entre os
     dois modos é o applyMode(), na seção 5. */
  function standby() {
    watching = false;
    armed    = false;

    root.classList.remove("is-playing", "is-paused", "is-muted");
    video.loop = false;
    video.pause();

    gsap.set(overlay, { clearProps: "opacity", overwrite: true });
  }

  /* Liga e desliga a prévia conforme a máscara se aproxima.

     A prévia é o que dispara o download do trailer, e são 17 MB — em dados
     móveis, de quem talvez só quisesse ler a sinopse. Então ela não começa
     mais no boot: a timeline do hero arma isto quando falta pouco para o ato
     2 (ver buildTimeline), o que dá tempo de encher o buffer antes de a
     máscara abrir sem cobrar o arquivo de quem nunca chega lá. */
  function arm(on) {
    if (on === armed) return;
    on ? preview() : standby();
  }

  return { reset, setReady, preview, standby, arm };
})();


function buildTimeline() {
  /* --- limpa o que existir de uma execução anterior (resize) --- */
  if (master) {
    if (master.scrollTrigger) master.scrollTrigger.kill(true);
    master.kill();
    master = null;
  }
  splits.forEach(s => s.revert());
  splits = [];

  /* --- quebra os três parágrafos em letras, nos dois formatos --- */
  splits = textEls.map(el => SplitText.create(el, {
    type: "words,chars",   // quebra por palavras também: preserva o wrap do texto
    aria: "auto"           // leitores de tela continuam lendo o texto original
  }));

  /* --- estado inicial: só o primeiro texto visível --- */
  gsap.set(textEls, { opacity: 1 });
  gsap.set(splits[0].chars, { opacity: 1 });
  gsap.set([...splits[1].chars, ...splits[2].chars], { opacity: 0 });

  /* A cor só entra na timeline no desktop. Lá a sinopse fica SOBRE a arte,
     que começa clara e termina escura, então ela precisa virar de preta para
     branca no meio do caminho. Em retrato a sinopse está abaixo da faixa de
     imagem, sobre o vermelho escuro do hero: nasce branca pelo CSS e assim
     continua, sem nada para acompanhar. */
  if (!isPortrait) gsap.set(textBox, { color: "rgba(0, 0, 0, 0.9)" });

  gsap.set(ring, { filter: "invert(0)" });
  gsap.set(badge, { opacity: 1 });

  /* --- estado inicial do ato 2 --- */
  gsap.set([title, textBox], { x: 0, y: 0 });
  measurePush();
  rv.w = 0;
  rv.h = 0;
  applyReveal();
  player.standby();

  playhead.frame = 0;
  render();

  const act2At   = isPortrait ? ACT_1_PORTRAIT : ACT_1;
  const duration = act2At + ACT_2;

  /* Duas unidades de folga antes do ato 2 — cerca de 80% de uma tela de
     rolagem — para o vídeo ter o que mostrar quando a máscara abrir. */
  const armAt = Math.max(0, act2At - 2) / duration;

  /* --- a timeline --- */
  master = gsap.timeline({
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "+=" + (duration * SCROLL_PER_UNIT) + "%",
      pin: true,
      scrub: 1,             // 1s de defasagem: acompanha a rolagem com inércia
      invalidateOnRefresh: true,

      /* o botão de play só fica clicável com a máscara aberta; sair da Hero
         (rolando pra cima ou pra baixo) para o trailer, para não deixar o
         áudio tocando fora da tela nem o arquivo baixando à toa */
      onUpdate: self => {
        const open = self.progress > 0.99;
        player.setReady(open);
        if (!open) player.reset();

        player.arm(self.progress >= armAt);
      },
      onLeave: () => player.standby(),
      onLeaveBack: () => player.standby()
    }
  });

  /* ------------------------------------------------------------------------
     ATO 1 — a sequência de frames e a troca de sinopse, nos dois formatos.
     As duas ocupam o ato inteiro, então começam e terminam juntas.
     ------------------------------------------------------------------------ */
  buildFrames(act2At);
  buildTextSwap(act2At);
  if (!isPortrait) buildLegibility();

  buildAct2(act2At, duration);
}


/* A sequência ocupa o ato 1 inteiro, seja ele qual for: começa em 0 e termina
   exatamente onde a máscara começa a abrir. */
function buildFrames(duration) {
  master.to(playhead, {
    frame: LAST_FRAME,
    duration,
    ease: "none",
    onUpdate: render
  }, 0);
}


/* Troca de textos, letra a letra e em ordem aleatória.
   As posições são calculadas a partir da duração do ato para o 1º fade
   começar em 0 e o último terminar exatamente no fim dele — mesmo início e
   mesmo fim da sequência de frames, seja o ato de 10u (desktop) ou 7u
   (retrato). */
function buildTextSwap(actDuration) {
  const fadeOut = (chars, at) => master.to(chars, {
    opacity: 0,
    duration: CHAR_FADE,
    ease: "power1.out",
    stagger: { amount: CHAR_SPREAD, from: "random" }
  }, at);

  const fadeIn = (chars, at) => master.to(chars, {
    opacity: 1,
    duration: CHAR_FADE,
    ease: "power1.in",
    stagger: { amount: CHAR_SPREAD, from: "random" }
  }, at);

  const in3Start  = actDuration - FADE_BLOCK;   // o último bloco encosta no fim
  const out2Start = in3Start - OVERLAP;

  fadeOut(splits[0].chars, 0);
  fadeIn (splits[1].chars, OVERLAP);
  fadeOut(splits[1].chars, out2Start);
  fadeIn (splits[2].chars, in3Start);
}


function buildLegibility() {
  /* Legibilidade — só no desktop.
     A sequência começa com fundo branco e termina em preto, então a sinopse
     preta e o selo circular preto sumiriam no fim. Os dois trechos abaixo
     acompanham essa virada — e cada um no seu tempo, porque as duas regiões
     do frame escurecem em momentos diferentes (medido nos próprios frames):

       - atrás da sinopse: claro até ~43%, escuro a partir de ~50%
       - atrás do selo:    claro até ~62%, escuro a partir de ~78%

     As duas viradas são curtas de propósito: no meio de um crossfade a arte
     fica cinza, que é justamente o pior contraste. Quanto mais rápida a
     passagem, menos tempo nesse meio-termo.

     O logo do filme não entra aqui: é uma arte colorida (vermelho/azul/dourado)
     que continua legível nos dois fundos. */
  master.to(textBox, {
    color: "rgba(255, 255, 255, 0.92)",
    ease: "none",
    duration: ACT_1 * 0.07
  }, ACT_1 * 0.44);

  master.to(ring, {
    filter: "invert(1)",
    ease: "none",
    duration: ACT_1 * 0.08
  }, ACT_1 * 0.68);
}


/* --------------------------------------------------------------------------
   ATO 2 — a máscara abre e revela o trailer

   O mesmo movimento nos dois formatos, trocado de eixo. Deitado, a máscara
   primeiro ganha altura (vira uma faixa vertical cheia) e depois largura, que
   é o que empurra o logo e a sinopse para os lados. Em pé é o contrário:
   primeiro a largura, depois a altura — e o empurrão é para cima e para
   baixo, porque em retrato o título está ACIMA da sinopse, não ao lado.
   -------------------------------------------------------------------------- */
function buildAct2(at, duration) {
  /* O selo "role a página" sai antes da máscara passar por cima dele */
  master.to(badge, {
    opacity: 0,
    ease: "power1.out",
    duration: ACT_2 * 0.22
  }, at);

  /* Primeiro o eixo que só abre a faixa... */
  master.to(rv, {
    [isPortrait ? "w" : "h"]: isPortrait ? heroW : heroH,
    ease: "power2.out",
    duration: ACT_2 * 0.28,
    onUpdate: applyReveal
  }, at);

  /* ...depois o eixo do empurrão. Termina exatamente no fim da timeline. */
  master.to(rv, {
    [isPortrait ? "h" : "w"]: revealSpan,
    ease: "power2.inOut",
    duration: ACT_2 * 0.78,
    onUpdate: applyReveal
  }, at + ACT_2 * 0.22);

  /* Com a máscara aberta, entra o botão de play */
  master.to(".player__big", {
    opacity: 1,
    scale: 1,
    ease: "back.out(2)",
    duration: ACT_2 * 0.16
  }, duration - ACT_2 * 0.16);
}


/* ==========================================================================
   4 — SEÇÃO ELENCO
   A seção fica pinnada enquanto os atores se revezam. Cada troca move
   três coisas ao mesmo tempo: a foto (revelada de cima para baixo), o nome
   na esquerda e a barra de progresso com a aranha.
   ========================================================================== */
const CAST_DURATION = 10;

const castSection = document.querySelector(".cast");
const castMedia   = document.querySelector(".cast__media");
const castList    = document.querySelector(".cast__list");
const castPerson  = document.querySelector(".cast__person");
const castFill    = document.querySelector(".cast__fill");
const castSpider  = document.querySelector(".cast__spider");

const shots     = gsap.utils.toArray(".cast__shot");
const slides    = gsap.utils.toArray(".cast__slide");
const castItems = gsap.utils.toArray(".cast__item");

const STOPS = shots.length;

/* Posição (0..1) do centro de cada nome dentro da lista. É o que faz a aranha
   parar exatamente na altura do nome ativo, sem número mágico nenhum. */
let stopPositions = [];
let castUnit = 1;          // 1u em px, para os deslocamentos do crossfade
let castTl = null;

const pick = { t: 0 };

function measureCast() {
  castUnit = castSection.clientWidth / 1920;

  /* A imagem precisa nascer com a altura final: quem cresce é a máscara */
  castMedia.style.setProperty("--media-h", castMedia.clientHeight + "px");

  const listBox = castList.getBoundingClientRect();
  stopPositions = castItems.map(li => {
    const b = li.getBoundingClientRect();
    return (b.top + b.height / 2 - listBox.top) / listBox.height;
  });
}

function applyPick() {
  const p = gsap.utils.interpolate(stopPositions, pick.t) * 100;

  castFill.style.height = p + "%";
  castSpider.style.top  = p + "%";

  /* o nome mais próximo é o ativo — o CSS já faz a transição de cor */
  const active = Math.round(pick.t * (STOPS - 1));
  castItems.forEach((li, i) => {
    li.classList.toggle("cast__item--active", i === active);
    if (i === active) li.setAttribute("aria-current", "true");
    else li.removeAttribute("aria-current");
  });
}

function buildCast() {
  if (castTl) {
    if (castTl.scrollTrigger) castTl.scrollTrigger.kill(true);
    castTl.kill();
    castTl = null;
  }

  measureCast();

  /* --- estado inicial: primeira foto inteira, primeiro nome visível --- */
  gsap.set(shots[0], { height: "100%" });
  gsap.set(shots.slice(1), { height: "0%" });
  gsap.set(slides[0], { opacity: 1, y: 0 });
  gsap.set(slides.slice(1), { opacity: 0 });

  pick.t = 0;
  applyPick();

  castTl = gsap.timeline({
    scrollTrigger: {
      trigger: ".cast",
      start: "top top",
      end: "+=" + (CAST_DURATION * SCROLL_PER_UNIT) + "%",
      pin: true,
      scrub: true,
      invalidateOnRefresh: true
    }
  });

  /* Reserva a duração total. Sem isto a timeline terminaria junto com a última
     troca (a duração de uma timeline é a do seu conteúdo), e o respiro do fim
     simplesmente não existiria. */
  castTl.to({}, { duration: CAST_DURATION }, 0);

  /* Um respiro no começo e no fim, e as quatro trocas distribuídas no meio */
  const HOLD  = CAST_DURATION * 0.10;
  const step  = (CAST_DURATION - HOLD * 2) / (STOPS - 1);
  const TRANS = step * 0.55;            // o resto de cada trecho é pausa

  /* Deslocamento vertical do crossfade dos nomes. No desktop são 18u, que a
     1920px dão 18px. Em retrato a mesma conta daria 3,6px — imperceptível,
     porque castUnit é a largura da seção dividida por 1920. Em pé ele é
     escrito contra a caixa do nome, que já está dimensionada em rem. */
  const SHIFT = isPortrait ? castPerson.clientHeight * 0.22 : 18 * castUnit;

  for (let k = 1; k < STOPS; k++) {
    const at = HOLD + (k - 1) * step;

    /* 4.1 — a foto nova desce por cima da anterior */
    castTl.fromTo(shots[k],
      { height: "0%" },
      { height: "100%", ease: "power2.inOut", duration: TRANS },
      at);

    /* 4.2 — o nome anterior sobe e some, o novo entra por baixo */
    castTl.to(slides[k - 1], {
      opacity: 0,
      y: -SHIFT,
      ease: "power1.in",
      duration: TRANS * 0.45
    }, at);

    castTl.fromTo(slides[k],
      { opacity: 0, y: SHIFT },
      { opacity: 1, y: 0, ease: "power2.out", duration: TRANS * 0.6 },
      at + TRANS * 0.4);

    /* 4.3 — a barra preenche e a aranha desce até o próximo nome */
    castTl.to(pick, {
      t: k / (STOPS - 1),
      ease: "power2.inOut",
      duration: TRANS,
      onUpdate: applyPick
    }, at);
  }
}


/* ==========================================================================
   5 — BOOT E TROCA DE MODO
   ========================================================================== */

/* Tudo que o GSAP escreveu inline precisa sair quando as timelines morrem.
   Estilo inline ganha de qualquer regra de @media: um width:0px sobrando no
   .reveal ou um height:0% sobrando num .cast__shot deixaria o layout
   estático com buracos no lugar do trailer e das fotos. */
function clearInlineStyles() {
  gsap.set(
    [title, textBox, badge, ring, ...textEls, ".player__big", ...shots, ...slides],
    { clearProps: "all" }
  );

  reveal.removeAttribute("style");            // leva junto o --frame-h
  castMedia.style.removeProperty("--media-h");
  castFill.style.removeProperty("height");
  castSpider.style.removeProperty("top");
}

function killTimelines() {
  [master, castTl].forEach(tl => {
    if (!tl) return;
    if (tl.scrollTrigger) tl.scrollTrigger.kill(true);
    tl.kill();
  });
  master = null;
  castTl = null;

  /* devolve os parágrafos ao texto original, sem os <span> de cada letra */
  splits.forEach(s => s.revert());
  splits = [];

  clearInlineStyles();
}

/* Entra e sai do modo estático. Roda no boot e a cada virada do breakpoint,
   então girar o celular reorganiza a página sem recarregar. */
function applyMode() {
  killTimelines();

  if (isStatic) {
    if (smoother) {
      smoother.kill();
      smoother = null;
    }
    player.standby();
  } else {
    /* Retrato também é coreografia: precisa do pin, do scrub e da rolagem
       suave que os alimenta. */
    if (!smoother) smoother = ScrollSmoother.create(SMOOTHER_OPTIONS);

    /* A prévia não começa aqui: quem liga é a timeline do hero, perto do
       ato 2 (ver player.arm). */
    player.standby();
    buildTimeline();
    buildCast();
  }

  /* o .stage tem tamanhos bem diferentes entre os modos */
  resizeCanvas();
  ScrollTrigger.refresh();
}

applyMode();

/* Cada virada reaplica o modo do zero. Girar o celular passa por aqui. */
function onModeChange() {
  const before = isStatic + "/" + isPortrait;
  readMode();
  if (isStatic + "/" + isPortrait === before) return;
  applyMode();
}

REDUCED_MQ.addEventListener("change", onModeChange);
NARROW_MQ.addEventListener("change", onModeChange);

/* As fontes chegam depois do primeiro paint e mudam a quebra de linha: refaz
   o split (e as medidas do elenco) para tudo cair no lugar certo. No modo
   estático não há split nem medida para refazer, mas o canvas ainda precisa
   ser redimensionado — a altura do .stage vem do texto. */
if (document.fonts && document.fonts.ready) {
  document.fonts.ready.then(() => {
    resizeCanvas();
    if (isStatic) return;

    buildTimeline();
    buildCast();
    ScrollTrigger.refresh();
  });
}

/* Só refaz o split quando a LARGURA muda: no mobile, a barra de endereço
   entrando e saindo altera a altura o tempo todo e não deve rebuildar nada.
   A altura da foto, essa sim, precisa ser reescrita em qualquer resize. */
let lastWidth = window.innerWidth;
let resizeTimer;

// window.addEventListener("resize", () => {
//   resizeCanvas();
//   castMedia.style.setProperty("--media-h", castMedia.clientHeight + "px");

//   if (window.innerWidth === lastWidth) return;
//   lastWidth = window.innerWidth;

//   clearTimeout(resizeTimer);
//   resizeTimer = setTimeout(() => {
//     buildTimeline();
//     buildCast();
//     ScrollTrigger.refresh();
//   }, 250);
// });


/* ==========================================================================
   6 — NAVEGAÇÃO
   Os dois links do topo rolam a página pelo próprio ScrollSmoother, para o
   destino ser alcançado com a mesma inércia da rolagem normal.

   "VER ELENCO" mira a seção inteira; "TRAILER" não pode mirar um elemento,
   porque a revelação acontece dentro da Hero pinnada — o trailer só está
   aberto no FIM daquela timeline. Então o alvo é a posição de rolagem em
   que o ScrollTrigger da Hero termina, lida na hora do clique (ela muda a
   cada rebuild/refresh).
   ========================================================================== */
const nav = document.querySelector(".nav");

nav.addEventListener("click", e => {
  const link = e.target.closest("[data-scroll]");
  if (!link) return;

  e.preventDefault();

  /* Sem ScrollSmoother (modo estático) os dois destinos são elementos de
     verdade — o trailer já está aberto e em fluxo normal. */
  if (!smoother) {
    document.querySelector(link.getAttribute("href"))
      .scrollIntoView({ behavior: "auto", block: "start" });
    return;
  }

  if (link.dataset.scroll === "elenco") {
    smoother.scrollTo("#elenco", true, "top top");
    return;
  }

  const heroST = master && master.scrollTrigger;
  smoother.scrollTo(heroST ? heroST.end : "#trailer", true);
});
