"""Browser regression checks. External requests are blocked; no live leads or database writes."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from threading import Thread
from urllib.parse import urlsplit
import json
import os
import sys
import traceback
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'test-results'
OUT.mkdir(exist_ok=True)
PAGES = ('index.html','sobre.html','solucoes.html','ct.html','blog.html','faq.html','guia-linhas.html','projeto.html','404.html')
results = []

class QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, *_):
        pass
server = ThreadingHTTPServer(('127.0.0.1', 0), partial(QuietHandler, directory=str(ROOT)))
Thread(target=server.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{server.server_port}'

def context(browser, width=1440, reduce='reduce'):
    ctx = browser.new_context(viewport={'width':width,'height':960}, device_scale_factor=1, reduced_motion=reduce, service_workers='block')
    # Deterministic fallback suite: never submit customer details, request a live PDF, or contact third-party services.
    ctx.route('**/*', lambda route: route.continue_() if route.request.url.startswith(BASE + '/') else route.abort())
    return ctx

def check(name, fn):
    try:
        fn()
        results.append({'name':name,'passed':True})
        print('PASS', name, flush=True)
    except Exception as error:
        results.append({'name':name,'passed':False,'error':str(error)})
        print('FAIL', name, str(error), flush=True)
        traceback.print_exc()

def no_overflow(page):
    amount = page.evaluate('Math.max(document.documentElement.scrollWidth,document.body.scrollWidth)-innerWidth')
    assert amount <= 1, f'{page.url}: horizontal overflow {amount}px'

with sync_playwright() as p:
    args = {'headless': True}
    if os.environ.get('CHROMIUM_PATH'):
        args['executable_path'] = os.environ['CHROMIUM_PATH']
    browser = p.chromium.launch(**args)

    for width in (320,390,768,1024,1440):
        def responsive(width=width):
            ctx = context(browser,width)
            page = ctx.new_page()
            errors = []
            page.on('pageerror', lambda error: errors.append(str(error)))
            for filename in PAGES:
                page.goto(BASE+'/'+filename, wait_until='networkidle')
                expect(page.locator('main h1')).to_have_count(1)
                expect(page.locator('.tf-footer')).to_be_visible()
                no_overflow(page)
                if filename == 'index.html':
                    expect(page.locator('#statProdutos')).to_have_text('955')
                    assert page.locator('.proof__quotes').count() == 0
                    photo = page.locator('.tf-hero-media img')
                    expect(photo).to_be_visible()
                    dimensions = photo.evaluate('(e)=>({w:e.clientWidth,h:e.clientHeight,nw:e.naturalWidth,nh:e.naturalHeight,fit:getComputedStyle(e).objectFit})')
                    assert dimensions['nw'] == 1600 and dimensions['nh'] == 533
                    assert dimensions['w'] > 0 and dimensions['h'] > 0 and dimensions['fit']=='cover', dimensions
                    if width in (390,1440):
                        page.screenshot(path=str(OUT/f'home-{width}.png'),full_page=True)
                        page.screenshot(path=str(OUT/f'home-{width}-viewport.png'))
                if filename == 'sobre.html' and width in (390,1440):
                    page.screenshot(path=str(OUT/f'about-{width}.png'),full_page=True)
            assert not errors, errors
            ctx.close()
        check(f'9 public pages, {width}px: headings, assets, no overflow, no JS errors', responsive)

    def purchase():
        ctx=context(browser)
        page=ctx.new_page(); errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/',wait_until='networkidle')
        page.locator('.tf-hero-actions [data-catalog]').click()
        expect(page.locator('#produtos')).to_be_visible()
        expect(page.locator('.pcard')).to_have_count(24)
        page.locator('#search').fill('A701')
        expect(page.locator('.pcard')).to_have_count(1)
        product=page.locator('.pcard[data-code="A701"]')
        product.locator('[data-act=detail]').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#prodModal')).to_be_visible()
        assert '?p=A701' in page.url
        expect(page.locator('#pmNome')).not_to_be_empty()
        page.keyboard.press('Escape')
        expect(page.locator('#prodModal')).to_be_hidden()
        product.locator('[data-act=add]').click()
        expect(page.locator('#cartCount')).to_have_text('1')
        product.locator('[data-act=inc]').click()
        expect(page.locator('#cartCount')).to_have_text('2')
        product.locator('[data-act=dec]').click()
        expect(page.locator('#cartCount')).to_have_text('1')
        product.locator('[data-act=fav]').click()
        expect(page.locator('#favCount')).to_have_text('1')
        page.locator('#navCart').click()
        expect(page.locator('#drawer')).to_be_visible()
        expect(page.locator('#drawerItems .ditem[data-code="A701"]')).to_be_visible()
        assert page.locator('#drawerTotal').inner_text()!='R$ 0,00'
        page.locator('#btnSolicitar').click()
        expect(page.locator('#leadModal')).to_be_visible()
        # Exercise native validation without submitting a lead or using fabricated personal information.
        page.locator('#btnEnviarLead').click()
        expect(page.locator('#leadErr')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('#leadModal')).to_be_hidden()
        expect(page.locator('#drawer')).to_be_visible()
        assert page.evaluate('document.body.style.overflow')=='hidden'
        page.keyboard.press('Escape')
        expect(page.locator('#drawer')).to_be_hidden()
        page.reload(wait_until='networkidle')
        expect(page.locator('#cartCount')).to_have_text('1')
        assert json.loads(page.evaluate('localStorage.getItem("torque_site_cart")'))['A701']==1
        assert not errors, errors
        ctx.close()
    check('Purchase journey: search, keyboard product detail, quantity, favorites, quote, form validation, persistence',purchase)

    def catalog():
        ctx=context(browser,390);page=ctx.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(BASE+'/?linha=A7%20Series',wait_until='networkidle')
        expect(page.locator('#catTitle')).to_have_text('A7 Series')
        expect(page.locator('.pcard')).to_have_count(24)
        page.locator('#sortBy').select_option('price-asc')
        amounts=page.locator('.pcard__price b').all_inner_texts()
        nums=[float(x.replace('R$','').replace('\xa0','').replace('.','').replace(',','.').strip()) for x in amounts]
        assert nums==sorted(nums)
        page.locator('#priceBand').select_option('10000-20000')
        amounts=page.locator('.pcard__price b').all_inner_texts()
        nums=[float(x.replace('R$','').replace('\xa0','').replace('.','').replace(',','.').strip()) for x in amounts]
        assert nums and all(10000<=x<20000 for x in nums)
        page.locator('#search').fill('equipamento inexistente teste')
        expect(page.locator('#empty')).to_be_visible()
        page.locator('#clearFilters').click()
        expect(page.locator('.pcard')).to_have_count(24)
        page.locator('#loadMore').click()
        expect(page.locator('.pcard')).to_have_count(48)
        no_overflow(page)
        page.locator('#produtos').screenshot(path=str(OUT/'catalog-390.png'))
        page.goto(BASE+'/?p=A701',wait_until='networkidle')
        expect(page.locator('#prodModal')).to_be_visible()
        page.locator('.pmodal__card').screenshot(path=str(OUT/'product-390.png'))
        expect(page.locator('#pmMedia img').first).to_be_visible()
        assert page.locator('#pmMedia img').first.evaluate('(e)=>getComputedStyle(e).objectFit')=='contain'
        page.keyboard.press('Escape')
        page.locator('#navBurger').click()
        expect(page.locator('#mmenu')).to_be_visible()
        page.keyboard.press('Escape')
        expect(page.locator('#mmenu')).to_be_hidden()
        expect(page.locator('#navBurger')).to_be_focused()
        assert not errors, errors
        ctx.close()
    check('Mobile catalog: line URL, sorting, price range, empty state, clear, pagination, product URL, menu',catalog)

    def motion():
        ctx=context(browser,1440,'no-preference');page=ctx.new_page()
        page.goto(BASE+'/',wait_until='networkidle')
        assert not page.locator('html').evaluate('(e)=>e.classList.contains("tf-motion-paused")')
        page.locator('.tf-hero-bottom [data-tf-motion]').click()
        expect(page.locator('html')).to_have_class('tf-enhanced tf-motion-paused')
        page.reload(wait_until='networkidle')
        assert page.evaluate('document.documentElement.classList.contains("tf-motion-paused")')
        expect(page.locator('#carPause')).to_be_disabled()
        page.locator('.tf-hero-bottom [data-tf-motion]').click()
        expect(page.locator('#carPause')).to_be_enabled()
        page.locator('#carNext').click()
        expect(page.locator('#carDots [aria-current=true]')).to_have_attribute('data-cdot','1')
        assert page.locator('#carTrack .slide[inert]').count()==3
        expect(page.locator('#carTrack .slide--active')).to_have_attribute('aria-hidden','false')
        page.locator('#carPause').click()
        expect(page.locator('#carPause')).to_have_attribute('aria-pressed','true')
        page.wait_for_timeout(7250)
        expect(page.locator('#carDots [aria-current=true]')).to_have_attribute('data-cdot','1')
        # Real 3D transforms are restricted to mouse users; reduced-motion immediately overrides them.
        page.emulate_media(reduced_motion='reduce')
        expect(page.locator('#carPause')).to_be_disabled()
        assert page.locator('.tf-showcase').evaluate('(e)=>getComputedStyle(e).transform')=='none'
        ctx.close()
    check('Motion preference, persistence, manual carousel, inert inactive slides and pause',motion)

    def keyboard_series():
        ctx=context(browser,390);page=ctx.new_page()
        page.goto(BASE+'/',wait_until='networkidle')
        page.locator('button.scard[data-serie="HM Series"]').focus()
        page.keyboard.press('Enter')
        expect(page.locator('#catTitle')).to_have_text('HM Series')
        assert page.locator('.pcard').count()>0
        page.goto(BASE+'/sobre.html',wait_until='networkidle')
        page.locator('.tf-nav-menu summary').click()
        expect(page.locator('.tf-nav-menu')).to_have_attribute('open','')
        page.keyboard.press('Escape')
        assert page.locator('.tf-nav-menu').get_attribute('open') is None
        ctx.close()
    check('Keyboard line selection and secondary mobile navigation',keyboard_series)
    browser.close()

server.shutdown()
(OUT/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
failed=sum(not result['passed'] for result in results)
print(f'{len(results)-failed}/{len(results)} browser scenarios passed; live Supabase writes and external CDN PDF generation are intentionally not exercised.')
sys.exit(1 if failed else 0)
