-- Aplicada em 15/10/2026 (versão 20261015120155).
-- Verificado como anon (com rollback): aceita 1 filho/enteado menor, filho de 18 (adulto) e sobrinho adulto;
-- recusa 2 menores e sobrinho menor. A única resposta real existente já cumpria a regra e não foi alterada.
--
-- Regra do RH para a confraternização (Asael, 15/10/2026): no máximo 1 acompanhante menor de 18 anos,
-- e ele precisa ser filho(a) ou enteado(a). Validada no servidor (o formulário também avisa, mas quem decide é o banco).
CREATE OR REPLACE FUNCTION public.responder_evento(p_slug text, p_usuario_id integer, p_vai boolean, p_email text,
  p_ja_participou boolean, p_acompanhantes jsonb)
RETURNS TABLE(respondido_em timestamptz, atualizado_em timestamptz, primeira_vez boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ev eventos; v_u usuarios; v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
        v_ac jsonb := coalesce(p_acompanhantes, '[]'::jsonb); v_item jsonb; v_idade int; v_ad int := 0; v_ad13 int := 0; v_cr int := 0;
        v_menores int := 0; v_email text := nullif(btrim(coalesce(p_email,'')), ''); v_existia boolean;
BEGIN
  SELECT * INTO v_ev FROM eventos WHERE slug = p_slug;
  IF NOT FOUND THEN RAISE EXCEPTION 'Evento não encontrado.'; END IF;
  IF NOT v_ev.aberto OR (v_ev.prazo IS NOT NULL AND v_hoje > v_ev.prazo) THEN RAISE EXCEPTION 'As inscrições deste evento estão encerradas.'; END IF;
  SELECT * INTO v_u FROM usuarios WHERE id = p_usuario_id AND coalesce(status,'ativo') = 'ativo' AND cadastro IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Colaborador não encontrado na lista de ativos.'; END IF;
  IF p_vai IS NULL THEN RAISE EXCEPTION 'Informe se vai participar.'; END IF;
  IF jsonb_typeof(v_ac) <> 'array' THEN RAISE EXCEPTION 'Lista de acompanhantes inválida.'; END IF;
  IF NOT p_vai THEN v_ac := '[]'::jsonb; END IF;            -- quem não vai não leva acompanhantes
  IF jsonb_array_length(v_ac) > 15 THEN RAISE EXCEPTION 'Máximo de 15 acompanhantes.'; END IF;
  IF v_email IS NOT NULL AND v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'E-mail inválido.'; END IF;
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_ac) LOOP
    IF length(btrim(coalesce(v_item->>'nome',''))) < 3 THEN RAISE EXCEPTION 'Informe o nome completo de cada acompanhante.'; END IF;
    IF coalesce(v_item->>'idade','') !~ '^\d{1,3}$' THEN RAISE EXCEPTION 'Idade inválida para %.', v_item->>'nome'; END IF;
    v_idade := (v_item->>'idade')::int;
    IF v_idade > 120 THEN RAISE EXCEPTION 'Idade inválida para %.', v_item->>'nome'; END IF;
    IF length(btrim(coalesce(v_item->>'parentesco',''))) = 0 THEN RAISE EXCEPTION 'Informe o parentesco de %.', v_item->>'nome'; END IF;
    IF v_idade < 18 THEN
      v_menores := v_menores + 1;
      IF v_item->>'parentesco' NOT IN ('Filho(a)','Enteado(a)') THEN
        RAISE EXCEPTION 'Menores de 18 anos só podem ir se forem filho(a) ou enteado(a) (%).', v_item->>'nome';
      END IF;
    END IF;
    -- Faixas do formulário original: acima de 18 / 13 a 17 / até 12.
    IF v_idade >= 18 THEN v_ad := v_ad + 1; ELSIF v_idade >= 13 THEN v_ad13 := v_ad13 + 1; ELSE v_cr := v_cr + 1; END IF;
  END LOOP;
  IF v_menores > 1 THEN RAISE EXCEPTION 'É permitido levar no máximo 1 acompanhante menor de 18 anos (filho ou enteado).'; END IF;
  SELECT EXISTS (SELECT 1 FROM evento_respostas r WHERE r.evento_id = v_ev.id AND r.usuario_id = p_usuario_id) INTO v_existia;
  RETURN QUERY
  INSERT INTO evento_respostas AS r (evento_id, usuario_id, vai_participar, email, ja_participou, acompanhantes,
                                qtd_adultos, qtd_13_17, qtd_ate_12, tempo_empresa)
  VALUES (v_ev.id, p_usuario_id, p_vai, v_email, p_ja_participou, v_ac, v_ad, v_ad13, v_cr, tempo_de_empresa(v_u.admissao, v_hoje))
  ON CONFLICT (evento_id, usuario_id) DO UPDATE SET
    vai_participar = EXCLUDED.vai_participar, email = EXCLUDED.email, ja_participou = EXCLUDED.ja_participou,
    acompanhantes = EXCLUDED.acompanhantes, qtd_adultos = EXCLUDED.qtd_adultos, qtd_13_17 = EXCLUDED.qtd_13_17,
    qtd_ate_12 = EXCLUDED.qtd_ate_12, tempo_empresa = EXCLUDED.tempo_empresa, atualizado_em = now()
  RETURNING r.respondido_em, r.atualizado_em, NOT v_existia;
END;
$$;
