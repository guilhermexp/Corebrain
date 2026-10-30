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
