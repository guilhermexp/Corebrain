# Proposta

## Why

A revisão de 2026-10-30 (plugin, extensão e ponte loopback) encontrou 15 problemas reais: um pedido de rede automático que alcança a rede local a partir de uma página clipada, segredos gravados dentro do vault, uma extensão que entrega o token a qualquer processo na porta da ponte, e falhas funcionais em capas, importação do X/Instagram, dedup e popup. Todos têm cenário reproduzível ou leitura de código direta; corrigir agora evita perda de capas, notas duplicadas e vazamento de segredo.

## What Changes

Plugin (`main.js`):
- P1. A busca automática de capa (página do clip e imagem) recusa destinos de loopback, rede privada, link-local e afins, inclusive após redirect, e não grava no vault resposta que não seja imagem.
- P2. Capa impossível (import do Instagram sem imagem permitida, ícone genérico) sai da fila de fundo da sessão e não bloqueia as demais.
- P3. A fila de capas do Instagram para quando o plugin descarrega; nada é baixado nem gravado depois disso.
- P4. Clipping comum do Instagram recém-criado volta a receber cópia local da capa.
- P5. Nota do X criada sem carimbo de chegada (falha parcial) recebe o carimbo depois, sem tocar notas antigas.
- P6. A dedup lê o `source` do frontmatter com parser YAML real (comentários e escapes).
- P7. Reconstruir a barra da galeria não acumula listeners globais.
- P8. Nome de arquivo vindo da ponte nunca fica vazio nem é nome reservado do Windows.
- P9. **BREAKING (config):** token da ponte e chave do modelo saem do `data.json` e vão para a `SecretStorage` do Obsidian, com migração automática. `minAppVersion` passa a 1.11.4.

Ponte e extensão:
- E1. Sync do X envia bookmarks em lotes; contas com mais de 10.000 bookmarks novos sincronizam.
- E2. Firefox e Safari conseguem ler a sessão do X (permissão `cookies`), e a UI mostra o erro real em vez de "faça login".
- E3. "Abrir incorporado" na janela independente abre o painel na aba de origem.
- E4. Status do sync do Instagram mostra contagens acumuladas mesmo após recarga da extensão.
- E5. A ponte aceita a origem da extensão Safari.
- E6. **BREAKING (protocolo da ponte 1 → 2):** antes de enviar o token, a extensão exige que a ponte prove conhecê-lo (desafio HMAC). Plugin e extensão precisam ser atualizados juntos.

Fora de escopo: as melhorias M1–M6 da revisão, exceto a CI passar a rodar os testes desta change; o plugin `pi-agent` instalado no vault.

## Capabilities

### New Capabilities
- `capas`: busca, download, validação e fila das capas locais dos clippings.
- `ponte-loopback`: contrato HTTP entre extensão e plugin: origens, prova de identidade, autenticação, nomes de arquivo e dedup por `source`.
- `importacao-x`: sincronização dos bookmarks do X, da extensão à nota com carimbo de chegada.
- `importacao-instagram`: sincronização dos salvos do Instagram e o status exibido ao usuário.
- `segredos-do-plugin`: onde o plugin guarda token da ponte e chave do modelo.
- `galeria`: ciclo de vida da view da galeria.
- `painel-da-extensao`: popup, janela independente e painel incorporado da extensão.

### Modified Capabilities
(nenhuma; `openspec/specs/` está vazio)

## Impact

- `main.js`, `manifest.json`, `tests/*.cjs`, `test.js`, `.github/workflows/ci.yml`, `SECURITY.md`, `docs/FEATURES.md`, `docs/INSTALL.md`.
- `extension/src/utils/bridge-settings.ts`, `x-bookmarks.ts`, `x-sync-ui.ts`, `instagram-sync.ts`, `background.ts`, `core/popup.ts`, manifests Firefox/Safari, testes `*.test.ts`.
- Protocolo da ponte vai a 2: extensão nova com plugin antigo (e vice-versa) não pareia; a mensagem de erro manda atualizar.
- Usuário com Obsidian < 1.11.4 deixa de carregar o plugin.
