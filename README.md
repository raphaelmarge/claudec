# MCP EVO (W12) — Gestão de Academia

Servidor [MCP](https://modelcontextprotocol.io) que conecta a **API de Integração
do EVO / W12** ao Claude. Expõe ferramentas em português para consultar alunos,
inadimplência, vendas, check-ins e leads diretamente no chat.

Construído com [FastMCP](https://gofastmcp.com) (Python) e transporte
**Streamable HTTP**, pronto para deploy remoto no **Railway**.

---

## Ferramentas expostas

| Ferramenta       | Endpoint EVO              | O que faz |
|------------------|---------------------------|-----------|
| `listar_alunos`  | `GET /api/v1/members`     | Lista membros (ativos/inativos/todos), com filtro por nome, e-mail e documento. |
| `inadimplentes`  | `GET /api/v1/receivables` | Recebíveis **em aberto** (`accountStatus=1`) vencidos até a data informada — quem deve e quanto (com soma total). |
| `vendas`         | `GET /api/v1/sales`       | Vendas por período. |
| `check_ins`      | `GET /api/v1/entries`     | Entradas/check-ins por período. |
| `leads`          | `GET /api/v1/prospects`   | Prospects/leads, com filtro por período/nome/e-mail. |

> Datas sempre no formato **`AAAA-MM-DD`**.

---

## Autenticação

A API do EVO usa **HTTP Basic Auth**:

- **usuário** = o DNS da conta (variável `EVO_DNS`, normalmente `evo`)
- **senha**   = o token da API (variável `EVO_TOKEN`)

O token **nunca** fica no código nem no repositório — é lido só de variável de
ambiente.

| Variável          | Obrigatória | Padrão | Descrição |
|-------------------|-------------|--------|-----------|
| `EVO_TOKEN`       | ✅ | — | Token da API do EVO (senha do Basic Auth). |
| `EVO_DNS`         | ⬜ | `evo` | DNS da conta (usuário do Basic Auth). |
| `EVO_BASE_URL`    | ⬜ | `https://evo-integracao.w12app.com.br` | Base URL da API. |
| `EVO_HTTP_TIMEOUT`| ⬜ | `60` | Timeout HTTP em segundos. |
| `MCP_SECRET`      | ⬜ | — | Se definido, protege o MCP em `/mcp/<MCP_SECRET>` (veja abaixo). |
| `PORT`            | ⬜ | `8000` | Porta HTTP (o Railway injeta automaticamente). |

### Protegendo o endpoint (`MCP_SECRET`)

Sem proteção, qualquer pessoa com a URL acessaria os dados da academia. O
conector personalizado do Claude **não** permite enviar um header
`Authorization` manual (quando um MCP remoto exige token, o Claude tenta um
fluxo **OAuth** completo, que exigiria um provedor de identidade).

A solução simples que funciona de imediato é **colocar um segredo no caminho da
URL**. Defina `MCP_SECRET` com um valor longo e aleatório e o endpoint passa a
ser `/mcp/<MCP_SECRET>` — só quem tem a URL completa consegue conectar. Sem a
variável, o endpoint fica público em `/mcp`.

> Há também um endpoint `GET /health` (sempre público, sem dados sensíveis) que
> o Railway usa para monitorar o serviço.

---

## Rodar localmente

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

cp .env.example .env      # preencha EVO_TOKEN (e EVO_DNS se não for "evo")
export $(grep -v '^#' .env | xargs)   # carrega as variáveis

python server.py          # sobe em http://localhost:8000/mcp
```

Teste o handshake:

```bash
curl -sL -X POST http://localhost:8000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"t","version":"1"}}}'
```

---

## Deploy no Railway

1. **Crie o projeto**: [railway.app](https://railway.app) → *New Project* →
   *Deploy from GitHub repo* → selecione este repositório/branch.
   O Railway detecta o `Dockerfile` automaticamente (config em `railway.toml`).

2. **Adicione as variáveis de ambiente** (aba **Variables** do serviço):

   ```
   EVO_TOKEN  = <seu_token_da_api_do_evo>
   EVO_DNS    = evo
   MCP_SECRET = <um_valor_longo_e_aleatorio>   # recomendado, protege o endpoint
   ```

   - Em *Variables* clique em **+ New Variable**, cole `EVO_TOKEN` e o valor do
     token, salve. Repita para `EVO_DNS` e (recomendado) `MCP_SECRET`.
   - **Não** defina `PORT` — o Railway injeta sozinho. O `server.py` já lê `$PORT`.
   - O token fica só no Railway (criptografado), nunca no Git.

3. **Gere a URL pública**: aba **Settings → Networking → Generate Domain**.
   O Railway dará algo como `https://seu-app.up.railway.app`.

4. **Endpoint MCP** = essa URL + o caminho:
   - Com `MCP_SECRET` definido: `https://seu-app.up.railway.app/mcp/<MCP_SECRET>`
   - Sem `MCP_SECRET`: `https://seu-app.up.railway.app/mcp`

---

## Conectar no Claude

No Claude (web/desktop): **Settings → Connectors → Add custom connector**, e cole
a URL do endpoint MCP (incluindo o `MCP_SECRET`, se você definiu um):

```
https://seu-app.up.railway.app/mcp/<MCP_SECRET>
```

Depois é só pedir no chat, ex.:
- *"liste os alunos ativos"*
- *"quem está inadimplente?"*
- *"vendas de 2026-06-01 a 2026-06-22"*
- *"check-ins de hoje"*
- *"quais leads entraram esta semana?"*

---

## Nota sobre os endpoints

As rotas seguem a **API de Integração v1 do EVO** documentada em
`https://evo-integracao.w12app.com.br/swagger/index.html`. Recomendo conferir,
no swagger da sua conta, os nomes exatos de alguns parâmetros de filtro (em
especial `status` em `/members` e `accountStatus`/datas em `/receivables`), já
que podem variar por versão. Ajustar é trivial: cada ferramenta monta o
dicionário `params` em `server.py`.
