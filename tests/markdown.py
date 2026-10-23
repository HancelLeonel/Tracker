"""Markdown en las notas: renderizador seguro, campo «Markdown» con barra de formato y vista previa, lista, búsqueda y respaldo."""
import os, sys, json, tempfile
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep
os.makedirs(OUT, exist_ok=True)
import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
from _nav import ir
espera()
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
try:
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width':390,'height':800})
        page = ctx.new_page(); errs=[]
        page.on('pageerror', lambda e: errs.append(str(e)))
        page.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        page.on('dialog', lambda d: d.accept())
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        md = lambda s: page.evaluate("s => import('/js/markdown.js').then(m => m.renderMarkdown(s))", s)

        # ================= 1. renderizador =================
        check('título', md('# Hola') == '<h3>Hola</h3>' and md('###### Seis') == '<h6>Seis</h6>', md('# Hola'))
        h = md('**negrita** y *cursiva* y ~~tachado~~ y `código`')
        check('negrita, cursiva, tachado y código en línea', all(x in h for x in ['<strong>negrita</strong>', '<em>cursiva</em>', '<del>tachado</del>', '<code>código</code>']), h)
        check('guiones bajos dentro de una palabra no son cursiva', '<em>' not in md('snake_case_name y 2 * 3 * 4'), md('snake_case_name y 2 * 3 * 4'))
        h = md('<script>alert(1)</script> <img src=x onerror=alert(1)>')
        check('el HTML escrito se muestra como texto', '<script' not in h and '<img' not in h and '&lt;script&gt;' in h, h)
        h = md('[x](javascript:alert(1)) y [y](data:text/html,hola)')
        check('los enlaces que no son http(s) no se enlazan', '<a' not in h and 'javascript:alert' in h, h)
        h = md('[ok](https://ejemplo.com/a_b_c*d?x=1&y=2)')
        check('el enlace conserva la dirección sin tocar guiones bajos ni asteriscos', 'href="https://ejemplo.com/a_b_c*d?x=1&amp;y=2"' in h and '<em>' not in h and 'rel="noopener noreferrer"' in h and 'target="_blank"' in h, h)
        h = md('mira https://ejemplo.com/ruta. Fin')
        check('una URL suelta se enlaza sin el punto final', 'href="https://ejemplo.com/ruta"' in h and '</a>. Fin' in h, h)
        h = md('```\n**no** <b>x</b>\n```')
        check('el código en bloque no se interpreta', '<pre class="code">**no** &lt;b&gt;x&lt;/b&gt;</pre>' == h, h)
        check('bloque de código sin cerrar llega hasta el final', md('```\nabc') == '<pre class="code">abc</pre>')
        h = md('- a\n  - b\n- c')
        check('listas con sangría', h == '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>', h)
        check('lista numerada', md('1. uno\n2. dos') == '<ol><li>uno</li><li>dos</li></ol>', md('1. uno\n2. dos'))
        h = md('- [x] hecho\n- [ ] pendiente')
        check('lista de tareas', h.count('class="task done"') == 1 and h.count('class="task "') == 1 and 'aria-label="Hecho"' in h and 'aria-label="Pendiente"' in h, h)
        check('cita y línea', md('> cita *x*\n\n---') == '<blockquote><p>cita <em>x</em></p></blockquote><hr>', md('> cita *x*\n\n---'))
        check('un salto de línea dentro del párrafo se respeta', md('uno\ndos') == '<p>uno<br>dos</p>')
        check('los escapes con barra invertida', md('\\*no\\* \\# no') == '<p>*no* # no</p>', md('\\*no\\* \\# no'))
        check('las imágenes no se cargan', '<img' not in md('![alt](https://x.com/a.png)'))
        check('texto vacío o raro no falla', md('') == '' and md(None) == '' and md('\u0000\u0000') == '')
        hostile = ['[a](https://x.com/"onmouseover="alert(1))', '**<b onclick=1>**', '`<script>`', '> <iframe src=x>', '# <svg onload=1>', '- [x] <img src=x onerror=1>', '[<img src=x onerror=1>](https://a.com)']
        bad = page.evaluate("""hs => import('/js/markdown.js').then(m => hs.flatMap(s => {
          const t = document.createElement('template'); t.innerHTML = m.renderMarkdown(s); const out = [];
          t.content.querySelectorAll('*').forEach(el => { if (!['P','H3','H4','H5','H6','STRONG','EM','DEL','CODE','A','PRE','UL','OL','LI','SPAN','BLOCKQUOTE','HR','BR','SVG','PATH'].includes(el.tagName.toUpperCase())) out.push(s + ' -> ' + el.tagName);
            for (const a of el.attributes) if (!['href','target','rel','class','role','aria-label','aria-hidden','viewbox','d'].includes(a.name.toLowerCase())) out.push(s + ' -> ' + el.tagName + '@' + a.name); });
          return out; }))""", hostile)
        check('ninguna entrada hostil produce etiquetas o atributos peligrosos', bad == [], bad)
        pl = lambda s: page.evaluate("s => import('/js/markdown.js').then(m => m.plainLine(s))", s)
        check('resumen de la lista sin marcas', pl('\n## Título *claro*\ntexto') == 'Título claro' and pl('- [ ] comprar [pan](https://a.com)') == 'comprar pan' and pl('```\n---\n') == '' and pl('') == '', pl('## Título *claro*'))

        # ================= 2. campo Markdown en una nota =================
        ev = lambda js: page.evaluate(f"import('/js/state.js').then(async st => {{ {js} }})")
        ev("""await st.saveNoteGroup({ id: 'g1', name: 'Apuntes', color: 'blue', icon: 'note', fields: [{ id: 'f1', name: 'Contenido', type: 'markdown', list: true }] });""")
        page.reload(); page.wait_for_selector('#view .home')
        dlg = page.locator('#dlg')
        def go(tab): ir(page, tab); page.wait_for_timeout(150)
        go('notes'); page.click('[data-act=open-ngroup]'); page.wait_for_timeout(150)
        page.click('[data-act=new-note]'); page.wait_for_timeout(250)
        ta = dlg.locator('textarea.md-in')
        check('el formulario trae editor con barra y pestañas', ta.count()==1 and dlg.locator('.md-bar [data-md]').count()==8 and dlg.locator('[data-mdtab]').count()==2)
        dlg.locator('[name=title]').fill('Mi plan')
        ta.click()
        dlg.locator('[data-md=head]').click()
        check('Título añade «## » a la línea', ta.input_value() == '## ', repr(ta.input_value()))
        ta.press_sequentially('Semana'); ta.press('Enter')
        dlg.locator('[data-md=bold]').click()
        check('Negrita sin selección inserta el marcador seleccionado', ta.input_value().endswith('**texto**') and ta.evaluate('t => t.value.slice(t.selectionStart, t.selectionEnd)') == 'texto', repr(ta.input_value()))
        ta.press_sequentially('importante'); ta.press('End'); ta.press('Enter')
        dlg.locator('[data-md=task]').click(); ta.press_sequentially('Comprar pan'); ta.press('Enter')
        dlg.locator('[data-md=list]').click(); ta.press_sequentially('Otra cosa')
        dlg.locator('[data-md=link]').click()
        check('Enlace deja seleccionada la dirección', ta.evaluate('t => t.value.slice(t.selectionStart, t.selectionEnd)') == 'https://')
        ta.press_sequentially('https://ejemplo.com/a_b'); ta.press('End'); ta.press('Enter')
        dlg.locator('[data-md=code]').click(); ta.press_sequentially('npm test'); ta.press('End'); ta.press('Enter')
        dlg.locator('[data-md=quote]').click(); ta.press_sequentially('una cita')
        v = ta.input_value()
        check('la barra aplicó cada formato', all(x in v for x in ['## Semana', '**importante**', '- [ ] Comprar pan', '- Otra cosa', '[texto](https://ejemplo.com/a_b)', '`npm test`', '> una cita']), repr(v))
        dlg.locator('[data-mdtab=prev]').click(); page.wait_for_timeout(100)
        prev = dlg.locator('.md-prev')
        check('Vista previa muestra el resultado y oculta el editor', prev.is_visible() and not ta.is_visible() and prev.locator('h4').inner_text()=='Semana' and prev.locator('strong').inner_text()=='importante' and prev.locator('li.task').count()==1 and prev.locator('blockquote').count()==1)
        check('Vista previa oculta la barra de formato', not dlg.locator('.md-bar').is_visible())
        page.screenshot(path=OUT+'markdown-previa.png')
        dlg.locator('[data-mdtab=edit]').click(); page.wait_for_timeout(100)
        check('volver a Escribir conserva el texto', ta.is_visible() and ta.input_value() == v)
        dlg.locator('button.primary').click(); page.wait_for_timeout(300)

        # ---- lista y detalle
        row = page.locator('.note-row').first.inner_text()
        check('la lista muestra la primera línea sin marcas de Markdown', 'Semana' in row and '##' not in row, row)
        page.locator('.card.note').first.click(); page.wait_for_timeout(250)
        det = dlg.locator('.md')
        check('el detalle muestra la nota con formato', det.locator('h4').count()==1 and det.locator('a[href="https://ejemplo.com/a_b"]').count()==1 and det.locator('li.task').count()==1 and det.locator('code').count()==1, det.inner_html()[:300])
        page.screenshot(path=OUT+'markdown-detalle.png')
        check('sin desborde horizontal en el detalle', dlg.evaluate('d => d.scrollWidth <= d.clientWidth'))
        dlg.locator('[data-act=note-edit]').click(); page.wait_for_timeout(250)
        check('al editar vuelve el texto original', dlg.locator('textarea.md-in').input_value() == v)
        dlg.locator('#cancel').click(); page.wait_for_timeout(150)

        # ---- búsqueda dentro del contenido en Markdown
        page.fill('#nsearch', 'Comprar pan'); page.wait_for_timeout(200)
        check('la búsqueda encuentra texto dentro del Markdown', page.locator('.note-row').count()==1)
        page.fill('#nsearch', 'zzz'); page.wait_for_timeout(200)
        check('y no encuentra lo que no está', page.locator('.note-row').count()==0)
        page.fill('#nsearch', '')

        # ---- respaldo
        exp = page.evaluate("import('/js/data.js').then(d => d.buildExport(false))")
        check('el respaldo guarda el tipo y el texto tal cual', exp['noteGroups'][0]['fields'][0]['type']=='markdown' and exp['notes'][0]['values']['f1']==v)
        check('validateImport acepta el tipo Markdown', page.evaluate("d => import('/js/data.js').then(m => m.validateImport(d).noteGroups[0].fields[0].type)", exp)=='markdown')

        # ---- contenido largo: URL y código anchos no desbordan
        ev("""const n = st.S.notes[0]; n.values.f1 = '# T\\n\\nhttps://ejemplo.com/' + 'a'.repeat(200) + '\\n\\n```\\n' + 'x'.repeat(300) + '\\n```\\n\\n`' + 'y'.repeat(150) + '`'; await st.saveNote(n);""")
        page.reload(); page.wait_for_selector('#view .home'); go('notes'); page.click('[data-act=open-ngroup]'); page.locator('.card.note').first.click(); page.wait_for_timeout(250)
        check('una URL, un bloque y un código muy largos no desbordan', dlg.evaluate('d => d.scrollWidth <= d.clientWidth'))
        dlg.locator('#cancel').click()
        ctx.close()

        # ================= 3. tema claro y fuente monoespaciada =================
        ctx = b.new_context(viewport={'width':390,'height':800}); page = ctx.new_page(); errs2=[]
        page.on('pageerror', lambda e: errs2.append(str(e)))
        page.goto('http://localhost:8765/'); page.wait_for_selector('#view .home')
        page.evaluate("""import('/js/state.js').then(async st => { await st.saveNoteGroup({ id: 'g1', name: 'Apuntes', color: 'blue', icon: 'note', fields: [{ id: 'f1', name: 'Contenido', type: 'markdown' }] });
          const now = Date.now(); const n = { id: 'n1', group: 'g1', title: 'Larga', values: { f1: '# Título\\n\\n- [x] hecho\\n- [ ] falta\\n\\n> cita\\n\\n`código` y [enlace](https://a.com)' }, tags: [], created: now, updated: now };
          st.S.notes.push(n); await st.saveNote(n); st.S.settings.theme = 'light'; st.S.settings.font = 'jetbrains'; await st.saveSettings();
          const ui = await import('/js/ui.js'); ui.applyTheme('light'); ui.applyFont('jetbrains'); })""")
        page.reload(); page.wait_for_selector('#view .home')
        ir(page, 'notes'); page.click('[data-act=open-ngroup]'); page.locator('.card.note').first.click(); page.wait_for_timeout(300)
        page.screenshot(path=OUT+'markdown-claro.png')
        check('tema claro + JetBrains Mono: sin desborde', page.locator('#dlg').evaluate('d => d.scrollWidth <= d.clientWidth') and not page.evaluate('document.documentElement.scrollWidth > innerWidth'))
        errs += errs2
        check('sin errores de consola', errs==[], errs)
        print('errors:', errs)
        b.close()
finally:
    srv.terminate()
print('FALLAS:', fails)
sys.exit(1 if fails else 0)
