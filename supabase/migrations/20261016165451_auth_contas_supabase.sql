-- Aplicada em 16/10/2026 (versão 20261016165451).
-- Verificado: 77 contas e 77 identidades criadas e ligadas; senha (hash) e e-mail idênticos aos do cadastro em 77/77;
-- "quem sou eu" reconhece a sessão e recusa anônimo e desligado; desligar bloqueia o login, reativar desbloqueia;
-- e-mail novo vira o login; logado não lê colunas de senha; catálogo de benefícios visível para logado.
-- Nenhuma senha é lida, exibida ou guardada neste arquivo: o hash é copiado dentro do banco.
--
-- Login do Supabase (etapa 1, 16/10/2026): cada colaborador ativo com e-mail ganha conta no Supabase Auth com a MESMA
-- senha de hoje (o hash bcrypt $2a$ já guardado em usuarios.password_hash é copiado; nenhuma senha é lida ou trocada).
-- O portal passa a entrar pelo Supabase e mantém o login antigo (verify_login) só como reserva durante a transição.
-- Também: desligar alguém bloqueia o login; mudar o e-mail no cadastro muda o e-mail de login.

ALTER TABLE public.usuarios ADD COLUMN auth_id uuid UNIQUE;

CREATE TEMP TABLE _contas ON COMMIT DROP AS
SELECT id AS usuario_id, lower(btrim(email)) AS email, password_hash, gen_random_uuid() AS aid
FROM public.usuarios
WHERE coalesce(status,'ativo') = 'ativo' AND email IS NOT NULL AND btrim(email) <> '' AND password_hash LIKE '$2a$%';

INSERT INTO auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
  created_at, updated_at, confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current,
  phone_change, phone_change_token, reauthentication_token, is_sso_user, is_anonymous)
SELECT '00000000-0000-0000-0000-000000000000', aid, 'authenticated', 'authenticated', email, password_hash, now(),
       '{"provider":"email","providers":["email"]}'::jsonb, jsonb_build_object('usuario_id', usuario_id),
       now(), now(), '', '', '', '', '', '', '', '', false, false
FROM _contas;

INSERT INTO auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
SELECT aid::text, aid, jsonb_build_object('sub', aid::text, 'email', email, 'email_verified', true, 'phone_verified', false), 'email', now(), now()
FROM _contas;

UPDATE public.usuarios u SET auth_id = c.aid FROM _contas c WHERE u.id = c.usuario_id;

-- Quem sou eu: o cadastro de quem está logado (pela sessão do Supabase, não por um id vindo do navegador).
CREATE OR REPLACE FUNCTION public.meu_usuario()
RETURNS TABLE(id integer, name text, email text, role text, setor text, area text, cargo text, admissao date, gestor_id integer,
              lider_id integer, skills text[], senioridade integer, telefone text, foto_url text, status text, cadastro text)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT u.id, u.name, u.email, u.role, u.setor, u.area, u.cargo, u.admissao, u.gestor_id, u.lider_id, u.skills, u.senioridade,
         u.telefone, u.foto_url, u.status, u.cadastro
  FROM usuarios u WHERE u.auth_id = auth.uid() AND auth.uid() IS NOT NULL AND coalesce(u.status,'ativo') = 'ativo';
$$;
REVOKE ALL ON FUNCTION public.meu_usuario() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.meu_usuario() TO authenticated;

-- Cadastro → login: desligado não entra; reativado volta a entrar; e-mail novo vira o login.
CREATE OR REPLACE FUNCTION public.sincroniza_login() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'auth' AS $$
BEGIN
  IF NEW.auth_id IS NULL THEN RETURN NEW; END IF;
  IF coalesce(NEW.status,'ativo') IS DISTINCT FROM coalesce(OLD.status,'ativo') THEN
    UPDATE auth.users SET banned_until = CASE WHEN coalesce(NEW.status,'ativo') = 'ativo' THEN NULL ELSE 'infinity'::timestamptz END,
                          updated_at = now() WHERE id = NEW.auth_id;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.email IS NOT NULL AND btrim(NEW.email) <> '' THEN
    UPDATE auth.users SET email = lower(btrim(NEW.email)), updated_at = now() WHERE id = NEW.auth_id;
    UPDATE auth.identities SET identity_data = identity_data || jsonb_build_object('email', lower(btrim(NEW.email))), updated_at = now()
      WHERE user_id = NEW.auth_id AND provider = 'email';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER usuarios_sincroniza_login AFTER UPDATE OF status, email ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.sincroniza_login();

-- Catálogo de benefícios: a leitura valia só para "anon"; quem entra pelo Supabase é "authenticated" e veria vazio.
CREATE POLICY catalogo_leitura_autenticado ON public.beneficios_catalogo FOR SELECT TO authenticated USING (true);
