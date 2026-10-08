-- Aplicada no projeto zybkcpvdptabxkxpieuv em 08/10/2026 (versão 20261008110941).
--
-- Código da vaga gerado pelo banco.
-- Por quê: vagas.id é texto sem default; o front inventava o código (6 últimos dígitos do relógio na
-- movimentação de admissão), o que pode colidir. Para a nova tela "Vagas" (criar/editar/encerrar),
-- o banco gera códigos sequenciais curtos: 100, 101, ... (começa em 100 para não colidir com o seed 0xx).
-- Inserts que já mandam id (ex.: movimentação de admissão) continuam funcionando como antes.
-- Obs.: sequências não voltam atrás em rollback, então pode haver "buracos" na numeração (normal).

CREATE SEQUENCE public.vagas_codigo_seq START WITH 100;
ALTER TABLE public.vagas ALTER COLUMN id SET DEFAULT lpad(nextval('public.vagas_codigo_seq')::text, 3, '0');
-- O navegador insere como anon: precisa de USAGE na sequência para o default funcionar.
GRANT USAGE ON SEQUENCE public.vagas_codigo_seq TO anon, authenticated;
