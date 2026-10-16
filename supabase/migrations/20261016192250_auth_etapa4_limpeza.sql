-- Aplicada em 16/10/2026 (versão 20261016192250). Verificado: coluna password inexistente; verify_login inexistente;
-- 77/77 contas com hash bcrypt idêntico ao do login; sem sessão as funções protegidas recusam; RH com sessão funciona.
--
-- Login do Supabase (etapa 4, limpeza final — 16/10/2026, autorizada pelo Asael).
-- 1) Login antigo removido: o portal entra só pelo Supabase desde a etapa 3 (commit eefeb54); nada mais chama verify_login
--    (conferido no banco e no código). Era também um ponto de tentativa de senha aberto a qualquer um.
DROP FUNCTION public.verify_login(text, text);

-- 2) Senhas em TEXTO ABERTO apagadas (92 cadastros). Nada as usava (conferido no banco, no código e nas funções do
--    servidor). O login usa só a senha criptografada (bcrypt). Quem esquecer a senha: RH › Colaboradores › Redefinir senha.
UPDATE public.usuarios SET password = NULL WHERE password IS NOT NULL;
ALTER TABLE public.usuarios DROP COLUMN password;

-- 3) Fim da transição: sem sessão do login, as funções protegidas recusam (antes aceitavam o número enviado pelo
--    navegador, para quem ainda entrasse pelo login antigo).
CREATE OR REPLACE FUNCTION public.quem_pede(p_informado integer) RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v integer;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Entre no portal para fazer isso.'; END IF;
  SELECT id INTO v FROM usuarios WHERE auth_id = auth.uid() AND coalesce(status,'ativo') = 'ativo';
  IF v IS NULL THEN RAISE EXCEPTION 'Sua sessão não corresponde a um cadastro ativo. Saia e entre de novo.'; END IF;
  RETURN v;   -- a sessão manda; o número enviado pelo navegador é ignorado
END; $$;
REVOKE ALL ON FUNCTION public.quem_pede(integer) FROM PUBLIC, anon, authenticated;
