# Importar salvos do Instagram (beta)

## Usar

1. Recarregue a extensão Corebrain Web Clipper em Gerenciar extensões. O build Chrome desta implementação está em `extension/dist`; se sua extensão carrega outra pasta, aponte a instalação de desenvolvimento para esse build.
2. Mantenha o Obsidian aberto com o plugin Corebrain/Clippings Gallery ativo e o pareamento já configurado.
3. Abra o Instagram logado no navegador, deixe a aba ativa e abra a extensão.
4. Clique em **Importar salvos do Instagram**, no cabeçalho ou no menu de ações.
5. Acompanhe encontrados, criados, já existentes e erros. Fechar o popup não é uma instrução de cancelar; use Cancelar. Reabrir o popup recupera o status.

O destino padrão é `Clippings`. A primeira versão cobre Todos os salvos, não seleção por coleção. Não altera nem remove os salvos no Instagram.

## Comportamento

- A extensão usa a sessão da própria aba; não envia cookies, CSRF ou senha à ponte local. Os dados das notas vão somente para o plugin pareado.
- Lê a lista completa antes de importar e não usa checkpoint incremental; o vault é a autoridade para deduplicação por shortcode. As URLs existentes não são regravadas.
- Os lotes são enviados do bloco mais antigo para o mais recente; a ordem relativa do feed aparece em “Adicionados recentemente”. Isso não reconstrói a posição dos clippings que já existiam, nem interpreta publicação como data de salvamento.
- Preserva legenda, autor, link, data de publicação disponível e imagens dos CDNs permitidos. Vídeos não são baixados como binários.
- Capas locais de notas novas são opcionais (`capaLocal`), em fila no plugin. Falha gera aviso, sem apagar a nota. Cópias já existentes não são alteradas pelo importador.
- Rate limit, login/verificação e formato inesperado interrompem a coleta, sem contornar desafios. Há limites de segurança de 400 páginas e 20 mil posts; atingir o limite antes do fim não importa uma lista silenciosamente incompleta.
- Cancelamento na gravação para entre lotes; o lote em curso pode terminar. Notas já gravadas ficam preservadas e são ignoradas numa nova varredura.
- Se o service worker for interrompido, a UI informa a interrupção. Não há retomada de cursor: inicie nova varredura. Timeouts de ponte podem deixar resultado indeterminado; a deduplicação torna nova tentativa segura.

## Evidência em 2026-09-26

- Extensão: 694/694 testes em 70 arquivos.
- Plugin: 94/94 testes; `node test.js` passou; quatro replays de 27 duplicatas reais do X criaram zero cópias e preservaram todos os originais.
- Build Chrome de produção passou (3 avisos de tamanho/performance já existentes).
- Typecheck geral mantém somente 3 erros preexistentes de opções de módulo: `src/cli.ts:208`, `src/core/menu-labels.test.ts:13`, `src/icons/icons.test.ts:11`. Nenhum diagnóstico novo de Instagram.
- Revisão independente sem achados materiais pendentes. Cobertura específica: paginação, timeout, 429, cancelamento, schema, dados do script injetado, canonicalização, repetição, ordenação e falha de capas.
- Plugin recarregado no Obsidian, rota Instagram confirmada ativa. Hashes das 897 notas Instagram existentes permaneceram iguais após reload.
- A sessão logada e a página Todos os posts foram conferidas visualmente, mas o endpoint de coleta e a importação ponta a ponta ainda **não foram validados na conta real**. A extensão foi compilada, não recarregada automaticamente no navegador. Não houve importação real nesta implementação.

Sem commit, push ou publicação remota. Os ajustes anteriores do X, capas e YAML continuam preservados na mesma árvore de trabalho.

## Correção de feedback — 2026-09-26 (tarde)

Corrigido o clique sem indicação visual: a interface mostra “Iniciando importação…” imediatamente, sem esperar o background, e bloqueia cliques repetidos. O painel lateral agora inclui o botão e a área de status que o menu já tentava acionar.

Mensagens de runtime têm prazo de 10 segundos. Respostas vazias/inválidas ou indisponibilidade ficam visíveis, sem um snapshot antigo `idle` esconder o erro. Timeout informa resultado indeterminado (o trabalho pode continuar) e orienta reabrir a extensão. Progresso, conclusão e cancelamento confirmados por broadcast não são apagados por respostas atrasadas ou timeout. Cancelamento aparece mesmo se timestamp/contagens coincidirem.

Testes de DOM exercitam cliques e respostas atrasadas, além dos testes do formatador. Revisão independente concluída sem achados materiais restantes. A ativação e a conferência visual deste novo build no Helium continuam pendentes de recarregar a extensão; não confundir build em disco com extensão já carregada.

## Correção de injeção — 2026-09-28

- A tentativa observada no Helium às 11:32 passou pela ponte e terminou com
  `Não foi possível ler a resposta da aba do Instagram.` (estado do worker,
  `updatedAt: 1790605937238`). A captura anterior mostrava outro erro de conexão.
- Causa reproduzida no artefato de produção: `buscarPaginaSalvosNoInstagram`
  era serializada com referência a `instagram_saved_awaiter`, auxiliar externo
  gerado pelo target ES6. Esse auxiliar não existe na aba de destino.
- RED: extração da função de `dist/background.js` e execução em VM isolada
  produziu `ReferenceError: instagram_saved_awaiter is not defined`.
- Correção limitada à função injetada: encadeamento de Promises autocontido,
  preservando host permitido, CSRF local, timeout, paginação e tratamento HTTP.
- Verificação: 714 testes em 73 arquivos aprovados; build Chrome aprovado com
  os três avisos de tamanho preexistentes. Importação completa na conta real
  ainda depende de recarregar a extensão e validar nova tentativa.
- Regressão do bundle: `npm run test:instagram-injection` (após build) executa a
  função extraída em VM sem auxiliares do módulo: seis cenários aprovados
  (sucesso, CSRF ausente, host inválido, HTTP, JSON inválido e aborto).
- Revisão independente sem achados materiais; confirmação de ponta a ponta
  permanece pendente, não substituída pelos testes isolados.
