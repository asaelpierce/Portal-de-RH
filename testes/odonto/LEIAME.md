# Testes — Plano odontológico (Bradesco Dental)

Dados **fictícios**.

- `teste_logica.mjs` — leitura da fatura (beneficiários, lançamentos extras, devoluções negativas, inclusões), total
  da subfatura, planilha (openpyxl) e e-mail: `node testes/odonto/teste_logica.mjs`
- `teste_tela.py` — tela Relatórios › odonto no navegador: rateio, vínculo de titular desconhecido, refazer, planilha
  e histórico. Mesmos requisitos do teste do seguro (portal em :5173, Playwright, `PDFJS_DIR`). Banco simulado
  compartilhado: `testes/relatorios_mock.js`.
- `fatura_ficticia.pdf` — fatura de teste. A leitura também foi validada com a fatura real de 10/2026 (100
  beneficiários, 125 lançamentos, R$ 2.051,75 = total da subfatura), que não fica no repositório.
