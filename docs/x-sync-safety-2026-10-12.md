# X sync: impedir duplicação e captura de foco

## Relato e causa localizada

A sincronização feita pela extensão criava cópias que o plugin só detectava
posteriormente, oferecendo apagar a nota nova. Durante o lote, o Obsidian
voltava ao primeiro plano repetidamente.

Na versão 1.8.0, `x-bookmarks-sync-e-salvar` tratava uma ponte indisponível como
permissão para usar `salvarComoNotas`: uma URI `obsidian://new` por bookmark.
Esse caminho contornava a deduplicação por identidade de fonte do endpoint
`/x-bookmarks`. `silent=true` não impedia a ativação do aplicativo pelo sistema.
O marcador local também não protege uma instalação nova em outro navegador.

O ramo foi confirmado no código distribuído; não há registro de rede da
execução relatada para afirmar por que a ponte estava inacessível naquele momento.
No diagnóstico, o `/ping` autenticado respondeu 200 e o `main.js` instalado no
vault tinha o mesmo SHA-256 do repositório.

## Auditoria somente leitura do vault

Na janela de mtimes observada entre 12:20 e 12:32, havia 2.295 notas
criadas/modificadas; 2.194 tinham `source` escalar de X. Destas, 2.158 tinham
identidade canônica (ID do post) presente em arquivo anterior à janela.
Não se repetiam IDs dentro do próprio lote. Os números são conservadores:
101 notas não entraram no parser restrito de fontes X. Mtime não é prova isolada
de criação; o achado confirma fontes repetidas, não autoriza exclusão de notas.
Nenhuma nota foi alterada ou removida durante essa auditoria.

## Contrato da correção

- A sincronização em lote do X exige a ponte autenticada e compatível.
- Ponte indisponível: parar com orientação de conexão, sem buscar/gravar o lote.
- Falha de escrita: sem fallback por URI e sem avançar o marcador local.
- A deduplicação acontece no plugin antes de criar notas, inclusive em outro navegador.
- Exibir erros e resultados parciais sem anunciar “Tudo em dia”.
- Preservar clippings existentes. Não apagar automaticamente cópias já criadas.

## Verificação

- 93 testes Node do plugin passaram antes da mudança na extensão.
- Consulta real somente leitura `/tem`: 3/3 fontes repetidas reconhecidas
  como já existentes pelo plugin em execução (HTTP 200).
- Extensão 1.8.1: 757 testes / 82 arquivos aprovados; typecheck aprovado.
- 6/6 fixtures de injeção do bundle Instagram aprovadas.
- Builds Chrome, Firefox e Safari aprovados; integridade dos três ZIPs conferida,
  versão 1.8.1 e ausência do fallback X inseguro nos bundles.
- Revisão independente: sem achados materiais; 10 testes do handler real e UI
  reexecutados pelo revisor com sucesso.
- Artefatos locais: `extension/builds/corebrain-clipper-1.8.1-{chrome,firefox,safari}.zip`.
  Esses ZIPs são ignorados pelo Git; o push publica código, não uma GitHub Release.
- O teste real no navegador requer a instalação atualizada; não confundir testes
  automatizados com a extensão que o usuário mantém carregada.
