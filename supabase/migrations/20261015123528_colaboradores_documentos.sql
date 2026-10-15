-- Aplicada em 15/10/2026 (versão 20261015123528).
-- Verificado como anon (com rollback): RH salva e lê; não-RH recusado ao ler e ao salvar; endereço curto recusado;
-- anon sem SELECT direto na tabela.
--
-- Dados para documentos de admissão (decisão do Asael em 15/10/2026: guardar no cadastro, protegido).
-- CTPS e endereço são dados pessoais: o navegador NÃO lê a tabela; só pelas funções abaixo, que exigem RH/dev ativo.
-- Limite conhecido: sem Supabase Auth, o id de quem pede vem do navegador (mesma limitação do resto do portal).
CREATE TABLE public.colaboradores_documentos (
  usuario_id     integer PRIMARY KEY REFERENCES public.usuarios(id),
  ctps           text,
  endereco       text,
  atualizado_em  timestamptz NOT NULL DEFAULT now(),
  atualizado_por integer REFERENCES public.usuarios(id)
);
ALTER TABLE public.colaboradores_documentos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.colaboradores_documentos FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.dados_documentos(p_usuario_id integer, p_pedido_por integer)
RETURNS TABLE(ctps text, endereco text, atualizado_em timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_pedido_por AND role IN ('rh','dev') AND coalesce(status,'ativo')='ativo') THEN
    RAISE EXCEPTION 'Acesso permitido apenas para RH.';
  END IF;
  RETURN QUERY SELECT d.ctps, d.endereco, d.atualizado_em FROM colaboradores_documentos d WHERE d.usuario_id = p_usuario_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.salvar_dados_documentos(p_pedido_por integer, p_usuario_id integer, p_ctps text, p_endereco text)
RETURNS timestamptz
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_ctps text := nullif(btrim(coalesce(p_ctps,'')),''); v_end text := nullif(btrim(coalesce(p_endereco,'')),''); v_em timestamptz;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_pedido_por AND role IN ('rh','dev') AND coalesce(status,'ativo')='ativo') THEN
    RAISE EXCEPTION 'Acesso permitido apenas para RH.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = p_usuario_id) THEN RAISE EXCEPTION 'Colaborador não encontrado.'; END IF;
  IF v_ctps IS NOT NULL AND (length(v_ctps) < 4 OR length(v_ctps) > 60) THEN RAISE EXCEPTION 'CTPS inválida.'; END IF;
  IF v_end IS NOT NULL AND (length(v_end) < 10 OR length(v_end) > 300) THEN RAISE EXCEPTION 'Endereço incompleto (informe rua, número, bairro, cidade/UF e CEP).'; END IF;
  INSERT INTO colaboradores_documentos AS d (usuario_id, ctps, endereco, atualizado_em, atualizado_por)
  VALUES (p_usuario_id, v_ctps, v_end, now(), p_pedido_por)
  ON CONFLICT (usuario_id) DO UPDATE SET ctps = EXCLUDED.ctps, endereco = EXCLUDED.endereco, atualizado_em = now(), atualizado_por = p_pedido_por
  RETURNING d.atualizado_em INTO v_em;
  RETURN v_em;
END;
$$;
REVOKE ALL ON FUNCTION public.dados_documentos(integer,integer), public.salvar_dados_documentos(integer,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dados_documentos(integer,integer), public.salvar_dados_documentos(integer,integer,text,text) TO anon, authenticated;
