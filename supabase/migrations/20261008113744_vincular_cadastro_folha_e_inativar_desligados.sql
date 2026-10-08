-- Aplicada no projeto zybkcpvdptabxkxpieuv em 08/10/2026 (versão 20261008113744).
-- Vínculo conferido par a par após aplicar: 90 usuários, idêntico ao gerado.
--
-- Liga usuários do portal ao cadastro (matrícula) da folha BRIT e inativa desligados.
-- Por quê: os saldos de férias vêm da folha, identificados pelo cadastro; o portal precisa saber
-- qual usuário é qual cadastro. Vínculo feito por nome completo (sem acento/caixa) contra as listas
-- de Colaboradores Ativos e Aniversariantes de 07/10/2026: 90 usuários; 3 contas sem cadastro
-- (Automação/Dev e as contas de teste "Daniel" e "Diogo").

ALTER TABLE public.usuarios ADD COLUMN cadastro text UNIQUE;
COMMENT ON COLUMN public.usuarios.cadastro IS 'Cadastro (matrícula) na folha BRIT — chave para saldos de férias';

UPDATE public.usuarios u SET cadastro = v.cad
FROM (VALUES
  (11,'100405'),
  (101,'100512'),
  (21,'100502'),
  (102,'100441'),
  (103,'100480'),
  (104,'257'),
  (105,'100507'),
  (61,'100466'),
  (106,'10097'),
  (1,'10103'),
  (12,'100322'),
  (51,'10004'),
  (22,'100336'),
  (23,'100426'),
  (24,'100492'),
  (62,'10005'),
  (107,'100469'),
  (52,'10008'),
  (13,'100442'),
  (25,'100422'),
  (26,'100487'),
  (108,'100408'),
  (109,'10076'),
  (110,'223'),
  (14,'100314'),
  (27,'100459'),
  (111,'100497'),
  (112,'17'),
  (113,'10096'),
  (114,'77'),
  (115,'100508'),
  (28,'100472'),
  (116,'100451'),
  (117,'100404'),
  (118,'100509'),
  (119,'100467'),
  (29,'100496'),
  (120,'4'),
  (10,'100402'),
  (121,'280'),
  (53,'227'),
  (122,'100316'),
  (60,'186'),
  (63,'10092'),
  (123,'224'),
  (30,'100493'),
  (31,'100485'),
  (124,'10091'),
  (125,'100481'),
  (32,'100503'),
  (54,'119'),
  (126,'194'),
  (127,'100482'),
  (33,'100505'),
  (34,'100475'),
  (128,'124'),
  (15,'100440'),
  (129,'100477'),
  (130,'85'),
  (35,'100506'),
  (131,'1'),
  (132,'100484'),
  (133,'100437'),
  (134,'100486'),
  (36,'100406'),
  (16,'100478'),
  (135,'10102'),
  (64,'195'),
  (136,'100416'),
  (137,'100312'),
  (50,'130'),
  (138,'239'),
  (37,'100494'),
  (139,'146'),
  (17,'100434'),
  (140,'100450'),
  (141,'247'),
  (142,'100452'),
  (38,'100504'),
  (20,'135'),
  (39,'100500'),
  (143,'100510'),
  (144,'100511'),
  (65,'140'),
  (145,'10100'),
  (146,'100444'),
  (40,'100499'),
  (147,'10087'),
  (148,'10082'),
  (41,'100491')
) AS v(id, cad) WHERE u.id = v.id;

-- 13 usuários ativos no portal mas desligados na folha (situação 007). Reversível: status volta a 'ativo'.
-- data_desligamento fica vazia: as listas da folha não trazem a data.
UPDATE public.usuarios SET status = 'desligado' WHERE id IN (11,104,105,61,12,29,53,124,32,33,129,37,40) AND status = 'ativo';

-- O login passa a recusar quem não está ativo (antes, desligado continuava entrando).
CREATE OR REPLACE FUNCTION public.verify_login(p_email text, p_password text)
 RETURNS TABLE(id integer, name text, email text, role text, setor text, area text, cargo text, admissao date, gestor_id integer, lider_id integer, skills text[], senioridade integer, telefone text, foto_url text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'extensions'
AS $function$
BEGIN
  RETURN QUERY
  SELECT u.id, u.name, u.email, u.role, u.setor, u.area, u.cargo,
         u.admissao, u.gestor_id, u.lider_id, u.skills, u.senioridade,
         u.telefone, u.foto_url
  FROM public.usuarios u
  WHERE u.email = trim(p_email)
    AND coalesce(u.status, 'ativo') = 'ativo'
    AND u.password_hash IS NOT NULL
    AND u.password_hash = extensions.crypt(p_password, u.password_hash);
END;
$function$;

-- Leitura é por coluna desde a migration 20261007164306: a nova coluna precisa entrar no GRANT.
GRANT SELECT (cadastro) ON public.usuarios TO anon, authenticated;
