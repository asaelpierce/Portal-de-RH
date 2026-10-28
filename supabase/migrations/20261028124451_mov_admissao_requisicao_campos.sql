-- Aplicada em 28/10/2026 (versão 20261028124451). Verificado (rollback, sessão do RH): substituição sem dizer quem é
-- recusada; pedido completo grava motivo, substituído, quantidade, tipo, turno e centro de custo; aprovado, a vaga sai
-- como "Temporário" com "Vagas: 2" e "Turno" na descrição; aumento de quadro simples continua (qtd 1, CLT).
--
-- Requisição de Pessoal (substitui o Forms "KdB 181") — 28/10/2026. O pedido de admissão ganha os campos usuais da
-- requisição: motivo (aumento de quadro / substituição, e de quem), quantidade de vagas, tipo de contratação, turno e
-- centro de custo (da folha). A vaga criada na aprovação já sai com tipo de contratação, quantidade e turno.
ALTER TABLE public.movimentacoes
  ADD COLUMN motivo_requisicao text CHECK (motivo_requisicao IN ('aumento_quadro','substituicao')),
  ADD COLUMN substituido_id integer REFERENCES public.usuarios(id),
  ADD COLUMN quantidade integer NOT NULL DEFAULT 1 CHECK (quantidade BETWEEN 1 AND 50),
  ADD COLUMN tipo_contratacao text CHECK (tipo_contratacao IN ('clt','temporario','aprendiz','estagio')),
  ADD COLUMN turno text,
  ADD COLUMN centro_custo text;

DO $do$
DECLARE def text; novo text;
BEGIN
  -- mov_abrir (admissão): valida e grava os novos campos
  def := pg_get_functiondef('public.mov_abrir(integer,text,jsonb)'::regprocedure);
  novo := replace(def,
$$    INSERT INTO movimentacoes (tipo, status, solicitante_id, solicitante_name, setor, lider_id, gestor_id, motivo, cargo, salario, requisitos)
    VALUES ('admissao', 'pendente_gestor', u.id, u.name, nullif(btrim(coalesce(d->>'setor','')),''), u.id, g.id,
            btrim(d->>'motivo'), btrim(d->>'cargo'), btrim(d->>'salario'), nullif(btrim(coalesce(d->>'requisitos','')),''))
    RETURNING * INTO v;$$,
$$    IF coalesce(d->>'motivo_requisicao','') NOT IN ('aumento_quadro','substituicao') THEN RAISE EXCEPTION 'Informe se é aumento de quadro ou substituição.'; END IF;
    IF d->>'motivo_requisicao' = 'substituicao' AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = nullif(d->>'substituido_id','')::int) THEN
      RAISE EXCEPTION 'Informe quem será substituído.'; END IF;
    IF coalesce(nullif(d->>'quantidade','')::int, 1) NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Quantidade de vagas inválida (1 a 50).'; END IF;
    IF coalesce(nullif(d->>'tipo_contratacao',''),'clt') NOT IN ('clt','temporario','aprendiz','estagio') THEN RAISE EXCEPTION 'Tipo de contratação inválido.'; END IF;
    IF nullif(btrim(coalesce(d->>'centro_custo','')),'') IS NOT NULL AND NOT EXISTS (SELECT 1 FROM usuarios WHERE centro_custo = btrim(d->>'centro_custo')) THEN
      RAISE EXCEPTION 'Centro de custo inválido (use um da folha).'; END IF;
    INSERT INTO movimentacoes (tipo, status, solicitante_id, solicitante_name, setor, lider_id, gestor_id, motivo, cargo, salario, requisitos,
                               motivo_requisicao, substituido_id, quantidade, tipo_contratacao, turno, centro_custo)
    VALUES ('admissao', 'pendente_gestor', u.id, u.name, nullif(btrim(coalesce(d->>'setor','')),''), u.id, g.id,
            btrim(d->>'motivo'), btrim(d->>'cargo'), btrim(d->>'salario'), nullif(btrim(coalesce(d->>'requisitos','')),''),
            d->>'motivo_requisicao', CASE WHEN d->>'motivo_requisicao' = 'substituicao' THEN nullif(d->>'substituido_id','')::int END,
            coalesce(nullif(d->>'quantidade','')::int, 1), coalesce(nullif(d->>'tipo_contratacao',''),'clt'),
            nullif(btrim(coalesce(d->>'turno','')),''), nullif(btrim(coalesce(d->>'centro_custo','')),''))
    RETURNING * INTO v;$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho de mov_abrir não encontrado.'; END IF;
  EXECUTE novo;

  -- mov_decidir: a vaga sai com tipo de contratação, quantidade e turno
  def := pg_get_functiondef('public.mov_decidir(integer,integer,text,text)'::regprocedure);
  novo := replace(def,
$$VALUES (m.cargo, nome_setor(m.setor), 'Kalenborn — presencial', 'CLT', coalesce(m.requisitos,'') || $$,
$$VALUES (m.cargo, nome_setor(m.setor), 'Kalenborn — presencial',
            CASE m.tipo_contratacao WHEN 'temporario' THEN 'Temporário' WHEN 'aprendiz' THEN 'Aprendiz' WHEN 'estagio' THEN 'Estágio' ELSE 'CLT' END,
            coalesce(m.requisitos,'') || CASE WHEN coalesce(m.quantidade,1) > 1 THEN E'\n\nVagas: ' || m.quantidade ELSE '' END
              || CASE WHEN m.turno IS NOT NULL THEN E'\nTurno: ' || m.turno ELSE '' END || $$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho de mov_decidir não encontrado.'; END IF;
  EXECUTE novo;
END $do$;
