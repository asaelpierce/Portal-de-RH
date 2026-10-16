-- Aplicada em 16/10/2026 (versão 20261016140622). Verificado: vaga criada com área "Manutenção" (setor manutencao).
--
-- Nome do setor na vaga criada pela aprovação de admissão: mesmos rótulos do portal (constante SL do App.jsx).
CREATE OR REPLACE FUNCTION public.nome_setor(p text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p WHEN 'producao' THEN 'Produção' WHEN 'engenharia' THEN 'Engenharia' WHEN 'comercial' THEN 'Comercial' WHEN 'supply' THEN 'Supply'
    WHEN 'financeiro' THEN 'Financeiro' WHEN 'fiscal' THEN 'Fiscal' WHEN 'rh' THEN 'RH' WHEN 'almoxarifado' THEN 'Almoxarifado' WHEN 'pcp' THEN 'PCP'
    WHEN 'qualidade' THEN 'Qualidade' WHEN 'manutencao' THEN 'Manutenção' WHEN 'diretoria' THEN 'Diretoria' WHEN 'gestao' THEN 'Gestão'
    WHEN 'vulcanizacao' THEN 'Vulcanização' WHEN 'producao_b' THEN 'Produção' WHEN 'producao_c' THEN 'Produção' WHEN 'ti' THEN 'Engenharia'
    WHEN 'corte' THEN 'Corte' ELSE p END;
$$;
CREATE OR REPLACE FUNCTION public.mov_decidir(p_pedido_por integer, p_id integer, p_decisao text, p_obs text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE m movimentacoes; v vagas;
BEGIN
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH decide pedidos de admissão/demissão.'; END IF;
  IF p_decisao NOT IN ('aprovado','rejeitado') THEN RAISE EXCEPTION 'Decisão inválida.'; END IF;
  SELECT * INTO m FROM movimentacoes WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado.'; END IF;
  IF m.status <> 'pendente_rh' THEN RAISE EXCEPTION 'Este pedido não está aguardando o RH.'; END IF;
  UPDATE movimentacoes SET rh_decisao = p_decisao, rh_obs = nullif(btrim(coalesce(p_obs,'')),''), rh_em = now(), rh_id = p_pedido_por, status = p_decisao
  WHERE id = p_id RETURNING * INTO m;
  IF p_decisao = 'aprovado' AND m.tipo = 'admissao' THEN
    INSERT INTO vagas (title, area, local, tipo, descricao, salario, requisitos, prazo_encerramento, ativa, movimentacao_id)
    VALUES (m.cargo, nome_setor(m.setor), 'Kalenborn — presencial', 'CLT', coalesce(m.requisitos,'') || CASE WHEN m.salario IS NOT NULL THEN E'\n\nSalário: ' || m.salario ELSE '' END,
            m.salario, m.requisitos, m.prazo_encerramento, true, m.id)
    RETURNING * INTO v;
    UPDATE movimentacoes SET vaga_criada_id = v.id WHERE id = p_id RETURNING * INTO m;
  ELSIF p_decisao = 'aprovado' AND m.tipo = 'demissao' THEN
    UPDATE usuarios SET status = 'desligado', data_desligamento = coalesce(m.ultimo_dia, (now() AT TIME ZONE 'America/Sao_Paulo')::date) WHERE id = m.user_id;
  END IF;
  RETURN jsonb_build_object('movimentacao', to_jsonb(m), 'vaga', CASE WHEN v.id IS NULL THEN NULL ELSE to_jsonb(v) END);
END; $$;
REVOKE ALL ON FUNCTION public.mov_decidir(integer,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.mov_decidir(integer,integer,text,text) TO anon, authenticated;
