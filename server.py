"""
Servidor MCP para a API de Integração do EVO (W12 — gestão de academia).

Expõe ferramentas em português para uso no Claude:
    - listar_alunos   -> GET /api/v1/members
    - inadimplentes   -> GET /api/v1/receivables  (recebíveis em aberto/vencidos)
    - vendas          -> GET /api/v1/sales
    - check_ins       -> GET /api/v1/entries
    - leads           -> GET /api/v1/prospects

Autenticação: HTTP Basic Auth
    usuário = EVO_DNS  (o DNS da conta, ex.: "evo")
    senha   = EVO_TOKEN (token da API — fornecido via variável de ambiente)

Base URL padrão: https://evo-integracao.w12app.com.br
Transporte MCP: Streamable HTTP (para conexão remota via Claude / Railway).
"""

from __future__ import annotations

import os
from datetime import date
from typing import Any, Optional

import httpx
from fastmcp import FastMCP
from starlette.requests import Request
from starlette.responses import JSONResponse

# --------------------------------------------------------------------------- #
# Configuração
# --------------------------------------------------------------------------- #

EVO_BASE_URL = os.environ.get(
    "EVO_BASE_URL", "https://evo-integracao.w12app.com.br"
).rstrip("/")
EVO_DNS = os.environ.get("EVO_DNS", "evo")
EVO_TOKEN = os.environ.get("EVO_TOKEN", "")

# Timeout generoso: alguns relatórios do EVO demoram a responder.
HTTP_TIMEOUT = float(os.environ.get("EVO_HTTP_TIMEOUT", "60"))

# Segredo opcional no caminho da URL. Se definido, o endpoint MCP passa a ser
# /mcp/<MCP_SECRET> — assim só quem tem a URL completa consegue conectar.
# Vazio = endpoint público em /mcp (sem proteção).
MCP_SECRET = os.environ.get("MCP_SECRET", "").strip("/")
MCP_PATH = f"/mcp/{MCP_SECRET}" if MCP_SECRET else "/mcp"

mcp = FastMCP(
    name="EVO (W12) — Gestão de Academia",
    instructions=(
        "Ferramentas para consultar a API de integração do EVO/W12: alunos, "
        "inadimplência, vendas, check-ins e leads. Datas no formato AAAA-MM-DD."
    ),
)


# --------------------------------------------------------------------------- #
# Cliente HTTP
# --------------------------------------------------------------------------- #

def _client() -> httpx.Client:
    if not EVO_TOKEN:
        raise RuntimeError(
            "EVO_TOKEN não configurado. Defina a variável de ambiente EVO_TOKEN "
            "(o token da API do EVO) antes de usar o servidor."
        )
    return httpx.Client(
        base_url=EVO_BASE_URL,
        auth=(EVO_DNS, EVO_TOKEN),  # HTTP Basic Auth: usuário=DNS, senha=token
        timeout=HTTP_TIMEOUT,
        headers={"Accept": "application/json"},
    )


def _clean(params: dict[str, Any]) -> dict[str, Any]:
    """Remove valores None/'' para não enviar filtros vazios à API."""
    return {k: v for k, v in params.items() if v is not None and v != ""}


def _get(path: str, params: dict[str, Any]) -> Any:
    """Faz GET autenticado e devolve o JSON, com erro legível em caso de falha."""
    with _client() as client:
        try:
            resp = client.get(path, params=_clean(params))
        except httpx.HTTPError as exc:
            raise RuntimeError(f"Falha de rede ao chamar {path}: {exc}") from exc

    if resp.status_code >= 400:
        # Nunca vaza o token; apenas status + corpo da resposta do EVO.
        snippet = resp.text[:800]
        raise RuntimeError(
            f"EVO retornou HTTP {resp.status_code} em GET {path}. Resposta: {snippet}"
        )

    try:
        return resp.json()
    except ValueError:
        return {"_raw": resp.text}


# --------------------------------------------------------------------------- #
# Ferramentas MCP
# --------------------------------------------------------------------------- #

@mcp.tool
def listar_alunos(
    status: str = "todos",
    nome: Optional[str] = None,
    email: Optional[str] = None,
    documento: Optional[str] = None,
    take: int = 50,
    skip: int = 0,
) -> Any:
    """Lista membros/alunos da academia (endpoint /api/v1/members).

    Args:
        status: "ativos", "inativos" ou "todos". Mapeado para o filtro
            `status` do EVO (1=ativo, 2=inativo).
        nome: filtra por nome (parcial).
        email: filtra por e-mail.
        documento: filtra por CPF/documento.
        take: quantos registros retornar (máx. 50 no EVO).
        skip: deslocamento para paginação.

    Retorna a lista de membros conforme a API do EVO.
    """
    status_map = {"ativos": 1, "inativos": 2, "todos": None}
    status_key = status.strip().lower()
    if status_key not in status_map:
        raise ValueError("status deve ser 'ativos', 'inativos' ou 'todos'.")

    params = {
        "status": status_map[status_key],
        "name": nome,
        "email": email,
        "document": documento,
        "take": min(take, 50),
        "skip": skip,
    }
    return _get("/api/v1/members", params)


@mcp.tool
def inadimplentes(
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    take: int = 50,
    skip: int = 0,
) -> Any:
    """Recebíveis em atraso/inadimplência (endpoint /api/v1/receivables).

    Filtra recebíveis com status "em aberto" (accountStatus=1) e vencimento
    dentro do intervalo informado — ou seja, quem está devendo e quanto.

    Args:
        data_inicio: início do vencimento (AAAA-MM-DD). Opcional.
        data_fim: fim do vencimento (AAAA-MM-DD). Padrão: hoje (vencidos até hoje).
        take: quantos registros retornar.
        skip: deslocamento para paginação.

    Retorna os recebíveis em aberto + um resumo com a soma dos valores.
    """
    if data_fim is None:
        data_fim = date.today().isoformat()

    params = {
        "dueDateStart": data_inicio,
        "dueDateEnd": data_fim,
        "accountStatus": 1,  # 1 = Em aberto (não recebido)
        "take": take,
        "skip": skip,
    }
    data = _get("/api/v1/receivables", params)

    # Resumo: tenta somar os valores em aberto, qualquer que seja o formato.
    itens = data if isinstance(data, list) else data.get("data") if isinstance(data, dict) else None
    resumo: dict[str, Any] = {}
    if isinstance(itens, list):
        total = 0.0
        for it in itens:
            if isinstance(it, dict):
                valor = it.get("ammount") or it.get("amount") or it.get("value") or 0
                try:
                    total += float(valor)
                except (TypeError, ValueError):
                    pass
        resumo = {"quantidade": len(itens), "total_em_aberto": round(total, 2)}

    return {"resumo": resumo, "recebiveis": data}


@mcp.tool
def vendas(
    data_inicio: str,
    data_fim: str,
    mostrar_recebiveis: bool = False,
    take: int = 50,
    skip: int = 0,
) -> Any:
    """Vendas em um período (endpoint /api/v1/sales).

    Args:
        data_inicio: data inicial da venda (AAAA-MM-DD).
        data_fim: data final da venda (AAAA-MM-DD).
        mostrar_recebiveis: se True, inclui os recebíveis de cada venda.
        take: quantos registros retornar.
        skip: deslocamento para paginação.

    Retorna as vendas do período conforme a API do EVO.
    """
    params = {
        "dateSaleStart": data_inicio,
        "dateSaleEnd": data_fim,
        "showReceivables": mostrar_recebiveis,
        "take": take,
        "skip": skip,
    }
    return _get("/api/v1/sales", params)


@mcp.tool
def check_ins(
    data_inicio: str,
    data_fim: str,
    id_aluno: Optional[int] = None,
    take: int = 50,
    skip: int = 0,
) -> Any:
    """Entradas/check-ins em um período (endpoint /api/v1/entries).

    Args:
        data_inicio: data inicial (AAAA-MM-DD).
        data_fim: data final (AAAA-MM-DD).
        id_aluno: filtra check-ins de um membro específico (idMember). Opcional.
        take: quantos registros retornar.
        skip: deslocamento para paginação.

    Retorna os registros de entrada/check-in conforme a API do EVO.
    """
    params = {
        "registerDateStart": data_inicio,
        "registerDateEnd": data_fim,
        "idMember": id_aluno,
        "take": take,
        "skip": skip,
    }
    return _get("/api/v1/entries", params)


@mcp.tool
def leads(
    data_inicio: Optional[str] = None,
    data_fim: Optional[str] = None,
    nome: Optional[str] = None,
    email: Optional[str] = None,
    take: int = 50,
    skip: int = 0,
) -> Any:
    """Prospects/leads (endpoint /api/v1/prospects).

    Args:
        data_inicio: início do cadastro do lead (AAAA-MM-DD). Opcional.
        data_fim: fim do cadastro do lead (AAAA-MM-DD). Opcional.
        nome: filtra por nome (parcial).
        email: filtra por e-mail.
        take: quantos registros retornar.
        skip: deslocamento para paginação.

    Retorna os prospects/leads conforme a API do EVO.
    """
    params = {
        "registerDateStart": data_inicio,
        "registerDateEnd": data_fim,
        "name": nome,
        "email": email,
        "take": take,
        "skip": skip,
    }
    return _get("/api/v1/prospects", params)


# --------------------------------------------------------------------------- #
# Health-check (usado pelo Railway para monitorar o serviço)
# --------------------------------------------------------------------------- #

@mcp.custom_route("/health", methods=["GET"])
async def health(_request: Request) -> JSONResponse:
    return JSONResponse(
        {
            "status": "ok",
            "service": "mcp-evo",
            "evo_token_configurado": bool(EVO_TOKEN),
            "endpoint_protegido": bool(MCP_SECRET),
        }
    )


# --------------------------------------------------------------------------- #
# Entrypoint — Streamable HTTP (compatível com Railway / conector remoto)
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8000"))
    mcp.run(transport="http", host="0.0.0.0", port=port, path=MCP_PATH)
