"""Dependency-free structural regression checks for the public storefront."""
import json
import re
import subprocess
from collections import Counter
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PAGES = ('index', 'sobre', 'solucoes', 'ct', 'blog', 'faq', 'guia-linhas', 'projeto', '404')

class Document(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.ids = []
        self.assets = []
    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if attrs.get('id'):
            self.ids.append(attrs['id'])
        if tag in ('link', 'script', 'img', 'source'):
            value = attrs.get('src', attrs.get('srcset', attrs.get('href', '')))
            if value and not re.match(r'^(?:https?:|data:|#|//)', value):
                self.assets.append(value.split('?')[0])

for page in PAGES:
    text = (ROOT / f'{page}.html').read_text()
    doc = Document()
    doc.feed(text)
    assert not [key for key, count in Counter(doc.ids).items() if count > 1], page
    assert text.count('css/premium.css?') == 1, page
    assert text.count('js/premium.js?') == 1, page
    assert '<main' in text and '<footer' in text, page
    for asset in doc.assets:
        assert (ROOT / asset).is_file(), (page, asset)
    assert 'Studio fictício' not in text, page
    assert 'academias atendidas' not in text, page

for path in (ROOT / 'js').glob('*.js'):
    subprocess.run(['node', '--check', str(path)], check=True)

# Public fallback data is unchanged. Live data can still override the fallback via Supabase.
raw = (ROOT / 'js/products.js').read_text()
products = json.loads(re.search(r'window.TORQUE_PUBLIC\s*=\s*(\{.*\})\s*;?\s*$', raw, re.S).group(1))['products']
assert len(products) == 955
assert next(p for p in products if p['codigo'] == 'A701')['imagem'] == 'assets/products/f11570308235.png'
print(f'Static checks passed: {len(PAGES)} public pages, {len(products)} fallback products, JavaScript syntax and local assets.')
