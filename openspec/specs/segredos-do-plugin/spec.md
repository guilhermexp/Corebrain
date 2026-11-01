# segredos-do-plugin Specification

## Purpose
Onde o plugin guarda o token da ponte e a chave do modelo, para que segredos não viajem com o vault em sync, git ou backup.

## Requirements

### Requirement: Segredos fora do vault
O token da ponte e a chave do modelo MUST ficar na `SecretStorage` do Obsidian e MUST NOT ser gravados no `data.json` do plugin.

#### Scenario: Primeira execução
- **WHEN** o plugin carrega pela primeira vez sem token
- **THEN** gera um token aleatório de 32 bytes, guarda na SecretStorage e o `data.json` não contém o token

#### Scenario: Chave do modelo configurada
- **WHEN** o usuário informa a chave do modelo nas opções
- **THEN** a chave vai para a SecretStorage e as chamadas ao modelo continuam autenticadas

### Requirement: Migração automática
Ao carregar, se o `data.json` ainda tiver `ponteToken` ou `modeloChave` não vazios, o plugin MUST copiá-los para a SecretStorage, remover os campos do `data.json` e manter o mesmo valor em uso, sem exigir novo pareamento.

#### Scenario: Usuário atualizando com extensão já pareada
- **WHEN** o plugin atualizado carrega com `ponteToken` no `data.json`
- **THEN** o campo some do `data.json` e a extensão continua autenticando com o mesmo token

### Requirement: Rotação continua imediata
Gerar novo token nas opções MUST invalidar o anterior na próxima requisição à ponte.

#### Scenario: Token regenerado
- **WHEN** o usuário gera novo token e a extensão ainda usa o antigo
- **THEN** a próxima requisição da extensão falha na prova/autenticação
