# Spec Delta

## Purpose

Sincronização dos salvos do Instagram pela extensão e o status de progresso que o usuário vê, inclusive após recarga da extensão.

## ADDED Requirements

### Requirement: Contagens acumuladas persistidas por lote
Durante a sync, o estado persistido MUST trazer, a cada lote concluído, as contagens acumuladas de criados, pulados e erros junto com o progresso. A recuperação após recarga do service worker MUST exibir essas contagens.

#### Scenario: Extensão recarregada depois do primeiro lote
- **WHEN** o primeiro lote cria 100 notas e a extensão é recarregada antes do fim
- **THEN** o status recuperado mostra 100 criados, não 0
