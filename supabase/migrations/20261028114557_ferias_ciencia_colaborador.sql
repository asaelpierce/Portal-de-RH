-- Aplicada em 28/10/2026 (versão 20261028114557). (O comentário original dizia 21/10 por engano; a data certa é 28/10.)
-- Verificado (rollback, sessões reais de RH e de colaborador): RH lança com "ciente" → data registrada e confirmação
-- forjada do colaborador descartada; colaborador confirma pela função; RH não apaga a confirmação; RH não confirma
-- no lugar do colaborador ("Só o próprio colaborador confirma a ciência das férias dele").
--
-- Férias: ciência do colaborador — último item que faltava para o portal substituir o Forms
-- "KdB 163 - Programação de Férias" (pergunta "Colaborador ciente?"). Decisão do Asael: os dois —
-- quem lança marca "colaborador ciente" e o colaborador com acesso também confirma no portal.
ALTER TABLE public.ferias
  ADD COLUMN ciente_lancador boolean NOT NULL DEFAULT false,
  ADD COLUMN ciente_lancador_em timestamptz,
  ADD COLUMN ciente_colaborador_em timestamptz;
COMMENT ON COLUMN public.ferias.ciente_lancador IS 'Quem lançou informou que o colaborador está ciente (pergunta do Forms KdB 163).';
COMMENT ON COLUMN public.ferias.ciente_colaborador_em IS 'O próprio colaborador confirmou a ciência no portal (só ele grava).';

-- Só o próprio colaborador grava a confirmação dele; quando ele mesmo lança, a ciência já fica registrada.
CREATE OR REPLACE FUNCTION public.ferias_ciencia_guarda() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
DECLARE v_eu int := public.eu();
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.ciente_colaborador_em := CASE WHEN v_eu IS NOT NULL AND v_eu = NEW.user_id THEN now() ELSE NULL END;
    NEW.ciente_lancador_em := CASE WHEN NEW.ciente_lancador THEN now() ELSE NULL END;
  ELSE
    IF NEW.ciente_colaborador_em IS DISTINCT FROM OLD.ciente_colaborador_em AND (v_eu IS NULL OR v_eu <> NEW.user_id) THEN
      NEW.ciente_colaborador_em := OLD.ciente_colaborador_em;
    END IF;
    IF NEW.ciente_lancador AND NOT OLD.ciente_lancador THEN NEW.ciente_lancador_em := now();
    ELSIF NOT NEW.ciente_lancador THEN NEW.ciente_lancador_em := NULL;
    ELSE NEW.ciente_lancador_em := OLD.ciente_lancador_em; END IF;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER ferias_ciencia BEFORE INSERT OR UPDATE ON public.ferias FOR EACH ROW EXECUTE FUNCTION public.ferias_ciencia_guarda();

-- "Estou ciente": só o próprio colaborador, pela sessão.
CREATE OR REPLACE FUNCTION public.ferias_confirmar_ciencia(p_pedido_por integer, p_ferias_id integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r ferias;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  SELECT * INTO r FROM ferias WHERE id = p_ferias_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Férias não encontradas.'; END IF;
  IF r.user_id <> p_pedido_por THEN RAISE EXCEPTION 'Só o próprio colaborador confirma a ciência das férias dele.'; END IF;
  IF r.status IN ('cancelado','rejeitado') THEN RAISE EXCEPTION 'Estas férias foram canceladas ou recusadas.'; END IF;
  UPDATE ferias SET ciente_colaborador_em = coalesce(ciente_colaborador_em, now()) WHERE id = p_ferias_id RETURNING * INTO r;
  RETURN to_jsonb(r);
END; $$;
REVOKE ALL ON FUNCTION public.ferias_confirmar_ciencia(integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ferias_confirmar_ciencia(integer,integer) TO authenticated;
REVOKE ALL ON FUNCTION public.ferias_ciencia_guarda() FROM PUBLIC, anon, authenticated;
