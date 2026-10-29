-- Aplicada em 29/10/2026 (versão 20261029140333). Verificado: João Vitor (CPF fora do cadastro) passou de "?" para
-- "desligado". Exclusões: se o CPF do segurado não estiver no cadastro (ex.: desligado antes da importação de CPFs),
-- busca a situação e a data de desligamento pelo nome.
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.seguro_vida_movimentacao(integer,jsonb)'::regprocedure);
  novo := replace(def,
$$      SELECT s.*, (SELECT dc.status FROM doc dc WHERE dc.cpf = s.cpf LIMIT 1) AS status_portal,
             (SELECT dc.data_desligamento FROM doc dc WHERE dc.cpf = s.cpf LIMIT 1) AS desligamento$$,
$$      SELECT s.*, coalesce((SELECT dc.status FROM doc dc WHERE dc.cpf = s.cpf LIMIT 1),
                           (SELECT u.status FROM usuarios u WHERE sv_norm(u.name) = sv_norm(s.nome) LIMIT 1)) AS status_portal,
             coalesce((SELECT dc.data_desligamento FROM doc dc WHERE dc.cpf = s.cpf LIMIT 1),
                      (SELECT u.data_desligamento FROM usuarios u WHERE sv_norm(u.name) = sv_norm(s.nome) LIMIT 1)) AS desligamento$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho não encontrado.'; END IF;
  EXECUTE novo;
END $do$;
