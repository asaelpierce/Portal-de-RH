# Avisos no canal do RH (Teams) — fluxo do Power Automate

O portal manda um JSON para o fluxo (gatilho HTTP) em três situações:

| evento        | quando                                                                 |
|---------------|------------------------------------------------------------------------|
| `novo_pedido` | alguém enviou férias, requisição, movimentação ou demissão pelo link   |
| `lembrete`    | dias úteis, 8h: pendências com prazo chegando ou paradas há 3+ dias    |
| `teste`       | botão "Enviar teste" em Configurações › Avisos no Teams                 |

Exemplo do que chega:

```json
{
  "evento": "novo_pedido",
  "tipo": "ferias",
  "titulo": "✈ Nova solicitação de férias",
  "mensagem": "<b>Tiago …</b> pediu férias para <b>Alice …</b> (Produção): <b>18/11/2026 a 17/12/2026</b> (30 dias).",
  "link": "https://portal-de-rh.vercel.app",
  "enviado_em": "29/10/2026 16:20",
  "id": 57,
  "solicitante": "Tiago …",
  "colaborador": "Alice …"
}
```

`mensagem` já vem pronta em HTML simples (negrito e `<br>`).

## Esquema JSON do gatilho

```json
{
  "type": "object",
  "properties": {
    "evento": { "type": "string" },
    "tipo": { "type": "string" },
    "titulo": { "type": "string" },
    "mensagem": { "type": "string" },
    "link": { "type": "string" },
    "enviado_em": { "type": "string" },
    "id": { "type": "integer" },
    "solicitante": { "type": "string" },
    "colaborador": { "type": "string" },
    "quantidade": { "type": "integer" }
  }
}
```

## Passo a passo

1. **Teams:** na equipe da empresa, crie o canal **RH – Comunicados** e coloque Mariele, Melina e Júlia.
2. **Power Automate:** Criar › **Fluxo da nuvem instantâneo** › nome "Portal de RH – avisos" › gatilho
   **"Quando uma solicitação HTTP é recebida"** (o mesmo tipo de gatilho do fluxo de e-mails do portal).
3. **Gatilho:** "Quem pode disparar o fluxo" = **Qualquer pessoa**; em "Esquema JSON do Corpo da Solicitação",
   cole o esquema acima.
4. **Nova etapa › Microsoft Teams › "Postar mensagem em um chat ou canal":**
   - Postar como: **Bot de fluxo** · Postar em: **Canal** · Equipe: a da empresa · Canal: **RH – Comunicados**
   - Mensagem (conteúdo dinâmico): **titulo** em negrito, quebra de linha, **mensagem**, quebra de linha,
     o texto "Abrir o Portal de RH" com link para **link**, e **enviado_em** no fim.
5. **(Recomendado) Nova etapa › "Resposta":** Código de status **200**.
6. **Salvar.** Abra de novo o gatilho e copie a **URL HTTP POST** que apareceu.
7. **Portal:** entre como RH › **Configurações › 🔔 Avisos no Teams** › cole a URL › **Salvar** › **Enviar teste**.
   A mensagem "✅ Teste do Portal de RH" deve aparecer no canal.

O lembrete diário **não precisa de outro fluxo**: o próprio portal dispara às 8h (dias úteis) para a mesma URL, com
`evento = "lembrete"`. Se quiser tratar diferente (ex.: marcar @RH só no lembrete), use uma **Condição** com
`evento` igual a `lembrete`.

Problemas: veja o **Histórico de execuções** do fluxo. Se não aparecer execução nenhuma, a URL colada no portal não é a
do fluxo (cole de novo). A URL funciona como senha: não compartilhe; para trocar, gere outra no fluxo e cole no portal.
