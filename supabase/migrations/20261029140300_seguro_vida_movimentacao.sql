-- Aplicada em 29/10/2026 (versão 20261029140300; o comentário original dizia 28/10 por engano). Ajustada em
-- 20261029140333 (exclusões: situação e desligamento também pelo nome). Verificado (rollback, sessão do RH) com a base
-- real (demonstrativo 09/2026, 79 segurados) e os 83 ativos do cadastro: inclusão = Alejandro (sem nascimento →
-- "verificar"); aprendizes (4) em "verificar"; exclusão = João Vitor (desligado).
--
-- Seguro de vida: listagem de inclusões e exclusões para mandar à Prudential. Ideia do Asael: o RH carrega a
-- lista de COLABORADORES ATIVOS da folha (BRIT) e o portal descobre quem entrou e quem saiu, comparando com os segurados
-- do último demonstrativo da Prudential guardado no portal (pelo CPF). Assim a seguradora recebe a movimentação certa e
-- a fatura já vem com o rateio certo. Aprendizes ficam em "verificar" (regra da apólice a confirmar). Só RH.
CREATE OR REPLACE FUNCTION public.seguro_vida_movimentacao(p_pedido_por integer, p_ativos jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE b seguro_vida_relatorios;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH gera a movimentação do seguro de vida.'; END IF;
  IF jsonb_typeof(p_ativos) <> 'array' OR jsonb_array_length(p_ativos) = 0 THEN RAISE EXCEPTION 'A lista de ativos está vazia.'; END IF;
  SELECT * INTO b FROM seguro_vida_relatorios ORDER BY competencia DESC LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'Carregue antes um demonstrativo da Prudential (ele é a base de quem já está segurado).'; END IF;

  RETURN (
    WITH ativos AS (
      SELECT lpad(regexp_replace(coalesce(e->>'cpf',''),'\D','','g'),11,'0') AS cpf, e->>'nome' AS nome, e->>'sexo' AS sexo, e->>'cargo' AS cargo,
             e->>'centro_custo' AS centro_custo, nullif(e->>'admissao','') AS admissao, nullif(e->>'nascimento','') AS nascimento
      FROM jsonb_array_elements(p_ativos) e WHERE regexp_replace(coalesce(e->>'cpf',''),'\D','','g') <> ''),
    seg AS (
      SELECT lpad(regexp_replace(coalesce(l->>'cpf',''),'\D','','g'),11,'0') AS cpf, l->>'nome' AS nome, l->>'nascimento' AS nascimento,
             l->>'centro_custo' AS centro_custo, l->>'inicio' AS inicio
      FROM jsonb_array_elements(b.linhas) l WHERE coalesce((l->>'premio')::numeric,0) > 0),
    doc AS (SELECT lpad(regexp_replace(coalesce(d.cpf,''),'\D','','g'),11,'0') AS cpf, d.data_nascimento, u.status, u.data_desligamento, u.name
            FROM colaboradores_documentos d JOIN usuarios u ON u.id = d.usuario_id WHERE coalesce(d.cpf,'') <> ''),
    entra AS (
      SELECT a.*, coalesce(a.nascimento, (SELECT dc.data_nascimento::text FROM doc dc WHERE dc.cpf = a.cpf LIMIT 1)) AS nasc,
             (a.cargo ILIKE '%aprendiz%') AS aprendiz
      FROM ativos a WHERE a.cpf NOT IN (SELECT cpf FROM seg)),
    sai AS (
      SELECT s.*, (SELECT dc.status FROM doc dc WHERE dc.cpf = s.cpf LIMIT 1) AS status_portal,
             (SELECT dc.data_desligamento FROM doc dc WHERE dc.cpf = s.cpf LIMIT 1) AS desligamento
      FROM seg s WHERE s.cpf NOT IN (SELECT cpf FROM ativos))
    SELECT jsonb_build_object(
      'base_competencia', b.competencia, 'segurados_base', (SELECT count(*) FROM seg), 'ativos', (SELECT count(*) FROM ativos),
      'inclusoes', coalesce((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'cpf', cpf, 'sexo', sexo, 'nascimento', nasc, 'admissao', admissao,
                    'cargo', cargo, 'centro_custo', centro_custo) ORDER BY nome) FROM entra WHERE NOT aprendiz), '[]'::jsonb),
      'aprendizes', coalesce((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'cpf', cpf, 'admissao', admissao, 'centro_custo', centro_custo) ORDER BY nome)
                    FROM entra WHERE aprendiz), '[]'::jsonb),
      'exclusoes', coalesce((SELECT jsonb_agg(jsonb_build_object('nome', nome, 'cpf', cpf, 'nascimento', nascimento, 'centro_custo', centro_custo,
                    'inicio', inicio, 'status_portal', status_portal, 'desligamento', desligamento) ORDER BY nome) FROM sai), '[]'::jsonb),
      'sem_nascimento', coalesce((SELECT jsonb_agg(nome ORDER BY nome) FROM entra WHERE NOT aprendiz AND nasc IS NULL), '[]'::jsonb))
  );
END; $$;
REVOKE ALL ON FUNCTION public.seguro_vida_movimentacao(integer,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.seguro_vida_movimentacao(integer,jsonb) TO authenticated;
