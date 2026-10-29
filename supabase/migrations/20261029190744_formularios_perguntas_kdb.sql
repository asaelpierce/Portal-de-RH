-- Aplicada em 29/10/2026 (versão 20261029190744). Verificado (rollback): admissão pelo formulário (Tiago, sem gestor)
-- grava demissão + quem saiu, temporário, sigilosa, prazo, diretoria ciente, gestor preenchido sozinho e motivo montado
-- ("Substituição por demissão — Urgente"); movimentação guarda salário atual → novo e diretoria ciente; aprovada pelo
-- RH, a vaga sigilosa é criada sem publicar (ativa = false), tipo "Temporário", com os requisitos comportamentais.
--
-- Formulários com as perguntas reais dos Forms KdB 181 (Requisição) e KdB 133 (Movimentação), ditadas pelo Asael em
-- 29/10/2026. Requisição: superior imediato, idade/sexo preferenciais (uso interno), tipo de contratação efetivo /
-- temporário / outra, tipo de vaga sigilosa / aberta / outra (sigilosa não é publicada), prazo de contratação, motivo
-- aumento de quadro / demissão / promoção / outra, requisitos técnicos e comportamentais, observações, diretoria ciente.
-- Movimentação: salário atual (fica registrado), diretoria ciente.
ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_motivo_requisicao_check;
ALTER TABLE public.movimentacoes ADD CONSTRAINT movimentacoes_motivo_requisicao_check
  CHECK (motivo_requisicao IN ('aumento_quadro','substituicao','demissao','promocao','outro'));
ALTER TABLE public.movimentacoes DROP CONSTRAINT IF EXISTS movimentacoes_tipo_contratacao_check;
ALTER TABLE public.movimentacoes ADD CONSTRAINT movimentacoes_tipo_contratacao_check
  CHECK (tipo_contratacao IN ('clt','temporario','aprendiz','estagio','outro'));
ALTER TABLE public.movimentacoes
  ADD COLUMN motivo_requisicao_outro text,
  ADD COLUMN tipo_contratacao_outro text,
  ADD COLUMN tipo_vaga text CHECK (tipo_vaga IN ('sigilosa','aberta','outra')),
  ADD COLUMN tipo_vaga_outro text,
  ADD COLUMN superior_id integer REFERENCES public.usuarios(id),
  ADD COLUMN perfil_idade_sexo text,
  ADD COLUMN requisitos_comportamentais text,
  ADD COLUMN observacoes text,
  ADD COLUMN diretoria_ciente boolean;

DO $do$
DECLARE def text; novo text;
BEGIN
  def := pg_get_functiondef('public.mov_abrir_como(integer,text,jsonb,boolean)'::regprocedure);
  novo := replace(def,
$$    IF coalesce(d->>'motivo_requisicao','') NOT IN ('aumento_quadro','substituicao') THEN RAISE EXCEPTION 'Informe se é aumento de quadro ou substituição.'; END IF;
    IF d->>'motivo_requisicao' = 'substituicao' AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = nullif(d->>'substituido_id','')::int) THEN
      RAISE EXCEPTION 'Informe quem será substituído.'; END IF;$$,
$$    IF coalesce(d->>'motivo_requisicao','') NOT IN ('aumento_quadro','substituicao','demissao','promocao','outro') THEN RAISE EXCEPTION 'Informe o motivo da requisição.'; END IF;
    IF d->>'motivo_requisicao' IN ('substituicao','demissao','promocao') AND NOT EXISTS (SELECT 1 FROM usuarios WHERE id = nullif(d->>'substituido_id','')::int) THEN
      RAISE EXCEPTION 'Informe quem será substituído (quem saiu ou foi promovido).'; END IF;
    IF d->>'motivo_requisicao' = 'outro' AND length(btrim(coalesce(d->>'motivo_requisicao_outro',''))) < 3 THEN RAISE EXCEPTION 'Explique o motivo da requisição.'; END IF;
    IF coalesce(nullif(d->>'tipo_contratacao',''),'clt') = 'outro' AND length(btrim(coalesce(d->>'tipo_contratacao_outro',''))) < 3 THEN RAISE EXCEPTION 'Explique o tipo de contratação.'; END IF;
    IF nullif(d->>'tipo_vaga','') IS NOT NULL AND d->>'tipo_vaga' NOT IN ('sigilosa','aberta','outra') THEN RAISE EXCEPTION 'Tipo de vaga inválido.'; END IF;$$);
  novo := replace(novo,
$$                               motivo_requisicao, substituido_id, quantidade, tipo_contratacao, turno, centro_custo)$$,
$$                               motivo_requisicao, substituido_id, quantidade, tipo_contratacao, turno, centro_custo,
                               motivo_requisicao_outro, tipo_contratacao_outro, tipo_vaga, tipo_vaga_outro, superior_id, perfil_idade_sexo,
                               requisitos_comportamentais, observacoes, diretoria_ciente, prazo_encerramento)$$);
  novo := replace(novo,
$$            d->>'motivo_requisicao', CASE WHEN d->>'motivo_requisicao' = 'substituicao' THEN nullif(d->>'substituido_id','')::int END,$$,
$$            d->>'motivo_requisicao', CASE WHEN d->>'motivo_requisicao' IN ('substituicao','demissao','promocao') THEN nullif(d->>'substituido_id','')::int END,$$);
  novo := replace(novo,
$$            nullif(btrim(coalesce(d->>'turno','')),''), nullif(btrim(coalesce(d->>'centro_custo','')),''))
    RETURNING * INTO v;$$,
$$            nullif(btrim(coalesce(d->>'turno','')),''), nullif(btrim(coalesce(d->>'centro_custo','')),''),
            nullif(left(btrim(coalesce(d->>'motivo_requisicao_outro','')),300),''), nullif(left(btrim(coalesce(d->>'tipo_contratacao_outro','')),200),''),
            nullif(d->>'tipo_vaga',''), nullif(left(btrim(coalesce(d->>'tipo_vaga_outro','')),200),''),
            (SELECT id FROM usuarios WHERE id = nullif(d->>'superior_id','')::int),
            nullif(left(btrim(coalesce(d->>'perfil_idade_sexo','')),200),''), nullif(left(btrim(coalesce(d->>'requisitos_comportamentais','')),2000),''),
            nullif(left(btrim(coalesce(d->>'observacoes','')),2000),''), CASE d->>'diretoria_ciente' WHEN 'sim' THEN true WHEN 'nao' THEN false END,
            CASE WHEN coalesce(d->>'prazo_encerramento','') ~ '^\d{4}-\d{2}-\d{2}$' THEN (d->>'prazo_encerramento')::date END)
    RETURNING * INTO v;$$);
  novo := replace(novo,
$$    atual := jsonb_build_object('cargo', c.cargo, 'setor', c.setor, 'area', c.area, 'centro_custo', c.centro_custo, 'lider_id', c.lider_id, 'gestor_id', c.gestor_id);$$,
$$    atual := jsonb_build_object('cargo', c.cargo, 'setor', c.setor, 'area', c.area, 'centro_custo', c.centro_custo, 'lider_id', c.lider_id, 'gestor_id', c.gestor_id,
                                'salario', nullif(left(btrim(coalesce(d->>'salario_atual','')),60),''), 'admissao', c.admissao);$$);
  novo := replace(novo,
$$                               data_prevista, mov_tipos, atual, proposta)$$,
$$                               data_prevista, mov_tipos, atual, proposta, diretoria_ciente)$$);
  novo := replace(novo,
$$            (d->>'data_vigencia')::date, tipos, atual, prop)$$,
$$            (d->>'data_vigencia')::date, tipos, atual, prop, CASE d->>'diretoria_ciente' WHEN 'sim' THEN true WHEN 'nao' THEN false END)$$);
  IF position('requisitos_comportamentais' in novo) = 0 OR position('''promocao'',''outro''' in novo) = 0 OR position('salario_atual' in novo) = 0
     OR position('prop, CASE d->>''diretoria_ciente''' in novo) = 0 THEN RAISE EXCEPTION 'Algum trecho de mov_abrir_como não foi encontrado.'; END IF;
  EXECUTE novo;

  def := pg_get_functiondef('public.mov_decidir(integer,integer,text,text)'::regprocedure);
  novo := replace(def,
$$            CASE m.tipo_contratacao WHEN 'temporario' THEN 'Temporário' WHEN 'aprendiz' THEN 'Aprendiz' WHEN 'estagio' THEN 'Estágio' ELSE 'CLT' END,$$,
$$            CASE m.tipo_contratacao WHEN 'temporario' THEN 'Temporário' WHEN 'aprendiz' THEN 'Aprendiz' WHEN 'estagio' THEN 'Estágio'
                                    WHEN 'outro' THEN coalesce(left(m.tipo_contratacao_outro,40),'Outro') ELSE 'CLT' END,$$);
  novo := replace(novo, $$m.salario, m.requisitos, m.prazo_encerramento, true, m.id)$$,
    $$m.salario, coalesce(m.requisitos,'') || CASE WHEN m.requisitos_comportamentais IS NOT NULL THEN E'\n\nComportamentais: ' || m.requisitos_comportamentais ELSE '' END,
            m.prazo_encerramento, coalesce(m.tipo_vaga,'aberta') <> 'sigilosa', m.id)$$);
  IF novo = def OR position('tipo_vaga' in novo) = 0 OR position('tipo_contratacao_outro' in novo) = 0 THEN RAISE EXCEPTION 'Trecho de mov_decidir não encontrado.'; END IF;
  EXECUTE novo;

  def := pg_get_functiondef('public.form_publico_enviar(text,jsonb)'::regprocedure);
  novo := replace(def, $$  m := public.mov_abrir_como(s.id, p_tipo, d, true);$$,
$$  IF NOT EXISTS (SELECT 1 FROM usuarios WHERE id = nullif(d->>'gestor_id','')::int AND nivel_perfil(role) >= 3 AND coalesce(status,'ativo') = 'ativo') THEN
    d := d || jsonb_build_object('gestor_id', coalesce(
      (SELECT id FROM usuarios WHERE id = nullif(d->>'superior_id','')::int AND nivel_perfil(role) >= 3 AND coalesce(status,'ativo') = 'ativo'),
      (SELECT id FROM usuarios WHERE id = s.gestor_id AND nivel_perfil(role) >= 3 AND coalesce(status,'ativo') = 'ativo'),
      CASE WHEN nivel_perfil(s.role) >= 3 THEN s.id END,
      (SELECT id FROM usuarios WHERE role = 'rh' AND coalesce(status,'ativo') = 'ativo' ORDER BY id LIMIT 1)));
  END IF;
  IF length(btrim(coalesce(d->>'motivo',''))) < 5 THEN
    d := d || jsonb_build_object('motivo', left(btrim(
      CASE d->>'motivo_requisicao' WHEN 'aumento_quadro' THEN 'Aumento do quadro' WHEN 'demissao' THEN 'Substituição por demissão'
        WHEN 'promocao' THEN 'Substituição por promoção' WHEN 'outro' THEN coalesce(d->>'motivo_requisicao_outro','Outro') ELSE 'Pedido pelo formulário' END
      || CASE WHEN nullif(btrim(coalesce(d->>'observacoes','')),'') IS NOT NULL THEN ' — ' || btrim(d->>'observacoes') ELSE '' END), 1000));
  END IF;
  m := public.mov_abrir_como(s.id, p_tipo, d, true);$$);
  IF novo = def THEN RAISE EXCEPTION 'Trecho de form_publico_enviar não encontrado.'; END IF;
  EXECUTE novo;
END $do$;
