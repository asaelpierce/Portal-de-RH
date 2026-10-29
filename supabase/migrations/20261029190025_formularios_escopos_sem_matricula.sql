-- Aplicada em 29/10/2026 (versão 20261029190025). Verificado (rollback, como anônimo): equipes Daniel/Diogo 50, Tiago
-- 24, Jhonatan/Gustavo/Reginaldo 5, Edson 8, Ricardo 7, Danilo 6, Daniela 3, Fábio 7, Mariele 9 (com Luiz e Fábio),
-- Luiz 1 (TI); Tiago pedindo férias da caldeiraria → recusado; da vulcanização (sem matrícula) → aceito; quem não tem
-- escopo → recusado.
--
-- Formulários sem login, ajustes do Asael:
-- • sem matrícula ("ninguém sabe"): quem pede só escolhe o nome;
-- • "Quem está pedindo" = só quem tem escopo, e a lista de colaboradores mostra só a equipe de quem pede, amarrada aos
--   centros de custo da folha (form_escopos; muda sozinha quando alguém muda de centro de custo).
-- A confirmar com o Asael: Jeferson → pintura; Luciene → qualidade; "produção toda" (Daniel/Diogo) inclui PCP,
-- manutenção e qualidade; Luiz Antonio → TI (férias do Asael).
CREATE TABLE public.form_escopos (
  solicitante_id integer PRIMARY KEY REFERENCES public.usuarios(id),
  centros_custo text[] NOT NULL DEFAULT '{}',
  usuarios_extra integer[] NOT NULL DEFAULT '{}',
  observacao text
);
ALTER TABLE public.form_escopos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.form_escopos FROM anon, authenticated;

INSERT INTO public.form_escopos (solicitante_id, centros_custo, usuarios_extra, observacao)
SELECT u.id, v.ccs, coalesce((SELECT array_agg(x.id) FROM usuarios x WHERE sv_norm(x.name) = ANY (v.extras)), '{}'), v.obs
FROM (VALUES
  ('DANIEL DE FREITAS TOLEDO', ARRAY['ADM PRODUCAO','CALDEIRARIA - MÃO DE OBRA','CORTE CERAMICA MAO DE OBRA','PINTURA - MÃO DE OBRA','REVESTIMENTO - MÃO DE OBRA','VULCANIZACAO - MÃO DE OBRA','MANUFACTORY OVERHEAD - PCP','MANUFACTORY OVERHEAD - MANUTENÇÃO','QUALIDADE SEGURANÇA'], ARRAY[]::text[], 'produção toda, incluindo os líderes'),
  ('DIOGO RIBEIRO DA SILVA',   ARRAY['ADM PRODUCAO','CALDEIRARIA - MÃO DE OBRA','CORTE CERAMICA MAO DE OBRA','PINTURA - MÃO DE OBRA','REVESTIMENTO - MÃO DE OBRA','VULCANIZACAO - MÃO DE OBRA','MANUFACTORY OVERHEAD - PCP','MANUFACTORY OVERHEAD - MANUTENÇÃO','QUALIDADE SEGURANÇA'], ARRAY[]::text[], 'produção toda, incluindo os líderes'),
  ('JHONATAN HENRIQUE FERREIRA SILVA', ARRAY['CALDEIRARIA - MÃO DE OBRA'], ARRAY[]::text[], 'caldeiraria'),
  ('TIAGO BISPO PINTO DOS SANTOS', ARRAY['VULCANIZACAO - MÃO DE OBRA'], ARRAY[]::text[], 'vulcanização'),
  ('GUSTAVO DE SOUZA MELO', ARRAY['CORTE CERAMICA MAO DE OBRA'], ARRAY[]::text[], 'corte'),
  ('REGINALDO VAGNER DE REZENDE', ARRAY['REVESTIMENTO - MÃO DE OBRA'], ARRAY[]::text[], 'revestimento'),
  ('JEFERSON FELIPE DE JESUS NUNES', ARRAY['PINTURA - MÃO DE OBRA'], ARRAY[]::text[], 'pintura (a confirmar)'),
  ('LUCIENE GONCALVES BATISTA', ARRAY['QUALIDADE SEGURANÇA'], ARRAY[]::text[], 'qualidade e segurança (a confirmar)'),
  ('EDSON MENEZES JUNIOR', ARRAY['COMERCIAL ENGENHEARIA ORÇAMENTOS','MANUFACTORY OVERHEAD - ENGENHARIA / PROJETOS'], ARRAY[]::text[], 'engenharia: orçamentos e projetos'),
  ('RICARDO LUIZ DE SOUZA PEREIRA', ARRAY['COMERCIAL VENDAS PARA','COMERCIAL VESPASIANO ADM','COMERCIAL VESPASIANO VENDAS'], ARRAY[]::text[], 'comercial'),
  ('DANILO VITOR SOUZA LOPES BARBOSA', ARRAY['SUPPLY COMPRAS','SUPPLY LOGISTICA'], ARRAY[]::text[], 'supply (compras e logística)'),
  ('DANIELA JORGE DE OLIVEIRA', ARRAY['SUPPLY ALMOXARIFADO'], ARRAY[]::text[], 'almoxarifado'),
  ('FABIO STORTI LAGO', ARRAY['RECURSOS HUMANOS','FISCAL','FINANCEIRO','TI'], ARRAY[]::text[], 'RH, fiscal, financeiro e TI'),
  ('MARIELE DE OLIVEIRA GONCALVES XAVIER', ARRAY['RECURSOS HUMANOS','FISCAL','FINANCEIRO','TI'], ARRAY['LUIZ ANTONIO DE CAMPOS','FABIO STORTI LAGO'], 'igual ao Fábio + Luiz Antonio e Fábio'),
  ('LUIZ ANTONIO DE CAMPOS', ARRAY['TI'], ARRAY[]::text[], 'TI (férias do Asael)')
) v(nome, ccs, extras, obs)
JOIN usuarios u ON sv_norm(u.name) = v.nome AND coalesce(u.status,'ativo') = 'ativo';

-- Quem está no escopo de um solicitante (só ativos).
CREATE OR REPLACE FUNCTION public.form_escopo_ids(p_solicitante integer) RETURNS SETOF integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT u.id FROM usuarios u JOIN form_escopos e ON e.solicitante_id = p_solicitante
  WHERE coalesce(u.status,'ativo') = 'ativo' AND (u.centro_custo = ANY (e.centros_custo) OR u.id = ANY (e.usuarios_extra));
$$;
REVOKE ALL ON FUNCTION public.form_escopo_ids(integer) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.form_publico_contexto()
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
  SELECT jsonb_build_object(
    'solicitantes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.name,
                       'equipe', (SELECT coalesce(jsonb_agg(i), '[]'::jsonb) FROM form_escopo_ids(u.id) i)) ORDER BY u.name)
                     FROM form_escopos e JOIN usuarios u ON u.id = e.solicitante_id WHERE coalesce(u.status,'ativo') = 'ativo'), '[]'::jsonb),
    'colaboradores', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', name, 'cargo', cargo, 'setor', setor) ORDER BY name)
                     FROM usuarios WHERE coalesce(status,'ativo') = 'ativo' AND cadastro IS NOT NULL), '[]'::jsonb),
    'lideres', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', name) ORDER BY name)
                     FROM usuarios WHERE coalesce(status,'ativo') = 'ativo' AND nivel_perfil(role) >= 2), '[]'::jsonb),
    'gestores', coalesce((SELECT jsonb_agg(jsonb_build_object('id', id, 'nome', name) ORDER BY name)
                     FROM usuarios WHERE coalesce(status,'ativo') = 'ativo' AND nivel_perfil(role) >= 3), '[]'::jsonb),
    'centros_custo', coalesce((SELECT jsonb_agg(DISTINCT centro_custo) FROM usuarios WHERE centro_custo IS NOT NULL), '[]'::jsonb),
    'areas', coalesce((SELECT jsonb_agg(DISTINCT area) FROM usuarios WHERE area IS NOT NULL), '[]'::jsonb));
$$;

-- Envio: sem matrícula; quem pede precisa ter escopo, e o colaborador (ou o substituído) precisa estar na equipe dele.
DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.form_publico_enviar(text,jsonb)'::regprocedure);
  novo := replace(def,
$$  IF NOT FOUND OR s.cadastro IS NULL OR ltrim(s.cadastro,'0') <> ltrim(regexp_replace(coalesce(d->>'solicitante_matricula',''),'\D','','g'),'0')
     OR ltrim(s.cadastro,'0') = '' THEN
    RAISE EXCEPTION 'Nome e matrícula não conferem. Use a sua matrícula da folha (está no contracheque) ou fale com o RH.'; END IF;$$,
$$  IF NOT FOUND OR NOT EXISTS (SELECT 1 FROM form_escopos WHERE solicitante_id = s.id) THEN
    RAISE EXCEPTION 'Escolha o seu nome na lista de quem pode pedir. Se não estiver, fale com o RH.'; END IF;
  IF nullif(d->>'user_id','') IS NOT NULL AND (d->>'user_id')::int NOT IN (SELECT form_escopo_ids(s.id)) THEN
    RAISE EXCEPTION 'Este colaborador não é da sua equipe. Fale com o RH.'; END IF;
  IF nullif(d->>'substituido_id','') IS NOT NULL AND (d->>'substituido_id')::int NOT IN (SELECT form_escopo_ids(s.id))
     AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = (d->>'substituido_id')::int AND status = 'desligado') THEN
    RAISE EXCEPTION 'A pessoa substituída não é da sua equipe. Fale com o RH.'; END IF;$$);
  novo := replace(novo, $$    IF NOT (nivel_perfil(s.role) >= 2 OR s.id = c.id) THEN RAISE EXCEPTION 'Férias de outra pessoa: só o líder ou o gestor pedem.'; END IF;
$$, '');
  novo := replace(novo, $$  IF nivel_perfil(s.role) < 2 THEN RAISE EXCEPTION 'Pedidos de pessoal são feitos por líderes e gestores.'; END IF;
$$, '');
  IF novo = def OR position('solicitante_matricula' in novo) > 0 OR position('form_escopo_ids' in novo) = 0 THEN RAISE EXCEPTION 'Trechos não encontrados.'; END IF;
  EXECUTE novo;
END $do$;
-- mov_abrir_como exige solicitante com perfil >= 2 ("Apenas líderes, gestores e RH"); todos os solicitantes com escopo
-- já são líder/gestor/RH, então segue valendo como trava extra.
