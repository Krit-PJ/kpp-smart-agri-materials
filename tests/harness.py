"""ตัวช่วยทดสอบหน้าเว็บด้วย Playwright: เสิร์ฟไฟล์จากเครื่อง แทน CDN/ฟอนต์/แผนที่ด้วยไฟล์ในเครื่อง"""
import os, re, base64, subprocess, time, socket

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
NM = os.path.join(ROOT, 'tests', 'node_modules')
PORT = 8811
BASE = f'http://localhost:{PORT}/docs/'
GRAY = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mN89+7dfwAJXAPuXtVQ9gAAAABJRU5ErkJggg==')


def serve():
    s = socket.socket()
    try:
        s.connect(('localhost', PORT)); s.close(); return None
    except OSError:
        pass
    p = subprocess.Popen(['python3', '-m', 'http.server', str(PORT), '-d', ROOT], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(0.8)
    return p


def font_css():
    out = []
    v = open(os.path.join(NM, '@fontsource-variable', 'noto-sans-thai', 'standard.css'), encoding='utf8').read()
    out.append(v.replace("'Noto Sans Thai Variable'", "'Noto Sans Thai'").replace('url(./files/', f'url(http://localhost:{PORT}/tests/node_modules/@fontsource-variable/noto-sans-thai/files/'))
    for fam, weights in [('kanit', [400, 500, 600, 700]), ('ibm-plex-sans-thai', [400, 500, 600, 700])]:
        for w in weights:
            css = open(os.path.join(NM, '@fontsource', fam, f'{w}.css'), encoding='utf8').read()
            css = css.replace('url(./files/', f'url(http://localhost:{PORT}/tests/node_modules/@fontsource/{fam}/files/')
            out.append(css)
    return '\n'.join(out)


FONT_CSS = None


def wire(page):
    global FONT_CSS
    if FONT_CSS is None:
        FONT_CSS = font_css()
    lib = {
        'leaflet.min.js': ('leaflet/dist/leaflet.js', 'application/javascript'),
        'leaflet.min.css': ('leaflet/dist/leaflet.css', 'text/css'),
        'exceljs.min.js': ('exceljs/dist/exceljs.min.js', 'application/javascript'),
        'qrcode.min.js': ('qrcode-generator/qrcode.js', 'application/javascript'),
    }

    async def cdn(route):
        name = route.request.url.rsplit('/', 1)[-1]
        if name not in lib:
            await route.fulfill(body=GRAY, content_type='image/png'); return
        f, ct = lib[name]
        await route.fulfill(body=open(os.path.join(NM, f), 'rb').read(), content_type=ct)

    async def fonts(route):
        await route.fulfill(body=FONT_CSS, content_type='text/css')

    async def tiles(route):
        await route.fulfill(body=GRAY, content_type='image/png')
    return [('**/cdnjs.cloudflare.com/**', cdn), ('**/fonts.googleapis.com/**', fonts), (re.compile(r'.*(openstreetmap|arcgisonline|cartocdn).*'), tiles)]
