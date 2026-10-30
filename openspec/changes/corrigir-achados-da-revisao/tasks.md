# Tasks

Cada correção começa por teste que falha reproduzindo o achado (RED), depois a correção (GREEN). Plugin: `node test.js` e `node --test tests/*.test.cjs tests/bridge-http.cjs tests/bridge-onload.cjs`. Extensão: `npm test --prefix extension`.

## 1. Plugin — capas (worker plugin)

- [ ] 1.1 P1: fetch protegido (D1) em `buscarCapa` e `baixarBytes`; verificar com testes que og:image privado, redirect para 127.0.0.1, hostname resolvendo para 10.0.0.5 e esquema `file:` não abrem conexão, e que capa pública continua gravada
- [ ] 1.2 P1: `encolher` descarta não-imagem e aceita GIF por assinatura (D2); verificar com teste que resposta HTML não cria arquivo em `Capas/`
- [ ] 1.3 P2: resultados permanentes saem da fila (D3); verificar com teste de 25 imports sem imagem + 1 válido em que o válido é processado e os 25 não se repetem
- [ ] 1.4 P3: cancelamento da fila do Instagram no unload (D4); verificar com teste que após unload nenhum download começa e nenhum `processFrontMatter` roda
- [ ] 1.5 P4: clip comum novo do Instagram copia capa (D5); verificar com teste de `/clip` Instagram com CDN permitido gerando `thumb`, e teste de nota antiga sem requisição ao Instagram

## 2. Plugin — ponte, importação e galeria (worker plugin)

- [ ] 2.1 E5: `origemPermitida` aceita `safari-web-extension:` (D11); verificar com teste em `bridge-http` para ping e preflight
- [ ] 2.2 E6 servidor: rota `GET /prova` e `protocol: 2` conforme D12; verificar com testes de prova correta para nonce conhecido (vetor fixo), 400 para nonce inválido, 403 para origem de site, e rotas autenticadas inalteradas
- [ ] 2.3 P5: carimbos pendentes (D6); verificar com teste que reproduz `{criados:0, erros:1}` seguido de repetição que deixa a nota carimbada, e teste que notas legadas não são reescritas
- [ ] 2.4 P6: `source` via `parseYaml` (D7), com `package.json` raiz + lockfile e mock do harness; verificar com teste do source comentado retornando duplicata
- [ ] 2.5 P7: listener único da barra (D8); verificar com teste de três reconstruções e um único disparo
- [ ] 2.6 P8: nome substituto e nomes reservados (D9); verificar com testes de `^` e `CON`
- [ ] 2.7 P9: segredos na SecretStorage com migração (D10), `minAppVersion` 1.11.4 e `versions.json`; verificar com testes de primeira execução, migração de `data.json` antigo (campo removido, mesmo token aceito), regeneração imediata, chave do modelo usada nas chamadas, e que `saveData` nunca recebe `ponteToken`/`modeloChave`
- [ ] 2.8 CI roda `npm ci` na raiz e todos os `tests/*.test.cjs` + `bridge-*.cjs`; atualizar `SECURITY.md`, `docs/FEATURES.md` e `docs/INSTALL.md` (protocolo 2, Safari, segredos, filtro de rede das capas); verificar com o comando da CI rodando localmente

## 3. Extensão (worker extensão)

- [ ] 3.1 E6 cliente: prova antes do Bearer em `fetchBridge` e `testBridgeConnection`, erros `unverified`/`protocol`, `isCompatibleBridge` exige protocolo 2, mensagens na página de opções (D12); verificar com testes de impostor (sem `Authorization` enviado), plugin antigo (protocolo) e ponte legítima (vetor fixo idêntico ao do 2.2)
- [ ] 3.2 E1: lotes de 100 no sync do X com marcador só no fim (D13); verificar com testes de 10.001 itens (101 POSTs, soma correta) e falha no 3º lote (marcador intacto)
- [ ] 3.3 E2: `cookies` + host x.com nos manifests Firefox/Safari e UI mostrando `st.error` (D14); verificar com teste dos manifests e de `x-sync-ui` com erro da API
- [ ] 3.4 E3: `tabId` de origem em "Abrir incorporado" (D15); verificar com teste de que o background encaminha `toggle-iframe` à aba informada
- [ ] 3.5 E4: contagens acumuladas persistidas por lote (D16); verificar com teste de recuperação após primeiro lote mostrando os criados
- [ ] 3.6 Builds `build:chrome` e `build:firefox` passam; atualizar `extension/README.md`/docs se citam pareamento

## 4. Integração (orquestrador)

- [ ] 4.1 Integrar as duas branches e rodar todas as suítes (plugin, extensão, empacotador) no resultado
- [ ] 4.2 Ponta a ponta: plugin real (harness) servindo a ponte e o cliente da extensão (`fetchBridge`) falando com ele — prova confere e clip é gravado; com impostor na porta, nada é enviado
- [ ] 4.3 Gate `review-pair.sh --gate` sobre o resultado integrado antes do commit final

## Workflow follow-up

- Recarregar o plugin no vault e a extensão no navegador; parear de novo só se a migração não preservar o token.
- `/openspec-archive-change`, `/sync`, `/cleanup` (worktrees e branches dos workers).
