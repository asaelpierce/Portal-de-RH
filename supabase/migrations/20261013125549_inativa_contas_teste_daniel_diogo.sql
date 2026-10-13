-- Aplicada em 13/10/2026 (versão 20261013125549).
-- Verificado: nenhum ativo ficou com gestor/líder apontando para as contas de teste; ativos = 83 da folha + Automação/Dev.
--
-- Contas de teste "Daniel" (id 2) e "Diogo" (id 3): não existem na folha (autorizado pelo Asael em 13/10/2026).
-- Status 'desligado' é o único valor inativo aceito pela tabela; o login já recusa quem não está ativo.
-- Reversível: voltar status para 'ativo'.

-- Antes: o líder Gustavo de Souza Melo (id 10, corte) tinha como gestor a conta de teste "Daniel".
-- Passa para Daniel de Freitas Toledo (id 108), gestor de todos os demais do corte.
UPDATE public.usuarios SET gestor_id = 108 WHERE id = 10 AND gestor_id = 2;

UPDATE public.usuarios SET status = 'desligado' WHERE id IN (2, 3) AND cadastro IS NULL AND status = 'ativo';
