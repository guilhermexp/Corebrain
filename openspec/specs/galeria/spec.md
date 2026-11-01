# galeria Specification

## Purpose
Ciclo de vida da view da galeria: reconstruções da interface não podem acumular trabalho nem reter elementos antigos.

## Requirements

### Requirement: Reconstrução da barra não acumula listeners
Reconstruir a barra da galeria (troca de ordem, modo ou refresh) MUST manter no máximo um listener global do formulário de adicionar por view, e fechar a view MUST remover esse listener.

#### Scenario: Três reconstruções
- **WHEN** a barra é reconstruída três vezes e o usuário clica fora do formulário
- **THEN** o handler de clique fora roda uma vez
