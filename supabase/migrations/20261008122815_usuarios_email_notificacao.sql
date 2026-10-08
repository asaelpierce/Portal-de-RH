-- Aplicada no projeto zybkcpvdptabxkxpieuv em 08/10/2026 (versão 20261008122815).
--
-- E-mail de notificação separado do login.
-- Por quê: o e-mail de login do Asael é asael@kalenborn.com.br (decisão dele: manter), mas a caixa que
-- ele lê é asael.abdon@kalenborn.com.br. Os relatórios usam email_notificacao quando preenchido; senão, email.
-- O navegador não lê esta coluna (não entra no GRANT do anon): só a Edge Function do relatório usa.
ALTER TABLE public.usuarios ADD COLUMN email_notificacao text;
COMMENT ON COLUMN public.usuarios.email_notificacao IS 'Se preenchido, notificações vão para este endereço em vez do e-mail de login';
UPDATE public.usuarios SET email_notificacao = 'asael.abdon@kalenborn.com.br' WHERE id = 1;
