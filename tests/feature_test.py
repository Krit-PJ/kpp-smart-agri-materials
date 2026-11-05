"""ทดสอบแบบฟอร์มที่แก้ไขได้ (Super Admin) + หัวรายงานที่หน้าพิมพ์ (โหมดทดลอง): python3 tests/feature_test.py <out>"""
import asyncio, sys, os
sys.path.insert(0, os.path.dirname(__file__))
import harness as H
from playwright.async_api import async_playwright
OUT = sys.argv[1]; os.makedirs(OUT, exist_ok=True)
LOGIN = "API.call('auth.login',%s).then(r=>App.setSession(r.token,r.user))"


async def main():
    H.serve()
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1440, 'height': 900}, accept_downloads=True)
        for pat, fn in H.wire(pg): await pg.route(pat, fn)
        errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        await pg.goto(H.BASE + '#map'); await pg.evaluate('localStorage.clear()'); await pg.reload()
        await pg.wait_for_selector('.dist-label', timeout=15000)
        # ── 2) Super Admin แก้ไขแบบฟอร์ม ──
        await pg.evaluate(LOGIN % "{username:'admin',password:'admin1234'}"); await pg.wait_for_timeout(400)
        await pg.goto(H.BASE + '#form'); await pg.wait_for_selector('#feList .fe-row')
        print('form rows:', await pg.locator('.fe-row').count(), '| header:', await pg.inner_text('#pageSub'))
        idx = await pg.evaluate("W => [...document.querySelectorAll('.fe-row')].findIndex(r => r.textContent.includes('ไถกลบตอซัง'))", None)
        row = pg.locator('.fe-row').nth(idx)
        await row.locator('[data-a=edit]').click(); await pg.wait_for_selector('#fLabel')
        print('R31 unit locked:', await pg.is_disabled('#fUnit'), '| kind locked:', await pg.is_disabled('#fKind'))
        await pg.fill('#fLabel', 'ไถกลบตอซัง/การใช้สารย่อยสลาย (ปรับถ้อยคำ)'); await pg.click('.modal-f .btn.primary')
        idx = await pg.evaluate("() => [...document.querySelectorAll('.fe-row')].findIndex(r => r.textContent.includes('การดำเนินการอื่น') && r.querySelector('.fe-code').textContent === '2.2')")
        await pg.locator('.fe-row').nth(idx).locator('[data-a=add]').click(); await pg.wait_for_selector('#fLabel')
        await pg.fill('#fLabel', 'อัดฟางก้อนจำหน่าย/ใช้เลี้ยงสัตว์'); await pg.fill('#fUnit', 'ตัน'); await pg.click('.modal-f .btn.primary')
        idx = await pg.evaluate("() => [...document.querySelectorAll('.fe-row')].findIndex(r => r.textContent.includes('มีการแจ้งข้อมูล/แจ้งเตือน'))")
        await pg.locator('.fe-row').nth(idx).locator('[data-a=retire]').click()
        idx = await pg.evaluate("() => [...document.querySelectorAll('.fe-row')].findIndex(r => r.textContent.includes('จัดทำข้อมูลสถานการณ์ประจำวัน'))")
        await pg.locator('.fe-row').nth(idx).locator('[data-a=del]').click(); await pg.click('.modal-f .btn.danger')
        print('pending:', await pg.inner_text('.savebar-info'))
        await pg.screenshot(path=f'{OUT}/form-editor.png', full_page=False)
        await pg.click('#fSave'); await pg.wait_for_function("!document.querySelector('#fSave') || document.querySelector('#fSave').disabled", timeout=8000)
        await pg.wait_for_timeout(500)
        print('after save:', await pg.inner_text('#pageSub'))
        print('AG_ITEMS:', await pg.evaluate("[AG_ITEMS.length, S.formCustom, !!U.item('N1'), U.item('R13').retired, !U.item('R9')]"))
        await pg.locator('.fe-row.new, .fe-row').filter(has_text='อัดฟางก้อน').first.scroll_into_view_if_needed()
        await pg.screenshot(path=f'{OUT}/form-saved.png')
        # ── 3) อำเภอกรอกข้อใหม่ ข้อยกเลิกใช้ไม่อยู่ในแบบกรอก ──
        await pg.evaluate(LOGIN % "{phone:'0810000001'}"); await pg.wait_for_timeout(400)
        await pg.goto(H.BASE + '#entry'); await pg.wait_for_selector('#eForm')
        print('entry: N1 shown =', await pg.locator('.fr[data-id=N1]').count(), '| R13 shown =', await pg.locator('.fr[data-id=R13]').count(), '| R9 shown =', await pg.locator('.fr[data-id=R9]').count())
        await pg.fill('.fr[data-id=N1] input[data-k=v]', '42.5')
        await pg.locator('.fr[data-id=N1]').scroll_into_view_if_needed(); await pg.screenshot(path=f'{OUT}/entry-new-item.png')
        await pg.click('#eNext'); await pg.wait_for_selector('#eOk'); await pg.check('#eOk'); await pg.click('#eSend'); await pg.wait_for_timeout(900)
        # ── 4) รายงานจังหวัด / พิมพ์ / Excel ──
        await pg.evaluate(LOGIN % "{username:'mini',password:'mini1234'}"); await pg.wait_for_timeout(400)
        await pg.goto(H.BASE + '#province'); await pg.wait_for_selector('#pTable')
        t = await pg.inner_text('#pTable'); print('province has N1:', 'อัดฟางก้อน' in t, '| has retired R13 (has data):', 'มีการแจ้งข้อมูล/แจ้งเตือน' in t, '| R9 gone:', 'จัดทำข้อมูลสถานการณ์ประจำวัน' not in t)
        cur = await pg.evaluate('S.currentRound()')
        await pg.goto(H.BASE + f'#print?scope=province&r={cur}'); await pg.wait_for_selector('.sheet'); await pg.wait_for_timeout(800)
        print('print sheets:', await pg.locator('.sheet').count(), '| has N1 row:', await pg.locator('.sheet td.lbl', has_text='อัดฟางก้อน').count(), '| title field:', await pg.locator('#pTitle').count(), '| office field:', await pg.input_value('#pOffice'))
        await pg.fill('#pOffice', 'สำนักงานเกษตรจังหวัดกำแพงเพชร (ทดสอบ)'); await pg.wait_for_timeout(500)
        print('office in preview:', await pg.locator('.ph1', has_text='(ทดสอบ)').count())
        await pg.locator('.sheet').first.screenshot(path=f'{OUT}/print-p1.png')
        async with pg.expect_download() as dl:
            await pg.click('#pXlsx')
        d = await dl.value; path = f'{OUT}/custom.xlsx'; await d.save_as(path); print('xlsx downloaded:', os.path.getsize(path), 'bytes')
        # ── 5) หัวรายงาน: ไม่ซ้ำกับหน้าตั้งค่า ──
        await pg.goto(H.BASE + '#settings'); await pg.wait_for_selector('#aSave')
        print('settings duplicate header editor removed:', await pg.locator('#hSave').count() == 0 and await pg.locator('[data-set=DOC_REF_2]').count() == 0, '| link:', await pg.locator('a[href="#print?scope=province"]').count())
        print('mini nav has form editor:', await pg.locator('.nav-item[data-key=form]').count())
        # ── 7) มือถือ ──
        m = await b.new_page(viewport={'width': 390, 'height': 844})
        for pat, fn in H.wire(m): await m.route(pat, fn)
        m.on('pageerror', lambda e: errs.append('m:' + str(e)))
        await m.goto(H.BASE + '#map'); await m.wait_for_selector('.dist-label')
        await m.evaluate(LOGIN % "{username:'admin',password:'admin1234'}"); await m.wait_for_timeout(400)
        for key in ['form', 'print', 'settings']:
            await m.goto(H.BASE + '#' + key); await m.wait_for_timeout(1200)
            print('mobile', key, 'scrollWidth:', await m.evaluate('document.documentElement.scrollWidth'))
            await m.screenshot(path=f'{OUT}/m-{key}.png')
        print('ERRORS', errs)
        await b.close()

asyncio.run(main())
