# Testes — Seguro de vida (rateio por centro de custo)

Dados **fictícios** (o PDF de teste foi gerado no formato da Prudential, com nomes e CPFs inventados).

- `teste_logica.mjs` — leitura do demonstrativo, planilha (aberta com openpyxl) e e-mail: `node testes/seguro_vida/teste_logica.mjs`
- `teste_tela.py` — tela Relatórios ponta a ponta no navegador (Playwright), com banco simulado mínimo embutido.
  Precisa do portal rodando (`npx vite --port 5173`) e do pdf.js 3.11.174 local
  (`npm install pdfjs-dist@3.11.174` numa pasta temporária; `PDFJS_DIR=<pasta>/node_modules/pdfjs-dist/build`).
- `demonstrativo_ficticio.pdf` — demonstrativo de teste (página em paisagem). O caso de página girada (como o PDF real
  da Prudential) foi validado com o demonstrativo real de set/2026, que não fica no repositório.
