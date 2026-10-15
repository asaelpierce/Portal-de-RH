# Importação de CPF e sexo — 15/10/2026

**Os dados NÃO estão neste repositório** (o repositório é público e CPF é dado pessoal).

- Fonte: `Planilha15_10_26.xlsx` (folha BRIT, 83 colaboradores: nome, sexo, CPF, cargo, centro de custo, admissão).
- Validação: 83 CPFs com dígito verificador correto e sem repetição; em 24 o Excel havia removido o zero à esquerda
  (CPF tratado como número) — restaurado antes de validar.
- Vínculo: pelo nome + data de admissão com a folha de 07/10/2026 → 82 colaboradores (cadastro).
- Destino: `colaboradores_documentos` (cpf, sexo), tabela sem acesso direto do navegador.
- Conferência após gravar: impressão digital md5 de `cadastro|cpf|sexo` (ordenado por cadastro) idêntica à da
  planilha: `783b43c52455c7fb0a8b49ec0f531f3e` (82 linhas, 82 CPFs válidos).
- Também: cargo de Arthur Gomes Silva (10097) → "Assistente de Projetos IIA", conforme a folha.
- Pendentes de decisão do RH (não aplicados): Alejandro Jesus dos Santos Camilo (admissão 20/10/2026, ainda não
  está no portal) e Joao Vitor Silva Martins (100493, estava na folha de 07/10 e não está nesta planilha).
