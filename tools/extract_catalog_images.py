#!/usr/bin/env python3
"""
Extrai as fotos em alta definição do catálogo SYT (PDF) e casa cada imagem
com o código do produto que aparece logo abaixo dela na página.

Fluxo seguro em duas fases:

  Fase 1 (padrão) — EXTRAÇÃO + RELATÓRIO, não toca nas imagens do app:
      python3 tools/extract_catalog_images.py --pdf "imagens_alta.pdf"

      Resultado:
        - tools/_incoming/<CODIGO>.png   (uma imagem por código casado)
        - tools/_incoming/_report.csv    (o que casou, o que não casou)
        - imagens sem código reconhecido vão para tools/_incoming/_unmatched/

  Fase 2 — APLICAÇÃO, sobrescreve as imagens dos produtos:
      python3 tools/extract_catalog_images.py --pdf "imagens_alta.pdf" --apply

      Para cada produto cujo código tem imagem extraída, sobrescreve o
      arquivo apontado por `imagem` em js/products.js. Os originais são
      copiados para assets/products/_backup/ antes de qualquer troca.

Casamento código→imagem:
  Usamos a LISTA OFICIAL de códigos do js/products.js (não adivinhamos
  formato). Para cada imagem da página, procuramos o código conhecido cujo
  rótulo de texto está logo abaixo da imagem e horizontalmente alinhado.

Dependência: PyMuPDF (fitz)
  pip install pymupdf
  (pypi.org está liberado mesmo no modo de rede "Trusted")
"""

import argparse
import csv
import json
import re
import shutil
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
PRODUCTS_JS = REPO_ROOT / "js" / "products.js"


def load_products():
    """Lê js/products.js e devolve a lista de produtos (dicts)."""
    text = PRODUCTS_JS.read_text(encoding="utf-8")
    m = re.search(r"window\.TORQUE_PUBLIC\s*=\s*(\{.*\})\s*;?\s*$", text, re.S)
    if not m:
        sys.exit("Não encontrei window.TORQUE_PUBLIC em js/products.js")
    data = json.loads(m.group(1))
    return data["products"]


def norm(s: str) -> str:
    """Normaliza um token para comparação de código."""
    return re.sub(r"[^A-Z0-9]", "", s.upper())


def build_code_index(products):
    """normalizado -> codigo original. Em colisão, mantém o primeiro."""
    idx = {}
    for p in products:
        n = norm(p["codigo"])
        if n and n not in idx:
            idx[n] = p["codigo"]
    return idx


def find_code_for_image(img_bbox, words, code_index, max_gap):
    """
    Acha o código conhecido cujo rótulo está logo ABAIXO da imagem e
    horizontalmente sobreposto a ela. words = lista de (x0,y0,x1,y1,texto).
    Retorna (codigo, distancia) ou (None, None).
    """
    ix0, iy0, ix1, iy1 = img_bbox
    icx = (ix0 + ix1) / 2
    best = None
    best_dist = None
    for x0, y0, x1, y1, txt in words:
        n = norm(txt)
        if n not in code_index:
            continue
        # precisa estar abaixo da base da imagem (com folga) e perto
        if y0 < iy1 - 5:
            continue
        gap = y0 - iy1
        if gap > max_gap:
            continue
        # sobreposição horizontal OU centro do texto perto do centro da imagem
        overlap = min(ix1, x1) - max(ix0, x0)
        wcx = (x0 + x1) / 2
        if overlap <= 0 and abs(wcx - icx) > (ix1 - ix0) / 2 + 30:
            continue
        # distância = vertical + desvio horizontal do centro
        dist = gap + abs(wcx - icx) * 0.5
        if best_dist is None or dist < best_dist:
            best_dist = dist
            best = code_index[n]
    return best, best_dist


def extract(pdf_path, products, code_index, out_dir, min_size, max_gap):
    try:
        import fitz  # PyMuPDF
    except ImportError:
        sys.exit("PyMuPDF não instalado. Rode: pip install pymupdf")

    out_dir.mkdir(parents=True, exist_ok=True)
    unmatched_dir = out_dir / "_unmatched"
    unmatched_dir.mkdir(exist_ok=True)

    doc = fitz.open(pdf_path)
    rows = []
    seen_codes = {}  # codigo -> (page, area) para resolver duplicatas (fica a maior)
    n_imgs = 0

    for pno in range(len(doc)):
        page = doc[pno]
        words = [(w[0], w[1], w[2], w[3], w[4]) for w in page.get_text("words")]
        # get_image_info(xrefs=True): bbox + xref de cada imagem desenhada
        infos = page.get_image_info(xrefs=True)
        for info in infos:
            xref = info.get("xref", 0)
            bbox = info["bbox"]  # (x0,y0,x1,y1)
            w_px = info.get("width", 0)
            h_px = info.get("height", 0)
            if w_px < min_size or h_px < min_size:
                continue  # ícone/logo pequeno, ignora
            n_imgs += 1
            code, dist = find_code_for_image(bbox, words, code_index, max_gap)

            # extrai os bytes nativos da imagem (alta resolução, sem perda)
            try:
                ext_img = doc.extract_image(xref) if xref else None
            except Exception:
                ext_img = None

            if ext_img:
                raw, ext = ext_img["image"], ext_img["ext"]
            else:
                # fallback: renderiza a região da imagem em alta DPI
                pix = page.get_pixmap(clip=fitz.Rect(bbox), dpi=300)
                raw, ext = pix.tobytes("png"), "png"

            area = w_px * h_px
            if code:
                # mantém a maior versão se o código aparecer mais de uma vez
                prev = seen_codes.get(code)
                dst = out_dir / f"{code}.png"
                if prev is None or area > prev:
                    _save_png(raw, ext, dst)
                    seen_codes[code] = area
                rows.append([code, pno + 1, w_px, h_px, round(dist or 0, 1), "OK", dst.name])
            else:
                dst = unmatched_dir / f"p{pno+1:03d}_{n_imgs:04d}.png"
                _save_png(raw, ext, dst)
                rows.append(["", pno + 1, w_px, h_px, "", "SEM_CODIGO", dst.name])

    doc.close()
    return rows, seen_codes


def _save_png(raw_bytes, ext, dst: Path):
    """Salva como PNG (converte se vier jp/outro)."""
    if ext == "png":
        dst.write_bytes(raw_bytes)
        return
    try:
        from PIL import Image
        import io
        Image.open(io.BytesIO(raw_bytes)).convert("RGB").save(dst, "PNG")
    except Exception:
        # se Pillow falhar, grava com a extensão original ao lado
        dst.with_suffix("." + ext).write_bytes(raw_bytes)


def write_report(rows, out_dir, products, seen_codes):
    report = out_dir / "_report.csv"
    with report.open("w", newline="", encoding="utf-8") as f:
        wr = csv.writer(f)
        wr.writerow(["codigo", "pagina", "larg_px", "alt_px", "dist", "status", "arquivo"])
        wr.writerows(sorted(rows, key=lambda r: (str(r[5]), str(r[0]))))

    all_codes = {p["codigo"] for p in products}
    matched = set(seen_codes)
    missing = sorted(all_codes - matched)
    print(f"\n  Relatório: {report}")
    print(f"  Produtos no catálogo : {len(all_codes)}")
    print(f"  Códigos casados      : {len(matched)}")
    print(f"  Produtos SEM imagem  : {len(missing)}")
    no_code = sum(1 for r in rows if r[5] == "SEM_CODIGO")
    print(f"  Imagens sem código   : {no_code} (em {out_dir / '_unmatched'})")
    if missing:
        preview = ", ".join(missing[:25])
        print(f"  Faltando (até 25): {preview}{' ...' if len(missing) > 25 else ''}")
    return missing


def apply_images(products, in_dir, backup_dir):
    """Sobrescreve assets/products/<hash>.png com as imagens casadas."""
    backup_dir.mkdir(parents=True, exist_ok=True)
    applied, skipped = 0, 0
    for p in products:
        src = in_dir / f"{p['codigo']}.png"
        if not src.exists():
            skipped += 1
            continue
        dst = REPO_ROOT / p["imagem"]
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists():
            shutil.copy2(dst, backup_dir / dst.name)
        shutil.copy2(src, dst)
        applied += 1
    print(f"\n  Aplicadas: {applied}  |  Sem imagem extraída: {skipped}")
    print(f"  Backup dos originais em: {backup_dir}")


def main():
    ap = argparse.ArgumentParser(description="Extrai imagens do catálogo SYT e casa por código.")
    ap.add_argument("--pdf", required=True, help="Caminho do PDF do catálogo")
    ap.add_argument("--apply", action="store_true",
                    help="Sobrescreve as imagens dos produtos (fase 2). Sem isso, só extrai.")
    ap.add_argument("--out", default=str(REPO_ROOT / "tools" / "_incoming"),
                    help="Pasta de saída/staging das imagens extraídas")
    ap.add_argument("--min-size", type=int, default=80,
                    help="Ignora imagens menores que isso (px) — filtra ícones")
    ap.add_argument("--max-gap", type=float, default=120,
                    help="Distância vertical máxima (pt) entre a imagem e o código abaixo")
    args = ap.parse_args()

    pdf_path = Path(args.pdf)
    if not pdf_path.exists():
        sys.exit(f"PDF não encontrado: {pdf_path}")

    products = load_products()
    code_index = build_code_index(products)
    out_dir = Path(args.out)

    if args.apply:
        # fase 2: aplica o que já foi extraído (extrai antes se a pasta estiver vazia)
        if not out_dir.exists() or not any(out_dir.glob("*.png")):
            print("  Pasta de staging vazia — extraindo primeiro...")
            rows, seen = extract(pdf_path, products, code_index, out_dir,
                                 args.min_size, args.max_gap)
            write_report(rows, out_dir, products, seen)
        apply_images(products, out_dir, REPO_ROOT / "assets" / "products" / "_backup")
    else:
        print(f"  Extraindo de: {pdf_path}")
        rows, seen = extract(pdf_path, products, code_index, out_dir,
                             args.min_size, args.max_gap)
        write_report(rows, out_dir, products, seen)
        print("\n  Revise as imagens e o _report.csv. Para aplicar:")
        print(f"    python3 tools/extract_catalog_images.py --pdf \"{args.pdf}\" --apply")


if __name__ == "__main__":
    main()
