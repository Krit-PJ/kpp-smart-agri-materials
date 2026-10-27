"""สร้าง PDF จากหน้าพิมพ์รายงาน แล้ววางเทียบกับแบบฟอร์มต้นฉบับ: python3 tests/print_test.py <out> <original-page-png-prefix>"""
import asyncio, sys, os, subprocess
sys.path.insert(0, os.path.dirname(__file__))
import harness as H
from playwright.async_api import async_playwright
from PIL import Image

OUT = sys.argv[1]; ORIG = sys.argv[2] if len(sys.argv) > 2 else None
os.makedirs(OUT, exist_ok=True)


async def main():
    H.serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1440, 'height': 900})
        for pat, fn in H.wire(pg): await pg.route(pat, fn)
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(H.BASE + '#map'); await pg.wait_for_selector('#mLogin')
        await pg.evaluate("API.call('auth.login',{username:'mini',password:'mini1234'}).then(r=>App.setSession(r.token,r.user))")
        await pg.wait_for_timeout(500)
        await pg.goto(H.BASE + '#print?scope=province&r=3'); await pg.wait_for_selector('.sheet')
        for sel, v in [('#pSeason', '2568 - 2569'), ('#pNo', '15'), ('#pStart', '2026-04-30'), ('#pEnd', '2026-05-06')]:
            await pg.fill(sel, v)
        await pg.wait_for_timeout(900)
        await pg.screenshot(path=f'{OUT}/print-screen.png')
        await pg.emulate_media(media='print')
        await pg.evaluate("window.onbeforeprint()")
        await pg.pdf(path=f'{OUT}/print.pdf', format='A4', print_background=True, prefer_css_page_size=True)
        print('fit notes:', await pg.eval_on_selector_all('#pPages .fitnote', 'e => e.map(x => x.textContent)'), 'errors:', errs)
        await b.close()
    subprocess.run(['pdftoppm', '-r', '110', '-png', f'{OUT}/print.pdf', f'{OUT}/mine'], check=True)
    print(subprocess.run(['pdfinfo', f'{OUT}/print.pdf'], capture_output=True, text=True).stdout.split('Pages:')[1].split('\n')[0].strip(), 'pages')
    if ORIG:
        for i in (1, 2):
            a = Image.open(f'{ORIG}-{i}.png').convert('RGB'); m = Image.open(f'{OUT}/mine-{i}.png').convert('RGB')
            m = m.resize((int(m.width * a.height / m.height), a.height))
            c = Image.new('RGB', (a.width + m.width + 10, a.height), 'white'); c.paste(a, (0, 0)); c.paste(m, (a.width + 10, 0))
            c.save(f'{OUT}/cmp{i}.png')

asyncio.run(main())
