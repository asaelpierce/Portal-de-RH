# Testes — Clube SESI Vespasiano

Dados **fictícios**.

- `teste_logica.mjs` — leitura da Relação de Conveniados (colunas, ponto decimal, data de corte → competência),
  total de titulares, planilha (openpyxl), e-mail e leitura do `relacao_ficticia.pdf` pelo pdf.js (se disponível no
  Node em `PDFJS_NODE` ou `/tmp/pdfjs`): `node testes/sesi/teste_logica.mjs`
- `teste_tela.py` — tela Relatórios › SESI no navegador. Mesmos requisitos dos outros testes de tela. Banco simulado
  compartilhado: `testes/relatorios_mock.js`.
- A leitura também foi validada com a relação real de 16/09/2026 (4 titulares, R$ 190,00), que não fica no repositório.
