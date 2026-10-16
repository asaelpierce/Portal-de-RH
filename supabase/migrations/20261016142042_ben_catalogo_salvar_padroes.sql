-- Aplicada em 16/10/2026 (versão 20261016142042). Verificado: item sem categoria → 'outros'/'todos'/🎁; edição mantém dados.
--
-- Catálogo de benefícios: campo vazio usa o padrão da tabela (categoria 'outros', elegibilidade 'todos', ícone 🎁),
-- em vez de mandar NULL e esbarrar em NOT NULL (encontrado no teste de 16/10/2026).
CREATE OR REPLACE FUNCTION public.ben_catalogo_salvar(p_pedido_por integer, p_id integer, p_dados jsonb)
RETURNS public.beneficios_catalogo LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c beneficios_catalogo; d jsonb := coalesce(p_dados,'{}'::jsonb);
        v_cat text := coalesce(nullif(btrim(coalesce(d->>'categoria','')),''), 'outros');
        v_ele text := coalesce(nullif(btrim(coalesce(d->>'elegibilidade','')),''), 'todos');
        v_ico text := coalesce(nullif(btrim(coalesce(d->>'icone','')),''), '🎁');
BEGIN
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH altera o catálogo de benefícios.'; END IF;
  IF length(btrim(coalesce(d->>'nome',''))) < 2 THEN RAISE EXCEPTION 'Informe o nome do benefício.'; END IF;
  IF p_id IS NULL THEN
    INSERT INTO beneficios_catalogo (nome, descricao, categoria, icone, valor_empresa, valor_collab, elegibilidade, ativo, criado_por_id)
    VALUES (btrim(d->>'nome'), d->>'descricao', v_cat, v_ico, coalesce(nullif(d->>'valor_empresa','')::numeric,0),
            coalesce(nullif(d->>'valor_collab','')::numeric,0), v_ele, coalesce((d->>'ativo')::boolean, true), p_pedido_por)
    RETURNING * INTO c;
  ELSE
    UPDATE beneficios_catalogo SET nome = btrim(d->>'nome'), descricao = d->>'descricao', categoria = v_cat, icone = v_ico,
      valor_empresa = coalesce(nullif(d->>'valor_empresa','')::numeric,0), valor_collab = coalesce(nullif(d->>'valor_collab','')::numeric,0),
      elegibilidade = v_ele, ativo = coalesce((d->>'ativo')::boolean, ativo)
    WHERE id = p_id RETURNING * INTO c;
    IF NOT FOUND THEN RAISE EXCEPTION 'Benefício não encontrado.'; END IF;
  END IF;
  RETURN c;
END; $$;
REVOKE ALL ON FUNCTION public.ben_catalogo_salvar(integer,integer,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ben_catalogo_salvar(integer,integer,jsonb) TO anon, authenticated;
