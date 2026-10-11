# Aceite: clippings, sincronizações e painel compacto

## Escopo solicitado

- Painel compacto, arredondado e sem o antigo popup nativo de toolbar.
- Captura de página, salvos do Instagram e bookmarks do X.
- Feedback de progresso/erro, repetição sem duplicar, preservação de notas e ordem.
- Pedido inicial: commit após validação funcional. Em 2026-10-11, o usuário
  solicitou explicitamente commit e push do estado atual, mesmo com o aceite
  ponta a ponta ainda pendente.
- Alterações em `pi-agent/` não fazem parte deste trabalho.

## Evidência atual

- Plugin: `node test.js` aprovado; 93 testes Node e 10 testes de empacotamento Python aprovados.
- Extensão: 751 testes / 80 arquivos aprovados após fixar a aba de origem
  antes da espera pela ponte (inclui regressão de troca de foco).
- Builds de produção Chrome, Firefox e Safari aprovados (avisos existentes de
  tamanho/performance). Os três bundles foram verificados sem popup nativo e
  com fixação da aba; 6/6 fixtures de injeção do bundle Chrome aprovadas.
- Revisão independente final: nenhum achado material pendente no código revisado.
- `npm run typecheck` aprovado após alinhar `tsconfig.json` ao módulo ES2020 já
  usado pelo loader do webpack. O target JavaScript não foi alterado.
- Plugin instalado no vault tem o mesmo SHA-256 de `main.js` do repositório.
- Ponte real autenticada: `GET /ping` retornou HTTP 200 / protocolo 1.
- Helium: sessão Instagram logada confirmada. A extensão ainda abriu
  `popup.html` como toolbar popup, sem `surface=floating` ou `surface=window`.
- Clique real em Sincronizar Instagram retornou “Não foi possível ler a resposta
  da aba do Instagram”. Isso NÃO é evidência de funcionamento do novo build.
- Depois dessa tentativa: 4.144 notas preservadas, zero criadas, alteradas ou
  removidas, comparadas por SHA-256. A baseline fica fora do repositório.

## Pendências para aceite

- [ ] Recarregar a extensão no Helium. A tentativa direta pelo conector nesta
  retomada retornou `Browser is not available: Helium`; recarga não concluída.
- [ ] Confirmar visualmente o painel flutuante e seus quatro cantos.
- [ ] Confirmar janela independente em uma nova guia/página restrita.
- [ ] Fechar por ×, Escape e clique fora; reabrir e conferir altura/rolagem.
- [ ] Capturar página real, repetir e conferir ausência de duplicação.
- [ ] Importar Instagram até conclusão; conferir progresso, contagens e notas.
- [ ] Repetir Instagram: zero duplicatas; notas preexistentes inalteradas.
- [ ] Sincronizar X e repetir; conferir deduplicação e ordem preservada.
- [ ] Conferir capas em amostra das notas novas.
- Publicação Git autorizada em 2026-10-11 na branch
  `feat/embedded-corebrain-agent`, sem incluir as alterações de `pi-agent/`.
  Essa publicação não representa aceite funcional.

Não confundir testes/artefatos em disco com a versão executada pelo navegador.
Este documento registra estado intermediário, não uma entrega aprovada.

## Estado da tentativa de validação

O critério de aceite ponta a ponta ainda não foi atendido; commit e push foram
autorizados posteriormente pelo usuário em 2026-10-11.
O último teste visual ainda mostrou o toolbar popup antigo. A aba Instagram
permaneceu aberta, pronta para retomar após a recarga manual.

## Verificação pré-push — 2026-10-11

- Reexecutados 93 testes Node do plugin: todos aprovados.
- `git diff --cached --check`: aprovado.
- Nova tentativa de typecheck indisponível neste checkout: `tsc: command not found`
  (dependências da extensão ausentes). O resultado anterior acima é histórico,
  não uma nova execução nesta data.
- Publicação solicitada do estado atual; pendências funcionais acima preservadas.
