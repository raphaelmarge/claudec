# Torque Fitness — Custos × venda

Subsite interno em `custos/`, independente da vitrine e dos orçamentos. Não é o app Método Torque.

## Primeiro uso

Entre com a conta administradora já autorizada. O menu da conta em `app.html` oferece **Custos × venda** quando a permissão específica é confirmada. O endereço direto também exige autenticação e permissão.

Use **Importar custos existentes** e digite a senha do cofre de custos da área Admin somente na página. O navegador abre `js/secure.js` via PBKDF2/AES-GCM e salva apenas FOBs e parâmetros de importação em tabelas restritas. A senha não sai do navegador. A importação não sobrescreve registros existentes e não altera o catálogo público.

Depois revise **Parâmetros de custo**. Despesas desconhecidas permanecem vazias e bloqueiam o total; zero significa que a despesa realmente não se aplica. Os parâmetros monetários são por equipamento, já rateados. Cada produto pode sobrepor os padrões e registrar sua fonte. Não há custos reais pré-preenchidos no código: o cofre continua fechado até o administrador desbloqueá-lo.

## Comparação e premissas

O preço de venda vem de `produtos/catalog.json` no mesmo Supabase da vitrine. São mostradas a data de publicação e a consulta. Falha online usa `TORQUE_PUBLIC.products` com aviso explícito de que o preço atual não foi confirmado. Não se usa preço calculado a partir do lucro nem se escreve em `settings`, Storage, produtos ou orçamentos.

`Custo na venda atual = base nacionalizada + despesas complementares − créditos confirmados + preço publicado × taxas de venda`

`Diferença = preço publicado − custo na venda atual`

`Margem sobre venda = diferença / preço publicado × 100`

`Acréscimo sobre custo = diferença / custo na venda atual × 100`

`Preço de equilíbrio sem lucro = custo fixo líquido / (1 − soma das taxas sobre venda)`

Margem de lucro e desconto geral não são entradas do modelo. Comissão, tributos da venda e taxas de recebimento são despesas, não margem. Cupons, descontos negociados e condições específicas de um orçamento não entram no preço de tabela. A diferença não é lucro líquido contábil.

A base nacionalizada documentada por produto substitui a fórmula legada de compra/importação/frete até o estoque. Não duplique despesas já incluídas nessa base; marque zero nos complementos correspondentes. Alternativamente, o modelo reproduz `js/app.js`:

`CIF = FOB + frete internacional + FOB × seguro%`

`Base = CIF × (1 + IOF + II + IPI + PIS/COFINS) / (1 − ICMS) × câmbio + frete nacional`

Essa fórmula é identificada como **estimativa legada**, não apuração fiscal. Alíquotas e créditos precisam de conferência documental/contábil. O painel inclui despachante, porto, armazenagem, inspeção, montagem, entrega, garantia, rateio operacional, financeiro, outros custos e créditos confirmados. Não faz rateio automático de um contêiner por peso/volume: receba ou calcule o valor por unidade antes de cadastrá-lo.

## Segurança e persistência

`supabase/equipment_costs.sql` foi aplicado no projeto de equipamentos em 10/09/2026, pela migração `equipment_costs_private_workspace`. Não reaplique esse DDL sobre as mesmas tabelas existentes.

- `equipment_cost_access`: autorização explícita por usuário; navegador só lê sua própria permissão, nunca cria ou altera permissões. Os administradores existentes foram incluídos uma única vez na instalação; novos usuários não recebem acesso automaticamente. Gerencie concessões/revogação com acesso administrativo ao Supabase, nunca por alterações de `profiles.role` feitas pelo cliente.
- `equipment_cost_records`: RLS para autorizados, sem privilégios de leitura de custos para `anon`. Escrita limitada a código/payload; versão, autor e horário são definidos no servidor. Não há exclusão pelo navegador.
- O frontend atualiza com código e versão. Uma sessão desatualizada recebe conflito e preserva o formulário. A importação usa `ON CONFLICT DO NOTHING`.
- Custos somente em memória no novo frontend; saída, troca de conta e retorno de sessão revogada limpam a tela. Nenhuma senha de cofre, custo ou configuração fiscal vai a localStorage, arquivos públicos ou logs. O login reutiliza a sessão Supabase do site.
- Exportar CSV exige confirmação de confidencialidade; campos textuais são protegidos contra fórmulas. O arquivo baixado continua sendo informação confidencial sob responsabilidade do administrador.

## Validação de 10/09/2026

`node --test tests/equipment-costs.test.cjs`: 21 testes aprovados. Cobrem totais, margens, ponto de equilíbrio, campos pendentes, overrides, créditos, preços ausentes, percentuais inválidos, números brasileiros, importação sem lucro e CSV.

No banco real, testes transacionais com `SET LOCAL ROLE` e claims dos usuários existentes confirmaram leitura/escrita do autorizado, metadados de servidor, conflito de versão, importação sem sobrescrita, rejeição de margem e negativos, bloqueio de vendedor e anônimo, impossibilidade de autoautorização e revogação. Todos os registros de teste foram revertidos com ROLLBACK.

Chromium offline com dependências simuladas: 10 cenários aprovados (tabela, cálculos, busca, gravação, conflito, saída, celular de 390 px sem vazamento horizontal da página, acesso negado, entrada, revogação e fallback de catálogo). O teste local não representa login com a conta real nem desbloqueio do cofre real. A verificação identificou e corrigiu overflow do rótulo acessível da tabela móvel.

O Security Advisor não apontou as novas tabelas/função. Há avisos preexistentes fora deste módulo: funções SECURITY DEFINER acessíveis por API, quatro tabelas SaaS sem políticas e proteção de senhas vazadas desativada. Não foram alterados fluxos de outros aplicativos. Referências oficiais de revisão:

- https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable
- https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy
- https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Publicação / reversão

Publicar os arquivos estáticos do repositório normalmente. A rota não depende de build, Edge Function nova ou serviço pago adicional. As dependências públicas do catálogo, login, nomes e logo são preservadas.

Para retirar apenas a interface, reverta o commit do subsite e do atalho. Não apague tabelas de custos como rollback automático: elas podem conter trabalho do administrador. Desative `equipment_cost_access.enabled` para revogar o acesso quando necessário.
