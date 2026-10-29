-- Aplicada em 29/10/2026 (versão 20261029192117). Verificado (rollback; envio fica na fila do pg_net e não sai):
-- URL que não é do Power Automate recusada; URL salva aparece mascarada; 2 pedidos pelo formulário (férias e
-- requisição) → 2 avisos com título e mensagem prontos; lembrete diário com 2 pendências; agendamento 0 11 * * 1-5.
-- Passo a passo do fluxo: docs/teams_power_automate.md
--
-- Avisos no canal do RH no Teams via Power Automate. Pedido do Asael: a cada pedido pelos formulários, um comunicado
-- no canal do RH; e um lembrete diário (dias úteis, 8h) de pendências com prazo chegando. O RH cola a URL do gatilho
-- "Quando uma solicitação HTTP é recebida" no portal (Configurações). A URL é um segredo (quem a tiver posta no canal):
-- fica numa tabela fechada e só aparece mascarada. O envio é assíncrono (pg_net) e nunca impede o pedido.
CREATE TABLE public.app_config (
  chave text PRIMARY KEY, valor text, atualizado_por integer REFERENCES public.usuarios(id), atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.app_config FROM anon, authenticated;
INSERT INTO public.app_config (chave, valor) VALUES ('portal_url', 'https://portal-de-rh.vercel.app');

CREATE OR REPLACE FUNCTION public.teams_enviar(p_payload jsonb) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_url text;
BEGIN
  SELECT valor INTO v_url FROM app_config WHERE chave = 'teams_webhook_url';
  IF coalesce(v_url,'') = '' THEN RETURN false; END IF;
  PERFORM net.http_post(url := v_url, body := p_payload, headers := '{"Content-Type":"application/json"}'::jsonb, timeout_milliseconds := 10000);
  RETURN true;
EXCEPTION WHEN others THEN
  RAISE WARNING 'Aviso ao Teams falhou: %', sqlerrm; RETURN false;   -- nunca impede o pedido
END; $$;
REVOKE ALL ON FUNCTION public.teams_enviar(jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.teams_payload(p_evento text, p_tipo text, p_titulo text, p_mensagem text, p_extra jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT jsonb_build_object('evento', p_evento, 'tipo', p_tipo, 'titulo', p_titulo, 'mensagem', p_mensagem,
    'link', (SELECT valor FROM app_config WHERE chave = 'portal_url'),
    'enviado_em', to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI')) || coalesce(p_extra, '{}'::jsonb);
$$;
REVOKE ALL ON FUNCTION public.teams_payload(text,text,text,text,jsonb) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.teams_aviso_ferias() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_set text;
BEGIN
  SELECT nome_setor(NEW.setor) INTO v_set;
  PERFORM teams_enviar(teams_payload('novo_pedido', 'ferias', '✈ Nova solicitação de férias',
    format('<b>%s</b> pediu férias para <b>%s</b>%s: <b>%s a %s</b> (%s dias).%s',
      coalesce(NEW.lancado_por_nome,'—'), NEW.user_name, CASE WHEN v_set IS NOT NULL THEN ' ('||v_set||')' ELSE '' END,
      to_char(NEW.inicio,'DD/MM/YYYY'), to_char(NEW.fim,'DD/MM/YYYY'), (NEW.fim - NEW.inicio) + 1,
      CASE WHEN NEW.ciente_lancador THEN ' Colaborador ciente.' ELSE '' END),
    jsonb_build_object('id', NEW.id, 'solicitante', NEW.lancado_por_nome, 'colaborador', NEW.user_name)));
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;
END; $$;
CREATE TRIGGER teams_aviso_ferias AFTER INSERT ON public.ferias FOR EACH ROW WHEN (NEW.origem = 'formulario') EXECUTE FUNCTION public.teams_aviso_ferias();

CREATE OR REPLACE FUNCTION public.teams_aviso_mov() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_tit text; v_msg text;
BEGIN
  IF NEW.origem <> 'formulario' OR NEW.status <> 'pendente_rh' OR (TG_OP = 'UPDATE' AND OLD.origem = 'formulario' AND OLD.status = 'pendente_rh') THEN RETURN NEW; END IF;
  IF NEW.tipo = 'admissao' THEN
    v_tit := '📋 Nova requisição de pessoal';
    v_msg := format('<b>%s</b> pediu %s vaga(s) de <b>%s</b>%s — motivo: %s%s.%s', NEW.solicitante_name, coalesce(NEW.quantidade,1), coalesce(NEW.cargo,'—'),
      CASE WHEN NEW.setor IS NOT NULL THEN ' ('||nome_setor(NEW.setor)||')' ELSE '' END,
      CASE NEW.motivo_requisicao WHEN 'aumento_quadro' THEN 'aumento do quadro' WHEN 'demissao' THEN 'reposição' WHEN 'promocao' THEN 'promoção'
        WHEN 'outro' THEN coalesce(NEW.motivo_requisicao_outro,'outra') ELSE coalesce(NEW.motivo_requisicao,'—') END,
      CASE WHEN NEW.substituido_id IS NOT NULL THEN ' de '||(SELECT name FROM usuarios WHERE id = NEW.substituido_id) ELSE '' END,
      CASE WHEN NEW.prazo_encerramento IS NOT NULL THEN ' Prazo de contratação: '||to_char(NEW.prazo_encerramento,'DD/MM/YYYY')||'.' ELSE '' END);
  ELSIF NEW.tipo = 'movimentacao' THEN
    v_tit := '⇄ Nova movimentação de pessoal';
    v_msg := format('<b>%s</b> pediu movimentação de <b>%s</b>: %s — a partir de %s.', NEW.solicitante_name, NEW.nome,
      coalesce((SELECT string_agg(CASE k WHEN 'cargo' THEN 'cargo → '||v WHEN 'salario' THEN 'salário → '||v WHEN 'setor' THEN 'setor → '||coalesce(nome_setor(v),v)
                 WHEN 'centro_custo' THEN 'centro de custo → '||v ELSE k||' → '||v END, '; ')
                FROM jsonb_each_text(coalesce(NEW.proposta,'{}'::jsonb)) e(k, v)), '—'),
      coalesce(to_char(NEW.data_prevista,'DD/MM/YYYY'),'—'));
  ELSE
    v_tit := '➖ Novo pedido de demissão';
    v_msg := format('<b>%s</b> pediu o desligamento de <b>%s</b>.', NEW.solicitante_name, coalesce(NEW.nome,'—'));
  END IF;
  PERFORM teams_enviar(teams_payload('novo_pedido', NEW.tipo, v_tit, v_msg,
    jsonb_build_object('id', NEW.id, 'solicitante', NEW.solicitante_name, 'colaborador', NEW.nome)));
  RETURN NEW;
EXCEPTION WHEN others THEN RETURN NEW;
END; $$;
CREATE TRIGGER teams_aviso_mov AFTER INSERT OR UPDATE OF origem, status ON public.movimentacoes FOR EACH ROW EXECUTE FUNCTION public.teams_aviso_mov();

CREATE OR REPLACE FUNCTION public.teams_lembrete_diario() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date; v_itens text[]; v_n int;
BEGIN
  SELECT array_agg(t ORDER BY o) INTO v_itens FROM (
    SELECT 1 o, format('✈ Férias de <b>%s</b> começam em <b>%s dia(s)</b> (%s) e ainda não foram aprovadas.', user_name, inicio - v_hoje, to_char(inicio,'DD/MM'))  t
      FROM ferias WHERE status LIKE 'pendente%' AND inicio BETWEEN v_hoje AND v_hoje + 35
    UNION ALL
    SELECT 2, format('⇄ Movimentação de <b>%s</b> vale a partir de <b>%s</b> e ainda não foi decidida.', nome, to_char(data_prevista,'DD/MM'))
      FROM movimentacoes WHERE tipo = 'movimentacao' AND status LIKE 'pendente%' AND data_prevista <= v_hoje + 7
    UNION ALL
    SELECT 3, format('📋 Requisição de <b>%s</b>: prazo de contratação em <b>%s</b> e ainda não foi decidida.', coalesce(cargo,'—'), to_char(prazo_encerramento,'DD/MM'))
      FROM movimentacoes WHERE tipo = 'admissao' AND status LIKE 'pendente%' AND prazo_encerramento <= v_hoje + 7
    UNION ALL
    SELECT 4, format('%s Pedido de %s%s está parado há <b>%s dias</b>.', CASE tipo WHEN 'admissao' THEN '📋' WHEN 'movimentacao' THEN '⇄' ELSE '➖' END,
             CASE tipo WHEN 'admissao' THEN 'requisição ('||coalesce(cargo,'—')||')' WHEN 'movimentacao' THEN 'movimentação' ELSE 'demissão' END,
             CASE WHEN nome IS NOT NULL THEN ' — '||nome ELSE '' END, v_hoje - created_at::date)
      FROM movimentacoes WHERE status LIKE 'pendente%' AND created_at::date <= v_hoje - 3
        AND NOT (tipo = 'movimentacao' AND data_prevista <= v_hoje + 7) AND NOT (tipo = 'admissao' AND prazo_encerramento <= v_hoje + 7)
    UNION ALL
    SELECT 5, format('✈ Pedido de férias de <b>%s</b> está parado há <b>%s dias</b>.', user_name, v_hoje - created_at::date)
      FROM ferias WHERE status LIKE 'pendente%' AND created_at::date <= v_hoje - 3 AND NOT (inicio BETWEEN v_hoje AND v_hoje + 35)
  ) x;
  v_n := coalesce(array_length(v_itens, 1), 0);
  IF v_n = 0 THEN RETURN 0; END IF;
  PERFORM teams_enviar(teams_payload('lembrete', 'lembrete', format('⏰ Lembrete do RH — %s pendência(s)', v_n),
    array_to_string(v_itens, '<br>'), jsonb_build_object('quantidade', v_n)));
  RETURN v_n;
END; $$;
REVOKE ALL ON FUNCTION public.teams_lembrete_diario() FROM PUBLIC, anon, authenticated;
SELECT cron.schedule('teams_lembrete_diario', '0 11 * * 1-5', $$SELECT public.teams_lembrete_diario()$$);  -- 08:00 em Brasília

CREATE OR REPLACE FUNCTION public.teams_config_salvar(p_pedido_por integer, p_url text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v text := btrim(coalesce(p_url,''));
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH configura os avisos do Teams.'; END IF;
  IF v <> '' AND (v !~ '^https://' OR v !~* '(logic\.azure\.com|powerautomate|powerplatform\.com)') THEN
    RAISE EXCEPTION 'Cole a URL do gatilho "Quando uma solicitação HTTP é recebida" do Power Automate (começa com https://).'; END IF;
  INSERT INTO app_config (chave, valor, atualizado_por, atualizado_em) VALUES ('teams_webhook_url', nullif(v,''), p_pedido_por, now())
  ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor, atualizado_por = EXCLUDED.atualizado_por, atualizado_em = now();
  RETURN public.teams_config_status(p_pedido_por);
END; $$;
CREATE OR REPLACE FUNCTION public.teams_config_status(p_pedido_por integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' STABLE AS $$
DECLARE c app_config;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH vê a configuração do Teams.'; END IF;
  SELECT * INTO c FROM app_config WHERE chave = 'teams_webhook_url';
  RETURN jsonb_build_object('configurado', coalesce(c.valor,'') <> '',
    'mascarado', CASE WHEN coalesce(c.valor,'') <> '' THEN left(c.valor, 38) || '…' || right(c.valor, 6) END,
    'atualizado_em', c.atualizado_em, 'atualizado_por', (SELECT name FROM usuarios WHERE id = c.atualizado_por));
END; $$;
CREATE OR REPLACE FUNCTION public.teams_testar(p_pedido_por integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_nome text;
BEGIN
  p_pedido_por := public.quem_pede(p_pedido_por);
  IF NOT eh_rh(p_pedido_por) THEN RAISE EXCEPTION 'Só o RH testa os avisos do Teams.'; END IF;
  SELECT name INTO v_nome FROM usuarios WHERE id = p_pedido_por;
  RETURN jsonb_build_object('enviado', teams_enviar(teams_payload('teste', 'teste', '✅ Teste do Portal de RH',
    format('Mensagem de teste enviada por <b>%s</b>. Se você está vendo isto no canal, os avisos estão funcionando.', v_nome), '{}'::jsonb)));
END; $$;
REVOKE ALL ON FUNCTION public.teams_config_salvar(integer,text), public.teams_config_status(integer), public.teams_testar(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.teams_config_salvar(integer,text), public.teams_config_status(integer), public.teams_testar(integer) TO authenticated;
