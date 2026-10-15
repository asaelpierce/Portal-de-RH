-- Aplicada em 15/10/2026 (versão 20261015171811).
--
-- Sexo (M/F) para concordância de gênero nos documentos (ex.: Termo de uso de imagem escrito só no masculino:
-- "brasileiro, nascido... portador... inscrito"). Fonte: planilha da folha de 15/10/2026. Mesma proteção dos demais dados.
ALTER TABLE public.colaboradores_documentos ADD COLUMN sexo char(1) CHECK (sexo IN ('M','F'));

DROP FUNCTION public.dados_documentos(integer, integer);
CREATE FUNCTION public.dados_documentos(p_usuario_id integer, p_pedido_por integer)
RETURNS TABLE(ctps text, endereco text, rg text, cpf text, data_nascimento date, naturalidade text, estado_civil text, sexo char(1), atualizado_em timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_pedido_por AND role IN ('rh','dev') AND coalesce(status,'ativo')='ativo') THEN
    RAISE EXCEPTION 'Acesso permitido apenas para RH.';
  END IF;
  RETURN QUERY SELECT d.ctps, d.endereco, d.rg, d.cpf, d.data_nascimento, d.naturalidade, d.estado_civil, d.sexo, d.atualizado_em
  FROM colaboradores_documentos d WHERE d.usuario_id = p_usuario_id;
END;
$$;

DROP FUNCTION public.salvar_dados_documentos(integer,integer,text,text,text,text,date,text,text);
-- Grava o conjunto COMPLETO (campo omitido fica em branco) — a tela envia sempre todos os campos.
CREATE FUNCTION public.salvar_dados_documentos(p_pedido_por integer, p_usuario_id integer, p_ctps text, p_endereco text,
  p_rg text DEFAULT NULL, p_cpf text DEFAULT NULL, p_data_nascimento date DEFAULT NULL, p_naturalidade text DEFAULT NULL,
  p_estado_civil text DEFAULT NULL, p_sexo text DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctps text := nullif(btrim(coalesce(p_ctps,'')),''); v_end text := nullif(btrim(coalesce(p_endereco,'')),'');
        v_rg text := nullif(btrim(coalesce(p_rg,'')),''); v_cpf text := nullif(regexp_replace(coalesce(p_cpf,''),'\D','','g'),'');
        v_nat text := nullif(btrim(coalesce(p_naturalidade,'')),''); v_ec text := nullif(btrim(coalesce(p_estado_civil,'')),'');
        v_sx text := nullif(upper(btrim(coalesce(p_sexo,''))),''); v_em timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_pedido_por AND role IN ('rh','dev') AND coalesce(status,'ativo')='ativo') THEN
    RAISE EXCEPTION 'Acesso permitido apenas para RH.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_usuario_id) THEN RAISE EXCEPTION 'Colaborador não encontrado.'; END IF;
  IF v_ctps IS NOT NULL AND (length(v_ctps) < 4 OR length(v_ctps) > 60) THEN RAISE EXCEPTION 'CTPS inválida.'; END IF;
  IF v_end IS NOT NULL AND (length(v_end) < 10 OR length(v_end) > 300) THEN RAISE EXCEPTION 'Endereço incompleto (informe rua, número, bairro, cidade/UF e CEP).'; END IF;
  IF v_rg IS NOT NULL AND (length(v_rg) < 4 OR length(v_rg) > 30) THEN RAISE EXCEPTION 'RG inválido.'; END IF;
  IF v_cpf IS NOT NULL AND NOT cpf_valido(v_cpf) THEN RAISE EXCEPTION 'CPF inválido (confira os números).'; END IF;
  IF p_data_nascimento IS NOT NULL AND (p_data_nascimento > (now() AT TIME ZONE 'America/Sao_Paulo')::date - interval '14 years' OR p_data_nascimento < date '1930-01-01') THEN
    RAISE EXCEPTION 'Data de nascimento fora do esperado.'; END IF;
  IF v_nat IS NOT NULL AND length(v_nat) > 80 THEN RAISE EXCEPTION 'Local de nascimento muito longo.'; END IF;
  IF v_ec IS NOT NULL AND v_ec NOT IN ('solteiro(a)','casado(a)','divorciado(a)','viúvo(a)','em união estável','separado(a)') THEN RAISE EXCEPTION 'Estado civil inválido.'; END IF;
  IF v_sx IS NOT NULL AND v_sx NOT IN ('M','F') THEN RAISE EXCEPTION 'Sexo inválido.'; END IF;
  INSERT INTO colaboradores_documentos AS d (usuario_id, ctps, endereco, rg, cpf, data_nascimento, naturalidade, estado_civil, sexo, atualizado_em, atualizado_por)
  VALUES (p_usuario_id, v_ctps, v_end, v_rg, v_cpf, p_data_nascimento, v_nat, v_ec, v_sx, now(), p_pedido_por)
  ON CONFLICT (usuario_id) DO UPDATE SET ctps = EXCLUDED.ctps, endereco = EXCLUDED.endereco, rg = EXCLUDED.rg, cpf = EXCLUDED.cpf,
    data_nascimento = EXCLUDED.data_nascimento, naturalidade = EXCLUDED.naturalidade, estado_civil = EXCLUDED.estado_civil, sexo = EXCLUDED.sexo,
    atualizado_em = now(), atualizado_por = p_pedido_por
  RETURNING d.atualizado_em INTO v_em;
  RETURN v_em;
END;
$$;
REVOKE ALL ON FUNCTION public.dados_documentos(integer,integer), public.salvar_dados_documentos(integer,integer,text,text,text,text,date,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dados_documentos(integer,integer), public.salvar_dados_documentos(integer,integer,text,text,text,text,date,text,text,text) TO anon, authenticated;
