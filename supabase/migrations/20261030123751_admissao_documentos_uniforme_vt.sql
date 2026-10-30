-- Aplicada em 30/10/2026 (versão 20261030123751). Ajustada em 20261030123822 (remoção sem DELETE direto no storage).
-- Verificado (rollback, como anônimo): envio para a pasta do link aceito; pasta inventada barrada; anônimo não lê a
-- pasta; registrar arquivo inexistente recusado; ficha devolve documentos e prazo; remover tira da lista.
--
-- Ficha de admissão (link): envio dos documentos (PDF/foto), prazo e — nos dados do candidato — uniforme,
-- vale-transporte e conta Itaú (pedido do Asael). Documentos numa pasta privada: o candidato só ENVIA para a pasta do
-- próprio link (enquanto o link vale); só o RH lê, por link temporário.
ALTER TABLE public.admissoes ADD COLUMN documentos jsonb NOT NULL DEFAULT '[]'::jsonb, ADD COLUMN prazo_documentos date;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('admissao-documentos', 'admissao-documentos', false, 15728640,
        ARRAY['application/pdf','image/jpeg','image/png','image/heic','image/heif','image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.admissao_token_ok(p_token text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p_token IS NOT NULL AND length(p_token) >= 32 AND EXISTS (SELECT 1 FROM admissoes
    WHERE token = p_token AND status NOT IN ('conferida','cancelada') AND now() <= token_expira_em);
$$;
GRANT EXECUTE ON FUNCTION public.admissao_token_ok(text) TO anon, authenticated;

CREATE POLICY "admissao_docs: candidato envia para a pasta do link" ON storage.objects FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'admissao-documentos' AND public.admissao_token_ok((storage.foldername(name))[1]));
CREATE POLICY "admissao_docs: RH lê" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'admissao-documentos' AND public.eh_rh(public.eu()));
CREATE POLICY "admissao_docs: RH apaga" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'admissao-documentos' AND public.eh_rh(public.eu()));

CREATE OR REPLACE FUNCTION public.admissao_documento_registrar(p_token text, p_tipo text, p_caminho text, p_nome text, p_tamanho bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v admissoes;
BEGIN
  IF NOT admissao_token_ok(p_token) THEN RAISE EXCEPTION 'Este link não aceita mais documentos. Fale com o RH.'; END IF;
  SELECT * INTO v FROM admissoes WHERE token = p_token FOR UPDATE;
  IF p_tipo NOT IN ('identidade','cpf','titulo','endereco','ctps','reservista','vacina','foto','pis','escolaridade','certidoes',
                    'vacina_filhos','cpf_filhos','frequencia_filhos','antecedentes','outro') THEN RAISE EXCEPTION 'Tipo de documento inválido.'; END IF;
  IF p_caminho IS NULL OR left(p_caminho, length(p_token) + 1) <> p_token || '/' THEN RAISE EXCEPTION 'Arquivo inválido.'; END IF;
  IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'admissao-documentos' AND name = p_caminho) THEN RAISE EXCEPTION 'Arquivo não encontrado. Envie de novo.'; END IF;
  IF jsonb_array_length(v.documentos) >= 60 THEN RAISE EXCEPTION 'Limite de arquivos atingido. Fale com o RH.'; END IF;
  UPDATE admissoes SET documentos = documentos || jsonb_build_array(jsonb_build_object('tipo', p_tipo, 'caminho', p_caminho,
      'nome', left(coalesce(p_nome,'arquivo'),120), 'tamanho', p_tamanho, 'enviado_em', now())), atualizado_em = now()
  WHERE id = v.id RETURNING documentos INTO v.documentos;
  RETURN v.documentos;
END; $$;

CREATE OR REPLACE FUNCTION public.admissao_documento_remover(p_token text, p_caminho text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_docs jsonb;
BEGIN
  IF NOT admissao_token_ok(p_token) THEN RAISE EXCEPTION 'Este link não aceita mais alterações. Fale com o RH.'; END IF;
  UPDATE admissoes SET documentos = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(documentos) e WHERE e->>'caminho' <> p_caminho), '[]'::jsonb),
         atualizado_em = now()
  WHERE token = p_token RETURNING documentos INTO v_docs;
  DELETE FROM storage.objects WHERE bucket_id = 'admissao-documentos' AND name = p_caminho AND left(name, length(p_token) + 1) = p_token || '/';
  RETURN v_docs;
END; $$;
GRANT EXECUTE ON FUNCTION public.admissao_documento_registrar(text,text,text,text,bigint), public.admissao_documento_remover(text,text) TO anon, authenticated;

DROP FUNCTION public.admissao_ficha(text);
CREATE FUNCTION public.admissao_ficha(p_token text)
RETURNS TABLE(nome text, email text, telefone text, cargo text, status text, token_expira_em timestamptz, dados_candidato jsonb, documentos jsonb, prazo_documentos date)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF p_token IS NULL OR length(p_token) < 32 THEN RAISE EXCEPTION 'Link inválido.'; END IF;
  RETURN QUERY SELECT a.nome, a.email, a.telefone, a.cargo, a.status, a.token_expira_em, a.dados_candidato,
    (SELECT coalesce(jsonb_agg(e - 'caminho' || jsonb_build_object('caminho', e->>'caminho')), '[]'::jsonb) FROM jsonb_array_elements(a.documentos) e),
    a.prazo_documentos
  FROM admissoes a WHERE a.token = p_token;
END; $$;
GRANT EXECUTE ON FUNCTION public.admissao_ficha(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admissao_definir_prazo(p_pedido_por integer, p_id bigint, p_prazo date)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Acesso permitido apenas para RH.'; END IF;
  UPDATE admissoes SET prazo_documentos = p_prazo, atualizado_em = now() WHERE id = p_id;
END; $$;
REVOKE ALL ON FUNCTION public.admissao_definir_prazo(integer,bigint,date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admissao_definir_prazo(integer,bigint,date) TO authenticated;
