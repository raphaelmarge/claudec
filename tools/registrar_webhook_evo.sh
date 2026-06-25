#!/usr/bin/env bash
# ============================================================
# TORQUE FITNESS — Registrar webhook no EVO/W12
# ------------------------------------------------------------
# Cadastra a Edge Function `evo-webhook` como destino dos eventos do EVO.
#
# A API do EVO usa autenticação BASIC:
#   usuário = login/dns da sua conta EVO  (EVO_LOGIN)
#   senha   = a chave/token de API do EVO (EVO_TOKEN)  -> Configurações > Integrações > API
#
# Uso:
#   export EVO_LOGIN="suaConta"
#   export EVO_TOKEN="suaChaveDeApiDoEVO"
#   export EVO_WEBHOOK_SECRET="o-mesmo-segredo-da-edge-function"
#   export CALLBACK_URL="https://uqwbywzuqooqzmiklqct.supabase.co/functions/v1/evo-webhook"
#   export EVENT_TYPE="NewSale"        # troque pelo evento desejado
#   # export ID_BRANCH="7921"          # opcional: filtrar por unidade
#   ./tools/registrar_webhook_evo.sh
#
# Dica: rode uma vez para CADA event type que quiser ouvir.
# Eventos conhecidos: NewSale, CreateMember, AlterMember
# (confirme a lista completa em Configurações > Integrações no painel do EVO).
# ============================================================
set -euo pipefail

API="https://evo-integracao-api.w12app.com.br/api/v1/webhook"

: "${EVO_LOGIN:?defina EVO_LOGIN}"
: "${EVO_TOKEN:?defina EVO_TOKEN}"
: "${EVO_WEBHOOK_SECRET:?defina EVO_WEBHOOK_SECRET}"
: "${CALLBACK_URL:?defina CALLBACK_URL}"
: "${EVENT_TYPE:?defina EVENT_TYPE}"

# monta o corpo (idBranch só entra se a variável existir)
payload=$(EVENT_TYPE="$EVENT_TYPE" CALLBACK_URL="$CALLBACK_URL" \
  EVO_WEBHOOK_SECRET="$EVO_WEBHOOK_SECRET" ID_BRANCH="${ID_BRANCH:-}" \
  python3 - <<'PY'
import json, os
body = {
    "eventType": os.environ["EVENT_TYPE"],
    "urlCallback": os.environ["CALLBACK_URL"],
    # header que a Edge Function valida (x-evo-token)
    "headers": [{"nome": "x-evo-token", "valor": os.environ["EVO_WEBHOOK_SECRET"]}],
    "filters": [],
}
if os.environ.get("ID_BRANCH"):
    body["idBranch"] = int(os.environ["ID_BRANCH"])
print(json.dumps(body))
PY
)

echo ">> Registrando webhook '${EVENT_TYPE}' -> ${CALLBACK_URL}"
curl -sS -X POST "$API" \
  -u "${EVO_LOGIN}:${EVO_TOKEN}" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  -w "\nHTTP %{http_code}\n"

echo
echo ">> Para LISTAR os webhooks já cadastrados:"
echo "   curl -sS -u \"\$EVO_LOGIN:\$EVO_TOKEN\" $API"
echo ">> Para REMOVER um webhook:  curl -sS -X DELETE -u ... ${API}/<idWebhook>"
