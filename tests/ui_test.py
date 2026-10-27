"""ทดสอบการใช้งานจริงทุกบทบาทในโหมดทดลอง: python3 tests/ui_test.py <โฟลเดอร์ภาพ>"""
import asyncio, sys, os, json
sys.path.insert(0, os.path.dirname(__file__))
import harness as H
from playwright.async_api import async_playwright

OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/shots'
os.makedirs(OUT, exist_ok=True)
errs = []


async def newpage(b, w=1440, h=900):
    ctx = await b.new_context(viewport={'width': w, 'height': h}, accept_downloads=True, locale='th-TH')
    pg = await ctx.new_page()
    for pat, fn in H.wire(pg):
        await pg.route(pat, fn)
    pg.on('pageerror', lambda e: errs.append('pageerror: ' + str(e)))
    pg.on('console', lambda m: m.type == 'error' and 'favicon' not in m.text and errs.append('console: ' + m.text))
    return pg


async def shot(pg, name, full=False):
    await pg.wait_for_timeout(350)
    await pg.screenshot(path=f'{OUT}/{name}.png', full_page=full)


async def login_phone(pg, phone):
    await pg.click('#mLogin')
    await pg.fill('#lgPhone', phone)
    await pg.click('#lgForm button[type=submit]')
    await pg.wait_for_selector('.side-user .who', timeout=8000)


async def login_admin(pg, u, p):
    await pg.click('#mLogin')
    await pg.click('#lgTabs [data-t=admin]')
    await pg.fill('#adUser', u); await pg.fill('#adPass', p)
    await pg.click('#adForm button[type=submit]')
    await pg.wait_for_selector('.side-user .who', timeout=8000)


async def logout(pg):
    await pg.evaluate("App.logout(true)")
    await pg.wait_for_selector('#mLogin')


async def main():
    srv = H.serve()
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await newpage(b)
        await pg.goto(H.BASE + '#map')
        await pg.evaluate("localStorage.clear()")
        await pg.reload()
        await pg.wait_for_selector('.dist-label', timeout=15000)
        await shot(pg, '01-map-public')
        n = await pg.locator('.dist-label').count(); print('district labels', n)
        await pg.locator('path.leaflet-interactive').nth(3).dispatch_event('click')
        await pg.wait_for_selector('#mCard:not([hidden])')
        await shot(pg, '02-map-click')

        # ── ลงทะเบียนใหม่ ──
        await pg.click('#mLogin')
        await pg.fill('#lgPhone', '0899998888')
        await pg.click('#lgForm button[type=submit]')
        await pg.wait_for_selector('#rgForm')
        await shot(pg, '03-register')
        await pg.fill('#rgName', 'ทดสอบ ลงทะเบียน'); await pg.fill('#rgPos', 'นักวิชาการส่งเสริมการเกษตร')
        await pg.select_option('#rgDist', 'D05'); await pg.check('#rgOk')
        await pg.click('#rgForm button[type=submit]')
        await pg.wait_for_selector('#eForm', timeout=8000)
        print('registered →', await pg.inner_text('#pageSub'))
        await logout(pg)

        # ── เจ้าหน้าที่อำเภอ: กรอก ตรวจสอบ ส่ง ──
        await login_phone(pg, '0810000001')
        await pg.wait_for_selector('#eForm')
        await shot(pg, '04-entry')
        r31 = pg.locator('.fr[data-id=R31]')
        prev = await r31.locator('.cum.prev').inner_text()
        await r31.locator('input[data-k=v]').fill('150')
        print('R31 prev', prev, '→ new', await r31.locator('.cv').inner_text(), '| มี on:', await r31.locator('.yn .on').count())
        r32 = pg.locator('.fr[data-id=R32]')
        await r32.locator('input[data-k=v]').fill('35'); await r32.locator('input[data-k=u]').fill('ไร่'); await r32.locator('input[data-k=t]').fill('อัดฟาง')
        await pg.click('#e4Add')
        await pg.locator('#e4 textarea').last.fill('จัดอบรมการทำปุ๋ยหมักจากฟางข้าว ณ ศาลาหมู่บ้าน')
        await pg.locator('#e4 input[data-k=v]').last.fill('1'); await pg.locator('#e4 input[data-k=u]').last.fill('ครั้ง')
        await pg.locator('#e4 input[data-k=u]').last.blur()
        await pg.fill('#e5', 'เครื่องอัดฟางไม่เพียงพอ')
        await pg.click('#eFilter [data-f=agri]'); await shot(pg, '05-entry-agri', True)
        await pg.click('#eDraft'); await pg.wait_for_timeout(700)
        print('after draft status:', await pg.inner_text('.toolbar .chip'))
        await pg.click('#eNext'); await pg.wait_for_selector('#eSend')
        await shot(pg, '06-review', True)
        await pg.check('#eOk'); await pg.click('#eSend')
        await pg.wait_for_selector('#eWithdraw', timeout=8000)
        await shot(pg, '07-submitted')
        print('submitted status:', await pg.inner_text('.toolbar .chip'))
        # อำเภอเข้าหน้าสถานะไม่ได้ (ค่าเริ่มต้น) / เมนูไม่แสดง
        print('district nav:', await pg.eval_on_selector_all('.nav-item span', 'els => els.map(e => e.textContent)'))
        await pg.goto(H.BASE + '#print?r=3'); await pg.wait_for_selector('.sheet')
        await pg.wait_for_timeout(800)
        await shot(pg, '08-print-district')
        await pg.goto(H.BASE + '#district'); await pg.wait_for_selector('#dR'); await shot(pg, '09-district', True)
        await logout(pg)

        # ── Mini Super Admin ──
        await login_admin(pg, 'mini', 'mini1234')
        await pg.wait_for_selector('#pTable')
        await shot(pg, '10-province', True)
        await pg.goto(H.BASE + '#status'); await pg.wait_for_selector('[data-review]')
        await shot(pg, '11-status', True)
        await pg.locator('[data-review="D01"]').click(); await pg.wait_for_selector('#rvNote')
        await shot(pg, '12-review-modal')
        await pg.get_by_role('button', name='ตรวจรับ').click(); await pg.wait_for_timeout(800)
        # เปิดให้อำเภอดูสถานะ
        await pg.check('#sVis'); await pg.wait_for_timeout(500)
        await pg.goto(H.BASE + '#users'); await pg.wait_for_selector('table.t'); await shot(pg, '13-users-mini', True)
        await pg.goto(H.BASE + '#logs'); await pg.wait_for_selector('table.t'); await shot(pg, '14-logs')
        await pg.goto(H.BASE + '#print?scope=province&r=3'); await pg.wait_for_selector('.sheet'); await pg.wait_for_timeout(900)
        await shot(pg, '15-print-province')
        await pg.fill('#pSeason', '2568 - 2569'); await pg.fill('#pNo', '15'); await pg.fill('#pStart', '2026-04-30'); await pg.fill('#pEnd', '2026-05-06')
        await pg.wait_for_timeout(600)
        async with pg.expect_download() as d:
            await pg.click('#pXlsx')
        dl = await d.value; await dl.save_as(f'{OUT}/province.xlsx'); print('xlsx:', dl.suggested_filename)
        await pg.emulate_media(media='print')
        await pg.evaluate("window.onbeforeprint()")
        await pg.pdf(path=f'{OUT}/province.pdf', format='A4', print_background=True, prefer_css_page_size=True)
        await pg.emulate_media(media='screen')
        await pg.goto(H.BASE + '#settings'); await pg.wait_for_selector('#rTable'); await shot(pg, '16-settings-mini', True)
        await logout(pg)

        # ── อำเภอเห็นสถานะเมื่อเปิดสวิตช์ ──
        await login_phone(pg, '0810000002')
        navs = await pg.eval_on_selector_all('.nav-item span', 'els => els.map(e => e.textContent)')
        print('district nav after toggle has status:', 'สถานะการส่งรายงาน' in navs)
        await pg.goto(H.BASE + '#status'); await pg.wait_for_selector('td.cell'); await shot(pg, '17-status-district')
        await logout(pg)

        # ── Super Admin ──
        await login_admin(pg, 'admin', 'admin1234')
        await pg.goto(H.BASE + '#users'); await pg.wait_for_selector('#uAdd')
        await pg.click('#uAdd'); await pg.select_option('#eRole', 'mini')
        await pg.fill('#eName', 'ผู้รวบรวม ใหม่'); await pg.fill('#eUser', 'mini2'); await pg.fill('#ePass', 'pass1234')
        await shot(pg, '18-add-mini')
        await pg.get_by_role('button', name='เพิ่มผู้ใช้').last.click(); await pg.wait_for_timeout(600)
        print('mini2 added:', await pg.locator('text=mini2').count() > 0)
        await shot(pg, '19-users-super', True)
        await pg.goto(H.BASE + '#entry?d=D09&r=2'); await pg.wait_for_selector('#eBody .card, #eForm'); print('super entry D09:', await pg.inner_text('#pageSub'))
        await pg.goto(H.BASE + '#logs'); await pg.wait_for_selector('table.t')
        print('log rows:', await pg.locator('table.t tbody tr').count())

        # ── มือถือ ──
        m = await newpage(b, 390, 844)
        await m.goto(H.BASE + '#map'); await m.wait_for_selector('.dist-label', timeout=15000)
        await shot(m, '20-mobile-map')
        await login_phone(m, '0810000003')
        await m.wait_for_selector('#eForm'); await shot(m, '21-mobile-entry')
        sw = await m.evaluate('document.documentElement.scrollWidth')
        print('mobile scrollWidth', sw)
        await m.click('#menuBtn'); await shot(m, '22-mobile-nav')
        await b.close()
    print('ERRORS', json.dumps(errs, ensure_ascii=False, indent=1))
    if srv: srv.terminate()

PAGES = []
_np = newpage
async def newpage(b, w=1440, h=900):
    pg = await _np(b, w, h); PAGES.append(pg); return pg

async def run():
    try:
        await main()
    except Exception as e:
        for i, pg in enumerate(PAGES):
            try: await pg.screenshot(path=f'{OUT}/zz-fail-{i}.png')
            except Exception: pass
        print('ERRORS', json.dumps(errs, ensure_ascii=False, indent=1))
        raise

asyncio.run(run())
