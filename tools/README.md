# tools/

Utilitários de manutenção do catálogo (rodam localmente, fora do app).

## extract_catalog_images.py

Extrai as imagens de um **catálogo PDF de alta resolução** e associa cada foto
ao produto correspondente em `js/products.js`, casando a imagem com o **código**
de produto (HM01, K3-12, …) que aparece mais próximo dela na página.

```bash
pip install pymupdf

# 1) confere — gera "imagens_alta_report.csv" com o mapeamento proposto.
#    Nada é alterado ainda.
python3 tools/extract_catalog_images.py --pdf "imagens_alta.pdf"

# 2) aplica — grava os PNGs em assets/products/ e atualiza js/products.js.
python3 tools/extract_catalog_images.py --pdf "imagens_alta.pdf" --apply
```

**Sempre confira o `_report.csv` antes de rodar com `--apply`.** A coluna `acao`
indica o que será feito por linha:

| acao        | significado                                                  |
|-------------|--------------------------------------------------------------|
| `novo`      | produto não tinha foto; vai ganhar uma                       |
| `atualiza`  | produto já tinha foto; será trocada pela do PDF              |
| `igual`     | a foto do PDF já é a foto atual (nada muda)                  |
| `sem_match` | imagem do PDF que não casou com nenhum código (ignorada)     |

O nome do arquivo gravado é o hash do conteúdo (`<12 hex>.png`), no mesmo padrão
de `assets/products/`. Isso torna a execução **idempotente**: rodar de novo com
o mesmo PDF não duplica imagens nem muda nada.

### Opções úteis

- `--max-dist 350` — distância máxima (em pontos do PDF) entre a imagem e o
  código para considerá-los do mesmo produto. Aumente se o catálogo tiver código
  e foto mais afastados; diminua se houver casamentos errados.
- `--min-width 120 --min-height 120` — ignora imagens menores que isto (px),
  para não pegar logos/ícones.
- `--products-js` / `--assets-dir` / `--report` — sobrescrevem os caminhos
  padrão (úteis para testar sem tocar nos arquivos reais).
