# Spec Delta

## Purpose

Busca, download, validação e fila das capas locais dos clippings, sem expor a rede local e sem travar ou perder capas.

## ADDED Requirements

### Requirement: Busca automática de capa só alcança destinos públicos
A busca automática de capa (página de origem do clip e URL da imagem) MUST recusar destinos que resolvem para loopback, rede privada (RFC 1918), link-local, CGNAT, multicast, endereço não especificado, IPv6 ULA/link-local ou IPv4 mapeado nesses blocos. A verificação MUST valer para o endereço efetivamente conectado e para cada redirect. Esquemas diferentes de http(s) MUST ser recusados.

#### Scenario: og:image aponta para a rede local
- **WHEN** um clip chega com `source` público cuja página declara `og:image` `http://192.168.0.1/x`
- **THEN** nenhuma conexão é aberta para 192.168.0.1 e a capa fica sem imagem

#### Scenario: Redirect para loopback
- **WHEN** a URL da imagem é https pública e responde redirect para `http://127.0.0.1:8080/`
- **THEN** o redirect não é seguido e o download falha sem gravar arquivo

#### Scenario: Hostname público que resolve para endereço privado
- **WHEN** o hostname da imagem resolve para 10.0.0.5
- **THEN** a conexão é recusada

#### Scenario: Capa pública continua funcionando
- **WHEN** a imagem está em um host público e responde 200 com JPEG válido
- **THEN** a capa é gravada na pasta de capas e o `thumb` da nota aponta para ela

### Requirement: Só imagem válida vira capa
O plugin MUST gravar como capa apenas bytes que decodificam como imagem (GIF reconhecido pela assinatura do arquivo inclusive). Resposta que não decodifica MUST ser descartada e o resultado MUST ser falha.

#### Scenario: Resposta HTML no lugar da imagem
- **WHEN** a URL da capa responde 200 com uma página HTML
- **THEN** nada é gravado em `Capas/` e o resultado é falha

### Requirement: Capa impossível não bloqueia a fila
Resultados permanentes (import do Instagram sem imagem permitida, imagem genérica do app) MUST sair da fila de fundo pelo resto da sessão; só falhas transitórias podem ser tentadas de novo.

#### Scenario: 25 imports sem imagem na frente da fila
- **WHEN** os 25 primeiros candidatos da rotina de fundo são imports do Instagram sem imagem e o 26º tem imagem válida
- **THEN** a rotina processa o 26º na rodada seguinte e não tenta os 25 de novo na sessão

### Requirement: Fila de capas termina com o plugin
Ao descarregar o plugin, a fila de capas do Instagram MUST descartar itens pendentes e nenhum download iniciado depois MUST acontecer; trabalho em andamento MUST NOT gravar arquivo nem alterar frontmatter após o descarregamento.

#### Scenario: Plugin desativado durante import grande
- **WHEN** o plugin é desativado com itens na fila de capas do Instagram
- **THEN** nenhum novo download começa e nenhuma nota é alterada pela instância antiga

### Requirement: Clipping comum do Instagram recebe capa local
Uma nota do Instagram recém-criada fora do `/instagram-saved` (por `/clip`, URI ou botão de adicionar), com imagem em CDN permitido e capa local habilitada, MUST receber cópia local da capa sem esperar ação manual. Notas antigas do Instagram MUST NOT disparar busca na página do post.

#### Scenario: Clip novo de post do Instagram
- **WHEN** a extensão clipa um post do Instagram com `image` em CDN permitido e `capaLocal` ligado
- **THEN** a capa é copiada para o vault na criação da nota

#### Scenario: Nota antiga do Instagram sem imagem
- **WHEN** o plugin carrega com notas antigas do Instagram sem `image`
- **THEN** nenhuma requisição é feita ao domínio do Instagram para elas
