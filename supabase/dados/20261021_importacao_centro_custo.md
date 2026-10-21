# Importação do centro de custo — 21/10/2026

- **Fonte:** planilha da folha da BRIT de 15/10/2026 (`Planilha15_10_26.xlsx`, coluna "Descrição (C.Custo)"), 83 linhas, 22 centros de custo.
- **Decisão (Asael, 21/10/2026):** a folha da BRIT é a fonte oficial do centro de custo para o rateio do seguro de vida.
- **Como:** ligação por CPF com `colaboradores_documentos.cpf` (a planilha guarda o CPF como número e perde o zero à
  frente — completado para 11 dígitos antes de comparar). O comando foi rodado direto no banco com a impressão (md5) de
  cada CPF; **os dados não ficam no repositório** (o repositório é público e CPF tem poucas combinações).
- **Resultado:** 82 de 82 ativos da folha com `usuarios.centro_custo` preenchido; nomes gravados exatamente como na folha
  (inclusive a grafia "COMERCIAL ENGENHEARIA ORÇAMENTOS" da BRIT).
- **Divergências encontradas** entre a lista do seguro de set/2026 (montada à mão) e a folha: 10 pessoas em centros de
  custo diferentes (ex.: 4 da "Vulcanização" que na folha estão em Pintura, Corte e Revestimento). A partir de agora o
  rateio segue a folha.
- **Manter atualizado:** admissões novas e mudanças de centro de custo precisam ser refletidas no cadastro (próxima
  importação da folha ou ajuste manual pelo RH).
