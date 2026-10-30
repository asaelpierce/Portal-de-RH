-- Aplicada em 30/10/2026 (versão 20261030123822). Achado no teste: o Supabase não permite apagar direto em
-- storage.objects. A remoção pelo candidato tira o arquivo da lista da ficha (o arquivo fica na pasta privada; o RH
-- pode apagar pela API de arquivos).
CREATE OR REPLACE FUNCTION public.admissao_documento_remover(p_token text, p_caminho text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_docs jsonb;
BEGIN
  IF NOT admissao_token_ok(p_token) THEN RAISE EXCEPTION 'Este link não aceita mais alterações. Fale com o RH.'; END IF;
  UPDATE admissoes SET documentos = coalesce((SELECT jsonb_agg(e) FROM jsonb_array_elements(documentos) e WHERE e->>'caminho' <> p_caminho), '[]'::jsonb),
         atualizado_em = now()
  WHERE token = p_token RETURNING documentos INTO v_docs;
  RETURN v_docs;
END; $$;
