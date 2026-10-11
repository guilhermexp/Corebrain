# Popup compacto Corebrain

Design aprovado pelo usuário em 2026-09-28: popup escuro, sem gradientes, inspirado na referência fornecida. Marca e configurações no topo; ação principal para salvar a página; ações Instagram e X com rótulos legíveis; feedback de sincronização e erros sempre acessível. Remover prévia textual e propriedades do popup. Pasta, cofre e modelo ficam em Opções de captura recolhidas. Não adicionar upload de arquivos nem importação de favoritos do navegador. Preservar conteúdo extraído internamente para captura, deduplicação e handlers existentes. Não modificar a interface do painel lateral desnecessariamente.

## Revision approved — reference fidelity
User rejected first compact layout. Approved: 260px charcoal rounded card, centered orange bookmark and short heading, discreet gray primary, unboxed sync rows, corner settings, extra capture controls behind corner disclosure. Status stays visible as concise summary with expandable details. Explicit UTF-8 declaration. Diagnose import failure independently; do not claim fixed from ping tests.

### Refinamento aprovado — cantos e alinhamento

Preservar largura de 220px e ações existentes. Usar raio de superfície 22px,
controles de captura 14px e linhas/status 12px. Remover o fundo opaco da raiz
HTML; a superfície visível pertence ao body arredondado. O frame nativo do
popup é controlado pelo navegador e não se promete removê-lo via CSS.
O foco de teclado da captura deve contornar o grupo inteiro, nunca apenas a
metade esquerda; destacar o segmento focado sem desabilitar a acessibilidade.
Uniformizar coluna de ícones, paddings, hover e estado pressionado. Nenhuma
mudança no fluxo de importação ou no side panel neste refinamento.

Implementação: foco visível no grupo de captura completo, sem sombras/outline
sobrepostos nos segmentos; coluna de ícones e raios alinhados. A revisão
identificou propagação do fundo do body para o canvas: corrigida com body
transparente e pseudo-superfície arredondada isolada, sem recortar menus.
Verificação: suíte de 714 testes passou; regressão de forma/foco RED→GREEN.
Detector apontou apenas animações de largura preexistentes fora deste bloco.
Limite: o contorno nativo da janela do Helium permanece sob controle do browser.
Conferência visual em preview com CSS do build final: superfície com cantos
arredondados e fundo separado do canvas; foco de teclado envolve o grupo
completo, inclusive a seta. Estado de erro expandido continua legível.
Preview não equivale à validação do frame nativo da extensão.
