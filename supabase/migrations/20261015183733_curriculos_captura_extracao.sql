-- Aplicada em 15/10/2026 (versão 20261015183733). Função "curriculos" publicada (versão 4).
-- Verificado com a IA real em modo simulação (nada gravado): Word, foto e PDF escaneado extraídos corretamente;
-- travas: endereço de teste fora da pasta/fora da simulação, usuário não-RH e chave errada recusados.
--
-- Captura e extração de currículos (decisões do Asael, 15/10/2026):
--   • duas entradas (arrastar no portal e Power Automate do e-mail do RH) → mesmo processamento no servidor
--     (Edge Function "curriculos");  • PDF, Word e foto;  • arquivo original guardado em área privada;
--   • a IA SÓ SUGERE: candidato entra como 'pendente' e o RH decide (LGPD art. 20 — revisão humana).
ALTER TABLE public.candidatos
  ADD COLUMN cidade        text,
  ADD COLUMN linkedin      text,
  ADD COLUMN experiencias  jsonb NOT NULL DEFAULT '[]'::jsonb,   -- [{empresa, cargo, periodo}]
  ADD COLUMN idiomas       text[],
  ADD COLUMN cnh           text,
  ADD COLUMN arquivo_path  text,                                 -- caminho no armazenamento privado "curriculos"
  ADD COLUMN arquivo_nome  text,
  ADD COLUMN origem        text,                                 -- 'upload' | 'email'
  ADD COLUMN sugestao_ia   text CHECK (sugestao_ia IN ('aprovado','revisao','rejeitado')),
  ADD COLUMN analise_ia    jsonb,                                -- avaliação completa da IA (sugestão)
  ADD COLUMN atualizado_em timestamptz;

-- Armazenamento privado dos currículos: sem políticas para anon/authenticated → só a Edge Function (service role) acessa;
-- o RH abre o arquivo por um link temporário gerado pela função.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('curriculos', 'curriculos', false, 10485760,
        ARRAY['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp'])
ON CONFLICT (id) DO NOTHING;

-- Chave da integração com o Power Automate (gerada no banco; só RH/dev consegue ver, na tela de Configurações).
INSERT INTO private.config VALUES ('curriculos_segredo', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
ON CONFLICT (chave) DO NOTHING;

CREATE OR REPLACE FUNCTION public.curriculos_segredo_ok(p_segredo text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'private', 'public' AS $$
  SELECT p_segredo IS NOT NULL AND p_segredo = (SELECT valor FROM private.config WHERE chave = 'curriculos_segredo');
$$;
REVOKE ALL ON FUNCTION public.curriculos_segredo_ok(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.curriculos_segredo_ok(text) TO service_role;

-- Tela de Configurações: endereço e chave para configurar o Power Automate (só RH/dev).
CREATE OR REPLACE FUNCTION public.integracao_curriculos(p_pedido_por integer)
RETURNS TABLE(chave text) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'private', 'public' STABLE AS $$
BEGIN
  IF NOT public.eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Acesso permitido apenas para RH.'; END IF;
  RETURN QUERY SELECT valor FROM private.config WHERE private.config.chave = 'curriculos_segredo';
END; $$;
REVOKE ALL ON FUNCTION public.integracao_curriculos(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.integracao_curriculos(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.eh_rh(integer) TO service_role;
