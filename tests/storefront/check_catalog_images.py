"""Check real local product photos and capture the visible catalog, not unloaded offscreen images."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
import json
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass

server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{server.server_port}'
results = []
try:
    with sync_playwright() as p:
        browser = p.chromium.launch()
        for width in (320, 390, 1440):
            ctx = browser.new_context(viewport={'width':width,'height':1100}, reduced_motion='reduce', service_workers='block')
            ctx.route('**/*', lambda route: route.continue_() if route.request.url.startswith(BASE + '/') else route.abort())
            page = ctx.new_page()
            page.goto(BASE + '/?linha=A7%20Series', wait_until='networkidle')
            expect(page.locator('.pcard')).to_have_count(24)
            page.locator('.pcard img').first.scroll_into_view_if_needed()
            page.wait_for_function('Array.from(document.querySelectorAll(".pcard img")).slice(0,2).every(im=>im.complete && im.naturalWidth>0)')
            assert page.evaluate('Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth') <= 1
            assert page.locator('.pcard img').first.evaluate('(im)=>getComputedStyle(im).objectFit') == 'contain'
            page.locator('#produtos').evaluate('(el)=>window.scrollTo(0,Math.max(0,el.offsetTop-85))')
            page.evaluate('''async () => {
                const visible = Array.from(document.querySelectorAll('.pcard img')).filter(im => {
                    const r = im.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0;
                });
                await Promise.all(visible.map(im => im.decode().catch(() => {})));
            }''')
            page.screenshot(path=str(OUT / f'catalog-{width}-viewport.png'))
            results.append({'width':width,'passed':True,'images':'real local A7 catalog photos, contain, first two decoded','external_requests':'blocked'})
            print(f'PASS catalog photos and overflow at {width}px', flush=True)
            ctx.close()
        browser.close()
finally:
    server.shutdown()
    (OUT/'catalog-images.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
