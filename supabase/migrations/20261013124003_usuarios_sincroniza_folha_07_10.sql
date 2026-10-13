-- Aplicada em 13/10/2026 (versão 20261013124003).
-- Verificado: 83 ativos com cadastro = 83 da folha; nenhuma função divergente; 13 desligados.
--
-- Sincroniza o cadastro do portal com a "Relação de Colaboradores" da folha BRIT de 07/10/2026 (pedido do Asael).
-- A folha é a fonte oficial: função (cargo) e quem está ativo.

-- 1) E-mail deixa de ser obrigatório: colaboradores de produção nem sempre têm e-mail, e a lista da folha não traz.
--    Sem e-mail não há login (verify_login compara e-mail), então quem entra assim fica sem acesso ao portal.
ALTER TABLE public.usuarios ALTER COLUMN email DROP NOT NULL;

-- 2) Função conforme a folha (18 diferenças em 07/10/2026: promoções, mudanças de área e grafia).
UPDATE public.usuarios u SET cargo = f.cargo
FROM (VALUES
  ('10103','Anal de Autom e Integ Digi IA'),('10004','Oficial de Produção IB'),('100492','Meio Oficial de Producao IA'),
  ('10008','Oficial de Produção IB'),('100487','Meio Oficial de Producao IA'),('100408','Coordenador de Produção IIIC'),
  ('223','Coordenador(a) Suppy Chain'),('100459','Oficial de Producao IA'),('10096','Assistente de Projetos IA'),
  ('77','Coordenador IIID'),('100493','Assistente de Expedição IA'),('100440','Oficial de Producao IA'),
  ('100416','Oficial de Producao IA'),('130','Supervisor de Produção IC'),('100434','Oficial de Producao IA'),
  ('135','Líder de Producao IC'),('100500','Meio Oficial de Producao IA'),('100491','Meio Oficial de Producao IA')
) AS f(cadastro, cargo)
WHERE u.cadastro = f.cadastro AND u.cargo IS DISTINCT FROM f.cargo;

-- 3) Admitidos que ainda não estavam no portal (6). Setor pelo "Local" da folha; gestor igual ao dos colegas do mesmo
--    local (todos coincidem). Líder imediato: Yuri (engenharia) segue o padrão da área (Edson); nos demais o líder
--    fica em branco porque os colegas do mesmo local têm líderes diferentes — o RH define.
INSERT INTO public.usuarios (name, email, role, setor, area, cargo, admissao, cadastro, status, lider_id, gestor_id, skills, senioridade)
VALUES
  ('Alisson Gabriel Ferreira dos Santos', NULL, 'colaborador', 'almoxarifado', NULL,           'Auxiliar de Almoxarifado IB', '2026-06-25', '100513', 'ativo', NULL, 108, '{}', 1),
  ('Jeronimo Michel Dos Santos',          NULL, 'colaborador', 'producao',     'vulcanizacao', 'Auxiliar de Producao IB',     '2026-07-06', '100515', 'ativo', NULL, 108, '{}', 1),
  ('Joao Felipe Cruz Vieira',             NULL, 'colaborador', 'producao',     'vulcanizacao', 'Auxiliar de Producao IB',     '2026-07-21', '100517', 'ativo', NULL, 108, '{}', 1),
  ('Mateus Henrique Cardoso Pinto',       NULL, 'colaborador', 'producao',     'vulcanizacao', 'Auxiliar de Producao IB',     '2026-07-21', '100516', 'ativo', NULL, 108, '{}', 1),
  ('Walisson Jose da Silva Ramos',        NULL, 'colaborador', 'producao',     'vulcanizacao', 'Auxiliar de Producao IB',     '2026-09-01', '100518', 'ativo', NULL, 108, '{}', 1),
  ('Yuri De Oliveira Brandao',            NULL, 'colaborador', 'engenharia',   NULL,           'Assistente de Engenharia IIC','2026-06-29', '100514', 'ativo', 114,  131, '{}', 1);
