# Testes — Unimed (rateio e descontos em folha)

Dados **fictícios**.

- `teste_logica.mjs` — leitura dos dois tipos de PDF (Rel1 mensalidade, Rel7 coparticipação), mês do relatório,
  travas (total, PDF repetido, outro PDF) e TODAS as regras confirmadas pelo RH (2 cobertos + 50%, 11%, crédito,
  diretoria, desligado → rescisão), planilha (6 abas) e e-mail: `node testes/unimed/teste_logica.mjs`
- `teste_tela.py` — tela Relatórios › Unimed no navegador, com 2 PDFs de uma vez, vínculo de família desconhecida e
  "refazer". Banco simulado compartilhado: `testes/relatorios_mock.js`.
- `rel1_ficticio.pdf`, `rel7_ficticio.pdf` — PDFs de teste. A leitura também foi validada com os 4 PDFs reais de
  out/2026, que não ficam no repositório.
