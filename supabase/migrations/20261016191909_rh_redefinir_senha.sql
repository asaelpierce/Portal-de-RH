-- Aplicada em 16/10/2026 (versão 20261016191909). Verificado (sessões simuladas, rollback): colaborador não redefine;
-- senha curta e pessoa sem e-mail recusadas; RH redefine → hash bcrypt custo 10 gravado e levado ao login do Supabase;
-- a nova senha confere tanto no cadastro quanto no login.
--
-- Redefinir senha pelo RH (16/10/2026, etapa 4 do login). Antes de apagar as senhas em texto aberto, o RH precisa de um
-- jeito correto de ajudar quem esqueceu a senha. A senha é gravada só criptografada (bcrypt) e o gatilho
-- garante_conta_login leva a nova senha para o login do Supabase. Nada da senha é registrado.
CREATE OR REPLACE FUNCTION public.rh_redefinir_senha(p_pedido_por integer, p_usuario_id integer, p_senha text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE u usuarios;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH redefine senhas.'; END IF;
  IF length(coalesce(p_senha,'')) < 8 THEN RAISE EXCEPTION 'A senha precisa ter pelo menos 8 caracteres.'; END IF;
  SELECT * INTO u FROM usuarios WHERE id = p_usuario_id;
  IF NOT FOUND OR coalesce(u.status,'ativo') <> 'ativo' THEN RAISE EXCEPTION 'Colaborador não encontrado entre os ativos.'; END IF;
  IF u.email IS NULL OR btrim(u.email) = '' THEN RAISE EXCEPTION 'Este colaborador não tem e-mail cadastrado: cadastre o e-mail antes de criar a senha.'; END IF;
  UPDATE usuarios SET password_hash = extensions.crypt(p_senha, extensions.gen_salt('bf', 10)) WHERE id = p_usuario_id;
  RETURN true;
END; $$;
REVOKE ALL ON FUNCTION public.rh_redefinir_senha(integer,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rh_redefinir_senha(integer,integer,text) TO authenticated;
