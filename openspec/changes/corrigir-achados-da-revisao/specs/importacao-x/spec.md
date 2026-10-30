# Spec Delta

## Purpose

Sincronização dos bookmarks do X pela extensão até notas na galeria com carimbo de chegada, em qualquer navegador suportado e qualquer volume.

## ADDED Requirements

### Requirement: Envio em lotes
A extensão MUST enviar os bookmarks novos à ponte em lotes de no máximo 100 itens, em ordem, acumulando criados, pulados e erros. O marcador de progresso do sync MUST avançar só depois que todos os lotes forem aceitos.

#### Scenario: Primeira sync com 10.001 bookmarks
- **WHEN** a conta tem 10.001 bookmarks novos
- **THEN** todos são enviados em lotes aceitos pela ponte e o resumo soma os resultados de todos os lotes

#### Scenario: Falha no meio
- **WHEN** o terceiro lote falha
- **THEN** o marcador não avança, os lotes já gravados são pulados como duplicata na próxima sync e o erro aparece ao usuário

### Requirement: Sessão do X em todos os navegadores
As builds Chrome, Firefox e Safari MUST declarar o acesso necessário para ler os cookies de sessão de `x.com`. Quando a API de cookies estiver indisponível ou falhar, a UI MUST mostrar esse erro em vez de pedir login.

#### Scenario: Firefox logado no X
- **WHEN** o usuário está logado em x.com no Firefox e inicia a sync
- **THEN** a extensão reconhece a sessão e sincroniza

#### Scenario: API de cookies falha
- **WHEN** a leitura de cookies lança erro
- **THEN** a UI mostra o erro retornado, não "faça login em x.com"

### Requirement: Carimbo de chegada recuperado após falha parcial
Quando a ponte cria a nota de um bookmark mas não consegue gravar o carimbo de chegada, o plugin MUST registrar essa nota como pendente e MUST gravar o carimbo em tentativa posterior (próxima sync ou próximo carregamento), sem alterar chegadas válidas nem notas que não ficaram pendentes.

#### Scenario: Repetição após falha do carimbo
- **WHEN** a primeira sync cria a nota mas falha ao carimbar, e a sync é repetida
- **THEN** a nota passa a ter carimbo de chegada e não é duplicada

#### Scenario: Notas legadas
- **WHEN** o plugin carrega com notas antigas sem carimbo que nunca ficaram pendentes
- **THEN** elas não são reescritas
