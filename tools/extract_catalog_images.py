#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
extract_catalog_images.py — Extrai imagens de alta resolução de um catálogo PDF
e associa cada imagem ao produto correspondente no `js/products.js`.

Como funciona
-------------
O PDF do catálogo costuma trazer, em cada página, a foto do equipamento ao lado
(ou logo abaixo) do seu *código* (ex.: HM01, K3-12, P-07). O script:

1. Lê os códigos de produto que existem em `js/products.js`.
2. Abre o PDF e, para cada página, extrai as imagens embutidas com a posição
   (bbox) de cada uma e a posição de cada palavra de texto.
3. Casa cada imagem com o código de produto cujo texto está mais próximo dela
   (atribuição gulosa: 1 imagem ↔ 1 código).
4. Salva a imagem como `assets/products/<hash>.png` (nome = hash do conteúdo,
   no mesmo padrão de 12 hex usado hoje, o que torna a execução idempotente).

Uso
---
    pip install pymupdf
    python3 tools/extract_catalog_images.py --pdf "imagens_alta.pdf"
        -> só confere: gera "imagens_alta_report.csv" com o mapeamento proposto.

    python3 tools/extract_catalog_images.py --pdf "imagens_alta.pdf" --apply
        -> aplica: grava os PNGs em assets/products/ e atualiza js/products.js.

Nada é alterado sem `--apply`. Sempre confira o `_report.csv` antes de aplicar.
"""

import argparse
import csv
import hashlib
import json
import math
import os
import re
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit(
        "PyMuPDF não encontrado. Instale com:\n\n    pip install pymupdf\n"
    )

# Raiz do repositório (este arquivo vive em tools/).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


# ---------------------------------------------------------------------------
# js/products.js — leitura e escrita
# ---------------------------------------------------------------------------
_ASSIGN_RE = re.compile(r"window\.TORQUE_PUBLIC\s*=\s*")


def load_products_js(path):
    """Devolve (prefixo, objeto, sufixo) de js/products.js.

    `objeto` é o dict já parseado; `prefixo`/`sufixo` preservam o comentário e o
    wrapper `window.TORQUE_PUBLIC = ...;` exatamente como estavam no arquivo.
    """
    with open(path, "r", encoding="utf-8") as fh:
        text = fh.read()
    m = _ASSIGN_RE.search(text)
    if not m:
        raise ValueError(f"Não encontrei 'window.TORQUE_PUBLIC =' em {path}")
    prefix = text[: m.end()]
    body = text[m.end():]
    # O JSON vai até o último ';' do arquivo.
    end = body.rstrip()
    if not end.endswith(";"):
        raise ValueError("Esperava que o objeto terminasse com ';'")
    json_text = end[:-1]
    data = json.loads(json_text)
    return prefix, data, ";\n"


def dump_products_js(path, prefix, data, suffix):
    """Reescreve js/products.js no mesmo estilo compacto (uma linha de JSON)."""
    json_text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(prefix + json_text + suffix)


# ---------------------------------------------------------------------------
# Casamento código <-> imagem
# ---------------------------------------------------------------------------
def normalize_code(s):
    """Normaliza um código para comparação (maiúsculas, sem espaços extras)."""
    return re.sub(r"\s+", "", s).upper()


def build_code_index(products):
    """Mapa CÓDIGO_NORMALIZADO -> produto (primeiro com aquele código)."""
    index = {}
    for p in products:
        code = p.get("codigo")
        if not code:
            continue
        index.setdefault(normalize_code(code), p)
    return index


def bbox_center(b):
    return ((b[0] + b[2]) / 2.0, (b[1] + b[3]) / 2.0)


def dist(c1, c2):
    return math.hypot(c1[0] - c2[0], c1[1] - c2[1])


def find_code_occurrences(page, code_index):
    """Procura, na página, palavras que sejam códigos de produto conhecidos.

    Casa tanto a palavra isolada quanto pares de palavras vizinhas (porque o
    extrator às vezes quebra 'K3-12' em 'K3' '-' '12'). Devolve uma lista de
    (codigo_normalizado, centro_bbox).
    """
    words = page.get_text("words")  # (x0,y0,x1,y1, palavra, block, line, word)
    found = []
    n = len(words)
    for i in range(n):
        x0, y0, x1, y1, w = words[i][:5]
        # Combina até 3 palavras consecutivas da mesma linha para reconstruir
        # códigos que o PDF separou (ex.: "K3", "-", "12").
        combos = []
        acc_text = ""
        acc_box = [x0, y0, x1, y1]
        for j in range(i, min(i + 3, n)):
            wx0, wy0, wx1, wy1, ww = words[j][:5]
            same_line = words[j][5] == words[i][5] and words[j][6] == words[i][6]
            if j > i and not same_line:
                break
            acc_text += ww
            acc_box = [
                min(acc_box[0], wx0), min(acc_box[1], wy0),
                max(acc_box[2], wx1), max(acc_box[3], wy1),
            ]
            combos.append((acc_text, tuple(acc_box)))
        for text, box in combos:
            code = normalize_code(text)
            if code in code_index:
                found.append((code, bbox_center(box)))
    return found


def match_images_on_page(page, code_index, min_w, min_h, max_dist):
    """Para uma página, devolve lista de dicts casando imagem -> código.

    Cada item: {xref, bbox, width, height, code, dist}. `code` pode ser None
    quando nenhuma correspondência ficou dentro de `max_dist`.
    """
    infos = page.get_image_info(xrefs=True)
    codes = find_code_occurrences(page, code_index)

    images = []
    for info in infos:
        xref = info.get("xref", 0)
        if not xref:
            continue
        bbox = info["bbox"]
        w = info.get("width", 0)
        h = info.get("height", 0)
        if w < min_w or h < min_h:
            continue  # ignora ícones/logos pequenos
        images.append({
            "xref": xref,
            "bbox": bbox,
            "center": bbox_center(bbox),
            "width": w,
            "height": h,
        })

    # Atribuição gulosa: pares (imagem, código) ordenados por distância.
    pairs = []
    for ii, img in enumerate(images):
        for code, ccenter in codes:
            d = dist(img["center"], ccenter)
            if d <= max_dist:
                pairs.append((d, ii, code))
    pairs.sort(key=lambda t: t[0])

    used_img = set()
    used_code = set()
    for d, ii, code in pairs:
        if ii in used_img or code in used_code:
            continue
        images[ii]["code"] = code
        images[ii]["dist"] = d
        used_img.add(ii)
        used_code.add(code)

    for img in images:
        img.setdefault("code", None)
        img.setdefault("dist", None)
    return images


# ---------------------------------------------------------------------------
# Extração das imagens
# ---------------------------------------------------------------------------
def render_png(doc, xref):
    """Devolve os bytes PNG de um xref de imagem, convertendo p/ RGB se preciso."""
    pix = fitz.Pixmap(doc, xref)
    # CMYK ou outros espaços -> RGB. (mantém alpha quando existir.)
    if pix.colorspace and pix.colorspace.n - (1 if pix.alpha else 0) >= 4:
        pix = fitz.Pixmap(fitz.csRGB, pix)
    data = pix.tobytes("png")
    pix = None
    return data


# ---------------------------------------------------------------------------
# Programa principal
# ---------------------------------------------------------------------------
def main(argv=None):
    ap = argparse.ArgumentParser(
        description="Extrai imagens de um catálogo PDF e associa aos produtos."
    )
    ap.add_argument("--pdf", required=True, help="caminho do PDF do catálogo")
    ap.add_argument(
        "--apply", action="store_true",
        help="grava os PNGs e atualiza js/products.js (sem isto, só gera o CSV)",
    )
    ap.add_argument(
        "--products-js", default=os.path.join(ROOT, "js", "products.js"),
        help="caminho de js/products.js",
    )
    ap.add_argument(
        "--assets-dir", default=os.path.join(ROOT, "assets", "products"),
        help="pasta onde os PNGs são gravados",
    )
    ap.add_argument("--report", default=None, help="caminho do CSV de relatório")
    ap.add_argument("--min-width", type=int, default=120,
                    help="ignora imagens com largura (px) menor que isto")
    ap.add_argument("--min-height", type=int, default=120,
                    help="ignora imagens com altura (px) menor que isto")
    ap.add_argument("--max-dist", type=float, default=350.0,
                    help="distância máx. (pt) entre imagem e código p/ casar")
    args = ap.parse_args(argv)

    if not os.path.isfile(args.pdf):
        sys.exit(f"PDF não encontrado: {args.pdf}")

    report_path = args.report or (
        os.path.splitext(args.pdf)[0] + "_report.csv"
    )

    prefix, data, suffix = load_products_js(args.products_js)
    products = data.get("products", [])
    code_index = build_code_index(products)
    print(f"{len(products)} produtos, {len(code_index)} códigos únicos.")

    doc = fitz.open(args.pdf)
    print(f"PDF aberto: {doc.page_count} páginas.")

    rows = []          # linhas do relatório
    assigned = {}      # codigo -> {filename, data, page, xref, w, h, dist}
    images_total = 0
    images_unmatched = 0

    for pno in range(doc.page_count):
        page = doc[pno]
        for img in match_images_on_page(
            page, code_index, args.min_width, args.min_height, args.max_dist
        ):
            images_total += 1
            code = img["code"]
            if code is None:
                images_unmatched += 1
                rows.append({
                    "pagina": pno + 1, "xref": img["xref"],
                    "img_w": img["width"], "img_h": img["height"],
                    "codigo": "", "produto": "", "dist": "",
                    "arquivo": "", "acao": "sem_match",
                })
                continue
            # Se o mesmo código casar em 2 lugares, fica o de menor distância.
            prev = assigned.get(code)
            if prev and prev["dist"] is not None and (
                img["dist"] is None or prev["dist"] <= img["dist"]
            ):
                continue
            try:
                png = render_png(doc, img["xref"])
            except Exception as exc:  # pragma: no cover - depende do PDF
                rows.append({
                    "pagina": pno + 1, "xref": img["xref"],
                    "img_w": img["width"], "img_h": img["height"],
                    "codigo": code, "produto": code_index[code].get("nome", ""),
                    "dist": round(img["dist"], 1) if img["dist"] else "",
                    "arquivo": "", "acao": f"erro:{exc}",
                })
                continue
            h12 = hashlib.sha1(png).hexdigest()[:12]
            filename = f"{h12}.png"
            assigned[code] = {
                "filename": filename, "data": png, "page": pno + 1,
                "xref": img["xref"], "w": img["width"], "h": img["height"],
                "dist": img["dist"],
            }

    # Monta as linhas do relatório para os códigos casados e decide a ação.
    for code, info in assigned.items():
        prod = code_index[code]
        rel_path = f"assets/products/{info['filename']}"
        current = prod.get("imagem", "")
        if current == rel_path:
            acao = "igual"
        elif current:
            acao = "atualiza"
        else:
            acao = "novo"
        rows.append({
            "pagina": info["page"], "xref": info["xref"],
            "img_w": info["w"], "img_h": info["h"],
            "codigo": prod.get("codigo", code), "produto": prod.get("nome", ""),
            "dist": round(info["dist"], 1) if info["dist"] is not None else "",
            "arquivo": rel_path, "acao": acao,
        })

    rows.sort(key=lambda r: (str(r["codigo"]) == "", str(r["codigo"]), r["pagina"]))

    # Grava o CSV de relatório (sempre).
    with open(report_path, "w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(fh, fieldnames=[
            "pagina", "xref", "img_w", "img_h",
            "codigo", "produto", "dist", "arquivo", "acao",
        ])
        writer.writeheader()
        writer.writerows(rows)

    matched = len(assigned)
    print(
        f"Imagens lidas: {images_total} | casadas: {matched} | "
        f"sem match: {images_unmatched} | produtos sem foto no PDF: "
        f"{len(code_index) - matched}"
    )
    print(f"Relatório: {report_path}")

    if not args.apply:
        print("\n(conferência) Nada foi alterado. Rode de novo com --apply "
              "para gravar.")
        return 0

    # --- aplica ---
    os.makedirs(args.assets_dir, exist_ok=True)
    written = 0
    updated = 0
    for code, info in assigned.items():
        dest = os.path.join(args.assets_dir, info["filename"])
        if not os.path.exists(dest):
            with open(dest, "wb") as fh:
                fh.write(info["data"])
            written += 1
        rel_path = f"assets/products/{info['filename']}"
        prod = code_index[code]
        if prod.get("imagem") != rel_path:
            prod["imagem"] = rel_path
            updated += 1

    dump_products_js(args.products_js, prefix, data, suffix)
    print(f"\nAplicado: {written} PNG(s) novo(s) gravado(s), "
          f"{updated} produto(s) com imagem atualizada em {args.products_js}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
