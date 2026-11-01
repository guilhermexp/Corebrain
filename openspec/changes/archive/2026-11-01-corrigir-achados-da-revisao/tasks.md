# Tasks

Cada correção começa por teste que falha reproduzindo o achado (RED), depois a correção (GREEN). Plugin: `node test.js` e `node --test tests/*.test.cjs tests/bridge-http.cjs tests/bridge-onload.cjs`. Extensão: `npm test --prefix extension`.

## 1. Plugin — capas (worker plugin)

- [x] 1.1 P1: fetch protegido (D1) em `buscarCapa` e `baixarBytes`; verificar com testes que og:image privado, redirect para 127.0.0.1, hostname resolvendo para 10.0.0.5 e esquema `file:` não abrem conexão, e que capa pública continua gravada
- [x] 1.2 P1: `encolher` descarta não-imagem e aceita GIF por assinatura (D2); verificar com teste que resposta HTML não cria arquivo em `Capas/`
- [x] 1.3 P2: resultados permanentes saem da fila (D3); verificar com teste de 25 imports sem imagem + 1 válido em que o válido é processado e os 25 não se repetem
- [x] 1.4 P3: cancelamento da fila do Instagram no unload (D4); verificar com teste que após unload nenhum download começa e nenhum `processFrontMatter` roda
- [x] 1.5 P4: clip comum novo do Instagram copia capa (D5); verificar com teste de `/clip` Instagram com CDN permitido gerando `thumb`, e teste de nota antiga sem requisição ao Instagram

## 2. Plugin — ponte, importação e galeria (worker plugin)

- [x] 2.1 E5: `origemPermitida` aceita `safari-web-extension:` (D11); verificar com teste em `bridge-http` para ping e preflight
- [x] 2.2 E6 servidor: rota `GET /prova` e `protocol: 2` conforme D12; verificar com testes de prova correta para nonce conhecido (vetor fixo), 400 para nonce inválido, 403 para origem de site, e rotas autenticadas inalteradas
- [x] 2.3 P5: carimbos pendentes (D6); verificar com teste que reproduz `{criados:0, erros:1}` seguido de repetição que deixa a nota carimbada, e teste que notas legadas não são reescritas
- [x] 2.4 P6: `source` via `parseYaml` (D7), com `package.json` raiz + lockfile e mock do harness; verificar com teste do source comentado retornando duplicata
- [x] 2.5 P7: listener único da barra (D8); verificar com teste de três reconstruções e um único disparo
- [x] 2.6 P8: nome substituto e nomes reservados (D9); verificar com testes de `^` e `CON`
- [x] 2.7 P9: segredos na SecretStorage com migração (D10), `minAppVersion` 1.11.4 e `versions.json`; verificar com testes de primeira execução, migração de `data.json` antigo (campo removido, mesmo token aceito), regeneração imediata, chave do modelo usada nas chamadas, e que `saveData` nunca recebe `ponteToken`/`modeloChave`
- [x] 2.8 CI roda `npm ci` na raiz e todos os `tests/*.test.cjs` + `bridge-*.cjs`; atualizar `SECURITY.md`, `docs/FEATURES.md` e `docs/INSTALL.md` (protocolo 2, Safari, segredos, filtro de rede das capas); verificar com o comando da CI rodando localmente
- [x] 2.9 Captura silenciosa (D18): fechar a janela principal no macOS preserva vault/ponte ocultos; unload remove handlers e before-quit permite Sair. Prova real no vault LifeOS: mesma ponte/PID depois de fechar e novo vídeo recebido sem reabrir o app; activate/quit/unload também comprovados pelo worker no Electron real

## 3. Extensão (worker extensão)

- [x] 3.1 E6 cliente: prova antes do Bearer em `fetchBridge` e `testBridgeConnection`, erros `unverified`/`protocol`, `isCompatibleBridge` exige protocolo 2, mensagens na página de opções (D12); verificar com testes de impostor (sem `Authorization` enviado), plugin antigo (protocolo) e ponte legítima (vetor fixo idêntico ao do 2.2)
- [x] 3.2 E1: lotes de 100 no sync do X com marcador só no fim (D13); verificar com testes de 10.001 itens (101 POSTs, soma correta) e falha no 3º lote (marcador intacto)
- [x] 3.3 E2: `cookies` + host x.com nos manifests Firefox/Safari e UI mostrando `st.error` (D14); verificar com teste dos manifests e de `x-sync-ui` com erro da API
- [x] 3.4 E3: `tabId` de origem em "Abrir incorporado" (D15); verificar com teste de que o background encaminha `toggle-iframe` à aba informada
- [x] 3.5 E4: contagens acumuladas persistidas por lote (D16); verificar com teste de recuperação após primeiro lote mostrando os criados
- [x] 3.6 Builds `build:chrome` e `build:firefox` passam; atualizar `extension/README.md`/docs se citam pareamento
- [x] 3.7 Feedback Instagram solicitado depois da revisão: exibir fase e contagens no resumo compacto, encerrar a barra após 4 s (8 s para falhas/parcial), não reapresentar resultado expirado ao reabrir nem esconder execução nova por timer antigo; verificar regressões temporais e página real do navegador com eventos sintéticos
- [x] 3.8 Captura silenciosa (D18): botão Salvar página atual usa ACK válido da ponte, sem URI nem bloqueio por modelo diário herdado; falha mantém conteúdo/controle recuperáveis. Atualização instalada no Aside e dois vídeos gravados pelo clique normal no ícone e no botão, preservando primeiro plano e vault configurado

## 4. Integração (orquestrador)

- [x] 4.1 Integrar as duas branches e rodar todas as suítes (plugin, extensão, empacotador) no resultado
- [x] 4.2 Ponta a ponta: plugin real (harness) servindo a ponte e o cliente da extensão (`fetchBridge`) falando com ele — prova confere e clip é gravado; com impostor na porta, nada é enviado
- [x] 4.3 Revisão manual de contingência completa conforme AGENTS, após indisponibilidade comprovada dos revisores automáticos: `.tmp/verify/corrigir-achados-da-revisao/manual-review/1/summary.md`; hashes dos arquivos e scanner gitleaks sem pendências; não se trata de exit 0 automático

### Evidência final

- Fontes integradas no checkout de uso. Plugin 0.4.1 carregado no LifeOS; extensão 1.8.2 confirmada no gerenciador do Aside, no mesmo ID/diretório instalado e sem apagar configurações.
- No checkout integrado: suíte Node 112/112, `node test.js` ok, Python 12/12, extensão 87 arquivos e 797/797 testes. Builds Chrome/Firefox passaram com os avisos de tamanho já registrados; pacote final inclui `window-lifecycle.js` e oito checksums conferidos.
- Aceitação real: ícone da barra do Aside → Salvar página atual no YouTube → arquivos reais `Clippings/9 GitHub Repos Blowing Up Right Now (I Tested Every One).md` e `Clippings/FREE 32GB VRAM Server for Running AI Models Locally.md`. O segundo envio foi depois de fechar a janela nativa do Obsidian; a ponte permaneceu no mesmo renderer. Aside em primeiro plano antes/depois; nenhuma nota precisou ser aberta.
- Não foram criados vault/perfil novos para essa aceitação, nem popup por URL, mudança de modelo ou envio direto à API em lugar do botão. O aviso indevido de notas diárias reportado pelo dono foi removido da captura normal.
- Revisão manual registrada em `.tmp/verify/corrigir-achados-da-revisao/manual-review/1/summary.md`, com base, identidade dos 53 arquivos, recibos de indisponibilidade, achados/tratamento e limites. Scanner sobre fonte integrada exata: 3,36 MB, nenhum segredo encontrado.
- Provas anteriores de ordem do X, HMAC e feedback Instagram ficam registradas nesse recibo e em `.tmp/verify/corrigir-achados-da-revisao/verification.md`. Não houve nova importação da conta Instagram nem teste de cookies reais Firefox/Safari. Clique nativo do Dock não foi alegado: a prova do worker exercitou o evento activate no Electron real.

## Workflow follow-up

- Recarregar o plugin no vault e a extensão no navegador; parear de novo só se a migração não preservar o token.
- `/openspec-archive-change`, `/sync`, `/cleanup` (worktrees e branches dos workers).
