# Testes — Convênio Drogaria Araujo

Dados **fictícios**.

- `teste_logica.mjs` — leitura do relatório RCONV-06 (período → competência, matrícula com zeros, milhar), conferência
  da "Soma Total", planilha (openpyxl) e e-mail: `node testes/araujo/teste_logica.mjs`
- `teste_tela.py` — tela Relatórios › Araujo no navegador. Mesmos requisitos dos outros testes de tela. Banco
  simulado compartilhado: `testes/relatorios_mock.js`.
- `relatorio_ficticio.pdf` — relatório de teste. A leitura também foi validada com o relatório real de 10/2026
  (12 funcionários, R$ 1.258,81 = Soma Total), que não fica no repositório.
