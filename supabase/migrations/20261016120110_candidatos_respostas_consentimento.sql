-- Aplicada em 16/10/2026 (versão 20261016120110).
--
-- Portal público do candidato (K.Carreiras) passa a enviar pela função "curriculos" (15/10/2026):
-- as respostas às perguntas do formulário passam a ficar guardadas (antes só iam para a IA e se perdiam)
-- e a data em que o candidato concordou com o uso dos dados (LGPD).
ALTER TABLE public.candidatos ADD COLUMN respostas jsonb, ADD COLUMN consentimento_em timestamptz;
