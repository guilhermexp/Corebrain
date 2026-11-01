# Spec Delta

## Purpose

Contrato HTTP loopback entre a extensão Corebrain e o plugin: quem pode falar com a ponte, como cada lado prova identidade e como as notas recebidas são nomeadas e deduplicadas.

## ADDED Requirements

### Requirement: Origens de extensão aceitas
A ponte MUST aceitar requisições e preflights com origem `chrome-extension:`, `moz-extension:` ou `safari-web-extension:` (sem caminho, query ou fragmento) e requisições sem `Origin` (CLI local). Qualquer outra origem MUST receber 403.

#### Scenario: Extensão Safari pareia
- **WHEN** a extensão Safari chama `/ping` com `Origin: safari-web-extension://<id>` e o token correto
- **THEN** a ponte responde 200 com o protocolo atual

#### Scenario: Site comum continua barrado
- **WHEN** uma página `https://evil.example` chama a ponte
- **THEN** a resposta é 403

### Requirement: Ponte prova conhecer o token antes de recebê-lo
A ponte MUST expor uma rota de desafio que, sem `Authorization`, recebe um nonce aleatório de 32 bytes e devolve o HMAC-SHA256 do nonce com o token como chave. A extensão MUST verificar essa prova com um nonce novo antes de toda requisição que leva o token, e MUST NOT enviar o token nem o conteúdo quando a prova falha ou está ausente. O protocolo anunciado passa a 2.

#### Scenario: Impostor na porta da ponte
- **WHEN** outro processo escuta na porta configurada e responde à rota de desafio sem conhecer o token
- **THEN** a extensão não envia `Authorization` nem o clip, e informa que a ponte não foi verificada

#### Scenario: Ponte legítima
- **WHEN** o plugin está ativo com o mesmo token da extensão
- **THEN** a prova confere e a requisição autenticada segue normalmente

#### Scenario: Plugin com protocolo antigo
- **WHEN** a extensão nova fala com um plugin sem a rota de desafio
- **THEN** a extensão não envia o token e o teste de conexão informa protocolo incompatível, pedindo atualização

#### Scenario: Nonce inválido
- **WHEN** a rota de desafio recebe nonce ausente ou fora do formato
- **THEN** a resposta é 400 e nenhuma prova é calculada

### Requirement: Nome de arquivo recebido pela ponte é sempre utilizável
O nome final da nota criada pela ponte MUST ser não vazio depois da sanitização e MUST NOT ser nome reservado do Windows (`CON`, `PRN`, `AUX`, `NUL`, `COM1`–`COM9`, `LPT1`–`LPT9`, sem diferenciar maiúsculas). Nesses casos o plugin MUST usar um nome substituto válido.

#### Scenario: Título só com caracteres removidos
- **WHEN** um clip chega com nome `^`
- **THEN** a nota é criada com nome substituto visível, nunca `Clippings/.md`

#### Scenario: Nome reservado
- **WHEN** um clip chega com nome `CON`
- **THEN** a nota é criada com nome que não é reservado no Windows

### Requirement: Dedup lê o source como YAML
A detecção de duplicata MUST obter o `source` de nível superior do frontmatter com um parser YAML, respeitando aspas, escapes e comentários. Frontmatter inválido MUST resultar em ausência de `source`, sem erro na requisição.

#### Scenario: Source com comentário
- **WHEN** existe nota com source `https://example.com/page` e chega um clip com `source: "https://example.com/page" # original URL`
- **THEN** a ponte responde duplicata e não cria nova nota

### Requirement: Receber capturas com o vault oculto
No macOS, fechar a janela principal do vault com Corebrain ativo MUST ocultá-la sem descarregar o plugin nem encerrar a ponte. Capturas recebidas nesse estado MUST ser gravadas sem mostrar janela, abrir nota ou abrir a galeria. Escolher Sair do Obsidian MUST continuar encerrando o aplicativo, e descarregar o plugin MUST remover os handlers de ciclo de vida que ele instalou.

#### Scenario: Captura depois de fechar a janela
- **WHEN** o usuário fecha a janela do vault e salva uma página pela extensão com Obsidian ainda rodando
- **THEN** o arquivo é gravado no vault, a extensão recebe a confirmação e nenhuma janela ou nota é aberta

#### Scenario: Encerramento explícito
- **WHEN** o usuário escolhe Sair do Obsidian
- **THEN** a retenção em segundo plano não impede o encerramento nem deixa a ponte órfã

### Requirement: Confirmação de gravação sem fallback que abre o aplicativo
Adicionar uma página MUST NOT despachar `obsidian://` automaticamente quando a ponte não responde. A extensão MUST confirmar sucesso somente após resposta válida da ponte com o caminho gravado; falha ou ausência de confirmação MUST manter o conteúdo capturado disponível e apresentar erro recuperável, sem afirmar que salvou.

#### Scenario: Ponte indisponível
- **WHEN** o usuário salva uma página e não há ponte disponível
- **THEN** o popup mantém a captura, informa que não houve confirmação e não abre o Obsidian

#### Scenario: Resposta inválida
- **WHEN** o endpoint retorna 200 sem `ok: true` ou sem caminho de arquivo válido
- **THEN** a extensão não registra sucesso nem fecha o popup como se tivesse gravado

#### Scenario: Salvar página com modelo diário herdado
- **WHEN** o usuário abre a extensão instalada pelo ícone no Aside e clica em Salvar página atual numa página do YouTube, mesmo com modelo diário previamente configurado
- **THEN** a extensão salva um clipping no vault já configurado e confirma o arquivo sem abrir nota ou galeria, sem exigir troca de modelo e sem usar vault ou perfil de teste
