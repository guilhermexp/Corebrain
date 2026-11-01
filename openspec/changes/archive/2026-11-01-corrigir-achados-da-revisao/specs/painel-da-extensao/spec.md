# Spec Delta

## Purpose

Popup, janela independente e painel incorporado da extensão: cada ação age sobre a aba de onde o usuário partiu.

## ADDED Requirements

### Requirement: Abrir incorporado age na aba de origem
O botão "Abrir incorporado" MUST abrir o painel incorporado na aba de origem do clip, tanto no popup quanto na janela independente.

#### Scenario: Janela independente
- **WHEN** o usuário abre a janela independente a partir de uma página e clica "Abrir incorporado"
- **THEN** o painel incorporado abre na página de origem, não na janela da extensão
