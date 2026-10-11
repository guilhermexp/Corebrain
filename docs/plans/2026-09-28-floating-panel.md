# Painel flutuante — aprovado pelo usuário

## Contrato
O clique no ícone, no modo padrão `popup`, abre o painel compacto em iframe
isolado dentro da página, não dentro da janela nativa retangular. Manter modos
explícitos `reader` e `embedded`, captura e sincronizações. Host arredondado,
220px, topo/direita, sombra única, sem movimentar o conteúdo do site. Altura
acompanha conteúdo com limite de viewport. Fechar por ícone, Esc ou clique fora;
restaurar foco. Sem bibliotecas novas ou alterações no pareamento.

## Limites e segurança
Páginas internas/protegidas e injeção recusada usam janela independente da
extensão (o fallback nativo de toolbar foi removido; ver correção abaixo). Mensagens
entre iframe e host só controlam altura/fechamento; validar source e origem,
limitar alturas e nunca enviar tokens ou conteúdo privado ao host. Preservar
side-panel. Recarga da extensão e da página pode ser necessária em abas antigas.

## Comprovação
Testes isolados de roteamento, host e cliente antes da implementação; build
Chrome, suíte completa, preview do host real com conteúdo de teste e revisão.
Validação da extensão instalada depende de recarga no Helium.

## Evidência 2026-09-28

- Host e cliente implementados separadamente; source/origin validados; origem
  HTTP(S) do pai transmitida no URL como fallback ao referrer.
- Revisão encontrou e corrigiu: captura rápida fechava painel existente e
  transmitia captura a outras abas; altura presa ao tamanho anterior; conteúdo
  alto sem rolagem; ações leitor/marca-texto não fechavam o painel flutuante.
- 734 testes / 76 arquivos aprovados (`--maxWorkers=2 --testTimeout=20000`).
- Typecheck sem novos erros; persistem os três erros de configuração de módulos
  já existentes em cli.ts, menu-labels.test.ts e icons.test.ts.
- Preview de página real no Helium com host/cliente compilados e CSS atualizado:
  cantos arredondados sem retângulo externo, iframe ajustado ao conteúdo,
  mensagem expansível, Escape fecha e restaura foco, clique fora fecha.
- Preview usa dados fictícios; não comprova importação nem substitui teste da
  extensão instalada. Necessário recarregar extensão e página para aceite final.
- Build final Chrome aprovado (3 avisos preexistentes de tamanho); regressão
  da função Instagram extraída do novo bundle também passou (6/6).

## Correção exigida pelo usuário: nenhum popup nativo (2026-09-28)

O fallback anterior voltava a chamar `browser.action.openPopup()` nas páginas
restritas — contradizia a remoção da moldura quadrada. Removido esse caminho
inteiramente, incluindo overrides antigos por aba na inicialização.

- Páginas compatíveis continuam usando o painel injetado arredondado.
- Páginas restritas/falha de injeção abrem janela compacta independente da
  extensão (janela de navegador `windows.create`, não toolbar/action popup).
- A janela independente usa uma única superfície, sem cartão arredondado
  colocado sobre fundo quadrado. A decoração externa dessa janela é do macOS.
- Captura mantém sourceTabId; o foco da nova janela não muda a página de origem.
  A mesma referência chega à leitura de salvos do Instagram e é validada.
- Erro de captura troca “Preparando captura…” por “Captura indisponível”.
- Não se promete janela independente sem decoração/frameless: isso não é
  exposto pela API de extensões Chromium. A correção elimina o popup de toolbar.

### Comprovação da remoção do fallback

- 748 testes / 79 arquivos aprovados, incluindo ausência de `action.openPopup`,
  manifests sem popup, recuperação segura da janela e sourceTabId do Instagram.
- Build Chrome atualizado em `extension/dist` (3 avisos de tamanho existentes).
- Bundle produzido confirmado sem `action.openPopup` e sem `nativeFallback=1`.
- 6/6 fixtures da função Instagram extraída do bundle aprovadas.
- Revisão final sem novos achados P1/P2. Typecheck mantém apenas os três erros
  preexistentes de configuração de módulos mencionados acima.
- Ainda depende de recarga da extensão pelo usuário no Helium para validar a
  instalação em execução; a janela independente não foi verificada visualmente.
