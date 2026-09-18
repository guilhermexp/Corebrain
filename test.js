/**
 * Checagem das funcoes puras de main.js.  `node test.js`
 *
 * main.js e um arquivo unico que faz require("obsidian") no topo, entao nao da
 * pra importar aqui. Em vez de partir o plugin em modulos (que o Obsidian nao
 * carrega), extraimos as funcoes puras pelo nome e avaliamos so elas.
 */
const fs = require("fs");
const assert = require("assert");

const src = fs.readFileSync(`${__dirname}/main.js`, "utf8");
const pega = (nome) => {
  const i = src.indexOf(`function ${nome}(`);
  assert.ok(i > -1, `${nome} sumiu de main.js`);
  const fim = src.indexOf("\n}\n", i);
  assert.ok(fim > i, `nao achei o fim de ${nome}`);
  return src.slice(i, fim + 2);
};

const { restoDaDescricao, hostDe, dominio, promptTraducao, lerTraducao, aplicarTraducao, semWikilink, desescapar, lerOg, notaDeLink, tituloDaUrl, aoSoltarEmColecao, nomeDeColecao, normalizarSource, origemPermitida, alternarFavorito } = eval(`(() => {
  ${pega("semWikilink")}
  const FAVORITO = "favoritos";
  ${pega("alternarFavorito")}
  ${pega("origemPermitida")}
  ${pega("normalizarSource")}
  ${pega("aoSoltarEmColecao")}
  ${pega("nomeDeColecao")}
  ${pega("sanitizar")}
  ${pega("desescapar")}
  ${pega("lerOg")}
  ${pega("tituloDaUrl")}
  ${pega("notaDeLink")}
  ${pega("restoDaDescricao")}
  ${pega("hostDe")}
  ${pega("dominio")}
  ${pega("promptTraducao")}
  ${pega("lerTraducao")}
  ${pega("aplicarTraducao")}
  return { restoDaDescricao, hostDe, dominio, promptTraducao, lerTraducao, aplicarTraducao, semWikilink, desescapar, lerOg, notaDeLink, tituloDaUrl, aoSoltarEmColecao, nomeDeColecao, normalizarSource, origemPermitida, alternarFavorito };
})()`);

// --- restoDaDescricao ---------------------------------------------------
// o caso que motivou: no X o title e a propria descricao cortada em ~90 chars
assert.strictEqual(
  restoDaDescricao(
    "how many of you send things to yourself on whatsapp and never find them again? i…",
    "how many of you send things to yourself on whatsapp and never find them again? i tried fixing it."
  ),
  "tried fixing it."
);
// o corte do clipper cai no meio da palavra: nao pode sobrar "sapp application"
assert.strictEqual(
  restoDaDescricao(
    "Reply to whatsapp messages directly from your notch. No need to install the what…",
    "Reply to whatsapp messages directly from your notch. No need to install the whatsapp application."
  ),
  "whatsapp application."
);
// title identico a description: nao sobra nada, a linha nao imprime duas vezes
assert.strictEqual(
  restoDaDescricao("Self-hosted WhatsApp API Gateway", "Self-hosted WhatsApp API Gateway"),
  ""
);
// descricao que nao repete o titulo passa inteira
assert.strictEqual(
  restoDaDescricao("matiasbattocchia/open-bsp-api", "Open-source WhatsApp Business platform."),
  "Open-source WhatsApp Business platform."
);
assert.strictEqual(restoDaDescricao("x", ""), "");
assert.strictEqual(restoDaDescricao("x", undefined), "");
// titulo vazio nao pode engolir a descricao: "".startsWith("") e true
assert.strictEqual(restoDaDescricao("", "Uma descricao"), "Uma descricao");
assert.strictEqual(restoDaDescricao("…", "Uma descricao"), "Uma descricao");

// Propriedade: o clipper corta o title em qualquer offset, entao vale testar
// TODOS os offsets — o resto nunca pode comecar no meio de uma palavra.
// (Verificado tambem contra as 2349 notas reais do vault: 0 violacoes.)
const frase =
  "Integrating WhatsApp, SMS and Email separately means maintaining multiple APIs, " +
  "multiple webhooks and multiple invoices. That's not your product.";
for (let n = 1; n < frase.length; n++) {
  const resto = restoDaDescricao(frase.slice(0, n) + "…", frase);
  if (!resto) continue;
  assert.ok(frase.endsWith(resto), `corte ${n}: o resto nao e sufixo da descricao`);
  const antes = frase[frase.length - resto.length - 1];
  assert.ok(
    antes === undefined || !/[\p{L}\p{N}]/u.test(antes),
    `corte ${n}: comeca no meio da palavra -> "${resto.slice(0, 20)}"`
  );
}

// --- hostDe / dominio ---------------------------------------------------
assert.strictEqual(hostDe("https://www.vercel.com/docs"), "vercel.com");
// o clipper as vezes grava source entre <>
assert.strictEqual(hostDe("<https://x.com/a/status/1>"), "x.com");
assert.strictEqual(hostDe("nao e url"), "");
assert.strictEqual(hostDe(undefined), "");

assert.strictEqual(dominio("https://youtu.be/abc"), "youtube");
assert.strictEqual(dominio("https://gist.github.com/x"), "github");
assert.strictEqual(dominio("https://twitter.com/x"), "x");
assert.strictEqual(dominio("https://www.instagram.com/p/abc/"), "instagram");
assert.strictEqual(dominio("https://instagram.com/reel/xyz"), "instagram");
// endsWith sozinho casaria estes com o dominio de verdade — bug que existia
// desde o inicio pra github/youtube/twitter, e que eu repeti no instagram
assert.strictEqual(dominio("https://naoinstagram.com"), "outros");
assert.strictEqual(dominio("https://notgithub.com"), "outros");
assert.strictEqual(dominio("https://fakeyoutube.com"), "outros");
assert.strictEqual(dominio("https://nottwitter.com"), "outros");
// subdominio de verdade continua contando
assert.strictEqual(dominio("https://gist.github.com/x"), "github");
assert.strictEqual(dominio("https://m.youtube.com/watch?v=1"), "youtube");
assert.strictEqual(dominio("https://vercel.com"), "outros");
assert.strictEqual(dominio(""), "outros");

// --- traducao: leitura da resposta do modelo ----------------------------
{
  const ok = lerTraducao('lixo antes [{"n":1,"t":"Titulo","d":"Descricao"}] lixo depois', 1);
  assert.deepStrictEqual(ok.get(1), { t: "Titulo", d: "Descricao" });

  // item fora da faixa, repetido ou vazio nao pode virar escrita no frontmatter
  const sujo = lerTraducao(
    '[{"n":0,"t":"a"},{"n":9,"t":"b"},{"n":1,"t":"bom","d":"ok"},{"n":1,"t":"duplicado"},' +
      '{"n":2,"t":"","d":""},{"n":2},{"n":"x","t":"c"}]',
    2
  );
  assert.strictEqual(sujo.size, 1, "so o item 1 e valido");
  assert.deepStrictEqual(sujo.get(1), { t: "bom", d: "ok" });

  // sem JSON tem que estourar, nao devolver vazio em silencio
  assert.throws(() => lerTraducao("desculpe, nao posso ajudar", 3), /JSON/);
}

// --- traducao: escrita preservando o original --------------------------
{
  const fm = { title: "Hello world", description: "A tool for X", tags: ["x-bookmark"] };
  assert.strictEqual(aplicarTraducao(fm, { t: "Ola mundo", d: "Uma ferramenta para X" }), true);
  assert.strictEqual(fm.title, "Ola mundo");
  assert.strictEqual(fm.title_original, "Hello world");
  assert.strictEqual(fm.description_original, "A tool for X");
  assert.deepStrictEqual(fm.tags, ["x-bookmark"], "nao pode mexer nos outros campos");

  // O PONTO CRITICO: rodar de novo nao pode sobrescrever o backup com a traducao,
  // senao o texto de origem some — e estas notas nao estao no git do vault.
  aplicarTraducao(fm, { t: "Ola mundo v2", d: "Outra traducao" });
  assert.strictEqual(fm.title_original, "Hello world", "backup foi sobrescrito!");
  assert.strictEqual(fm.description_original, "A tool for X", "backup foi sobrescrito!");
  assert.strictEqual(fm.title, "Ola mundo v2");

  // campo ausente na resposta nao apaga o que existe
  const so = { title: "Keep me", description: "Traduz isto" };
  aplicarTraducao(so, { t: "", d: "Isto foi traduzido" });
  assert.strictEqual(so.title, "Keep me");
  assert.strictEqual(so.title_original, undefined, "sem traducao, sem backup");
  assert.strictEqual(so.description_original, "Traduz isto");

  // traducao identica ao original nao suja o frontmatter com backup inutil
  const igual = { description: "Ja em portugues" };
  assert.strictEqual(aplicarTraducao(igual, { t: "", d: "Ja em portugues" }), false);
  assert.strictEqual(igual.description_original, undefined);
}

// --- traducao: prompt ---------------------------------------------------
{
  const p = promptTraducao([{ t: "A", d: "B" }, { t: "C", d: "" }]);
  assert.ok(p.includes("1. t: A"), "numera a partir de 1");
  assert.ok(p.includes("2. t: C"));
  assert.ok(/portugues do Brasil/i.test(p));
  // sem isto o modelo traduz "mainamirh/obsidian-link-cards" e quebra a busca
  assert.ok(/repositorio/i.test(p), "precisa mandar manter nome de repo em ingles");
}

// --- semWikilink: os 1163 nos fantasma do grafo -------------------------
assert.strictEqual(semWikilink("[[Brian]]"), "Brian");
assert.strictEqual(semWikilink("[[Md Ismail \u0160ojal \ud83d\udd77\ufe0f]]"), "Md Ismail \u0160ojal \ud83d\udd77\ufe0f");
assert.strictEqual(semWikilink("  [[Com espaco em volta]]  "), "Com espaco em volta");
// alias: o que aparece na tela e o lado direito
assert.strictEqual(semWikilink("[[Nome Real|Apelido]]"), "Apelido");
// caminho: o Obsidian mostra so o ultimo trecho
assert.strictEqual(semWikilink("[[pessoas/Fulano]]"), "Fulano");
// ja limpo passa batido (a limpeza tem que ser idempotente)
assert.strictEqual(semWikilink("Brian"), "Brian");
assert.strictEqual(semWikilink(semWikilink("[[Brian]]")), "Brian");
// vazio/nulo nao pode virar a string "null"/"undefined" no frontmatter
assert.strictEqual(semWikilink(""), "");
assert.strictEqual(semWikilink(null), "");
assert.strictEqual(semWikilink(undefined), "");
// link no MEIO de um texto nao e o caso do campo author: nao mexer
assert.strictEqual(semWikilink("texto com [[link]] no meio"), "texto com [[link]] no meio");
assert.strictEqual(semWikilink("[[um]] e [[dois]]"), "[[um]] e [[dois]]");

// --- adicionar link: leitura das meta tags -----------------------------
{
  assert.strictEqual(desescapar("Foo &amp; Bar"), "Foo & Bar");
  assert.strictEqual(desescapar("&lt;tag&gt; &quot;x&quot; &#39;y&#39;"), '<tag> "x" \'y\'');
  assert.strictEqual(desescapar("&#x1F600; ok"), "\u{1F600} ok");
  assert.strictEqual(desescapar("quebra\n  de   linha"), "quebra de linha");
  // entidade que eu nao trato fica como esta, nao vira lixo
  assert.strictEqual(desescapar("50&deg; hoje"), "50&deg; hoje");

  // property ANTES de content
  const a = lerOg('<meta property="og:title" content="Titulo A"><meta property="og:image" content="https://i/a.png">');
  assert.strictEqual(a.titulo, "Titulo A");
  assert.strictEqual(a.imagem, "https://i/a.png");

  // content ANTES de property: e como o YouTube publica, e foi o que ja me mordeu
  const b = lerOg('<meta content="Titulo B" property="og:title">');
  assert.strictEqual(b.titulo, "Titulo B");

  // name= em vez de property= (Twitter cards e a description classica)
  const c = lerOg('<meta name="twitter:title" content="Titulo C"><meta name="description" content="Desc C">');
  assert.strictEqual(c.titulo, "Titulo C");
  assert.strictEqual(c.descricao, "Desc C");

  // sem og: cai no <title> da pagina
  const d = lerOg("<html><head><title>  Titulo  do  HTML  </title></head></html>");
  assert.strictEqual(d.titulo, "Titulo do HTML");

  // og:title ganha do <title>
  const e = lerOg('<title>Ignorar</title><meta property="og:title" content="Vencedor">');
  assert.strictEqual(e.titulo, "Vencedor");

  // pagina sem nada nao pode estourar
  assert.deepStrictEqual(lerOg(""), { titulo: "", descricao: "", imagem: "" });
  assert.deepStrictEqual(lerOg(null), { titulo: "", descricao: "", imagem: "" });
}

// --- adicionar link: montagem da nota ----------------------------------
{
  const { nome, conteudo } = notaDeLink(
    "https://exemplo.com/a?b=1",
    { titulo: 'Um "titulo" com: dois pontos', descricao: "A descricao", imagem: "https://i/x.png" },
    "2026-08-06"
  );
  // aspas e dois pontos sem escape quebrariam o YAML da nota inteira
  const linha = (k) => conteudo.split("\n").find((l) => l.startsWith(k + ": "));
  assert.doesNotThrow(() => JSON.parse(linha("title").slice(7)));
  assert.strictEqual(JSON.parse(linha("title").slice(7)), 'Um "titulo" com: dois pontos');
  assert.strictEqual(JSON.parse(linha("source").slice(8)), "https://exemplo.com/a?b=1");
  assert.ok(conteudo.startsWith("---\n") && conteudo.includes('\n  - "clippings"'));
  assert.ok(conteudo.includes("created: 2026-08-06"));
  // o nome do arquivo nao pode levar caractere que o sistema recusa
  assert.ok(!/[\\/:*?"<>|]/.test(nome), `nome invalido: ${nome}`);

  // sem imagem, o campo nao entra (a galeria trata ausencia, nao string vazia)
  const semImg = notaDeLink("https://x.dev", { titulo: "T", descricao: "", imagem: "" }, "2026-01-01");
  assert.ok(!semImg.conteudo.includes("image:"));

  // sem og:title: o host sozinho nao identifica nada, entao entra o caminho.
  // Instagram e o caso real: paywall de login, zero tag og na resposta.
  assert.strictEqual(tituloDaUrl("https://www.instagram.com/reel/DbvdH3KjZH7/"), "instagram.com - reel/DbvdH3KjZH7");
  assert.strictEqual(tituloDaUrl("https://vercel.com/docs/cli"), "vercel.com - docs/cli");
  assert.strictEqual(tituloDaUrl("https://vercel.com/"), "vercel.com"); // raiz: so o host
  assert.strictEqual(tituloDaUrl("nao e url"), "nao e url");
  assert.strictEqual(tituloDaUrl(""), "");
  assert.ok(tituloDaUrl("https://a.dev/" + "x".repeat(200)).length < 90, "nao pode virar nome gigante");

  const semTit = notaDeLink("https://www.vercel.com/docs", { titulo: "", descricao: "", imagem: "" }, "2026-01-01");
  assert.strictEqual(semTit.nome, "vercel.com - docs");
}

// --- arrastar card pra uma colecao ------------------------------------
{
  // filtrado por "agents" e soltou em "videos": MOVE, sai de agents
  assert.deepStrictEqual(
    aoSoltarEmColecao(["x-bookmark", "agents"], "videos", "agents"),
    ["x-bookmark", "videos"]
  );
  // sem filtro de colecao (Tudo, ou filtrado por fonte): so ACRESCENTA.
  // Nao da pra saber de qual das duas colecoes ela deveria sair.
  assert.deepStrictEqual(
    aoSoltarEmColecao(["x-bookmark", "agents"], "videos", null),
    ["x-bookmark", "agents", "videos"]
  );
  // soltar na propria colecao de origem nao pode remove-la NEM reordenar: quem
  // chama compara elemento a elemento pra decidir se grava, e reordenar faria
  // reescrever o arquivo a toa.
  assert.deepStrictEqual(aoSoltarEmColecao(["agents"], "agents", "agents"), ["agents"]);
  assert.deepStrictEqual(
    aoSoltarEmColecao(["x-bookmark", "agents", "macos"], "agents", "agents"),
    ["x-bookmark", "agents", "macos"]
  );
  // ja tem o destino: nao duplica
  assert.deepStrictEqual(aoSoltarEmColecao(["agents", "videos"], "videos", null), ["agents", "videos"]);
  // nota sem tags nenhuma
  assert.deepStrictEqual(aoSoltarEmColecao(undefined, "videos", null), ["videos"]);
  assert.deepStrictEqual(aoSoltarEmColecao([], "videos", "agents"), ["videos"]);
  // tags como escalar, nao lista
  assert.deepStrictEqual(aoSoltarEmColecao("agents", "videos", "agents"), ["videos"]);
  // as tags que nao sao colecao (x-bookmark, clippings) tem que sobreviver
  assert.ok(aoSoltarEmColecao(["clippings", "macos"], "ui-ux", "macos").includes("clippings"));
}

// --- nome de colecao ---------------------------------------------------
assert.strictEqual(nomeDeColecao("Audios e Voz"), "audios-e-voz");
assert.strictEqual(nomeDeColecao("  UI/UX  "), "ui/ux");
assert.strictEqual(nomeDeColecao("Ferramentas #1 (novas)!"), "ferramentas-1-novas");
assert.strictEqual(nomeDeColecao("Programação"), "programação"); // acento e letra, fica
assert.strictEqual(nomeDeColecao("a   b"), "a-b");
// "a - b": o hifen do meio sobrevive ao filtro e vira "a---b" sem o colapso
assert.strictEqual(nomeDeColecao("a - b"), "a-b");
assert.strictEqual(nomeDeColecao("Video / Audio"), "video/audio");
assert.strictEqual(nomeDeColecao("--borda--"), "borda");
// so simbolo nao vira tag: o chamador precisa poder recusar
assert.strictEqual(nomeDeColecao("###"), "");
assert.strictEqual(nomeDeColecao("   "), "");
assert.strictEqual(nomeDeColecao(null), "");
assert.ok(nomeDeColecao("x".repeat(80)).length <= 40);

// --- normalizarSource: e o que decide se uma nota e duplicata ----------
// "<url>" e "url" sao a MESMA pagina. Comparar cru fez o mesmo tweet entrar
// duas vezes: uma clipada pela extensao, outra vinda do sync do X.
assert.strictEqual(normalizarSource("<https://x.com/a/1>"), "https://x.com/a/1");
assert.strictEqual(normalizarSource("  https://x.com/a/1  "), "https://x.com/a/1");
assert.strictEqual(normalizarSource("https://x.com/a/1"), "https://x.com/a/1");
assert.strictEqual(
  normalizarSource("<https://x.com/a/1>"),
  normalizarSource("https://x.com/a/1"),
  "as duas formas tem que colidir no dedup"
);
assert.strictEqual(normalizarSource(undefined), "");
assert.strictEqual(normalizarSource(null), "");
// nao pode inventar: > no meio da URL fica
assert.strictEqual(normalizarSource("https://x.com/a>b"), "https://x.com/a>b");

// --- origemPermitida: fronteira de seguranca do servidor local ---------
// O Origin sozinho nao autentica: a ponte tambem exige o token de instalacao.
// Ainda assim, origens web/opaque precisam ser recusadas antes da autenticacao
// para que um site nao consiga usar a porta local como um oracle.
assert.strictEqual(origemPermitida("chrome-extension://abcdef"), true);
assert.strictEqual(origemPermitida("moz-extension://a1b2c3"), true);
assert.strictEqual(origemPermitida(undefined), false, "sem Origin nao e uma origem de extensao");
assert.strictEqual(origemPermitida(null), false);
assert.strictEqual(origemPermitida(""), false);
assert.strictEqual(origemPermitida("null"), false, 'Origin opaque nao e permitido');

// O QUE NAO PODE: pagina web escrevendo no vault. Navegador sempre manda o
// origin real da pagina, entao estes tem que continuar barrados.
for (const mau of [
  "https://site-malicioso.com",
  "http://localhost:3000",
  "https://127.0.0.1",
  "file://",
  "moz-extension://",
  "https://chrome-extension.com",       // nao e o esquema, e um dominio parecido
  "https://evil.com/chrome-extension://",
]) {
  assert.strictEqual(origemPermitida(mau), false, `deixou passar: ${mau}`);
}
// tipo errado nao pode virar "permitido"
assert.strictEqual(origemPermitida(123), false);
assert.strictEqual(origemPermitida({}), false);

// toda fonte que dominio() devolve precisa ter logo, senao a barra lateral
// renderiza o icone generico sem ninguem perceber (foi o bug do icone vazio)
{
  const src = fs.readFileSync(`${__dirname}/main.js`, "utf8");
  const bloco = src.slice(src.indexOf("const LOGOS"), src.indexOf("\n};", src.indexOf("const LOGOS")));
  const comLogo = new Set([...bloco.matchAll(/^  (\w+):/gm)].map((m) => m[1]));
  for (const f of ["github", "youtube", "x", "instagram", "outros"]) {
    assert.ok(comLogo.has(f), `fonte "${f}" nao tem logo em LOGOS`);
  }
  const corpo = src.slice(src.indexOf("function dominio("));
  const devolvidas = [...corpo.slice(0, corpo.indexOf("\n}")).matchAll(/return "(\w+)"/g)].map((m) => m[1]);
  for (const f of new Set(devolvidas)) assert.ok(comLogo.has(f), `dominio() devolve "${f}" sem logo`);
}

// --- favoritos ---------------------------------------------------------
{
  // liga e desliga
  assert.deepStrictEqual(alternarFavorito(["clippings"]), ["clippings", "favoritos"]);
  assert.deepStrictEqual(alternarFavorito(["clippings", "favoritos"]), ["clippings"]);
  // as outras tags nao podem se perder no caminho
  const t2 = alternarFavorito(["clippings", "agents", "skill"]);
  assert.ok(t2.includes("agents") && t2.includes("skill") && t2.includes("favoritos"));
  assert.deepStrictEqual(alternarFavorito(t2).sort(), ["agents", "clippings", "skill"]);
  // nota sem tag nenhuma
  assert.deepStrictEqual(alternarFavorito(undefined), ["favoritos"]);
  assert.deepStrictEqual(alternarFavorito([]), ["favoritos"]);
  // tags como escalar
  assert.deepStrictEqual(alternarFavorito("clippings"), ["clippings", "favoritos"]);
  // dois cliques voltam ao estado original, sem duplicar nem reordenar
  const orig = ["clippings", "videos"];
  assert.deepStrictEqual(alternarFavorito(alternarFavorito(orig)), orig);
}

// favoritos NAO pode estar em cfg.colecoes: o classificador atribuiria sozinho
{
  const src = fs.readFileSync(`${__dirname}/main.js`, "utf8");
  const padrao = src.slice(src.indexOf("const PADRAO"), src.indexOf("\n};", src.indexOf("const PADRAO")));
  assert.ok(!/favoritos/.test(padrao), "favoritos entrou em PADRAO.colecoes");
}

// TOCAVEL: define onde o botao de play aparece. Errar pra mais poe play em card
// que nao toca; errar pra menos esconde o play justamente nos 898 reels.
{
  const src = fs.readFileSync(`${__dirname}/main.js`, "utf8");
  const m = src.match(/const TOCAVEL =\s*(\/[\s\S]*?\/i);/);
  assert.ok(m, "TOCAVEL sumiu de main.js");
  const TOCAVEL = eval(m[1]);

  for (const u of [
    "https://www.instagram.com/reel/DLSFlQ7xXB1/",
    "https://www.instagram.com/reels/C3DzUlavkqm/",
    "https://www.instagram.com/p/DcoUmZ2RGTD/",
    "https://www.instagram.com/tv/ABC123/",
    "https://www.youtube.com/watch?v=bzf2YZa0Vkg",
    "https://www.youtube.com/shorts/abc",
    "https://youtu.be/abc",
  ]) assert.ok(TOCAVEL.test(u), `deveria tocar: ${u}`);

  for (const u of [
    "https://x.com/vast_ai/status/2043151697837457829",
    "https://github.com/Remocn/remocn",
    "https://www.instagram.com/example/",     // perfil, nao post
    "https://www.instagram.com/explore/",
    "https://naoinstagram.com/reel/abc/",             // dominio parecido
    "",
  ]) assert.ok(!TOCAVEL.test(u), `nao deveria tocar: ${u}`);
}

console.log("ok");
