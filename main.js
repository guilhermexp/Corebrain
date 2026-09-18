const { Plugin, ItemView, Notice, requestUrl, PluginSettingTab, Setting, setIcon, Modal } = require("obsidian");
const http = require("http");
const { randomBytes, timingSafeEqual } = require("crypto");

// ponytail: caminhos fixos. Se um dia precisar de mais de uma galeria, ai sim vira setting.
/**
 * Tudo que antes estava fixo no codigo vira padrao configuravel. Sem isto o
 * plugin so funciona em quem tem exatamente as mesmas pastas que eu.
 */
const PADRAO = {
  // uma pasta so: a divisao Clippings/X Bookmarks era por metodo de captura, nao
  // por conteudo. Fonte e colecao ja vivem no frontmatter, e a galeria agrupa por elas.
  pastas: ["Clippings"],
  pastaBookmarks: "Clippings",
  porta: 27125,
  // Token local da instalacao. Nunca vai em URL nem em logs; a extensao o
  // envia somente no header Authorization da ponte loopback.
  ponteToken: "",
  coluna: 300,
  linha: 210,
  ordem: "recente",
  modo: "grade",
  propsColapsadas: true,
  colecoes: ["whatsapp", "videos", "marketing", "audio-voz", "agents", "ui-ux", "macos", "skill", "hack", "tdah", "templates"],
  // Buscas salvas: { nome: { pedido, criada, caminhos: [] } }. Sao listas
  // explicitas de notas, nao regra de texto — quem escolhe e um modelo lendo
  // titulo e descricao, entao o criterio nao cabe num filtro. Ficam aqui e nao
  // no frontmatter de proposito: pergunta descartavel nao deve sujar 2800 notas.
  buscas: {},
  // capas baixadas pro vault. Sem isso a galeria depende de CDN de terceiro:
  // as URLs do Instagram sao assinadas e morrem em ~5 dias (403 signature
  // expired), e o GitHub responde 429 quando pedimos muitas de uma vez.
  pastaCapas: "Clippings/_capas",
  larguraCapa: 640,
  capaLocal: true,
  modeloUrl: "https://api.kimi.com/coding/v1/chat/completions",
  modeloNome: "k3",
  modeloChave: "",
};

// imagens dentro da nota, pro carrossel
const MD_IMG = /!\[[^\]]*\]\((\S+?)\)/g;
// so badge/avatar de verdade. camo NAO entra aqui: e proxy generico do GitHub,
// carrega screenshot tanto quanto badge — quem decide e a URL original (ver decamo).
const LIXO = /avatars\.githubusercontent|shields\.io|badge|\/badges?\/|api\.star-history|\.svg($|\?)/i;

/** camo.githubusercontent.com/<sha>/<url-original-em-hex> */
function decamo(u) {
  if (!u.includes("camo.githubusercontent.com")) return u;
  const hex = u.split("/").pop().split("?")[0];
  if (!/^[0-9a-f]+$/i.test(hex) || hex.length % 2) return u;
  let s = "";
  for (let i = 0; i < hex.length; i += 2) s += String.fromCharCode(parseInt(hex.substr(i, 2), 16));
  return s.startsWith("http") ? s : u;
}

/** Logos das fontes (paths do Simple Icons). Sao marcas: uso apenas pra
 *  identificar a origem do clipping, que e o uso previsto. */
const LOGOS = {
  github:
    "M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12",
  youtube:
    "M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
  x: "M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
  instagram:
    "M12 0C8.74 0 8.333.015 7.053.072 5.775.132 4.905.333 4.14.63c-.789.306-1.459.717-2.126 1.384S.935 3.35.63 4.14C.333 4.905.131 5.775.072 7.053.012 8.333 0 8.74 0 12s.015 3.667.072 4.947c.06 1.277.261 2.148.558 2.913.306.788.717 1.459 1.384 2.126.667.666 1.336 1.079 2.126 1.384.766.296 1.636.499 2.913.558C8.333 23.988 8.74 24 12 24s3.667-.015 4.947-.072c1.277-.06 2.148-.262 2.913-.558.788-.306 1.459-.718 2.126-1.384.666-.667 1.079-1.335 1.384-2.126.296-.765.499-1.636.558-2.913.06-1.28.072-1.687.072-4.947s-.015-3.667-.072-4.947c-.06-1.277-.262-2.149-.558-2.913-.306-.789-.718-1.459-1.384-2.126C21.319 1.347 20.651.935 19.86.63c-.765-.297-1.636-.499-2.913-.558C15.667.012 15.26 0 12 0zm0 2.16c3.203 0 3.585.016 4.85.071 1.17.055 1.805.249 2.227.415.562.217.96.477 1.382.896.419.42.679.819.896 1.381.164.422.36 1.057.413 2.227.057 1.266.07 1.646.07 4.85s-.015 3.585-.074 4.85c-.061 1.17-.256 1.805-.421 2.227-.224.562-.479.96-.899 1.382-.419.419-.824.679-1.38.896-.42.164-1.065.36-2.235.413-1.274.057-1.649.07-4.859.07-3.211 0-3.586-.015-4.859-.074-1.171-.061-1.816-.256-2.236-.421-.569-.224-.96-.479-1.379-.899-.421-.419-.69-.824-.9-1.38-.165-.42-.359-1.065-.42-2.235-.045-1.26-.061-1.649-.061-4.844 0-3.196.016-3.586.061-4.861.061-1.17.255-1.814.42-2.234.21-.57.479-.96.9-1.381.419-.419.81-.689 1.379-.898.42-.166 1.051-.361 2.221-.421 1.275-.045 1.65-.06 4.859-.06l.045.03zm0 3.678c-3.405 0-6.162 2.76-6.162 6.162 0 3.405 2.76 6.162 6.162 6.162 3.405 0 6.162-2.76 6.162-6.162 0-3.405-2.76-6.162-6.162-6.162zM12 16c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4zm7.846-10.405c0 .795-.646 1.44-1.44 1.44-.795 0-1.44-.646-1.44-1.44 0-.794.646-1.439 1.44-1.439.793-.001 1.44.645 1.44 1.439z",
  outros:
    "M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm7.938 6.5h-3.28a15.7 15.7 0 0 0-1.32-3.36A10.03 10.03 0 0 1 19.938 6.5zM12 2.04c.83 1.2 1.48 2.66 1.9 4.46h-3.8c.42-1.8 1.07-3.26 1.9-4.46zM2.26 14a9.98 9.98 0 0 1 0-4h3.76a20.6 20.6 0 0 0 0 4H2.26zm.8 2h3.28c.32 1.2.76 2.33 1.32 3.36A10.03 10.03 0 0 1 3.06 16zm3.28-8H3.06a10.03 10.03 0 0 1 4.6-3.36A15.7 15.7 0 0 0 6.34 8zM12 21.96c-.83-1.2-1.48-2.66-1.9-4.46h3.8c-.42 1.8-1.07 3.26-1.9 4.46zM14.34 16h-4.68a18.5 18.5 0 0 1 0-4h4.68a18.5 18.5 0 0 1 0 4zm2 3.36c.56-1.03 1-2.16 1.32-3.36h3.28a10.03 10.03 0 0 1-4.6 3.36zM17.98 14a20.6 20.6 0 0 0 0-4h3.76a9.98 9.98 0 0 1 0 4h-3.76z",
};

// Favoritos e colecao fixa: nao entra em cfg.colecoes de proposito, senao o
// classificador poderia atribuir sozinho. Favoritar e so seu.
const FAVORITO = "favoritos";
const ICONE_ESTRELA =
  "M12 2.5l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5-5.8-3-5.8 3 1.1-6.5-4.7-4.6 6.5-.9L12 2.5z";
const ICONE_LIXEIRA =
  "M4 6h16M9 6V4.5A1.5 1.5 0 0 1 10.5 3h3A1.5 1.5 0 0 1 15 4.5V6m2 0v13a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 7 19V6M10.5 10v6.5M13.5 10v6.5";

const ICONE_PLAY = "M8 5.5v13l11-6.5-11-6.5z";

// Onde o play aparece. So links que tocam dentro do <webview> do Obsidian: reel
// e post do Instagram, video e short do YouTube. Botao em cima do que nao toca
// seria um botao que mente.
// ponytail: /p/ do Instagram tambem pode ser foto (33 dos 898 salvos). O play
// abre a foto no painel do lado em vez de tocar — errado no icone, inofensivo no
// resto. Se incomodar, gravar `media: video` no frontmatter e filtrar por ele.
// `(^|\/\/|\.)` antes do dominio pelo mesmo motivo do dominio(): sem isso
// "naoinstagram.com/reel/x" casaria e ganharia um play que nao toca.
const TOCAVEL =
  /(^|\/\/|\.)(instagram\.com\/(reel|reels|p|tv)\/|youtube\.com\/(watch|shorts)|youtu\.be\/)/i;

// elo de corrente: o que vai pra area de transferencia e a URL, nao a nota
const ICONE_LINK =
  "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71";
const ICONE_CHECK = "M20 6L9 17l-5-5";

// etiqueta generica: colecao e tag sua, nao tem marca propria
const ICONE_TAG =
  "M21.41 11.58l-9-9A2 2 0 0 0 11 2H4a2 2 0 0 0-2 2v7a2 2 0 0 0 .59 1.42l9 9a2 2 0 0 0 2.82 0l7-7a2 2 0 0 0 0-2.84zM6.5 8A1.5 1.5 0 1 1 8 6.5 1.5 1.5 0 0 1 6.5 8z";

function svgIcone(d) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "currentColor");
  svg.addClass("cg-logo");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
  return svg;
}

function logoFonte(nome) {
  return svgIcone(LOGOS[nome] || LOGOS.outros);
}

const VIEW = "clippings-galeria";
const EH_GIF = /\.gif($|\?)/i;
// tamanho do lote de rolagem. Pequeno de proposito: a sentinela continua
// visivel e o observador pede mais, entao a tela se preenche sozinha.
const ICONE_LUPA = "M10.5 3a7.5 7.5 0 1 0 4.55 13.46l4.24 4.25 1.42-1.42-4.25-4.24A7.5 7.5 0 0 0 10.5 3zm0 2a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11z";
// og:image generica que o Instagram devolve quando esta bloqueando: o icone do
// app, igual pra todo post. Salvar isso e pior que nao ter capa — parece que
// funcionou. Cheguei a gravar 332 assim depois de martelar o site com 885
// requisicoes seguidas.
const CAPA_GENERICA = /static\.cdninstagram\.com\/rsrc\.php/i;
const LOTE_ROLAGEM = 20;
const ESPACO = 16; // vao entre colunas; igual ao gap do .cg-masonry no CSS
// tipo proprio no dataTransfer: em `dragover` o navegador esconde o conteudo mas
// deixa ver os tipos, e e assim que a barra sabe se o que vem e card ou link.
const TIPO_CARD = "application/x-cg-card";

/** Nome digitado -> tag valida. Obsidian aceita letra, numero, _ - / numa tag;
 *  espaco e acento-com-simbolo viram problema na hora de filtrar. */
function nomeDeColecao(bruto) {
  return String(bruto || "")
    .trim()
    .toLowerCase()
    // "Video / Audio" -> "video/audio". Sem isto o espaco vira hifen dos dois
    // lados da barra e sai "video-/-audio" — e barra e tag aninhada no Obsidian.
    .replace(/\s*\/\s*/g, "/")
    .replace(/\s+/g, "-")
    .replace(/[^\p{L}\p{N}_\-/]/gu, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-/]+|[-/]+$/g, "")
    .slice(0, 40);
}

/** O clipper repete: no X o title e a propria descricao cortada em ~90 chars.
 *  Mostrar os dois inteiros imprime a mesma frase duas vezes — entao a descricao
 *  comeca de onde o titulo parou. Quando nao ha resto, nao ha descricao. */
function restoDaDescricao(titulo, desc) {
  if (!desc) return "";
  const t = String(titulo || "").replace(/[…\s.]+$/, ""); // o "…" do corte nao casa
  if (!desc.startsWith(t)) return desc;
  // o corte cai no meio da palavra ("...install the what…"): sem voltar ate o
  // comeco dela, a descricao comecaria em "sapp application".
  const meioDaPalavra = /\S/.test(desc[t.length] || "");
  const i = meioDaPalavra ? t.lastIndexOf(" ") + 1 : t.length; // 0 = devolve tudo
  return desc.slice(i).replace(/^[\s….]+/, "");
}

/**
 * "[[Nome]]" -> "Nome".
 *
 * Cada clipping grava `author: [[Fulano]]`, e essas notas nao existem: sao 1163
 * nos fantasma no grafo, mais do que as notas reais fora dos clippings. Vira
 * texto puro. So converte quando o valor INTEIRO e um wikilink — link no meio de
 * uma frase fica como esta, porque ai o autor quis linkar mesmo.
 */
function semWikilink(v) {
  const s = String(v === null || v === undefined ? "" : v).trim();
  const m = s.match(/^\[\[([^\]]+)\]\]$/);
  if (!m) return s;
  const alvo = m[1];
  const i = alvo.indexOf("|");
  // com alias, o que aparece na tela e o alias; sem alias, o ultimo trecho do caminho
  return (i >= 0 ? alvo.slice(i + 1) : alvo.split("/").pop()).trim();
}

/**
 * Tags da nota depois de soltar num destino.
 *
 * "Mudar para la" so faz sentido quando da pra saber de ONDE ela sai: se a
 * galeria esta filtrada por uma colecao, arrastar pra outra MOVE (sai da
 * origem). Em "Tudo" ou filtrado por fonte, nao ha origem — entao ACRESCENTA,
 * porque tirar a colecao errada seria pior do que somar uma.
 */
function aoSoltarEmColecao(tags, destino, origem) {
  const lista = [].concat(tags || []).map(String).filter(Boolean);
  const base = origem && origem !== destino ? lista.filter((t) => t !== origem) : lista;
  return base.includes(destino) ? base : [...base, destino];
}

/** Entidades HTML que aparecem em og:title/og:description. Sem isto o titulo
 *  chega na galeria como "Foo &amp; Bar". */
function desescapar(s) {
  const nomeadas = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };
  return String(s || "")
    .replace(/&([a-z]+);/gi, (m, e) => (e.toLowerCase() in nomeadas ? nomeadas[e.toLowerCase()] : m))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/\s+/g, " ")
    .trim();
}

/** Le as meta tags de uma pagina. Os atributos vem em qualquer ordem, entao
 *  procura nos dois sentidos (property antes ou depois de content) — foi o que
 *  fez o og:image do YouTube ser encontrado. */
function lerOg(html) {
  const h = String(html || "");
  const pega = (prop) => {
    const p = prop.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const antes = new RegExp(`<meta[^>]+(?:property|name)=["']${p}["'][^>]*content=["']([^"']*)["']`, "i");
    const depois = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${p}["']`, "i");
    const m = h.match(antes) || h.match(depois);
    return m ? desescapar(m[1]) : "";
  };
  const tagTitle = (h.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "";
  return {
    titulo: pega("og:title") || pega("twitter:title") || desescapar(tagTitle),
    descricao: pega("og:description") || pega("twitter:description") || pega("description"),
    imagem: pega("og:image") || pega("og:image:url") || pega("twitter:image"),
  };
}

/**
 * Titulo quando a pagina nao publica og:title (login wall, SPA, 403).
 * "instagram.com" sozinho nao identifica nada; com o caminho da URL vira
 * "instagram.com - reel/DbvdH3KjZH7", que da pra reconhecer na galeria.
 */
function tituloDaUrl(url) {
  const h = hostDe(url);
  if (!h) return String(url || "");
  let caminho = "";
  try {
    caminho = decodeURIComponent(new URL(normalizarSource(url)).pathname)
      .split("/")
      .filter(Boolean)
      .join("/");
  } catch {
    caminho = "";
  }
  return caminho ? `${h} - ${caminho.slice(0, 70)}` : h;
}

/** Monta a nota de um link colado, no MESMO formato do clipper — assim galeria,
 *  classificador e tradutor tratam link colado e link clipado do mesmo jeito. */
function notaDeLink(url, og, hoje) {
  const y = (v) => JSON.stringify(String(v === null || v === undefined ? "" : v));
  const titulo = og.titulo || tituloDaUrl(url);
  const linhas = [
    "---",
    `title: ${y(titulo)}`,
    `source: ${y(url)}`,
    `created: ${hoje}`,
    `description: ${y(og.descricao)}`,
    'tags:\n  - "clippings"',
  ];
  if (og.imagem) linhas.push(`image: ${y(og.imagem)}`);
  linhas.push("---", "", `[${titulo}](${url})`, "");
  return { nome: sanitizar(titulo) || "link", conteudo: linhas.join("\n") };
}

/** Liga/desliga o favorito. Preserva as outras tags, e nao duplica. */
function alternarFavorito(tags) {
  const lista = [].concat(tags || []).map(String).filter(Boolean);
  return lista.includes(FAVORITO) ? lista.filter((t) => t !== FAVORITO) : [...lista, FAVORITO];
}

/** Prompt de traducao. Fora da classe pra poder testar sem rede. */
function promptTraducao(itens) {
  return (
    "Traduza para portugues do Brasil o titulo (t) e a descricao (d) de cada item.\n" +
    "Mantenha em ingles: nomes proprios, nomes de repositorio (autor/projeto), @usuarios, " +
    "URLs, comandos, nomes de produto e termos tecnicos consagrados.\n" +
    "Nao resuma, nao comente, nao invente. Se ja estiver em portugues, devolva igual.\n" +
    'Responda so [{"n":1,"t":"...","d":"..."}, ...] na ordem, um item para cada entrada.\n\n' +
    itens.map((x, i) => `${i + 1}. t: ${x.t || ""}\n   d: ${x.d || ""}`).join("\n")
  );
}

/** Le a resposta do modelo. Item malformado e descartado em vez de virar lixo no
 *  frontmatter — uma nota sem traducao e recuperavel, uma nota corrompida nao. */
function lerTraducao(txt, total) {
  const m = String(txt || "").match(/\[[\s\S]*\]/);
  if (!m) throw new Error("resposta do modelo nao veio em JSON");
  const out = new Map();
  for (const x of JSON.parse(m[0])) {
    const n = Number(x && x.n);
    if (!Number.isInteger(n) || n < 1 || n > total || out.has(n)) continue;
    const t = typeof x.t === "string" ? x.t.trim() : "";
    const d = typeof x.d === "string" ? x.d.trim() : "";
    if (!t && !d) continue;
    out.set(n, { t, d });
  }
  return out;
}

/** Grava a traducao guardando o original UMA vez. Reexecutar nao pode sobrescrever
 *  o backup com uma traducao: estas notas nao estao no git do vault, o *_original
 *  e a unica copia do texto de origem. */
function aplicarTraducao(fm, trad, somentePendentes = false) {
  let mudou = false;
  for (const campo of ["title", "description"]) {
    const novo = trad[campo === "title" ? "t" : "d"];
    const atual = fm[campo];
    if (!novo || !atual) continue;
    const backup = `${campo}_original`;
    // `aplicarTraducao` continua aceitando uma nova traducao quando chamado
    // diretamente (compatibilidade com notas antigas), mas o lote so deve
    // escrever campos que ainda estao pendentes. Assim uma resposta parcial
    // nao reprocessa o titulo que ja foi traduzido.
    if (somentePendentes && fm[backup] !== undefined) continue;
    if (novo === atual) {
      // Resposta igual tambem e uma resposta valida (nome proprio, termo ja
      // em portugues etc.). No lote, o backup com o mesmo valor funciona como
      // marcador persistente de que este campo ja foi processado.
      if (somentePendentes) {
        fm[backup] = atual;
        mudou = true;
      }
      continue;
    }
    if (fm[backup] === undefined) fm[backup] = atual;
    fm[campo] = novo;
    mudou = true;
  }
  return mudou;
}

/** O clipper as vezes grava source: "<url>". Comparar sem tirar os <> faz a
 *  mesma pagina passar por duas URLs diferentes e virar nota duplicada. */
function normalizarSource(s) {
  return String(s === null || s === undefined ? "" : s).trim().replace(/^<|>$/g, "");
}

const CAMPO_CHEGADA = "corebrain_added_at";
const ISO_CHEGADA = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/;

/** Arrival is an event timestamp, not a date-only source field. Keep valid
 * values exactly as authored; only a missing/invalid value is replaced. */
function chegadaValida(value) {
  return typeof value === "string" && ISO_CHEGADA.test(value.trim()) && Number.isFinite(Date.parse(value));
}

/** Hostname cru. No rodape do modo lista "outros" nao diz nada; "vercel.com" diz. */
function hostDe(source) {
  try {
    return new URL(normalizarSource(source)).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/** Dominio da fonte, agrupando a cauda longa: 88 sao github, o resto e 1 nota cada. */
function dominio(source) {
  const h = hostDe(source);
  if (!h) return "outros";
  // `endsWith` sozinho casaria "naogithub.com" com "github.com" — tem que ser o
  // dominio exato ou um subdominio de verdade (com o ponto).
  const eh = (d) => h === d || h.endsWith("." + d);
  if (eh("github.com")) return "github";
  if (eh("youtube.com") || eh("youtu.be")) return "youtube";
  if (eh("x.com") || eh("twitter.com")) return "x";
  if (eh("instagram.com")) return "instagram";
  return "outros";
}

/**
 * Galeria masonry propria.
 * Existe porque o Bases posiciona os cards por JS com altura fixa: masonry ali
 * significaria brigar com o layout dele a cada frame. Aqui a altura e natural
 * (a <img> manda) e o masonry sai de `columns` do CSS, sem JS de layout nenhum.
 */
function normalizarBusca(texto) {
  return String(texto ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}
function termosDaBusca(texto) {
  return [...new Set(normalizarBusca(texto).trim().split(/\s+/).filter(Boolean))];
}
function camposDaBusca(file, fm) {
  return [fm.title, fm.description, fm.title_original, fm.description_original,
    fm.source, file.basename, fm.tags, fm.author, fm.authors].flat(Infinity)
    .filter((v) => typeof v === "string" || typeof v === "number").join("\n");
}
function dataDeEntrada(file, fm) {
  const valor = fm.corebrain_added_at;
  const t = typeof valor === "string" ? Date.parse(valor) : NaN;
  return Number.isFinite(t) ? t : Number(file.stat?.ctime) || 0;
}
function faixasDaBusca(texto, termos) {
  const mapa = []; let normal = "", pos = 0;
  for (const char of texto) {
    const n = normalizarBusca(char);
    for (let i = 0; i < n.length; i++) mapa.push([pos, pos + char.length]);
    normal += n; pos += char.length;
  }
  const faixas = [];
  for (const termo of termos) {
    let i = normal.indexOf(termo);
    while (i >= 0) {
      let fim = mapa[i + termo.length - 1][1];
      while (fim < texto.length && /[\u0300-\u036f]/.test(texto[fim])) fim++;
      faixas.push([mapa[i][0], fim]); i = normal.indexOf(termo, i + termo.length);
    }
  }
  faixas.sort((a, b) => a[0] - b[0]);
  const juntas = [];
  for (const faixa of faixas) {
    const ultima = juntas[juntas.length - 1];
    if (ultima && faixa[0] <= ultima[1]) ultima[1] = Math.max(ultima[1], faixa[1]);
    else juntas.push(faixa);
  }
  return juntas;
}

class GaleriaView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return VIEW;
  }
  getDisplayText() {
    return "Galeria de clippings";
  }
  getIcon() {
    return "layout-grid";
  }

  async onOpen() {
    this._buscaFechada = false;
    this.register(() => {
      this._buscaFechada = true;
      clearTimeout(this.tb);
      this._textoBusca?.clear();
      clearTimeout(this.t);
      this.observador?.disconnect();
      this.medidor?.disconnect();
      this.cancelarRestauracaoScroll();
    });
    this.render();
    // clipping novo (ou thumbnail que acabou de chegar) entra sem precisar reabrir
    this.registerEvent(this.app.metadataCache.on("changed", (file, data, cache) => {
      if (this.metadataMudou(file, data, cache)) this.agendarRender();
    }));
    this.registerEvent(this.app.vault.on("delete", () => this.agendarRender()));
    this.registerEvent(this.app.vault.on("rename", (file, antigo) => {
      const naGaleria = (caminho) => {
        const s = typeof caminho === "string" ? caminho : caminho?.path;
        return !!s && this.plugin.pastas.some((p) => s === p.slice(0, -1) || s.startsWith(p));
      };
      const novoNaGaleria = naGaleria(file);
      const velho = typeof antigo === "string" ? antigo : antigo?.path;
      const antigoNaGaleria = naGaleria(velho);
      if (novoNaGaleria || antigoNaGaleria) this.agendarRender();
    }));
  }

  /** Re-render por mudanca de DADO (capa baixada, nota apagada). Preserva onde
   *  voce estava: quem mexeu na galeria foi o plugin, nao voce. Busca, filtro e
   *  ordem chamam render() direto, porque ai voltar ao topo e o certo. */
  agendarRender() {
    clearTimeout(this.t);
    this.t = setTimeout(() => this.render(true), 400);
  }

  /** So mudancas que aparecem na galeria devem reconstruir todos os cards.
   *  O metadata cache tambem dispara para author, aliases e propriedades que
   *  nao mudam nenhum filtro, entao comparamos uma projecao pequena. */
  imagensDoCorpo(corpo) {
    if (Array.isArray(corpo)) return [...new Set(corpo.map(String).filter((u) => u.startsWith("http") && !LIXO.test(u)))];
    if (typeof corpo !== "string") return null;
    return [...new Set(
      [...corpo.matchAll(MD_IMG)]
        .map((m) => decamo(m[1]))
        .filter((u) => u.startsWith("http") && !LIXO.test(u)),
    )];
  }

  projecaoMetadata(cache, corpo) {
    const fm = cache?.frontmatter || {};
    return JSON.stringify({
      title: fm.title,
      description: fm.description,
      source: fm.source,
      image: fm.image,
      thumb: fm.thumb,
      created: fm.created,
      corebrain_added_at: fm.corebrain_added_at,
      tags: fm.tags,
      // Texto sem imagem nao importa para a galeria; somente a lista de
      // imagens do corpo participa da projecao. `null` significa que ainda nao
      // recebemos o conteudo, diferente de um corpo conhecido sem imagens.
      corpo: this.imagensDoCorpo(corpo),
    });
  }

  lembrarMetadata(file, cache, corpo) {
    if (!file?.path) return;
    this._corpoGaleria ||= new Map();
    const imagens = this.imagensDoCorpo(corpo);
    if (imagens !== null) this._corpoGaleria.set(file.path, imagens);
    const conhecidas = this._corpoGaleria.has(file.path)
      ? this._corpoGaleria.get(file.path)
      : this.plugin.imgs?.get(file.path) ?? null;
    this._metadataGaleria ||= new Map();
    this._metadataGaleria.set(file.path, this.projecaoMetadata(cache, conhecidas));
  }

  metadataMudou(file, corpo, cache) {
    // Compatibilidade com chamadas internas/tests antigas que passavam apenas
    // (file, cache), antes de o conteudo do corpo entrar na projecao.
    if (cache === undefined && corpo && typeof corpo === "object" && "frontmatter" in corpo) {
      cache = corpo;
      corpo = undefined;
    }
    if (!file?.path || !this.plugin.pastas.some((p) => file.path.startsWith(p))) return false;
    const textoAnterior = this.corpoIndexado(file)?.texto;
    if (typeof corpo === "string") this.guardarTextoBusca(file, corpo);
    const buscaMudou = !!termosDaBusca(this.busca).length &&
      (typeof corpo === "string" && textoAnterior !== corpo || this._camposBusca?.get(file.path) !== camposDaBusca(file, cache?.frontmatter || {}));
    this._camposBusca ||= new Map();
    this._camposBusca.set(file.path, camposDaBusca(file, cache?.frontmatter || {}));
    this._corpoGaleria ||= new Map();
    const imagens = this.imagensDoCorpo(corpo);
    if (imagens !== null) this._corpoGaleria.set(file.path, imagens);
    const conhecidas = this._corpoGaleria.has(file.path)
      ? this._corpoGaleria.get(file.path)
      : this.plugin.imgs?.get(file.path) ?? null;
    const agora = this.projecaoMetadata(cache, conhecidas);
    const antes = this._metadataGaleria?.get(file.path);
    this._metadataGaleria ||= new Map();
    this._metadataGaleria.set(file.path, agora);
    return buscaMudou || antes === undefined || antes !== agora;
  }

  sincronizarMetadata() {
    this._corpoGaleria ||= new Map();
    const vistos = new Set();
    this._metadataGaleria = new Map(this.todas().map(({ f, fm }) => {
      vistos.add(f.path);
      const imagens = this._corpoGaleria.has(f.path)
        ? this._corpoGaleria.get(f.path)
        : this.plugin.imgs?.get(f.path) ?? null;
      if (imagens !== null) this._corpoGaleria.set(f.path, imagens);
      return [f.path, this.projecaoMetadata({ frontmatter: fm }, imagens)];
    }));
    for (const path of this._corpoGaleria.keys()) if (!vistos.has(path)) this._corpoGaleria.delete(path);
  }

  cancelarRestauracaoScroll() {
    const estado = this._restauracaoScroll;
    if (!estado) return;
    estado.cancelado = true;
    estado.timers.forEach((id) => clearTimeout(id));
    estado.limpar?.();
    this._restauracaoScroll = null;
  }

  /** Recoloca o painel depois do reflow inicial, mas para no primeiro scroll
   *  que nao foi causado por este metodo — a navegacao do usuario vence o
   *  conserto de altura das imagens. */
  programarRestauracaoScroll(painel, rolagem) {
    this.cancelarRestauracaoScroll();
    if (!painel || !rolagem) return;
    const estado = { cancelado: false, timers: [], programado: null, programando: false };
    const aoRolar = () => {
      if (estado.programando) return;
      if (estado.programado !== null && painel.scrollTop === estado.programado) {
        estado.programado = null;
        return;
      }
      this.cancelarRestauracaoScroll();
    };
    painel.addEventListener("scroll", aoRolar);
    estado.limpar = () => painel.removeEventListener("scroll", aoRolar);
    this._restauracaoScroll = estado;
    const repor = () => {
      if (estado.cancelado || painel.isConnected === false) return;
      if (painel.scrollTop < rolagem) {
        // O browser pode limitar o valor enquanto as imagens ainda nao
        // aumentaram o scrollHeight. Registre o valor REAL depois da escrita;
        // o evento de scroll desse clamp nao e uma navegacao do usuario.
        estado.programando = true;
        painel.scrollTop = rolagem;
        estado.programado = painel.scrollTop;
        estado.programando = false;
      }
    };
    repor();
    estado.timers = [80, 250, 600, 1200].map((ms) => setTimeout(repor, ms));
  }

  /** Todas as notas da pasta, sem filtro — a sidebar conta em cima disto. */
  todas() {
    return this.app.vault
      .getMarkdownFiles()
      .filter((f) => this.plugin.pastas.some((p) => f.path.startsWith(p)))
      .map((f) => ({ f, fm: this.app.metadataCache.getFileCache(f)?.frontmatter || {} }));
  }

  assinaturaBusca(file) {
    return `${file.stat?.mtime || 0}:${file.stat?.size || 0}:${file.stat?.ctime || 0}`;
  }

  corpoIndexado(file) {
    const item = this._textoBusca?.get(file.path);
    return item?.file === file && item.assinatura === this.assinaturaBusca(file) ? item : null;
  }

  guardarTextoBusca(file, texto, erro = false) {
    this._textoBusca ||= new Map();
    const corpo = String(texto).replace(/^\uFEFF?---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, "");
    this._textoBusca.set(file.path, {file, assinatura: this.assinaturaBusca(file), texto: corpo,
      normal: normalizarBusca(corpo), erro});
  }

  async indexarBusca() {
    if (this._buscaFechada || !termosDaBusca(this.busca).length) return;
    if (this._indexandoBusca) return this._indexandoBusca;
    const arquivos = this.todas().map(({f}) => f);
    const vivos = new Set(arquivos.map(f => f.path));
    for (const path of this._textoBusca?.keys() || []) if (!vivos.has(path)) this._textoBusca.delete(path);
    const fila = arquivos.filter(f => this.app.vault.getAbstractFileByPath(f.path) === f && !this.corpoIndexado(f));
    if (!fila.length) return;
    this.statusBusca?.setText("Buscando no conteúdo…");
    const ler = async () => {
      while (fila.length && !this._buscaFechada) {
        const file = fila.shift(), path = file.path, assinatura = this.assinaturaBusca(file);
        const anterior = this._textoBusca?.get(path);
        let texto = "", erro = false;
        try { texto = await this.app.vault.cachedRead(file); } catch { erro = true; }
        if (this._buscaFechada || file.path !== path ||
          this.app.vault.getAbstractFileByPath(path) !== file ||
          this.assinaturaBusca(file) !== assinatura || this._textoBusca?.get(path) !== anterior) continue;
        this.guardarTextoBusca(file, texto, erro);
      }
    };
    this._indexandoBusca = Promise.all(Array.from({length: Math.min(8, fila.length)}, ler));
    try { await this._indexandoBusca; }
    finally {
      this._indexandoBusca = null;
      if (!this._buscaFechada) {
        this.errosBusca = [...(this._textoBusca?.values() || [])].filter(x => x.erro).length;
        const buscando = termosDaBusca(this.busca).length > 0;
        this.statusBusca?.setText(buscando && this.errosBusca ? `${this.errosBusca} nota(s) não puderam ser lidas.` : "");
        if (buscando) {
          this.atualizarResultados(true);
          // A create/rename/modify may have arrived during the asynchronous read.
          const faltam = this.todas().some(({f}) => this.app.vault.getAbstractFileByPath(f.path) === f && !this.corpoIndexado(f));
          if (faltam) await this.indexarBusca();
        }
      }
    }
  }

  notas() {
    const termos = termosDaBusca(this.busca);
    const sel = this.plugin.cfg.filtro || { tipo: "tudo" };
    const lista = this.todas().filter(({ f, fm }) => {
      if (sel.tipo === "fonte" && dominio(fm.source) !== sel.valor) return false;
      if (sel.tipo === "tag" && ![].concat(fm.tags || []).includes(sel.valor)) return false;
      if (sel.tipo === "busca" && !this.plugin.caminhosDaBusca(sel.valor).has(f.path)) return false;
      if (!termos.length) return true;
      const texto = normalizarBusca(camposDaBusca(f, fm)) + "\n" + (this.corpoIndexado(f)?.normal || "");
      return termos.every(t => texto.includes(t));
    });
    const nome = x => String(x.fm.title || x.f.basename).toLowerCase();
    const ordens = {
      recente: (a, b) => dataDeEntrada(b.f, b.fm) - dataDeEntrada(a.f, a.fm),
      antigo: (a, b) => dataDeEntrada(a.f, a.fm) - dataDeEntrada(b.f, b.fm),
      az: (a, b) => nome(a).localeCompare(nome(b)),
    };
    const ordem = ordens[this.plugin.cfg.ordem] || ordens.recente;
    return lista.sort((a,b) => ordem(a,b) || a.f.path.localeCompare(b.f.path));
  }

  destacarBusca(el, texto) {
    texto = String(texto ?? "");
    const faixas = faixasDaBusca(texto, termosDaBusca(this.busca));
    if (!faixas.length) { el.setText(texto); return; }
    let pos = 0;
    for (const [inicio, fim] of faixas) {
      if (inicio > pos) el.createSpan({text: texto.slice(pos, inicio)});
      el.createEl("mark", {cls: "cg-busca-destaque", text: texto.slice(inicio, fim)});
      pos = fim;
    }
    if (pos < texto.length) el.createSpan({text: texto.slice(pos)});
  }

  trechoBusca(pai, file, fm, visivel) {
    const termos = termosDaBusca(this.busca).filter(t => !normalizarBusca(visivel).includes(t));
    if (!termos.length) return;
    const texto = `${camposDaBusca(file, fm)}\n${this.corpoIndexado(file)?.texto || ""}`.replace(/\s+/g, " ");
    const faixa = faixasDaBusca(texto, termos)[0];
    if (!faixa) return;
    const inicio = Math.max(0, faixa[0] - 45), fim = Math.min(texto.length, faixa[1] + 115);
    const el = pai.createDiv({cls: "cg-busca-trecho"});
    this.destacarBusca(el, (inicio ? "…" : "") + texto.slice(inicio, fim) + (fim < texto.length ? "…" : ""));
  }

  /** Grupos derivados do que ja existe no frontmatter — nada pra voce classificar. */
  grupos() {
    const todas = this.todas();
    const fontes = new Map();
    const tags = new Map();
    for (const { fm } of todas) {
      const f = dominio(fm.source);
      fontes.set(f, (fontes.get(f) || 0) + 1);
      for (const t of [].concat(fm.tags || [])) {
        // favoritos tem item proprio no topo, e x-bookmark/bookmarks-bar sao origens (nao colecoes)
        if (t !== "clippings" && t !== FAVORITO && t !== "x-bookmark" && t !== "bookmarks-bar") {
          tags.set(t, (tags.get(t) || 0) + 1);
        }
      }
    }
    // colecao recem-criada ainda nao tem nota nenhuma. Sem entrar aqui com 0,
    // ela nao apareceria na barra — e sem aparecer, nao da pra arrastar pra ela.
    for (const c of this.plugin.cfg.colecoes || []) if (!tags.has(c)) tags.set(c, 0);
    const favoritos = todas.filter(({ fm }) => [].concat(fm.tags || []).map(String).includes(FAVORITO)).length;
    const ordena = (m) => [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    // conta so o que ainda existe: nota apagada nao pode inflar o numero
    const vivos = new Set(todas.map(({ f }) => f.path));
    const buscas = Object.entries(this.plugin.cfg.buscas || {})
      .map(([nome, b]) => [nome, (b.caminhos || []).filter((c) => vivos.has(c)).length])
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
    return { total: todas.length, favoritos, buscas, fontes: ordena(fontes), tags: ordena(tags) };
  }

  barraLateral(raiz) {
    const g = this.grupos();
    const side = raiz.createDiv({ cls: "cg-side" });
    const sel = this.plugin.cfg.filtro || { tipo: "tudo" };

    const item = (pai, { tipo, valor }, rotulo, n, icone) => {
      const el = pai.createDiv({ cls: "cg-item" });
      if (icone) el.appendChild(icone);
      el.createSpan({ cls: "cg-rotulo", text: rotulo });
      const num = el.createSpan({ cls: "cg-num", text: String(n) });
      if (sel.tipo === tipo && sel.valor === valor) el.addClass("cg-ativo");
      el.addEventListener("click", async () => {
        await this.plugin.salvar({ filtro: { tipo, valor } });
        this.render();
      });
      // so colecao recebe card: fonte vem da URL, nao da pra atribuir
      if (tipo === "tag") this.aceitarCard(el, valor, num);
      return el;
    };

    item(side, { tipo: "tudo" }, "Tudo", g.total);
    // fixo: aparece mesmo com 0, senao nao haveria pra onde arrastar o primeiro
    item(side, { tipo: "tag", valor: FAVORITO }, "Favoritos", g.favoritos, svgIcone(ICONE_ESTRELA));

    if (g.fontes.length) {
      side.createDiv({ cls: "cg-secao", text: "Fontes" });
      for (const [f, n] of g.fontes) item(side, { tipo: "fonte", valor: f }, f, n, logoFonte(f));
    }

    if (g.buscas.length) {
      side.createDiv({ cls: "cg-secao", text: "Buscas" });
      for (const [nome, n] of g.buscas) {
        const el = item(side, { tipo: "busca", valor: nome }, nome, n, svgIcone(ICONE_LUPA));
        el.setAttr("title", (this.plugin.cfg.buscas[nome] || {}).pedido || nome);
        const x = el.createSpan({ cls: "cg-apagar-busca", attr: { "aria-label": "Apagar busca" } });
        setIcon(x, "x");
        x.addEventListener("click", async (e) => {
          e.stopPropagation(); // senao o clique tambem seleciona a busca que sumiu
          await this.plugin.apagarBusca(nome);
          this.render();
        });
      }
    }

    const cab = side.createDiv({ cls: "cg-secao cg-secao-acao" });
    cab.createSpan({ text: "Coleções" });
    const mais = cab.createSpan({ cls: "cg-mais", attr: { "aria-label": "Nova coleção" } });
    setIcon(mais, "plus");

    const nova = side.createEl("input", {
      cls: "cg-nova",
      attr: { type: "text", placeholder: "nome da coleção", spellcheck: "false" },
    });
    mais.addEventListener("click", () => {
      side.toggleClass("cg-criando", !side.hasClass("cg-criando"));
      if (side.hasClass("cg-criando")) nova.focus();
      else nova.value = "";
    });
    nova.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") return side.removeClass("cg-criando");
      if (e.key !== "Enter") return;
      await this.plugin.criarColecao(nova.value);
      nova.value = "";
      side.removeClass("cg-criando");
      this.render();
    });

    for (const [t, n] of g.tags) item(side, { tipo: "tag", valor: t }, t, n, svgIcone(ICONE_TAG));
    if (!g.tags.length) {
      side.createDiv({ cls: "cg-vazio", text: "Crie uma coleção no + acima e arraste cards pra ela." });
    }
  }

  /** Alvo de soltar: o card cai aqui e ganha (ou troca de) coleção. */
  aceitarCard(el, colecao, num) {
    el.addEventListener("dragover", (e) => {
      if (!e.dataTransfer?.types.includes(TIPO_CARD)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.addClass("cg-alvo");
    });
    el.addEventListener("dragleave", () => el.removeClass("cg-alvo"));
    el.addEventListener("drop", async (e) => {
      e.preventDefault();
      el.removeClass("cg-alvo");
      const caminho = e.dataTransfer?.getData(TIPO_CARD);
      if (!caminho) return;
      // so tira da origem quando a galeria esta filtrada por colecao (ver aoSoltarEmColecao)
      const f = this.plugin.cfg.filtro || {};
      const mudou = await this.plugin.moverParaColecao(caminho, colecao, f.tipo === "tag" ? f.valor : null);
      if (mudou) num.setText(String(Number(num.getText() || 0) + 1)); // resposta imediata
      this.agendarRender();
    });
  }

  render(preservar) {
    const c = this.contentEl;
    // Data can change while typing: leave the toolbar/input connected.
    if (preservar && c.querySelector(".cg-painel")) {
      this.atualizarResultados(true);
      this.sincronizarMetadata();
      const side = c.querySelector(".cg-side");
      if (side) {
        const temporario = document.createElement("div");
        this.barraLateral(temporario);
        side.replaceWith(temporario.firstElementChild);
      }
      void this.indexarBusca();
      return;
    }
    this.cancelarRestauracaoScroll();
    // guardado ANTES do empty(): depois o elemento antigo perde o scroll
    const antigo = c.querySelector(".cg-painel");
    const rolagem = preservar && antigo ? antigo.scrollTop : 0;
    const jaMostradas = preservar ? this.mostradas || 0 : 0;
    c.empty();
    this.grade = null; // controleTamanho roda antes da grade nova existir
    c.addClass("cg-view");
    if (this.plugin.cfg.sideAberta === false) c.addClass("cg-side-fechada");

    this.barraLateral(c);
    const painel = c.createDiv({ cls: "cg-painel" });

    const notas = this.notas();
    this.sincronizarMetadata();
    const topo = painel.createDiv({ cls: "cg-topo" });
    const btn = topo.createDiv({ cls: "cg-toggle", text: "☰" });
    btn.addEventListener("click", async () => {
      await this.plugin.salvar({ sideAberta: this.plugin.cfg.sideAberta === false });
      c.toggleClass("cg-side-fechada", this.plugin.cfg.sideAberta === false);
    });
    topo.createSpan({ cls: "cg-total", text: `${notas.length} clippings` });
    this.controleBusca(topo);
    this.controleOrdem(topo);
    this.controleModo(topo);

    this.controleTamanho(topo);
    this.botaoAdicionar(topo);

    this.renderResultados(painel, notas, jaMostradas, rolagem);
    if (termosDaBusca(this.busca).length) void this.indexarBusca();

    this.aceitarSolto(painel);
  }

  atualizarResultados(preservar = false) {
    const painel = this.contentEl.querySelector(".cg-painel");
    if (!painel || this._buscaFechada) return;
    const rolagem = preservar ? painel.scrollTop : 0;
    const mostradas = preservar ? this.mostradas || 0 : 0;
    this.cancelarRestauracaoScroll();
    this.grade?.remove(); this.sentinela?.remove(); this.vazioBusca?.remove();
    const notas = this.notas();
    this.contentEl.querySelector(".cg-total")?.setText(`${notas.length} clippings`);
    this.renderResultados(painel, notas, mostradas, rolagem);
    if (!preservar) painel.scrollTop = 0;
  }

  renderResultados(painel, notas, jaMostradas, rolagem) {
    const lista = this.plugin.cfg.modo === "lista";
    this.grade = painel.createDiv({ cls: lista ? "cg-lista" : "cg-masonry" });
    this.colunas = null;
    if (!lista) this.montarColunas();
    this.geracao = (this.geracao || 0) + 1;

    // Carrega em lotes conforme voce rola. Com tudo de uma vez eram 2638 <img>
    // no DOM: cada uma que chega muda a altura do card e obriga o `columns` a
    // reposicionar os 2652 itens — milhares de reflows.
    this.fila = notas;
    this.mostradas = 0;
    this.sentinela = painel.createDiv({ cls: "cg-sentinela" });
    this.observador?.disconnect();
    this.observador = new IntersectionObserver(
      (entradas) => {
        if (entradas.some((e) => e.isIntersecting)) this.maisUmLote();
      },
      // 600px de antecedencia: o lote seguinte chega antes de voce ver o fim
      { root: painel, rootMargin: "600px" }
    );
    this.observador.observe(this.sentinela);
    this.maisUmLote();
    // repoe os lotes que ja estavam abertos, senao a galeria volta pra 20 cards
    while (this.mostradas < jaMostradas && this.mostradas < this.fila.length) this.maisUmLote();
    // Repoe algumas vezes: no instante do render as <img> ainda nao tem altura,
    // entao o scrollHeight e menor e o navegador apara o valor (media: perdia
    // ~2100px). Se voce rolar pra cima nesse meio tempo, os timers sao cancelados.
    this.programarRestauracaoScroll(painel, rolagem);

    // o `columns` reajustava sozinho quando a janela mudava; colunas de verdade
    // precisam ser recontadas na mao
    this.medidor?.disconnect();
    if (!lista) {
      this.medidor = new ResizeObserver(() => this.montarColunas());
      this.medidor.observe(painel);
    }

    if (!notas.length) this.vazioBusca = painel.createDiv({cls: "cg-busca-vazia", text: "Nenhum clipping encontrado."});
  }

  /** Proximo lote no DOM. O observador chama de novo enquanto a sentinela
   *  continuar visivel, entao a primeira tela se preenche sozinha. */
  /** Primeiro card ainda visivel no painel. Serve de ancora pra rolagem: e o
   *  que voce esta olhando, entao e o que precisa continuar no lugar. */
  cardNoTopo(painel, cards) {
    if (!painel || !cards?.length) return null;
    const y = painel.getBoundingClientRect().top;
    return cards.find((el) => el.getBoundingClientRect().bottom > y) || null;
  }

  /** Coluna mais baixa no momento. E o que torna a rolagem estavel: o card novo
   *  entra numa coluna e os que ja estao la nao se mexem. */
  colunaMaisCurta() {
    return this.colunas.reduce((a, b) => (b.offsetHeight < a.offsetHeight ? b : a));
  }

  /**
   * Colunas como elementos, em vez do `columns` do CSS.
   *
   * O `columns` rebalanceia TODO o conteudo a cada item acrescentado: ao carregar
   * o lote seguinte, 13 dos 20 cards ja visiveis trocavam de lugar. Parecia que
   * a galeria estava repetindo preview la embaixo, mas era o mesmo card mudando
   * de coluna. Multi-coluna do CSS e incompativel com rolagem infinita.
   *
   * Devolve true se a quantidade de colunas mudou (so ai vale redistribuir).
   */
  montarColunas() {
    const larg = this.grade.clientWidth || 900;
    const col = parseFloat(getComputedStyle(this.contentEl).getPropertyValue("--cg-col")) || 300;
    const n = Math.max(1, Math.min(12, Math.floor((larg + ESPACO) / (col + ESPACO))));
    if (this.colunas && this.colunas.length === n) return false;

    const cards = this.colunas ? [...this.grade.querySelectorAll(".cg-card")] : [];
    const ordem = new Map((this.fila || []).map(({f}, i) => [f.path, i]));
    cards.sort((a, b) => (ordem.get(a.getAttribute("data-cg-path")) ?? Infinity) -
      (ordem.get(b.getAttribute("data-cg-path")) ?? Infinity));
    // Guarda em QUAL card voce estava, nao o scrollTop: com outra quantidade de
    // colunas a altura toda muda, entao o mesmo scrollTop cai em outro conteudo.
    const painel = this.grade.parentElement;
    const ancora = this.cardNoTopo(painel, cards);

    this.grade.empty();
    this.colunas = Array.from({ length: n }, () => this.grade.createDiv({ cls: "cg-coluna" }));
    // um appendChild por card forca layout a cada passo, mas so acontece quando
    // a largura muda de faixa — nunca durante a rolagem
    cards.forEach((el) => this.colunaMaisCurta().appendChild(el));

    // sem isto o grade.empty() acima zera a altura, o navegador prende o
    // scrollTop e voce volta pro topo — foi o que acontecia ao abrir o painel
    // dividido, que estreita a galeria e muda a contagem de colunas
    if (ancora && painel) {
      painel.scrollTop += ancora.getBoundingClientRect().top - painel.getBoundingClientRect().top;
    }
    return true;
  }

  maisUmLote() {
    if (!this.fila || this.mostradas >= this.fila.length) return;
    const lista = this.plugin.cfg.modo === "lista";
    const lote = this.fila.slice(this.mostradas, this.mostradas + LOTE_ROLAGEM);
    this.mostradas += lote.length;

    this.pendentes = [];
    for (const { f, fm } of lote) {
      if (lista) this.linha(this.grade, f, fm);
      else this.card(this.colunaMaisCurta(), f, fm);
    }
    this.prepararFotos(this.geracao); // sem await: nao segura a pintura

    if (this.mostradas >= this.fila.length) {
      this.observador?.disconnect();
      this.sentinela?.remove();
    }
  }

  /** "+" no topo, junto dos outros controles. O campo desce por baixo dele,
   *  em vez de empurrar a barra — assim a largura da barra nao muda ao abrir. */
  botaoAdicionar(topo) {
    const fab = topo.createDiv({ cls: "cg-fab" });
    const btn = fab.createDiv({ cls: "cg-fab-btn", attr: { "aria-label": "Adicionar link" } });
    setIcon(btn, "plus");
    const inp = fab.createEl("input", {
      cls: "cg-fab-input",
      attr: { type: "url", placeholder: "Cole um link ou arraste um pra grade", spellcheck: "false" },
    });

    const abrir = (sim) => {
      fab.toggleClass("cg-fab-aberto", sim);
      if (sim) inp.focus();
      else inp.value = "";
    };
    btn.addEventListener("click", () => abrir(!fab.hasClass("cg-fab-aberto")));
    inp.addEventListener("keydown", async (e) => {
      if (e.key === "Escape") return abrir(false);
      if (e.key !== "Enter" || !inp.value.trim()) return;
      const url = inp.value.trim();
      inp.value = "";
      abrir(false);
      await this.plugin.adicionarLink(url);
    });
    // clicar fora fecha, senao a caixa fica aberta atras do conteudo
    this.registerDomEvent(document, "click", (e) => {
      if (fab.hasClass("cg-fab-aberto") && !fab.contains(e.target)) abrir(false);
    });
  }

  /** Arrastar um link de qualquer lugar pra cima da galeria. */
  aceitarSolto(painel) {
    painel.addEventListener("dragover", (e) => {
      if (e.dataTransfer?.types.includes(TIPO_CARD)) return; // card vai pra barra, nao pra ca
      e.preventDefault();
      painel.addClass("cg-soltar");
    });
    painel.addEventListener("dragleave", () => painel.removeClass("cg-soltar"));
    painel.addEventListener("drop", async (e) => {
      e.preventDefault();
      painel.removeClass("cg-soltar");
      const dt = e.dataTransfer;
      // uri-list e o formato de arrastar link; text/plain e o fallback do Safari
      const bruto = dt?.getData("text/uri-list") || dt?.getData("text/plain") || "";
      const url = bruto.split("\n").find((l) => /^https?:\/\//i.test(l.trim()));
      if (url) await this.plugin.adicionarLink(url);
    });
  }

  controleBusca(topo) {
    const inp = topo.createEl("input", {
      cls: "cg-busca",
      attr: { type: "search", placeholder: "Buscar nas notas…", "aria-label": "Buscar nas notas", value: this.busca || "" },
    });
    inp.addEventListener("input", () => {
      this.busca = inp.value;
      clearTimeout(this.tb);
      this.tb = setTimeout(() => {
        this.atualizarResultados();
        if (termosDaBusca(this.busca).length) void this.indexarBusca();
        else this.statusBusca?.setText("");
      }, 180);
    });
    this.statusBusca = topo.createSpan({cls: "cg-busca-status", attr: {role: "status", "aria-live": "polite"}});
  }

  controleOrdem(topo) {
    const sel = topo.createEl("select", { cls: "cg-ordem dropdown" });
    for (const [v, txt] of [["recente", "Adicionados recentemente"], ["antigo", "Adicionados há mais tempo"], ["az", "A–Z"]]) {
      sel.createEl("option", { value: v, text: txt });
    }
    sel.value = this.plugin.cfg.ordem || "recente";
    sel.addEventListener("change", async () => {
      await this.plugin.salvar({ ordem: sel.value });
      this.render();
    });
  }

  /** Grade x lista. Um botao so: com dois estados, dois botoes seria so ruido. */
  controleModo(topo) {
    const lista = this.plugin.cfg.modo === "lista";
    const b = topo.createDiv({
      cls: "cg-toggle",
      attr: { "aria-label": lista ? "Ver em grade" : "Ver em lista" },
    });
    // mostra o icone do modo que o clique leva, nao o do modo atual
    setIcon(b, lista ? "layout-grid" : "list");
    b.addEventListener("click", async () => {
      await this.plugin.salvar({ modo: lista ? "grade" : "lista" });
      this.render();
    });
  }

  /** Tamanho do item. Na grade e a largura da coluna; na lista e a altura da
   *  linha (a capa deriva dela por aspect-ratio). Mexe so numa CSS var, entao
   *  arrastar o slider nao re-renderiza os cards — o layout reflui sozinho.
   *  Cada modo guarda o seu valor: as unidades nao sao comparaveis. */
  controleTamanho(topo) {
    const conf =
      this.plugin.cfg.modo === "lista"
        ? { chave: "linha", varCss: "--cg-linha", min: 120, max: 340, passo: 10 }
        : { chave: "coluna", varCss: "--cg-col", min: 180, max: 560, passo: 20 };
    const valor = this.plugin.cfg[conf.chave];

    // na grade o slider decide quantas colunas cabem, entao remonta quando muda
    const aplicar = (px) => {
      this.contentEl.style.setProperty(conf.varCss, `${px}px`);
      if (this.plugin.cfg.modo !== "lista" && this.grade) this.montarColunas();
    };
    aplicar(valor);

    const cx = topo.createDiv({ cls: "cg-ctrl" });
    cx.createSpan({ cls: "cg-ctrl-icone", text: "▪" });
    const range = cx.createEl("input", {
      cls: "cg-range",
      attr: { type: "range", min: conf.min, max: conf.max, step: conf.passo, value: valor },
    });
    cx.createSpan({ cls: "cg-ctrl-icone cg-grande", text: "▪" });

    range.addEventListener("input", () => aplicar(+range.value));
    // salva so no fim do arrasto, senao seriam dezenas de escritas em data.json
    range.addEventListener("change", () => this.plugin.salvar({ [conf.chave]: +range.value }));
  }

  /** Clique simples abre a ficha (overlay); Cmd/Ctrl-clique vai direto pra nota,
   *  que era o comportamento antigo — quem quer editar nao quer o overlay no meio. */
  abrirAoClicar(el, file, fm) {
    el.addEventListener("click", (e) => {
      if (e.target.closest(".cg-seta, .cg-acao, .cg-play")) return; // navegam/favoritam/apagam/tocam, nao abrem
      if (e.metaKey || e.ctrlKey) {
        this.app.workspace.getLeaf("tab").openFile(file);
        return;
      }
      new FichaModal(this, file, fm).open();
    });
  }

  /** Acoes do overlay: aparecem no hover. Ficam no card (nao na moldura)
   *  porque nota sem imagem nao tem moldura. */
  acoes(card, file, fm) {
    const barra = card.createDiv({ cls: "cg-acoes" });

    const est = barra.createDiv({ cls: "cg-acao cg-estrela", attr: { "aria-label": "Favoritar" } });
    est.appendChild(svgIcone(ICONE_ESTRELA));
    const pintar = (fav) => est.toggleClass("cg-fav", fav);
    pintar([].concat(fm.tags || []).map(String).includes(FAVORITO));
    est.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation(); // senao abre a nota junto
      pintar(await this.plugin.favoritar(file.path));
    });

    // sem source nao ha o que copiar: botao que nao faz nada e pior que botao ausente
    const url = normalizarSource(fm.source);
    if (url) {
      const cop = barra.createDiv({ cls: "cg-acao cg-copiar", attr: { "aria-label": "Copiar link" } });
      cop.appendChild(svgIcone(ICONE_LINK));
      cop.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation(); // senao abre a ficha junto
        try {
          await navigator.clipboard.writeText(url);
          // troca o icone por um check no lugar de abrir Notice: a confirmacao
          // aparece onde voce clicou, e copiar varios links seguidos nao vira
          // uma pilha de avisos no canto da tela
          cop.empty();
          cop.appendChild(svgIcone(ICONE_CHECK));
          cop.addClass("cg-copiado");
          setTimeout(() => {
            cop.empty();
            cop.appendChild(svgIcone(ICONE_LINK));
            cop.removeClass("cg-copiado");
          }, 1200);
        } catch {
          new Notice("Nao consegui copiar o link.", 4000);
        }
      });
    }

    const del = barra.createDiv({ cls: "cg-acao cg-apagar", attr: { "aria-label": "Apagar nota" } });
    del.appendChild(svgIcone(ICONE_LIXEIRA));
    del.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();
      await this.plugin.apagarNota(file);
    });
  }

  /** Arrastar o card ate uma colecao da barra. */
  tornarArrastavel(el, file) {
    el.setAttr("draggable", "true");
    el.addEventListener("dragstart", (e) => {
      e.dataTransfer.setData(TIPO_CARD, file.path);
      e.dataTransfer.effectAllowed = "move";
      el.addClass("cg-arrastando");
    });
    el.addEventListener("dragend", () => el.removeClass("cg-arrastando"));
  }

  /** Play sobre a capa, so onde o link toca dentro do Obsidian. Fica na moldura
   *  (nao no card) pra centralizar na imagem e sumir junto com ela. */
  play(moldura, fm) {
    if (!TOCAVEL.test(normalizarSource(fm.source))) return;
    const bt = moldura.createDiv({ cls: "cg-play", attr: { "aria-label": "Assistir ao lado" } });
    bt.appendChild(svgIcone(ICONE_PLAY));
    bt.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      abrirNoWebViewer(this.app, normalizarSource(fm.source));
    });
  }

  card(grade, file, fm) {
    const card = grade.createDiv({ cls: "cg-card", attr: {"data-cg-path": file.path} });
    this.abrirAoClicar(card, file, fm);
    this.tornarArrastavel(card, file);
    this.acoes(card, file, fm);

    const capa = capaDe(this.app, fm);
    if (capa) {
      const moldura = card.createDiv({ cls: "cg-moldura" });
      const img = moldura.createEl("img", { cls: "cg-foto", attr: { src: capa, loading: "lazy" } });
      const setCapa = capaComRetentativa(img, moldura, capa);
      this.play(moldura, fm);
      // a lista final depende de ler o corpo da nota: fica pra depois da 1a pintura
      this.pendentes.push({ moldura, img, file, capa, setCapa });
    } else {
      // sem og:image e sem imagem no corpo (site nao publica nenhuma).
      // Sem isso o texto fica solto no meio do masonry, parecendo card quebrado.
      card.addClass("cg-so-texto");
      card.createDiv({ cls: "cg-marca", text: (fm.title || file.basename).slice(0, 2).toUpperCase() });
    }

    // so uma linha de texto: o title do clipper quase sempre repete a description
    const leg = card.createDiv({ cls: "cg-legenda" });
    const visivel = fm.description || fm.title || file.basename;
    this.destacarBusca(leg.createDiv({ cls: "cg-desc" }), visivel);
    this.trechoBusca(leg, file, fm, visivel);
  }

  /** Modo lista, no formato do obsidian-link-cards: miniatura a esquerda, titulo,
   *  descricao e a fonte no rodape. Aqui cabe titulo E descricao — no card do
   *  masonry nao cabia, por isso la so entra uma linha. */
  linha(lista, file, fm) {
    const row = lista.createDiv({ cls: "cg-linha" });
    this.abrirAoClicar(row, file, fm);
    this.tornarArrastavel(row, file);
    this.acoes(row, file, fm);

    // `cg-moldura` de proposito: assim o carrossel e a promocao do GIF valem aqui
    // tambem, sem duplicar nada — a lista so muda o enquadramento.
    const moldura = row.createDiv({ cls: "cg-moldura cg-linha-capa" });
    const capa = capaDe(this.app, fm);
    if (capa) {
      const img = moldura.createEl("img", {
        cls: "cg-foto",
        attr: { src: capa, loading: "lazy" },
      });
      const setCapa = capaComRetentativa(img, moldura, capa);
      this.play(moldura, fm);
      this.pendentes.push({ moldura, img, file, capa, setCapa });
    } else {
      moldura.addClass("cg-so-texto");
      moldura.createDiv({
        cls: "cg-marca",
        text: (fm.title || file.basename).slice(0, 2).toUpperCase(),
      });
    }

    const titulo = fm.title || file.basename;
    const txt = row.createDiv({ cls: "cg-linha-txt" });
    this.destacarBusca(txt.createDiv({ cls: "cg-linha-titulo" }), titulo);
    const resto = restoDaDescricao(titulo, fm.description);
    if (resto) this.destacarBusca(txt.createDiv({ cls: "cg-linha-desc" }), resto);
    this.trechoBusca(txt, file, fm, `${titulo} ${resto || ""}`);

    const pe = txt.createDiv({ cls: "cg-linha-pe" });
    pe.appendChild(logoFonte(dominio(fm.source)));
    pe.createSpan({ text: hostDe(fm.source) || "sem fonte" });
  }

  /** GIF na frente: quando a nota tem um, ele quase sempre e o demo do projeto —
   *  vale mais que o og:image estatico. Sem GIF, a ordem nao muda. */
  async fotosDe(file, capa) {
    const corpo = (await this.plugin.imagensDe(file)) || [];
    const todas = [...new Set([capa, ...corpo])].filter(Boolean);
    const gifs = todas.filter((u) => EH_GIF.test(u));
    return gifs.length ? [...gifs, ...todas.filter((u) => !EH_GIF.test(u))] : todas;
  }

  /** Roda depois da 1a pintura: le o corpo das notas, promove o GIF a capa e
   *  monta o carrossel. Fora do render pra galeria nao demorar a aparecer. */
  async prepararFotos(geracao) {
    const fila = this.pendentes;
    this.pendentes = [];
    for (const p of fila) {
      if (geracao !== this.geracao) return; // render novo em andamento
      const fotos = await this.fotosDe(p.file, p.capa);
      const imagensDoCache = this.plugin.imgs?.get(p.file.path);
      if (imagensDoCache) {
        this.lembrarMetadata(p.file, this.app.metadataCache.getFileCache(p.file), imagensDoCache);
      }
      const setCapa = p.setCapa || ((src) => { p.img.src = src; });
      if (fotos[0] !== p.capa) setCapa(fotos[0]);
      if (fotos.length > 1) this.carrossel(p.moldura, p.img, fotos, setCapa);
    }
  }

  carrossel(moldura, img, fotos, setCapa) {
    const escolher = setCapa || ((src) => { img.src = src; });
    let i = 0;
    const cont = moldura.createDiv({ cls: "cg-contador", text: `1/${fotos.length}` });
    for (const [d, txt] of [[-1, "‹"], [1, "›"]]) {
      const b = moldura.createDiv({ cls: `cg-seta cg-${d < 0 ? "prev" : "next"}`, text: txt });
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        i = (i + d + fotos.length) % fotos.length;
        escolher(fotos[i]);
        cont.setText(`${i + 1}/${fotos.length}`);
      });
    }
  }
}

/**
 * Servidor local que recebe os bookmarks do X vindos da extensao.
 *
 * Por que existe: a extensao gravava cada nota via `obsidian://new`. O macOS
 * ativa o app a cada URI despachada, entao 2.360 notas = 2.360 vezes o Obsidian
 * roubando o foco — impossivel usar o computador enquanto sincroniza. Aqui a
 * extensao manda tudo num POST e o plugin escreve com a API do vault: nenhuma
 * ativacao, e o progresso aparece dentro do Obsidian.
 */


/**
 * So paginas de extensao podem usar CORS na ponte. A ausencia de Origin e
 * reservada para clientes CLI, que ainda precisam do Bearer token; nao e uma
 * forma de pular a autenticacao.
 */
function origemPermitida(origin) {
  if (typeof origin !== "string" || !origin) return false;
  try {
    const u = new URL(origin);
    if (!u.hostname || (u.pathname !== "" && u.pathname !== "/") || u.search || u.hash) return false;
    return u.protocol === "chrome-extension:" || u.protocol === "moz-extension:";
  } catch {
    return false;
  }
}

const PROTOCOLO_PONTE = 1;
const MAX_CORPO_PONTE = 80 * 1024 * 1024;
const MAX_CONTEUDO_CLIP = 16 * 1024 * 1024;
const MAX_BOOKMARKS = 10000;

function tokenValido(recebido, esperado) {
  if (typeof recebido !== "string" || typeof esperado !== "string" || !recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Caminhos da ponte sao relativos ao vault e nunca podem apontar para config. */
function caminhoPonteValido(bruto) {
  if (typeof bruto !== "string") return false;
  const caminho = bruto.trim().replace(/\/+$/, "");
  if (!caminho || caminho.length > 240 || caminho.startsWith("/") || caminho.includes("\\") || /[\0\r\n]/.test(caminho)) {
    return false;
  }
  const partes = caminho.split("/");
  return partes.every((parte) => {
    if (!parte || parte === "." || parte === ".." || parte.startsWith(".")) return false;
    if (/^data\.json$/i.test(parte) || /^\.obsidian$/i.test(parte) || /^\.trash$/i.test(parte)) return false;
    return !/[\0\r\n]/.test(parte);
  });
}

function nomePonteValido(nome) {
  if (typeof nome !== "string") return false;
  const s = nome.trim();
  return !!s && s.length <= 180 && s !== "." && s !== ".." && !s.startsWith(".") &&
    !/[\\/:*?"<>|#\[\]\0\r\n]/.test(s);
}

function pastaSegura(bruto, fallback) {
  const pasta = bruto === undefined || bruto === null || bruto === "" ? fallback : bruto;
  if (!caminhoPonteValido(pasta)) throw new Error("pasta invalida");
  return String(pasta).trim().replace(/\/+$/, "");
}

function fontesDoYaml(conteudo) {
  const texto = String(conteudo || "");
  const fm = texto.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\s|$)/);
  if (!fm) return [];
  const linhas = fm[1].split(/\r?\n/);
  const indice = linhas.findIndex((linha) => /^\s*source\s*:/.test(linha));
  if (indice < 0) return [];
  let valor = linhas[indice].replace(/^\s*source\s*:\s*/, "").trim();
  const valores = [];
  if (!valor) {
    for (let i = indice + 1; i < linhas.length; i++) {
      const item = linhas[i].match(/^\s*-\s*(.*?)\s*$/);
      if (!item) break;
      valores.push(item[1]);
    }
  } else if (valor.startsWith("[") && valor.endsWith("]")) {
    try {
      const parsed = JSON.parse(valor);
      if (Array.isArray(parsed)) valores.push(...parsed);
    } catch {
      valores.push(...valor.slice(1, -1).split(","));
    }
  } else {
    valores.push(valor);
  }
  return valores.map((v) => {
    let item = String(v || "").trim();
    if ((item.startsWith('"') && item.endsWith('"')) || (item.startsWith("'") && item.endsWith("'"))) item = item.slice(1, -1);
    if (item.startsWith("<") && item.endsWith(">")) item = item.slice(1, -1);
    return normalizarSource(item);
  }).filter(Boolean);
}

function fonteDoYaml(conteudo) {
  return fontesDoYaml(conteudo)[0] || "";
}

function fontesDoFrontmatter(source) {
  const valores = Array.isArray(source) ? source : [source];
  return valores.map((v) => normalizarSource(v)).filter(Boolean);
}

/**
 * Abre no navegador padrao do sistema.
 *
 * window.open nao serve: com o Web Viewer ligado (openExternalURLs: true, que e
 * o padrao) o Obsidian intercepta e abre numa aba dele mesmo. shell.openExternal
 * entrega pro SO. No mobile nao existe electron, dai o window.open de reserva.
 */
function abrirNoNavegador(url) {
  try {
    require("electron").shell.openExternal(url);
  } catch {
    window.open(url, "_blank");
  }
}

/**
 * Abre o link num Web Viewer ao lado da galeria, em vez de mandar pro SO.
 *
 * O oposto do abrirNoNavegador de proposito: aquele existe porque o Obsidian
 * sequestrava links que voce queria ver no navegador de verdade. Aqui e o
 * contrario — reel publico toca no <webview> sem login, entao assistir sem
 * trocar de app e o comportamento melhor.
 *
 * O painel e reaproveitado: assistir 20 reels seguidos abrindo 20 abas
 * transformaria a janela num acordeao.
 */
/**
 * Deixa o reel assistivel: fecha o "Cadastre-se no Instagram" que cobre o video
 * e liga o som, que o Instagram sempre inicia mutado.
 *
 * Modal: o X e o unico <svg> dentro do [role="dialog"] — e nele que miramos, nao
 * no aria-label, que vem traduzido ("Fechar" / "Close") e mudaria com o idioma.
 * Clicar no proprio X (em vez de arrancar o no) deixa o Instagram desfazer o
 * scroll-lock que ele poe no body; o remove() e so plano B.
 *
 * Som: mexer no `video.muted` direto, e nao no botao de som da pagina. O botao
 * alterna — se um dia o Instagram lembrar a preferencia e ja abrir com audio,
 * clicar mutaria. Alem disso o label dele tambem e traduzido. Testado: o
 * Instagram nao remuta depois, e o video segue tocando (a politica de autoplay
 * do webview nao pausa).
 *
 * ponytail: polling curto no lugar de MutationObserver. O modal aparece ~1s
 * depois do load e o webview e outro processo — observer exigiria injetar e
 * manter um listener la dentro pra economizar uns pings.
 */
const PREPARA = (modal, som) => `(() => {
  const r = { modal: false, som: false };
  if (${modal}) {
    const d = document.querySelector('[role="dialog"]');
    if (d) {
      const svg = d.querySelector("svg");
      const x = svg && (svg.closest('[role="button"]') || svg.parentElement);
      if (x) x.click(); else { d.remove(); document.body.style.overflow = ""; }
      r.modal = true;
    }
  }
  if (${som}) {
    const v = document.querySelector("video");
    if (v) { v.muted = false; v.volume = 1; r.som = true; }
  }
  return r;
})()`;

async function prepararInstagram(leaf) {
  // cada coisa e feita uma vez so: religar o som a cada ping brigaria com voce
  // se resolvesse mutar o video na mao
  let modal = false;
  let som = false;
  for (let i = 0; i < 16 && !(modal && som); i++) {
    await new Promise((r) => setTimeout(r, 800));
    const wv = leaf.view && leaf.view.webview;
    // aba trocada de pagina ou fechada no meio: nao ha mais o que preparar
    if (!wv || !leaf.view.url || !/instagram\.com/i.test(leaf.view.url)) return;
    try {
      const r = await wv.executeJavaScript(PREPARA(!modal, !som));
      modal = modal || r.modal;
      som = som || r.som;
    } catch {
      // navegando ou ainda sem contexto: tenta de novo no proximo ping
    }
  }
}

let painelVideo = null;

function abrirNoWebViewer(app, url) {
  // "ainda esta na janela?" e nao "ja e um webviewer?": setViewState leva um
  // tick pra trocar o tipo da view, e nesse intervalo getLeavesOfType nao acha o
  // painel recem-criado — dois plays seguidos abririam dois paineis.
  let vivo = false;
  if (painelVideo) app.workspace.iterateAllLeaves((l) => { if (l === painelVideo) vivo = true; });
  const leaf = vivo ? painelVideo : app.workspace.getLeaf("split", "vertical");
  painelVideo = leaf;
  // navigate: true e o que faz um webview ja aberto trocar de pagina; sem ele o
  // setViewState guarda a url e a aba fica onde estava.
  leaf.setViewState({ type: "webviewer", state: { url, navigate: true }, active: true });
  app.workspace.revealLeaf(leaf);
  if (/instagram\.com/i.test(url)) prepararInstagram(leaf);
}

/**
 * Marca a capa como quebrada — mas so depois de tentar de novo.
 *
 * O opengraph.githubassets.com devolve 429 quando a galeria pede muitas imagens
 * de uma vez: medi 50 de 100 capas do GitHub falhando na primeira tentativa, e
 * as MESMAS URLs respondendo 200 quando pedidas isoladas. Erro de taxa e
 * temporario, entao desistir na primeira falha e desistir cedo demais.
 *
 * Espera com jitter: sem ele as 50 que falharam juntas voltariam juntas e
 * tomariam 429 de novo.
 */
function capaComRetentativa(img, moldura, url, tentativas = 4) {
  let n = 0;
  let selecionada = String(url || "");
  let timer = null;
  const fonteDaImagem = () => String(img.getAttribute?.("src") || img.src || selecionada || "");
  const mesmaFonte = (a, b) => {
    const semCache = (s) => String(s || "").replace(/[?&]cgr=\d+$/, "");
    return semCache(a) === semCache(b);
  };
  const cancelarTimer = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  const escolher = (nova) => {
    cancelarTimer();
    selecionada = String(nova || "");
    n = 0;
    moldura.removeClass?.("cg-quebrada");
    img.src = selecionada;
  };
  img.addEventListener("load", () => {
    cancelarTimer();
    n = 0;
  });
  img.addEventListener("error", () => {
    const atual = fonteDaImagem();
    // O carrossel pode ter mudado de imagem enquanto o timer da anterior estava
    // esperando. A URL atual e a fonte da nova tentativa, nunca a capa inicial.
    if (atual && !mesmaFonte(atual, selecionada)) {
      selecionada = atual;
      n = 0;
    }
    if (n >= tentativas) return moldura.addClass("cg-quebrada");
    // 800ms dobrando: com 400ms a segunda tentativa caia dentro da mesma janela
    // de limite e tomava 429 de novo (recuperava 79 de 100 em vez de 97)
    const espera = 800 * Math.pow(2, n) + Math.random() * 800;
    const tentativa = ++n;
    const alvo = selecionada;
    timer = setTimeout(() => {
      timer = null;
      // A pessoa pode ter trocado o card, ou o render pode ter removido a
      // imagem, enquanto o timer estava pendente. Nao ressuscite a tentativa.
      if (img.isConnected === false || !mesmaFonte(fonteDaImagem(), alvo)) return;
      img.src = `${alvo}${alvo.includes("?") ? "&" : "?"}cgr=${tentativa}`;
    }, espera);
  });
  return escolher;
}

/** Nome estavel pro arquivo da capa: mesma URL sempre da o mesmo nome, entao
 *  rodar a baixa duas vezes nao duplica arquivo. djb2 pra nao importar crypto. */
function nomeDeCapa(url, ext) {
  const s = String(url || "");
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `${h.toString(36)}${s.length.toString(36)}.${ext}`;
}

/** Extensao a partir da URL. Serve so pro nome do arquivo — o que decide o
 *  formato de verdade e o byte, mas o Obsidian precisa da extensao pra exibir. */
function extDaUrl(url) {
  const m = String(url || "").split("?")[0].match(/\.(jpe?g|png|gif|webp|avif)$/i);
  return m ? m[1].toLowerCase().replace("jpeg", "jpg") : "jpg";
}

/** Capa a exibir: a copia local quando existe, senao a URL do CDN.
 *  Um lugar so — card, linha e ficha passam por aqui. */
function capaDe(app, fm) {
  const t = fm && fm.thumb ? String(fm.thumb) : "";
  if (t && app.vault.getAbstractFileByPath(t)) return app.vault.adapter.getResourcePath(t);
  return (fm && fm.image) || "";
}

function sanitizar(nome) {
  return String(nome || "")
    .replace(/[\\/:*?"<>|#^[\]]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

/**
 * Overlay do clique no card: capa grande a esquerda, ficha a direita.
 * Antes o clique abria a nota numa aba nova — ver uma imagem virava trocar de
 * contexto e depois voltar. Aqui da pra olhar e fechar com Esc.
 *
 * Modal do Obsidian de proposito: backdrop, Esc e clique-fora ja vem prontos e
 * ficam consistentes com o resto do app. Um overlay proprio seria reimplementar
 * os tres — e o foco/scroll-lock, que sao os que ninguem lembra de fazer.
 */
class FichaModal extends Modal {
  constructor(view, file, fm) {
    super(view.app);
    this.view = view;
    this.file = file;
    this.fm = fm || {};
  }

  onOpen() {
    const { contentEl, modalEl } = this;
    modalEl.addClass("cg-ficha-modal");
    this.containerEl.addClass("cg-ficha-caixa");
    contentEl.empty();

    const fm = this.fm;
    const titulo = fm.title || this.file.basename;
    // sem X proprio: o Modal ja desenha o dele (.modal-header-button) no canto
    const capa = contentEl.createDiv({ cls: "cg-ficha-capa" });
    const urlCapa = capaDe(this.app, fm);
    if (urlCapa) {
      const img = capa.createEl("img", { attr: { src: urlCapa } });
      // capa quebrada aqui apareceria como area vazia enorme, nao como card torto
      img.addEventListener("error", () => {
        img.remove();
        capa.createDiv({ cls: "cg-marca", text: titulo.slice(0, 2).toUpperCase() });
      });
    } else {
      capa.createDiv({ cls: "cg-marca", text: titulo.slice(0, 2).toUpperCase() });
    }

    const lado = contentEl.createDiv({ cls: "cg-ficha-lado" });
    lado.createDiv({ cls: "cg-ficha-titulo", text: titulo });

    const meta = lado.createDiv({ cls: "cg-ficha-meta" });
    meta.appendChild(logoFonte(dominio(fm.source)));
    meta.createSpan({ text: hostDe(fm.source) || "sem fonte" });
    if (fm.created) meta.createSpan({ cls: "cg-ficha-data", text: String(fm.created).slice(0, 10) });

    // a URL inteira, clicavel: o botao "Abrir original" abre igual, mas nao deixa
    // ver PARA ONDE vai. Aqui da pra ler o destino antes de clicar.
    if (fm.source) {
      const url = normalizarSource(fm.source);
      const a = lado.createEl("a", { cls: "cg-ficha-url", text: url, href: url });
      a.setAttrs({ target: "_blank", rel: "noopener" });
      // handler explicito: <a href> sozinho nao abriu nada aqui (o clique nem
      // passou por window.open)
      a.addEventListener("click", (e) => {
        e.preventDefault();
        abrirNoNavegador(url);
      });
    }

    const desc = restoDaDescricao(titulo, fm.description) || fm.description;
    if (desc) lado.createDiv({ cls: "cg-ficha-desc", text: desc });

    // tags menos "clippings": ela esta em todas, entao nao informa nada
    const cols = [].concat(fm.tags || []).map(String).filter((t) => t && t !== "clippings");
    if (cols.length) {
      const chips = lado.createDiv({ cls: "cg-ficha-chips" });
      cols.forEach((t) => chips.createSpan({ cls: "cg-chip", text: t }));
    }

    const botoes = lado.createDiv({ cls: "cg-ficha-botoes" });
    const bt = (txt, cls, fn) => {
      const b = botoes.createEl("button", { cls: `cg-ficha-bt ${cls || ""}`, text: txt });
      b.addEventListener("click", fn);
      return b;
    };

    const fav = bt("", "cg-ficha-fav", async () => {
      const agora = await this.view.plugin.favoritar(this.file.path);
      fav.toggleClass("cg-fav", agora);
      fav.setText(agora ? "Favoritado" : "Favoritar");
    });
    const jaFav = cols.includes(FAVORITO);
    fav.toggleClass("cg-fav", jaFav);
    fav.setText(jaFav ? "Favoritado" : "Favoritar");

    bt("Abrir nota", "", () => {
      this.close();
      this.app.workspace.getLeaf("tab").openFile(this.file);
    });
    if (fm.source) bt("Abrir original", "", () => abrirNoNavegador(normalizarSource(fm.source)));
    bt("Apagar", "cg-ficha-apagar", async () => {
      this.close();
      await this.view.plugin.apagarNota(this.file);
    });
  }

  onClose() {
    this.contentEl.empty();
  }
}

class Receptor {
  constructor(plugin) {
    this.plugin = plugin;
    this.servidor = null;
    this.porta = null;
    // Requests that write the vault share one queue. Without it, two tabs
    // syncing at once can both observe the same source before either creates it.
    this.fila = Promise.resolve();
  }

  iniciar() {
    if (this.servidor) return;
    const porta = Number(this.plugin.cfg.porta) || PADRAO.porta;
    this.porta = porta;
    const servidor = http.createServer((req, res) => this.tratar(req, res));
    this.servidor = servidor;
    servidor.on("error", (e) => {
      // Keep the plugin alive when another process already owns the port. The
      // old handler referenced an undefined PORTA and raised a second error.
      console.error("clippings-gallery: nao consegui abrir a porta", porta, e.message);
      if (this.servidor === servidor) this.servidor = null;
    });
    // 127.0.0.1 explicito: nao queremos isso exposto na rede
    servidor.listen(porta, "127.0.0.1");
  }

  parar() {
    if (!this.servidor) return;
    this.servidor.close();
    this.servidor = null;
  }

  responder(res, status, corpo, origin) {
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      Vary: "Origin",
    };
    // Never use `*`: it would make authenticated responses readable by any
    // website. Originless CLI clients simply do not need this header.
    if (origemPermitida(origin)) headers["Access-Control-Allow-Origin"] = origin;
    if (!res.writableEnded) {
      res.writeHead(status, headers);
      res.end(status === 204 ? "" : JSON.stringify(corpo));
    }
  }

  autorizado(req) {
    const cabecalho = req.headers.authorization;
    const m = typeof cabecalho === "string" ? cabecalho.match(/^Bearer\s+(.+)$/i) : null;
    return !!m && tokenValido(m[1], this.plugin.cfg.ponteToken);
  }

  tratar(req, res) {
    const origin = req.headers.origin;

    if (req.method === "OPTIONS") {
      if (origin !== undefined && !origemPermitida(origin)) {
        return this.responder(res, 403, { erro: "origem nao permitida" }, origin);
      }
      // Browsers do not send Authorization on preflight. The actual request
      // remains protected by autorizado() below.
      return this.responder(res, 204, {}, origin);
    }

    // An Origin is mandatory for browser calls, while originless requests are
    // intentionally supported for local CLI clients. Neither path bypasses
    // Bearer authentication.
    if (origin !== undefined && !origemPermitida(origin)) {
      return this.responder(res, 403, { erro: "origem nao permitida" }, origin);
    }
    if (!this.autorizado(req)) return this.responder(res, 401, { erro: "nao autorizado" }, origin);

    let url;
    try {
      url = new URL(req.url || "/", "http://127.0.0.1");
    } catch {
      return this.responder(res, 400, { erro: "url invalida" }, origin);
    }

    if (req.method === "GET" && url.pathname === "/ping") {
      return this.responder(res, 200, {
        ok: true,
        plugin: "clippings-gallery",
        protocol: PROTOCOLO_PONTE,
        version: PROTOCOLO_PONTE,
      }, origin);
    }

    // a extensao pergunta ANTES de clipar: clipping normal nao passa pela ponte,
    // entao sem isto ele cria nota repetida sem ninguem perceber.
    if (req.method === "GET" && url.pathname === "/tem") {
      const alvo = normalizarSource(url.searchParams.get("url"));
      const achada = alvo && this.plugin.notaComSource(alvo);
      return this.responder(res, 200, { existe: !!achada, caminho: achada ? achada.path : null }, origin);
    }

    // Clip avulso. Pela URI `obsidian://` o macOS ATIVA o Obsidian e abre a
    // nota, tirando voce da pagina que estava lendo. Por aqui a nota e escrita
    // pela API do vault, sem ativar janela nenhuma — mesmo motivo do
    // /x-bookmarks, que existia so pro lote.
    if (req.method === "POST" && url.pathname === "/clip") {
      return this.lerCorpo(req, res, origin, MAX_CONTEUDO_CLIP, async (d) => this.gravarClip(d));
    }

    if (req.method !== "POST" || url.pathname !== "/x-bookmarks") {
      return this.responder(res, 404, { erro: "rota desconhecida" }, origin);
    }

    return this.lerCorpo(req, res, origin, MAX_CORPO_PONTE, (d) => {
      if (!d || typeof d !== "object" || Array.isArray(d) || !Array.isArray(d.bookmarks)) {
        throw new Error("bookmarks invalido");
      }
      if (d.bookmarks.length > MAX_BOOKMARKS) throw new Error("bookmarks demais");
      return this.gravar(d.bookmarks, d.pasta === undefined ? this.plugin.cfg.pastaBookmarks : d.pasta);
    });
  }

  /** Le o corpo do POST e responde com limite e JSON/schema validos. */
  lerCorpo(req, res, origin, limite, fn) {
    let corpo = "";
    let excedeu = false;
    // Decode at the stream boundary. Decoding each Buffer chunk independently
    // can replace a UTF-8 emoji when its bytes straddle two TCP packets.
    req.setEncoding("utf8");
    req.on("data", (c) => {
      if (excedeu) return;
      corpo += c;
      if (Buffer.byteLength(corpo) > limite) {
        excedeu = true;
        this.responder(res, 413, { erro: "corpo grande demais" }, origin);
        // Keep draining without buffering so the client receives the 413 response.
      }
    });
    req.on("end", async () => {
      if (excedeu || res.writableEnded) return;
      try {
        const d = JSON.parse(corpo);
        this.responder(res, 200, await fn(d), origin);
      } catch (e) {
        this.responder(res, 400, { erro: String(e && e.message || "corpo invalido") }, origin);
      }
    });
  }

  encadear(fn) {
    const tarefa = this.fila.then(fn, fn);
    this.fila = tarefa.catch(() => {});
    return tarefa;
  }

  /** Grava a nota de um clip. Dedup por source, igual ao resto da galeria. */
  gravarClip(payload) {
    return this.encadear(() => this._gravarClip(payload));
  }

  async notaComSource(source) {
    const direto = this.plugin.notaComSource(source);
    if (direto) return direto;
    const vault = this.plugin.app.vault;
    for (const f of vault.getMarkdownFiles()) {
      const naGaleria = this.plugin.pastas.some((p) => f.path.startsWith(p));
      if (!naGaleria) continue;
      const fm = this.plugin.app.metadataCache.getFileCache(f)?.frontmatter || {};
      if (fontesDoFrontmatter(fm.source).includes(source)) return f;
      if (!fm.source && typeof vault.cachedRead === "function") {
        if (fontesDoYaml(await vault.cachedRead(f).catch(() => "")).includes(source)) return f;
      }
    }
    return null;
  }

  async _gravarClip(payload) {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new Error("clip invalido");
    const { conteudo, nome, pasta } = payload;
    if (typeof conteudo !== "string" || !conteudo.trim()) throw new Error("sem conteudo");
    if (Buffer.byteLength(conteudo) > MAX_CONTEUDO_CLIP) throw new Error("conteudo grande demais");
    if (!nomePonteValido(nome)) throw new Error("nome invalido");
    const fallback = this.plugin.cfg.pastaBookmarks || this.plugin.pastas?.[0] || "Clippings";
    const dir = pastaSegura(pasta, String(fallback).replace(/\/+$/, ""));
    const vault = this.plugin.app.vault;

    const source = fonteDoYaml(conteudo);
    const jaTem = source && await this.notaComSource(source);
    if (jaTem) return { ok: true, duplicata: true, caminho: jaTem.path };

    if (!vault.getAbstractFileByPath(dir)) await vault.createFolder(dir).catch(() => {});
    const base = sanitizar(nome);
    let caminho = `${dir}/${base}.md`;
    for (let i = 2; vault.getAbstractFileByPath(caminho); i++) caminho = `${dir}/${base} (${i}).md`;

    const file = await vault.create(caminho, conteudo);
    await this.plugin.registrarChegada?.(file);
    this.plugin.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
    return { ok: true, duplicata: false, caminho };
  }

  gravar(bookmarks, pasta) {
    return this.encadear(() => this._gravar(bookmarks, pasta));
  }

  async _gravar(bookmarks, pasta) {
    if (!Array.isArray(bookmarks) || bookmarks.length > MAX_BOOKMARKS) throw new Error("bookmarks invalido");
    const dir = pastaSegura(pasta, this.plugin.cfg.pastaBookmarks || "Clippings");
    for (const b of bookmarks) {
      if (!b || typeof b !== "object" || Array.isArray(b) || !nomePonteValido(b.nome) ||
        typeof b.conteudo !== "string" || !b.conteudo.trim() || Buffer.byteLength(b.conteudo) > MAX_CONTEUDO_CLIP ||
        (b.source !== undefined && typeof b.source !== "string")) {
        throw new Error("bookmark invalido");
      }
    }
    const vault = this.plugin.app.vault;

    if (!vault.getAbstractFileByPath(dir)) await vault.createFolder(dir).catch(() => {});

    // Indice unico por SOURCE (a URL do tweet), nao por nome de arquivo.
    const caminhos = new Set();
    const sources = new Set();
    for (const f of vault.getMarkdownFiles()) {
      const naGaleria = this.plugin.pastas.some((p) => f.path.startsWith(p));
      if (!naGaleria && !f.path.startsWith(dir + "/")) continue;
      if (f.path.startsWith(dir + "/")) caminhos.add(f.path);
      const fm = this.plugin.app.metadataCache.getFileCache(f)?.frontmatter || {};
      for (const src of fontesDoFrontmatter(fm.source)) sources.add(src);
      // Metadata can lag immediately after a write (and some test/adapters do
      // not expose frontmatter). Read the YAML as a fallback so a concurrent
      // sync cannot re-add a source just because the cache is stale.
      if (!fm.source && typeof vault.cachedRead === "function") {
        for (const src of fontesDoYaml(await vault.cachedRead(f).catch(() => ""))) sources.add(src);
      }
    }

    /** Mesmo nome com source diferente ganha sufixo, em vez de ser jogado fora. */
    const caminhoLivre = (nome) => {
      let c = `${dir}/${nome}.md`;
      let i = 2;
      while (caminhos.has(c) || vault.getAbstractFileByPath(c)) c = `${dir}/${nome} (${i++}).md`;
      return c;
    };

    const aviso = new Notice("Recebendo bookmarks do X…", 0);
    let criados = 0;
    let pulados = 0;
    let erros = 0;

    for (let i = 0; i < bookmarks.length; i++) {
      const b = bookmarks[i];
      try {
        const source = normalizarSource(b.source) || fonteDoYaml(b.conteudo);
        if (source && sources.has(source)) {
          pulados++;
        } else {
          const caminho = caminhoLivre(sanitizar(b.nome));
          const file = await vault.create(caminho, b.conteudo);
          await this.plugin.registrarChegada?.(file);
          caminhos.add(caminho);
          if (source) sources.add(source);
          criados++;
        }
      } catch (e) {
        erros++;
      }
      if (i % 25 === 0 || i === bookmarks.length - 1) {
        aviso.setMessage(`Bookmarks do X: ${i + 1}/${bookmarks.length} · ${criados} novos`);
        await new Promise((r) => setTimeout(r, 0)); // deixa a UI respirar
      }
    }

    aviso.hide();
    new Notice(
      `Bookmarks do X: ${criados} criados` +
        (pulados ? ` · ${pulados} já existiam` : "") +
        (erros ? ` · ${erros} com erro` : ""),
      6000,
    );
    return { criados, pulados, erros };
  }
}

/**
 * Classifica notas em colecoes usando um modelo compativel com a API da OpenAI.
 *
 * Em lote de 25 de proposito: uma chamada por nota daria ~2.500 requisicoes e
 * horas de espera. Testei regra por palavra-chave antes e ela erra feio —
 * marca "macos" porque a palavra aparece de passagem, e perde "video" quando o
 * texto diz "Kling" ou "After Effects".
 */
class Classificador {
  constructor(plugin) {
    this.plugin = plugin;
  }

  resumo(file) {
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    return `${fm.title || file.basename} — ${fm.description || ""}`.slice(0, 260).replace(/\s+/g, " ");
  }

  /** So notas das pastas configuradas que ainda nao tem nenhuma colecao. */
  pendentes() {
    const cols = new Set(this.plugin.cfg.colecoes);
    return this.plugin.app.vault.getMarkdownFiles().filter((f) => {
      if (!this.plugin.pastas.some((p) => f.path.startsWith(p))) return false;
      const tags = [].concat(this.plugin.app.metadataCache.getFileCache(f)?.frontmatter?.tags || []);
      return !tags.some((t) => cols.has(String(t)));
    });
  }

  async chamar(itens) {
    const cfg = this.plugin.cfg;
    const r = await requestUrl({
      url: cfg.modeloUrl,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.modeloChave}` },
      body: JSON.stringify({
        model: cfg.modeloNome,
        stream: false,
        messages: [
          { role: "system", content: "Responda apenas JSON valido, sem texto ao redor." },
          {
            role: "user",
            content:
              `Classifique cada item nas colecoes: ${cfg.colecoes.join(", ")}.\n` +
              "So atribua se o item for PRINCIPALMENTE sobre aquilo, nunca por mencao de passagem. " +
              'Pode ter 0, 1 ou 2. Responda so [{"n":1,"cols":["..."]}, ...] na ordem.\n\n' +
              itens.map((t, i) => `${i + 1}. ${t}`).join("\n"),
          },
        ],
      }),
    });
    const txt = r.json?.choices?.[0]?.message?.content || "";
    const m = txt.match(/\[[\s\S]*\]/);
    if (!m) throw new Error("resposta do modelo nao veio em JSON");
    return JSON.parse(m[0]);
  }

  /** `limite` serve pra testar num punhado antes de soltar em milhares. */
  async rodar(limite) {
    const cfg = this.plugin.cfg;
    if (!cfg.modeloChave) {
      new Notice("Configure a chave do modelo nas opcoes do plugin.", 6000);
      return;
    }
    const alvos = limite ? this.pendentes().slice(0, limite) : this.pendentes();
    if (!alvos.length) {
      new Notice("Todas as notas ja tem colecao.", 4000);
      return;
    }

    const validas = new Set(cfg.colecoes);
    const aviso = new Notice(`Classificando 0/${alvos.length}…`, 0);
    let ok = 0;
    let erros = 0;

    for (let i = 0; i < alvos.length; i += 25) {
      const grupo = alvos.slice(i, i + 25);
      try {
        const r = await this.chamar(grupo.map((f) => this.resumo(f)));
        const pos = new Map(r.map((x) => [x.n, (x.cols || []).filter((c) => validas.has(c))]));
        for (let j = 0; j < grupo.length; j++) {
          const cols = pos.get(j + 1) || [];
          if (!cols.length) continue;
          // processFrontMatter preserva o resto da nota — nada de reescrever YAML na mao
          await this.plugin.app.fileManager.processFrontMatter(grupo[j], (fm) => {
            const atuais = [].concat(fm.tags || []).map(String);
            fm.tags = [...new Set([...atuais, ...cols])];
          });
          ok++;
        }
      } catch (e) {
        erros += grupo.length;
        console.error("clippings-gallery: lote falhou", e);
      }
      aviso.setMessage(`Classificando ${Math.min(i + 25, alvos.length)}/${alvos.length}…`);
    }

    aviso.hide();
    new Notice(`Colecoes: ${ok} notas classificadas${erros ? ` · ${erros} falharam` : ""}`, 6000);
    this.plugin.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
  }
}

/**
 * Traduz titulo e descricao para portugues, em lote.
 *
 * O original vai para `title_original` / `description_original` ANTES de qualquer
 * escrita. Nao e zelo excessivo: as 2378 notas de `X Bookmarks/` nao estao no git
 * do vault, entao nao existe de onde voltar se a traducao sair ruim.
 */
class Tradutor {
  constructor(plugin) {
    this.plugin = plugin;
  }

  /** Notas com texto que ainda nao passaram pela traducao. Ter `*_original`
   *  ja gravado e o que marca "traduzida" — assim rodar de novo nao retraduz
   *  (nem gasta modelo) e nao empilha traducao em cima de traducao. */
  pendentes() {
    return this.plugin.app.vault.getMarkdownFiles().filter((f) => {
      if (!this.plugin.pastas.some((p) => f.path.startsWith(p))) return false;
      const fm = this.plugin.app.metadataCache.getFileCache(f)?.frontmatter || {};
      if (!fm.title && !fm.description) return false;
      return (
        (!!fm.title && fm.title_original === undefined) ||
        (!!fm.description && fm.description_original === undefined)
      );
    });
  }

  item(file) {
    const fm = this.plugin.app.metadataCache.getFileCache(file)?.frontmatter || {};
    const limpa = (s) => String(s || "").replace(/\s+/g, " ").trim();
    return {
      // Manda o original para dar contexto ao modelo, mas nunca usa a
      // traducao anterior como nova fonte caso o outro campo ainda esteja
      // pendente.
      t: limpa(fm.title_original !== undefined ? fm.title_original : fm.title || file.basename),
      d: limpa(fm.description_original !== undefined ? fm.description_original : fm.description),
    };
  }

  async chamar(itens) {
    const cfg = this.plugin.cfg;
    const r = await requestUrl({
      url: cfg.modeloUrl,
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.modeloChave}` },
      body: JSON.stringify({
        model: cfg.modeloNome,
        stream: false,
        messages: [
          { role: "system", content: "Responda apenas JSON valido, sem texto ao redor." },
          { role: "user", content: promptTraducao(itens) },
        ],
      }),
    });
    return lerTraducao(r.json?.choices?.[0]?.message?.content, itens.length);
  }

  /** `limite` serve pra conferir num punhado antes de soltar em milhares. */
  async rodar(limite) {
    const cfg = this.plugin.cfg;
    if (!cfg.modeloChave) {
      new Notice("Configure a chave do modelo nas opcoes do plugin.", 6000);
      return;
    }
    const alvos = limite ? this.pendentes().slice(0, limite) : this.pendentes();
    if (!alvos.length) {
      new Notice("Nada para traduzir: todas ja passaram.", 4000);
      return;
    }

    const LOTE = 20; // a resposta e do tamanho da entrada; 25 ja arriscava truncar
    const aviso = new Notice(`Traduzindo 0/${alvos.length}…`, 0);
    let ok = 0;
    let erros = 0;

    for (let i = 0; i < alvos.length; i += LOTE) {
      const grupo = alvos.slice(i, i + LOTE);
      try {
        const trads = await this.chamar(grupo.map((f) => this.item(f)));
        for (let j = 0; j < grupo.length; j++) {
          const t = trads.get(j + 1);
          if (!t) continue; // modelo pulou este item: fica pendente pra proxima
          await this.plugin.app.fileManager.processFrontMatter(grupo[j], (fm) => {
            if (aplicarTraducao(fm, t, true)) ok++;
          });
        }
      } catch (e) {
        erros += grupo.length;
        console.error("clippings-gallery: lote de traducao falhou", e);
      }
      aviso.setMessage(`Traduzindo ${Math.min(i + LOTE, alvos.length)}/${alvos.length}…`);
    }

    aviso.hide();
    new Notice(`Traducao: ${ok} notas${erros ? ` · ${erros} falharam` : ""}`, 6000);
    this.plugin.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
  }

  /** Desfaz: devolve o texto de `*_original` e apaga o backup. */
  async reverter() {
    const alvos = this.plugin.app.vault.getMarkdownFiles().filter((f) => {
      if (!this.plugin.pastas.some((p) => f.path.startsWith(p))) return false;
      const fm = this.plugin.app.metadataCache.getFileCache(f)?.frontmatter || {};
      return fm.title_original !== undefined || fm.description_original !== undefined;
    });
    for (const f of alvos) {
      await this.plugin.app.fileManager.processFrontMatter(f, (fm) => {
        for (const campo of ["title", "description"]) {
          const b = `${campo}_original`;
          if (fm[b] === undefined) continue;
          fm[campo] = fm[b];
          delete fm[b];
        }
      });
    }
    new Notice(`Revertidas ${alvos.length} notas.`, 6000);
    this.plugin.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
  }
}

class AbaConfig extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl: c } = this;
    c.empty();

    const campo = (nome, desc, chave, ph) =>
      new Setting(c).setName(nome).setDesc(desc).addText((t) =>
        t
          .setPlaceholder(ph || "")
          .setValue(String(this.plugin.cfg[chave] ?? ""))
          .onChange(async (v) => this.plugin.salvar({ [chave]: v.trim() })),
      );

    new Setting(c).setName("Pastas").setHeading();

    new Setting(c)
      .setName("Pastas da galeria")
      .setDesc("Uma por linha. Sao as pastas que aparecem na galeria.")
      .addTextArea((t) =>
        t
          .setValue((this.plugin.cfg.pastas || []).join("\n"))
          .onChange(async (v) => this.plugin.salvar({ pastas: v.split("\n").map((x) => x.trim()).filter(Boolean) })),
      );

    campo("Pasta dos bookmarks", "Onde o sync do X grava as notas.", "pastaBookmarks", "Clippings");

    new Setting(c).setName("Ponte com a extensao").setHeading();

    new Setting(c)
      .setName("Porta local")
      .setDesc("A extensao do clipper envia os bookmarks para 127.0.0.1 nesta porta. A mudanca reinicia a ponte.")
      .addText((t) =>
        t.setValue(String(this.plugin.cfg.porta)).onChange(async (v) => {
          const n = parseInt(v, 10);
          if (n > 0 && n < 65536) await this.plugin.salvar({ porta: n });
        }),
      );

    new Setting(c)
      .setName("Token de pareamento")
      .setDesc("Cole este token nas configuracoes da extensao. Ele autoriza somente esta instalacao local.")
      .addText((t) => {
        t.setValue(String(this.plugin.cfg.ponteToken || ""));
        t.inputEl.type = "password";
        t.inputEl.readOnly = true;
        t.inputEl.setAttribute("autocomplete", "off");
        t.inputEl.setAttribute("spellcheck", "false");
        return t;
      })
      .addButton((b) =>
        b.setButtonText("Mostrar").onClick(() => {
          const input = b.buttonEl.parentElement?.querySelector("input");
          if (!input) return;
          input.type = input.type === "password" ? "text" : "password";
          b.setButtonText(input.type === "password" ? "Mostrar" : "Ocultar");
        }),
      )
      .addButton((b) =>
        b.setButtonText("Copiar").onClick(async () => {
          try {
            await navigator.clipboard.writeText(String(this.plugin.cfg.ponteToken || ""));
            new Notice("Token copiado.", 3000);
          } catch {
            new Notice("Nao foi possivel copiar o token.", 4000);
          }
        }),
      )
      .addButton((b) =>
        b.setButtonText("Gerar novo token").setWarning().onClick(async () => {
          const token = randomBytes(32).toString("hex");
          await this.plugin.salvar({ ponteToken: token });
          new Notice("Novo token gerado; atualize a extensao.", 5000);
          this.display();
        }),
      );

    new Setting(c).setName("Colecoes").setHeading();

    new Setting(c)
      .setName("Colecoes")
      .setDesc("Uma por linha. Sao as tags que o classificador pode atribuir.")
      .addTextArea((t) =>
        t
          .setValue((this.plugin.cfg.colecoes || []).join("\n"))
          .onChange(async (v) => this.plugin.salvar({ colecoes: v.split("\n").map((x) => x.trim()).filter(Boolean) })),
      );

    campo("Endpoint do modelo", "Qualquer API compativel com a da OpenAI.", "modeloUrl");
    campo("Modelo", "", "modeloNome", "k3");

    new Setting(c)
      .setName("Chave da API")
      .setDesc("Fica no data.json do plugin, dentro do seu vault.")
      .addText((t) => {
        t.inputEl.type = "password";
        t.setValue(this.plugin.cfg.modeloChave || "").onChange(async (v) =>
          this.plugin.salvar({ modeloChave: v.trim() }),
        );
      });

    new Setting(c)
      .setName("Classificar agora")
      .setDesc("Percorre as notas sem colecao e atribui usando o modelo.")
      .addButton((b) => b.setButtonText("Classificar").setCta().onClick(() => this.plugin.classificar()));

    new Setting(c)
      .setName("Capas faltando")
      .setDesc(
        "Busca og:image das notas sem preview. O thumb automatico so roda quando a nota " +
          "muda, entao nota antiga que falhou fica sem capa pra sempre."
      )
      .addButton((b) =>
        b.setButtonText("Buscar").onClick(() => this.plugin.buscarCapasFaltando())
      );

    new Setting(c)
      .setName("Guardar capas no vault")
      .setDesc(
        "Baixa a imagem pra " +
          (this.plugin.cfg.pastaCapas || PADRAO.pastaCapas) +
          " e passa a exibir a copia local. As URLs do Instagram sao assinadas e expiram em ~5 dias; " +
          "o GitHub responde 429 em rajada. Baixada uma vez, a capa nao some mais."
      )
      .addButton((b) => b.setButtonText("Só Instagram").onClick(() => this.plugin.baixarCapasLocais("instagram")))
      .addButton((b) => b.setButtonText("Todas").onClick(() => this.plugin.baixarCapasLocais()));

    new Setting(c)
      .setName("Propriedades colapsadas ao abrir")
      .setDesc(
        "Vale para as notas das pastas da galeria. Expandir continua funcionando; " +
          "o estado volta a colapsado na proxima nota que voce abrir."
      )
      .addToggle((tg) =>
        tg.setValue(this.plugin.cfg.propsColapsadas !== false).onChange((v) => this.plugin.salvar({ propsColapsadas: v }))
      );

    new Setting(c)
      .setName("Duplicatas")
      .setDesc("Notas com o mesmo source de outra. Mantem a mais antiga de cada.")
      .addButton((b) =>
        b.setButtonText("Listar").onClick(() => {
          const d = this.plugin.duplicatas();
          if (!d.length) return new Notice("Nenhuma duplicata.", 4000);
          const n = new Notice("", 20000);
          n.messageEl.createDiv({ text: `${d.length} copias (a mais antiga de cada fica):` });
          for (const f of d.slice(0, 12)) n.messageEl.createDiv({ text: `· ${f.basename.slice(0, 52)}` });
          if (d.length > 12) n.messageEl.createDiv({ text: `… e mais ${d.length - 12}` });
        })
      )
      .addButton((b) =>
        b
          .setButtonText("Mover pra lixeira")
          .setWarning()
          .onClick(async () => {
            const d = this.plugin.duplicatas();
            for (const f of d) await this.plugin.app.fileManager.trashFile(f);
            new Notice(`${d.length} copias movidas pra lixeira.`, 6000);
            this.plugin.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
          })
      );

    new Setting(c)
      .setName("Limpar autores")
      .setDesc(
        "Tira os [[ ]] do campo author. Cada wikilink de autor vira um no que nao " +
          "existe no grafo — eram 1163 aqui."
      )
      .addButton((b) => b.setButtonText("Limpar").onClick(() => this.plugin.limparAutores()));

    new Setting(c).setName("Traducao").setHeading();

    new Setting(c)
      .setName("Traduzir para portugues")
      .setDesc(
        "Traduz titulo e descricao das notas que ainda nao passaram. O texto original " +
          "fica guardado em title_original / description_original."
      )
      .addButton((b) => b.setButtonText("Testar em 5").onClick(() => this.plugin.traduzir(5)))
      .addButton((b) => b.setButtonText("Traduzir tudo").setCta().onClick(() => this.plugin.traduzir()));

    new Setting(c)
      .setName("Desfazer traducao")
      .setDesc("Devolve o texto de *_original para title / description e apaga o backup.")
      .addButton((b) => b.setButtonText("Reverter").setWarning().onClick(() => this.plugin.reverterTraducao()));
  }
}

class ClippingsGallery extends Plugin {
  async onload() {
    this.cfg = Object.assign({}, PADRAO, await this.loadData());
    // Pairing is installation-specific. Generate once on first run and keep it
    // in the plugin data; never print or put it in a URL.
    if (typeof this.cfg.ponteToken !== "string" || !this.cfg.ponteToken.trim()) {
      this.cfg.ponteToken = randomBytes(32).toString("hex");
      await this.saveData(this.cfg);
    }
    this.aplicarPastas();
    // A normal obsidian:// URI can create a note without the clipper. Observe
    // genuine vault creations as the fallback, but never rewrite files while
    // the vault is still being enumerated during startup. Capture paths below
    // stamp their own writes explicitly, so this guard cannot lose them.
    this._chegadaInicial = new Map();
    this._chegadaPronta = false;
    this.registerEvent(this.app.vault.on("create", (file) => {
      if (!this._chegadaPronta || !file?.path || this._chegadaInicial.get(file.path) === file) return;
      void this.registrarChegada(file);
    }));
    this.registerEvent(this.app.vault.on("delete", (file) => {
      if (file?.path) this._chegadaInicial.delete(file.path);
    }));
    const chegadaAposLayout = () => {
      this._chegadaInicial = new Map((this.app.vault.getMarkdownFiles?.() || []).map((f) => [f.path, f]));
      this._chegadaPronta = true;
    };
    if (typeof this.app.workspace.onLayoutReady === "function") this.app.workspace.onLayoutReady(chegadaAposLayout);
    else chegadaAposLayout();
    this.registerView(VIEW, (leaf) => new GaleriaView(leaf, this));

    this.addRibbonIcon("layout-grid", "Galeria de clippings", () => this.abrirGaleria());
    this.addCommand({ id: "open", name: "Abrir galeria de clippings", callback: () => this.abrirGaleria() });

    // clipping novo ganha thumbnail sozinho — sem rodar script na mao
    this.emAndamento = new Set();
    this.registerEvent(
      this.app.metadataCache.on("changed", (file, _data, cache) => this.thumb(file, cache))
    );

    // recebe os bookmarks do X sem passar por obsidian:// (que roubaria o foco)
    this.receptor = new Receptor(this);
    this.receptor.iniciar();
    this.completarCapasDeFundo();
    this.register(() => this.receptor.parar());

    this.addSettingTab(new AbaConfig(this.app, this));
    this.addCommand({
      id: "classificar",
      name: "Classificar notas sem colecao",
      callback: () => this.classificar(),
    });
    this.addCommand({
      id: "traduzir",
      name: "Traduzir titulos e descricoes para portugues",
      callback: () => this.traduzir(),
    });
    this.addCommand({
      id: "capas",
      name: "Buscar capas faltando",
      callback: () => this.buscarCapasFaltando(),
    });
    this.addCommand({
      id: "limpar-autores",
      name: "Limpar wikilinks do campo author",
      callback: () => this.limparAutores(),
    });

    // Rede de seguranca: o clipping normal entra por obsidian://new, que o core
    // do Obsidian atende — a extensao pode estar velha, desligada ou sem
    // conseguir falar com a ponte. Aqui e o unico ponto por onde TODA nota nova
    // passa, entao e aqui que da pra garantir.
    this.registerEvent(this.app.metadataCache.on("changed", (f) => this.avisarDuplicata(f)));

    // O estado colapsado das propriedades e por aba e so em memoria: aba nova
    // sempre nasce expandida. Nao ha config nativa, e CSS puro nao serve —
    // existe classe pra "colapsado", nenhuma pra "o usuario expandiu", entao
    // nao daria pra distinguir o padrao de uma escolha dele.
    this.registerEvent(this.app.workspace.on("file-open", (f) => this.colapsarProps(f)));

    this.imgs = new Map(); // path -> string[] (imagens do corpo)
    this.registerEvent(this.app.vault.on("modify", (f) => this.imgs.delete(f.path)));
    // Buscas salvas guardam caminhos concretos, entao acompanham renomeacoes
    // para nao virarem uma lista silenciosamente vazia.
    this.registerEvent(this.app.vault.on("rename", (f, antigo) => this.atualizarBuscasRenomeada(f, antigo)));
  }

  /** Add an immutable arrival timestamp to one newly-created gallery note.
   *  The per-path promise also coalesces the create event with the explicit
   *  capture-path call, preventing a second frontmatter write. */
  registrarChegada(file) {
    const caminho = String(file?.path || "");
    if (!caminho.endsWith(".md") || !this.pastas?.some((p) => caminho.startsWith(p))) return Promise.resolve(false);
    this._chegadaJobs ||= new Map();
    const pendente = this._chegadaJobs.get(caminho);
    if (pendente) return pendente;

    const trabalho = this._registrarChegada(file)
      .catch((e) => {
        console.error("clippings-gallery: nao consegui registrar chegada em", caminho, e);
        return false;
      })
      .finally(() => {
        if (this._chegadaJobs.get(caminho) === trabalho) this._chegadaJobs.delete(caminho);
      });
    this._chegadaJobs.set(caminho, trabalho);
    return trabalho;
  }

  async _registrarChegada(file) {
    const cache = this.app.metadataCache?.getFileCache?.(file)?.frontmatter || file.frontmatter || {};
    if (chegadaValida(cache[CAMPO_CHEGADA])) return false;
    const timestamp = new Date().toISOString();
    let mudou = false;

    if (this.app.fileManager?.processFrontMatter) {
      await this.app.fileManager.processFrontMatter(file, (fm) => {
        if (!chegadaValida(fm[CAMPO_CHEGADA])) {
          fm[CAMPO_CHEGADA] = timestamp;
          mudou = true;
        }
      });
      return mudou;
    }
    return false;
  }

  /** Normaliza: aceita "Clippings" ou "Clippings/" e ignora linha vazia. */
  aplicarPastas() {
    this.pastas = (this.cfg.pastas || [])
      .map((p) => String(p).trim().replace(/\/+$/, ""))
      .filter(Boolean)
      .map((p) => p + "/");
  }

  /** Executa um lote por vez. Comandos e botoes podem ser acionados duas vezes
   *  enquanto o modelo espera; devolver a mesma Promise evita duas leituras do
   *  mesmo conjunto e duas escritas concorrentes no frontmatter. */
  loteUnico(nome, tarefa) {
    this._lotes ||= new Map();
    const ativo = this._lotes.get(nome);
    if (ativo) {
      new Notice(`Operacao de ${nome} ja esta em andamento.`, 4000);
      return ativo;
    }
    const execucao = Promise.resolve().then(tarefa);
    const resultado = execucao.finally(() => {
      if (this._lotes.get(nome) === resultado) this._lotes.delete(nome);
    });
    this._lotes.set(nome, resultado);
    return resultado;
  }

  classificar(limite) {
    return this.loteUnico("classificacao", () => new Classificador(this).rodar(limite));
  }

  traduzir(limite) {
    return this.loteUnico("traducao", () => new Tradutor(this).rodar(limite));
  }

  /**
   * Manda a nota pra lixeira, com desfazer que funciona de verdade.
   *
   * O padrao do Obsidian e lixeira do SISTEMA: recuperavel na mao, mas nao por
   * codigo. Como estas notas nao estao no git, o conteudo e lido ANTES de
   * apagar e o "Desfazer" recria o arquivo a partir dele.
   */
  async apagarNota(file) {
    let conteudo = "";
    try {
      conteudo = await this.app.vault.read(file);
    } catch (e) {
      console.error("clippings-gallery: nao consegui ler antes de apagar", file.path, e);
      new Notice("Nao consegui ler a nota; nao vou apagar sem ter como desfazer.", 6000);
      return;
    }
    const caminho = file.path;
    await this.app.fileManager.trashFile(file);
    this.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());

    const n = new Notice("", 12000);
    n.messageEl.createDiv({ text: "Nota apagada:" });
    n.messageEl.createDiv({ text: file.basename, cls: "cg-aviso-nome" });
    const undo = n.messageEl.createEl("a", { text: "Desfazer", href: "#" });
    undo.addEventListener("click", async (e) => {
      e.preventDefault();
      n.hide();
      if (this.app.vault.getAbstractFileByPath(caminho)) return new Notice("Ja existe uma nota nesse caminho.", 5000);
      await this.app.vault.create(caminho, conteudo);
      new Notice("Nota restaurada.", 4000);
      this.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
    });
  }

  /** Liga/desliga o favorito. Devolve o estado novo. */
  async favoritar(caminho) {
    const f = this.app.vault.getAbstractFileByPath(caminho);
    if (!f) return false;
    let fav = false;
    await this.app.fileManager.processFrontMatter(f, (fm) => {
      fm.tags = alternarFavorito(fm.tags);
      fav = fm.tags.includes(FAVORITO);
    });
    return fav;
  }

  /** Cria uma colecao vazia. Ela ja aparece na barra com 0 (ver grupos()),
   *  senao nao haveria onde soltar o primeiro card. */
  async criarColecao(bruto) {
    const nome = nomeDeColecao(bruto);
    if (!nome) {
      new Notice("Nome invalido para uma coleção.", 4000);
      return null;
    }
    const atuais = this.cfg.colecoes || [];
    if (atuais.includes(nome)) {
      new Notice(`"${nome}" já existe.`, 4000);
      return nome;
    }
    await this.salvar({ colecoes: [...atuais, nome] });
    new Notice(`Coleção "${nome}" criada. Arraste cards pra ela.`, 5000);
    return nome;
  }

  /** Aplica o resultado de aoSoltarEmColecao no frontmatter da nota. */
  async moverParaColecao(caminho, destino, origem) {
    const f = this.app.vault.getAbstractFileByPath(caminho);
    if (!f) return false;
    let mudou = false;
    await this.app.fileManager.processFrontMatter(f, (fm) => {
      const antes = [].concat(fm.tags || []).map(String);
      const depois = aoSoltarEmColecao(fm.tags, destino, origem);
      if (antes.length === depois.length && antes.every((t, i) => t === depois[i])) return;
      fm.tags = depois;
      mudou = true;
    });
    return mudou;
  }

  /**
   * Nota recem-criada com um source que ja existe? Avisa e oferece apagar.
   *
   * Nao apaga sozinho de proposito: as vezes a segunda copia e proposital (a
   * pagina mudou). Mas tambem nao fica calado, que era o que acontecia.
   */
  async avisarDuplicata(file) {
    if (!this.pastas.some((p) => file.path.startsWith(p))) return;
    if (this.jaAvisadas?.has(file.path)) return;
    // so nota nova: renomear/editar uma antiga nao pode disparar isso
    if (Date.now() - file.stat.ctime > 60000) return;

    const src = normalizarSource(this.app.metadataCache.getFileCache(file)?.frontmatter?.source);
    if (!src) return;
    const outra = this.app.vault
      .getMarkdownFiles()
      .find(
        (f) =>
          f.path !== file.path &&
          this.pastas.some((p) => f.path.startsWith(p)) &&
          normalizarSource(this.app.metadataCache.getFileCache(f)?.frontmatter?.source) === src
      );
    if (!outra) return;

    (this.jaAvisadas = this.jaAvisadas || new Set()).add(file.path);
    const n = new Notice("", 15000);
    n.messageEl.createDiv({ text: "Este link ja estava na galeria:" });
    n.messageEl.createDiv({ text: outra.basename, cls: "cg-aviso-nome" });
    const apagar = n.messageEl.createEl("a", { text: "Apagar a copia nova", href: "#" });
    apagar.addEventListener("click", async (e) => {
      e.preventDefault();
      await this.app.fileManager.trashFile(file);
      n.hide();
      new Notice("Copia removida.", 4000);
      this.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
    });
  }

  /** Todas as notas cujo source repete o de outra, exceto a mais antiga de cada. */
  duplicatas() {
    const porSource = new Map();
    for (const f of this.app.vault.getMarkdownFiles()) {
      if (!this.pastas.some((p) => f.path.startsWith(p))) continue;
      const s = normalizarSource(this.app.metadataCache.getFileCache(f)?.frontmatter?.source);
      if (!s) continue;
      if (!porSource.has(s)) porSource.set(s, []);
      porSource.get(s).push(f);
    }
    const extras = [];
    for (const [, fs] of porSource) {
      if (fs.length < 2) continue;
      // fica a mais antiga; as outras sao as copias
      fs.sort((a, b) => a.stat.ctime - b.stat.ctime);
      extras.push(...fs.slice(1));
    }
    return extras;
  }

  /**
   * Colapsa as propriedades ao ABRIR a nota — uma vez so.
   *
   * Se rodasse a cada layout-change, o usuario nunca conseguiria deixar
   * expandido: reabriria fechado no meio do uso. Aqui ele expande e fica
   * expandido ate abrir outra nota.
   */
  colapsarProps(file) {
    if (!this.cfg.propsColapsadas || !file) return;
    if (!this.pastas.some((p) => file.path.startsWith(p))) return;

    // setCollapse e nao addClass("is-collapsed"): o Obsidian guarda o estado num
    // booleano proprio. Mexendo so na classe, os dois dessincronizam e o
    // primeiro clique do usuario nao faz nada — ele teria que clicar duas vezes.
    //
    // ponytail: reaplica em 0/120/300/600ms em vez de esperar um evento de
    // "view pronta". Em ABA NOVA o Obsidian reconstroi o metadataEditor depois
    // do file-open e reseta collapsed pra false — na mesma aba isso nao
    // acontece. Nao achei evento que marque esse fim; a janela e curta o
    // bastante pra ninguem conseguir expandir dentro dela. Se um dia a API
    // expuser "view pronta", troca por ela.
    const alvo = this.app.workspace.getMostRecentLeaf();
    for (const ms of [0, 120, 300, 600]) {
      setTimeout(() => {
        if (this.app.workspace.getMostRecentLeaf() !== alvo) return; // ja trocou de nota
        alvo?.view?.metadataEditor?.setCollapse?.(true);
      }, ms);
    }
  }

  /** Primeira nota da galeria com este source, ou null. E o que decide
   *  duplicata — em todo lugar: ponte, botao + e consulta da extensao. */
  notaComSource(url) {
    const alvo = normalizarSource(url);
    if (!alvo) return null;
    return (
      this.app.vault
        .getMarkdownFiles()
        .find(
          (f) =>
            this.pastas.some((p) => f.path.startsWith(p)) &&
            normalizarSource(this.app.metadataCache.getFileCache(f)?.frontmatter?.source) === alvo
        ) || null
    );
  }

  /** Cola um link direto na galeria, sem passar pela extensao.
   *  Devolve o TFile criado, ou null se ja existia / deu erro.
   *  `silencioso`: sem Notice e sem re-render — para importar em lote, senao
   *  186 links viram 186 avisos empilhados e 186 renders. */
  async adicionarLink(bruto, silencioso) {
    const diga = (msg, ms) => (silencioso ? null : new Notice(msg, ms));
    const url = normalizarSource(bruto);
    if (!/^https?:\/\//i.test(url)) {
      diga("Isso nao parece um link http(s).", 4000);
      return null;
    }

    const pasta = (this.pastas[0] || "Clippings/").replace(/\/$/, "");
    // dedup por source, igual a ponte da extensao: o nome do arquivo nao decide
    const jaTem = this.notaComSource(url);
    if (jaTem) {
      diga("Esse link ja esta na galeria.", 5000);
      return null;
    }

    const aviso = diga("Buscando os dados do link…", 0);
    try {
      let og = { titulo: "", descricao: "", imagem: "" };
      try {
        og = lerOg((await requestUrl({ url })).text);
      } catch (e) {
        // site fora do ar ou bloqueando: ainda vale salvar o link
        console.error("clippings-gallery: nao consegui ler", url, e);
      }
      const hoje = new Date().toISOString().slice(0, 10);
      const { nome, conteudo } = notaDeLink(url, og, hoje);

      if (!this.app.vault.getAbstractFileByPath(pasta)) await this.app.vault.createFolder(pasta);
      let caminho = `${pasta}/${nome}.md`;
      for (let i = 2; this.app.vault.getAbstractFileByPath(caminho); i++) caminho = `${pasta}/${nome} (${i}).md`;

      const file = await this.app.vault.create(caminho, conteudo);
      await this.registrarChegada(file);
      aviso?.hide();
      diga(og.titulo ? `Adicionado: ${og.titulo.slice(0, 60)}` : "Link adicionado.", 5000);
      if (!silencioso) this.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
      return file;
    } catch (e) {
      aviso?.hide();
      console.error("clippings-gallery: falhou ao adicionar", url, e);
      diga(`Nao consegui adicionar: ${e.message}`, 6000);
      return null;
    }
  }

  /**
   * Baixa a capa pro vault e grava `thumb` no frontmatter.
   *
   * Motivo: a URL do CDN nao e nossa. As do Instagram sao assinadas e expiram
   * em ~5 dias (medi 884 de 884 vencidas), e o opengraph do GitHub responde 429
   * em rajada. Baixando uma vez, a capa nunca mais some.
   *
   * Devolve "ok" | "ja tinha" | "sem imagem" | "falhou".
   */
  async baixarCapa(file) {
    const fm = this.app.metadataCache.getFileCache(file)?.frontmatter || {};
    if (fm.thumb && this.app.vault.getAbstractFileByPath(String(fm.thumb))) return "ja tinha";
    // o lote e o de fundo podem cair na mesma nota; sem isto os dois criariam
    // o mesmo arquivo e o segundo estouraria em "ja existe"
    if (this.emAndamento.has(file.path)) return "em andamento";
    this.emAndamento.add(file.path);
    try {
      return await this.baixarCapaAgora(file, fm);
    } finally {
      this.emAndamento.delete(file.path);
    }
  }

  async baixarCapaAgora(file, fm) {

    // a URL guardada pode estar morta (Instagram): busca uma nova a partir do post
    let url = String(fm.image || "");
    let bytes = CAPA_GENERICA.test(url) ? null : await this.baixarBytes(url);
    if (!bytes && fm.source) {
      const nova = await this.buscarCapa(normalizarSource(fm.source));
      if (nova && nova !== url) {
        url = nova;
        bytes = await this.baixarBytes(url);
      }
    }
    if (CAPA_GENERICA.test(url)) return "bloqueado"; // icone do app, nao o post
    if (!bytes) return url || fm.source ? "falhou" : "sem imagem";

    const { dados, ext } = await this.encolher(bytes, extDaUrl(url));
    const pasta = this.cfg.pastaCapas || PADRAO.pastaCapas;
    if (!this.app.vault.getAbstractFileByPath(pasta)) await this.app.vault.createFolder(pasta).catch(() => {});
    const caminho = `${pasta}/${nomeDeCapa(fm.source || url, ext)}`;
    if (!this.app.vault.getAbstractFileByPath(caminho)) {
      await this.app.vault.createBinary(caminho, dados);
    }
    await this.app.fileManager.processFrontMatter(file, (f) => {
      f.thumb = caminho;
    });
    return "ok";
  }

  /** Baixa os bytes. Retenta no 429 (o opengraph do GitHub limita em rajada) e
   *  desiste na hora no 403/404 — assinatura vencida nao melhora esperando. */
  async baixarBytes(url, tentativas = 3) {
    if (!/^https?:\/\//i.test(String(url || ""))) return null;
    for (let n = 0; n <= tentativas; n++) {
      try {
        const r = await requestUrl({ url, throw: false });
        if (r.status === 200 && r.arrayBuffer && r.arrayBuffer.byteLength >= 100) return r.arrayBuffer;
        if (r.status !== 429) return null;
      } catch {
        return null;
      }
      if (n < tentativas) await new Promise((s) => setTimeout(s, 900 * Math.pow(2, n) + Math.random() * 700));
    }
    return null;
  }

  /**
   * Reduz pra `larguraCapa` quando a imagem e maior que isso.
   *
   * So quando compensa: medi uma amostra do X e as de 1200x1200 e 2048x1676
   * caem 7x, mas as que ja sao menores que 640 nao ganham nada — reencodar uma
   * de 361x640 deixou o arquivo MAIOR. GIF fica intacto: o canvas devolveria so
   * o primeiro quadro, e a galeria promove GIF a capa justamente por animar.
   */
  async encolher(bytes, ext) {
    const largura = this.cfg.larguraCapa || PADRAO.larguraCapa;
    if (ext === "gif") return { dados: bytes, ext };
    try {
      const bmp = await createImageBitmap(new Blob([bytes]));
      if (bmp.width <= largura) return { dados: bytes, ext };
      const cv = new OffscreenCanvas(largura, Math.round((bmp.height * largura) / bmp.width));
      cv.getContext("2d").drawImage(bmp, 0, 0, cv.width, cv.height);
      const blob = await cv.convertToBlob({ type: "image/jpeg", quality: 0.82 });
      return { dados: await blob.arrayBuffer(), ext: "jpg" };
    } catch {
      return { dados: bytes, ext }; // formato que o canvas nao abre: guarda cru
    }
  }

  /** Set dos caminhos de uma busca. Memoiza porque notas() roda a cada render e
   *  a cada tecla digitada; sem isto seria um Set novo por chamada. */
  caminhosDaBusca(nome) {
    const b = (this.cfg.buscas || {})[nome];
    if (!b) return new Set();
    if (this._buscaCache?.nome !== nome || this._buscaCache.ref !== b) {
      this._buscaCache = { nome, ref: b, set: new Set(b.caminhos || []) };
    }
    return this._buscaCache.set;
  }

  /** Atualiza caminhos exatos (e descendentes, quando uma pasta e renomeada)
   *  nas buscas salvas. O evento de rename chega depois que `file.path` mudou. */
  async atualizarBuscasRenomeada(file, antigo) {
    const velho = String(antigo || "").replace(/^\/+|\/+$/g, "");
    const novo = String(typeof file === "string" ? file : file?.path || "").replace(/^\/+|\/+$/g, "");
    if (!velho || !novo || velho === novo) return false;

    const buscas = { ...(this.cfg.buscas || {}) };
    let mudou = false;
    for (const [nome, busca] of Object.entries(buscas)) {
      let alterouBusca = false;
      const caminhos = [].concat(busca?.caminhos || []).map((c) => {
        const caminho = String(c);
        if (caminho === velho) {
          alterouBusca = true;
          return novo;
        }
        if (caminho.startsWith(`${velho}/`)) {
          alterouBusca = true;
          return `${novo}${caminho.slice(velho.length)}`;
        }
        return caminho;
      });
      if (alterouBusca) {
        buscas[nome] = { ...busca, caminhos: [...new Set(caminhos)] };
        mudou = true;
      }
    }
    if (!mudou) return false;
    await this.salvar({ buscas });
    this._buscaCache = null;
    this.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
    return true;
  }

  /** Cria/substitui uma busca salva. `caminhos` e a lista escolhida por quem
   *  chama (um modelo lendo titulo e descricao), nao uma regra de texto. */
  async salvarBusca(nome, caminhos, pedido) {
    const chave = String(nome || "").trim().slice(0, 60);
    if (!chave) throw new Error("busca sem nome");
    const vivos = new Set(this.app.vault.getMarkdownFiles().map((f) => f.path));
    // descarta caminho que nao existe: busca so promete o que da pra mostrar
    const validos = [...new Set([].concat(caminhos || []).map(String))].filter((c) => vivos.has(c));
    const buscas = { ...(this.cfg.buscas || {}) };
    buscas[chave] = { pedido: String(pedido || chave), criada: new Date().toISOString().slice(0, 10), caminhos: validos };
    await this.salvar({ buscas });
    this._buscaCache = null;
    this.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
    return { nome: chave, salvos: validos.length, ignorados: [].concat(caminhos || []).length - validos.length };
  }

  async apagarBusca(nome) {
    const buscas = { ...(this.cfg.buscas || {}) };
    if (!(nome in buscas)) return false;
    delete buscas[nome];
    const patch = { buscas };
    // se a busca apagada era o filtro ativo, a galeria ficaria vazia sem saida
    if (this.cfg.filtro?.tipo === "busca" && this.cfg.filtro.valor === nome) patch.filtro = { tipo: "tudo" };
    await this.salvar(patch);
    this._buscaCache = null;
    return true;
  }

  /** Tira os [[ ]] do campo author das notas das pastas configuradas.
   *  Sem isto o grafo fica cheio de no que nao existe (ver semWikilink). */
  async limparAutores() {
    const alvos = this.app.vault.getMarkdownFiles().filter((f) => {
      if (!this.pastas.some((p) => f.path.startsWith(p))) return false;
      const a = this.app.metadataCache.getFileCache(f)?.frontmatter?.author;
      return [].concat(a || []).some((v) => /^\[\[[^\]]+\]\]$/.test(String(v).trim()));
    });
    if (!alvos.length) {
      new Notice("Nenhum author com wikilink.", 4000);
      return;
    }

    const aviso = new Notice(`Limpando 0/${alvos.length}…`, 0);
    let n = 0;
    for (const f of alvos) {
      await this.app.fileManager.processFrontMatter(f, (fm) => {
        // preserva a forma: lista continua lista, escalar continua escalar
        fm.author = Array.isArray(fm.author)
          ? fm.author.map(semWikilink).filter(Boolean)
          : semWikilink(fm.author);
      });
      if (++n % 100 === 0) aviso.setMessage(`Limpando ${n}/${alvos.length}…`);
    }
    aviso.hide();
    new Notice(`Autores limpos: ${n} notas.`, 6000);
  }

  reverterTraducao() {
    return new Tradutor(this).reverter();
  }

  async salvar(mudanca) {
    const portaAnterior = this.cfg.porta;
    Object.assign(this.cfg, mudanca);
    this.aplicarPastas();
    await this.saveData(this.cfg);
    if (mudanca && Object.prototype.hasOwnProperty.call(mudanca, "porta") && portaAnterior !== this.cfg.porta && this.receptor) {
      this.receptor.parar();
      this.receptor.iniciar();
    }
  }

  /** Abre a galeria masonry (view propria). Reusa a aba se ja estiver aberta. */
  async abrirGaleria() {
    const aberta = this.app.workspace.getLeavesOfType(VIEW)[0];
    if (aberta) return this.app.workspace.revealLeaf(aberta);
    await this.app.workspace.getLeaf("tab").setViewState({ type: VIEW, active: true });
  }

  /** Imagens do corpo da nota (pro carrossel). null = nao deu pra ler, tenta depois. */
  async imagensDe(file) {
    if (this.imgs.has(file.path)) return this.imgs.get(file.path);
    const txt = await this.app.vault.cachedRead(file);
    if (!txt) return null;
    const achadas = [...txt.matchAll(MD_IMG)]
      .map((m) => decamo(m[1]))
      .filter((u) => u.startsWith("http") && !LIXO.test(u));
    const unicas = [...new Set(achadas)];
    this.imgs.set(file.path, unicas);
    return unicas;
  }

  async thumb(file, cache) {
    const fm = cache?.frontmatter;
    if (!this.pastas.some((p) => file.path.startsWith(p)) || !fm?.source) return;
    const temCopia = fm.thumb && this.app.vault.getAbstractFileByPath(String(fm.thumb));
    if (fm.image && temCopia) return; // ja tem capa e copia local
    if (this.emAndamento.has(file.path)) return; // processFrontMatter re-dispara "changed"
    this.emAndamento.add(file.path);
    try {
      if (!fm.image) {
        const img = await this.buscarCapa(normalizarSource(fm.source));
        if (!img) return;
        await this.app.fileManager.processFrontMatter(file, (f) => {
          f.image = img;
        });
      }
      // baixa ja na chegada: a URL do CDN pode estar morta daqui a 5 dias, e
      // ai nao adianta mais tentar. Pegou a primeira vez, nao sai mais.
      //
      // baixarCapaAgora e nao baixarCapa: o lock de emAndamento ja esta em nossa
      // mao desde o inicio deste metodo, e baixarCapa comeca conferindo esse
      // mesmo lock — chamar ela aqui devolvia "em andamento" e a capa nunca era
      // baixada na chegada. So apareceu num teste ponta a ponta.
      if (this.cfg.capaLocal !== false) {
        const atual = this.app.metadataCache.getFileCache(file)?.frontmatter || fm;
        await this.baixarCapaAgora(file, atual);
      }
    } catch (e) {
      console.error("clippings-gallery: og:image falhou em", file.path, e);
    } finally {
      this.emAndamento.delete(file.path);
    }
  }

  /**
   * Completa as capas que faltam, de fundo, sem Notice.
   *
   * O thumb() so cobre nota que MUDA. Nota antiga, ou uma em que o download
   * falhou (CDN fora do ar na hora), ficaria sem copia pra sempre esperando um
   * clique em Configuracoes. Aqui a galeria converge sozinha entre sessoes.
   *
   * Comeca depois de 20s pra nao competir com a abertura do vault, e vai em
   * fatias: o objetivo e nunca aparecer, nao terminar rapido.
   */
  completarCapasDeFundo() {
    if (this.cfg.capaLocal === false) return;
    // Nota cujo site nao publica og:image nenhuma nunca vai ter capa. Sem esta
    // lista o laco voltaria nelas a cada 5s pra sempre, re-buscando a pagina e
    // logando erro — medi 32 assim depois do lote. So na memoria de proposito:
    // no proximo load tenta de novo, caso o site tenha saido do ar na hora.
    this.capasSemJeito = new Set();
    let espera = 5000;
    const passo = async () => {
      if (this.parandoDeFundo) return;
      const faltam = this.semCopiaLocal().filter((f) => !this.capasSemJeito.has(f.path));
      if (!faltam.length) return; // nada a fazer: para de reagendar
      let ok = 0;
      for (const f of faltam.slice(0, 25)) {
        if (this.parandoDeFundo) return;
        try {
          const r = await this.baixarCapa(f);
          if (r === "ok") ok++;
          // "bloqueado" fica de fora: o site esta recusando AGORA, mas volta.
          // Marcar como sem jeito congelaria a capa por toda a sessao.
          else if (r === "falhou" || r === "sem imagem") this.capasSemJeito.add(f.path);
        } catch (e) {
          this.capasSemJeito.add(f.path);
          console.error("clippings-gallery: capa de fundo falhou em", f.path, e);
        }
        await new Promise((s) => setTimeout(s, 250)); // sem rajada: 429 e o inimigo
      }
      // Rodada inteira sem sucesso quer dizer que o site esta bloqueando.
      // Insistir no mesmo ritmo so piora — recua ate 30min e volta ao normal
      // assim que uma capa passa. Foi assim que gravei 332 icones genericos:
      // martelando 885 requisicoes seguidas.
      espera = ok ? 5000 : Math.min(espera * 4, 30 * 60 * 1000);
      this.timerFundo = setTimeout(passo, espera);
    };
    this.timerFundo = setTimeout(passo, 20000);
    this.register(() => {
      this.parandoDeFundo = true;
      clearTimeout(this.timerFundo);
    });
  }

  /** Notas que tem capa remota mas ainda nao tem copia local. */
  semCopiaLocal() {
    return this.app.vault.getMarkdownFiles().filter((f) => {
      if (!this.pastas.some((p) => f.path.startsWith(p))) return false;
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      if (!fm?.source) return false;
      if (fm.thumb && this.app.vault.getAbstractFileByPath(String(fm.thumb))) return false;
      return true;
    });
  }

  /** Baixa em lote. `fonte` limita a uma fonte (ex.: "instagram"), util porque
   *  as do Instagram sao as unicas que morrem sempre. */
  baixarCapasLocais(fonte, limite) {
    return this.loteUnico("capas", () => this._baixarCapasLocais(fonte, limite));
  }

  async _baixarCapasLocais(fonte, limite) {
    let alvos = this.semCopiaLocal();
    if (fonte) {
      alvos = alvos.filter((f) => {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
        return dominio(fm?.source) === fonte;
      });
    }
    if (limite) alvos = alvos.slice(0, limite);
    if (!alvos.length) {
      new Notice("Todas as capas ja estao no vault.", 4000);
      return { ok: 0, falhou: 0 };
    }
    const aviso = new Notice(`Baixando capas 0/${alvos.length}…`, 0);
    let ok = 0;
    let falhou = 0;
    for (let i = 0; i < alvos.length; i++) {
      try {
        const r = await this.baixarCapa(alvos[i]);
        if (r === "ok") ok++;
        else if (r === "falhou" || r === "sem imagem") falhou++;
      } catch (e) {
        falhou++;
        console.error("clippings-gallery: capa local falhou em", alvos[i].path, e);
      }
      if (i % 5 === 0) aviso.setMessage(`Baixando capas ${i + 1}/${alvos.length}…`);
    }
    aviso.hide();
    new Notice(`Capas no vault: ${ok} baixadas · ${falhou} sem imagem.`, 8000);
    this.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
    return { ok, falhou };
  }

  /** Busca a capa de uma URL. Usa lerOg (aceita name=, as duas ordens de
   *  atributo e cai no twitter:image) em vez das duas regex antigas so de
   *  og:image — mesma leitura do botao "+". */
  async buscarCapa(url) {
    if (!url) return "";
    const { imagem } = lerOg((await requestUrl({ url })).text);
    return imagem ? new URL(imagem, url).href : ""; // resolve caminho relativo
  }

  /** Notas da galeria com source e sem imagem. */
  semCapa() {
    return this.app.vault.getMarkdownFiles().filter((f) => {
      if (!this.pastas.some((p) => f.path.startsWith(p))) return false;
      const fm = this.app.metadataCache.getFileCache(f)?.frontmatter;
      return !!fm?.source && !fm.image;
    });
  }

  /**
   * Reprocessa as notas sem capa.
   *
   * O thumb() so dispara quando a nota muda: nota antiga cuja busca falhou (ou
   * que entrou antes disso existir) fica sem preview pra sempre, sem jeito de
   * tentar de novo. Este e o jeito.
   */
  async buscarCapasFaltando() {
    const alvos = this.semCapa();
    if (!alvos.length) {
      new Notice("Todas as notas com source ja tem capa.", 4000);
      return;
    }
    const aviso = new Notice(`Buscando capas 0/${alvos.length}…`, 0);
    let ok = 0;
    let sem = 0;
    for (let i = 0; i < alvos.length; i++) {
      const f = alvos[i];
      try {
        const fm = this.app.metadataCache.getFileCache(f)?.frontmatter || {};
        const img = await this.buscarCapa(normalizarSource(fm.source));
        if (img) {
          await this.app.fileManager.processFrontMatter(f, (m) => {
            m.image = img;
          });
          ok++;
        } else {
          sem++; // o site nao publica og:image nenhuma — nao ha o que buscar
        }
      } catch (e) {
        sem++;
        console.error("clippings-gallery: capa falhou em", f.path, e);
      }
      aviso.setMessage(`Buscando capas ${i + 1}/${alvos.length}…`);
    }
    aviso.hide();
    new Notice(`Capas: ${ok} encontradas · ${sem} sem imagem publicada.`, 7000);
    this.app.workspace.getLeavesOfType(VIEW).forEach((l) => l.view.render?.());
  }
}

module.exports = ClippingsGallery;
