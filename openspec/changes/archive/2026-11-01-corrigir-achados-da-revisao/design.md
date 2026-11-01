# Design

## Context

Ver proposal.md (Why). O plugin é `main.js` escrito à mão (CommonJS, sem build, `isDesktopOnly: true`), testado com `node test.js` e `node --test tests/*.cjs` sobre o harness em memória `tests/plugin-harness.cjs`. A extensão é TypeScript com webpack e Vitest em `extension/`. Toda chamada da extensão à ponte passa por `fetchBridge()` em `extension/src/utils/bridge-settings.ts`. O roteamento da ponte está em `tratar()` (`main.js` ~1907); origens em `origemPermitida()` (~1421); token em `cfg.ponteToken`, comparado com `timingSafeEqual`. Obsidian instalado: 1.14.5.

## Goals / Non-Goals

**Goals:** corrigir P1–P9 e E1–E6 com teste de regressão para cada um; manter o pareamento existente funcionando após a migração.

**Non-Goals:** melhorias M1–M6 (exceto CI rodar todos os testes Node do plugin); o fetch do botão "+" com URL digitada pelo usuário (`main.js` ~2969) segue sem filtro de rede, porque o destino é escolha explícita do usuário; mudanças no modelo de cópia de capas além de P2–P4.

## Decisions

### D1. Fetch protegido para capas (P1)
`buscarCapa` (HTML da página) e `baixarBytes` (imagem) passam a usar um fetch próprio com `http`/`https` do Node, não `requestUrl`: `requestUrl` segue redirects sem controle e não expõe o IP conectado. O fetch usa a opção `lookup` para validar cada endereço resolvido antes de conectar (fecha DNS rebinding entre checagem e conexão), recusa IP literal bloqueado, segue no máximo 5 redirects manualmente revalidando cada um, só aceita http/https, tem timeout (15 s) e limite de corpo (HTML 5 MB, imagem 20 MB). Blocos recusados: 0/8, 10/8, 100.64/10, 127/8, 169.254/16, 172.16/12, 192.168/16, 224/4, 240/4, ::, ::1, fc00::/7, fe80::/10, ff00::/8 e IPv4 mapeado em IPv6 nesses blocos. Retry no 429 é mantido. Alternativa recusada: checar o hostname antes de `requestUrl` — não cobre redirect nem rebinding.

### D2. Validação de imagem (P1)
`encolher()` deixa de "guardar cru" quando `createImageBitmap` falha: GIF é aceito por assinatura (`GIF87a`/`GIF89a`) sem decodificar; qualquer outro formato que não decodifica vira falha e nada é gravado.

### D3. Resultados permanentes de capa (P2)
Import do Instagram sem imagem permitida retorna `"sem imagem"`; imagem genérica continua `"bloqueado"`. A rotina de fundo põe `"sem imagem"` e `"bloqueado"` em `capasSemJeito` (sessão); `"falhou"` continua elegível. A seleção dos 25 candidatos exclui `capasSemJeito`.

### D4. Cancelamento da fila do Instagram (P3)
A fila `_instagramCoverQueue` ganha sinal de encerramento registrado no unload do plugin: limpa pendentes, e o worker checa o sinal antes de iniciar download e antes de criar arquivo/`processFrontMatter`.

### D5. Capa de clip comum do Instagram (P4)
O retorno antecipado de `thumb()` para Instagram passa a valer só para notas que não são criação nova nesta sessão. "Criação nova" reutiliza o mesmo critério que hoje decide carimbar chegada em create genuíno (não reescreve legadas no startup). Para essas notas, se `image` está em CDN permitido (`imagemInstagramPermitida`) e `capaLocal` está ligado, copia a capa; nunca busca a página do post.

### D6. Carimbo pendente do X (P5)
Quando `processFrontMatter` do carimbo falha após `vault.create`, o caminho entra em `cfg.carimbosPendentes` (array persistido no `data.json`, sem segredo). A cada sync do X e no `onload` (após layout pronto), o plugin tenta carimbar os pendentes que existem e ainda não têm chegada válida, e remove da lista os resolvidos ou apagados. Alternativa recusada: carimbar qualquer duplicata sem chegada — reescreveria notas legadas.

### D7. Source por YAML (P6)
A extração do `source` (`main.js` ~1479–1501) usa `parseYaml` do Obsidian sobre o bloco de frontmatter; erro de parse ou resultado que não é objeto → sem source. O harness (`tests/plugin-harness.cjs`) não tem parser YAML e o repo não tem `package.json` na raiz: criar `package.json` privado na raiz só com a devDependency `yaml` em versão exata e lockfile, o mock de `parseYaml` do harness delega a ela, e a CI roda `npm ci` na raiz antes dos testes Node. Alternativa recusada: parser manual de escalar — repete o defeito que P6 corrige.

### D8. Listener único da barra (P7)
O listener global de "clique fora" do formulário de adicionar é registrado uma vez por view (`registerDomEvent` na view, ou remoção do anterior antes de reconstruir).

### D9. Nome de arquivo (P8)
Depois de `sanitizar()`, se o nome ficar vazio/só pontos/espaços → `Clipping <AAAA-MM-DD HHmmss>`; se o basename for reservado no Windows (case-insensitive, com ou sem extensão) → acrescenta ` _`. A colisão continua tratada pela lógica existente.

### D10. Segredos na SecretStorage (P9)
IDs fixos: `corebrain-ponte-token` e `corebrain-modelo-chave`. `onload`: lê da `app.secretStorage`; se ausente e houver valor no `data.json`, migra (setSecret, apaga campo, `saveData`); se o token continuar ausente, gera `randomBytes(32).hex` e grava. O token fica em memória (`this.ponteToken`) para `autorizado()`; regenerar atualiza memória e SecretStorage na hora. A UI da chave do modelo grava via `setSecret`; leitura na chamada ao modelo. `PADRAO` perde `ponteToken`/`modeloChave`; `salvar()` nunca persiste esses campos. `manifest.json` `minAppVersion` → `1.11.4`; `versions.json` atualizado conforme o padrão do repo. O harness de testes ganha `app.secretStorage` em memória.

### D11. Origem Safari (E5)
`origemPermitida` aceita `safari-web-extension:`.

### D12. Prova de identidade da ponte (E6) — contrato compartilhado
- Rota: `GET /prova?nonce=<64 hex minúsculos>`, sem `Authorization`. Sujeita à mesma regra de origem (D11). Nonce ausente/fora do formato → 400.
- Resposta 200: `{"plugin":"clippings-gallery","protocol":2,"prova":"<hex HMAC-SHA256(chave=token em UTF-8, mensagem='corebrain-ponte-prova:v1:'+nonce)>"}`.
- `/ping` e demais rotas continuam exigindo Bearer; `/ping` passa a anunciar `protocol: 2`.
- Extensão: `fetchBridge()` gera nonce com `crypto.getRandomValues(32)`, chama `/prova` sem `Authorization`, recalcula o HMAC com WebCrypto e compara; só então envia a requisição com Bearer. Falha → lança `BridgeUnverifiedError` (prova errada/ausente) ou `BridgeProtocolError` (404/401 em `/prova` ou `protocol !== 2`); nada do corpo é enviado. `testBridgeConnection()` mapeia para `'unverified'` e `'protocol'`, com mensagens próprias na página de opções. `isCompatibleBridge` passa a exigir `protocol === 2`.
- Por que é seguro expor `/prova` sem token: só revela HMAC de nonces escolhidos pelo chamador; a extensão usa nonce novo de 256 bits a cada requisição, então respostas colhidas não servem para se passar pela ponte. Sites não leem a resposta (origem barrada por CORS/403).
- Alternativa recusada: assinar cada requisição com HMAC em vez de Bearer — muda todas as rotas e o CLI sem ganho proporcional.

### D13. Lotes do X (E1)
`background.ts` divide a lista em lotes de 100, envia em sequência por `fetchBridge('/x-bookmarks')`, soma `criados/pulados/erros`, e só salva o marcador após o último lote ok. Erro em um lote interrompe e reporta. Limite do plugin (10.000) fica como está.

### D14. Cookies do X no Firefox/Safari (E2)
Manifests Firefox e Safari ganham `cookies` e o host `*://*.x.com/*` (o Chrome já tem). `estaLogadoNoX` distingue exceção da API (retorna `{logado:false, error}`) e `x-sync-ui.ts` mostra `st.error` antes da orientação de login.

### D15. Aba de origem no modo incorporado (E3)
`popup.ts` envia `tabId` (o `sourceTabId`/`currentTabId` já conhecido) junto de `getActiveTabAndToggleIframe`; `background.ts` usa esse `tabId` quando presente e só cai na aba ativa quando ausente (popup normal).

### D16. Contagens do Instagram (E4)
O callback de progresso de `sendSaved()` passa as contagens acumuladas após cada lote; `instagram-sync.ts` persiste `created/skipped/errors` junto com `processed/total`.

### D17. Divisão do trabalho
Dois workers em worktrees separados a partir da mesma base: **plugin** (todo `main.js`, `manifest.json`, `versions.json`, `tests/`, `test.js`, CI, docs do plugin; inclui o lado servidor de E5/E6) e **extensão** (todo `extension/`, inclui o lado cliente de E6). O único contrato compartilhado é D12. O orquestrador integra as duas branches e roda o teste ponta a ponta do pareamento.

### D18. Captura silenciosa com vault oculto
Reprodução no Obsidian real: com vault carregado e aplicativo oculto, `/clip` gravou sem abrir nota; após fechar a última janela o renderer e a ponte em 27125 encerraram, embora o processo do app continuasse rodando. O próximo clique caiu em URI e reabriu o vault com a nota de teste. O dono escolheu manter o vault carregado e oculto em vez de enfileirar até reabrir.

No macOS, o plugin registra ciclo de vida Electron da janela principal: fechamento normal oculta em vez de destruir a janela, sem revelar folhas; encerramento explícito do app continua permitido. Registros são pertencentes à instância e removidos no unload; não interceptar fechar abas internas, janelas secundárias ou reinício/reload. Reativação pelo Dock deve mostrar a janela existente. Usar o runtime Electron já fornecido pelo Obsidian (`@electron/remote`), sem dependência nova nem daemon. Comprovar comportamento no runtime real — mocks não provam retenção do renderer ou encerramento nativo.

No envio de página, ponte ausente/sem pareamento/resposta inválida deixa o popup com erro recuperável e conteúdo disponível, nunca invoca URI para simular sucesso. Validar `ok: true`, caminho não vazio e indicador de duplicata antes de incrementar estatística ou fechar popup. O indicador de envio deve ser limpo em `finally`.

A ação visível **Salvar página atual** é uma captura normal pela ponte e não pode ser bloqueada por comportamento diário herdado de um modelo escondido. Não alterar os modelos/configurações do dono para fazer o teste passar nem adicionar semântica de append/overwrite.

Prova de aceitação do dono: atualizar a extensão efetivamente instalada no Aside, usar o vault que ela já tem configurado e salvar um vídeo do YouTube pelo clique normal no ícone da barra e no botão. Conferir arquivo real e foco sem abrir nota/galeria. Não criar vault, perfil, popup por URL ou fluxo alternativo para substituir essa prova. A imagem enviada pelo dono, com o erro de notas diárias, já prova a falha anterior.

## Risks / Trade-offs

- [Plugin e extensão em versões diferentes deixam de parear] → mensagem explícita de "atualize" nos dois casos; release dos dois juntos.
- [Fetch próprio perde algum comportamento do `requestUrl` (proxy do sistema, cookies)] → capas são públicas; sem proxy é aceitável; documentar.
- [Imagens em formato que o Chromium não decodifica (ex.: HEIC) deixam de virar capa] → antes viravam arquivo inválido de qualquer forma.
- [SecretStorage exige Obsidian ≥ 1.11.4] → `minAppVersion` atualizado; o Obsidian atual do dono é 1.14.5.
- [Migração apaga o token do `data.json`] → só apaga depois de `setSecret` e releitura conferirem o mesmo valor.

## Migration Plan

Atualização do plugin migra segredos no primeiro `onload` (D10). Extensão e plugin precisam ser atualizados juntos (protocolo 2). Rollback: reverter as duas branches; o token continua na SecretStorage e pode ser copiado de volta pelas opções (regenerar e colar na extensão).
