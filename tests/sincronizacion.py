"""Sincronización con Google Drive (inicio de sesión y Drive simulados): enviar, traer, conflictos y copias de seguridad."""
import os, sys, tempfile, json, hashlib, re
from pathlib import Path
ROOT = str(Path(__file__).resolve().parent.parent)
OUT = os.path.join(tempfile.gettempdir(), 'tracker-shots') + os.sep
os.makedirs(OUT, exist_ok=True)
import subprocess, time
from playwright.sync_api import sync_playwright
srv = subprocess.Popen(['python3','-m','http.server','8765','-d',ROOT],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
from _servidor import espera
espera()
fails=[]
def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ')+name, extra if not cond else '')
    if not cond: fails.append(name)
URL = 'http://localhost:8765/'

# Google falso: el script de inicio de sesión entrega un token y Drive guarda un solo archivo en memoria.
GSI = """window.google = { accounts: { oauth2: { initTokenClient: c => ({ requestAccessToken() { window.__tokens = (window.__tokens||0)+1; setTimeout(() => c.callback({ access_token: 'tok', expires_in: 3600 }), 10); } }) } } };"""
drive = {'file': None, 'calls': [], 'scopes': []}
def drive_route(route):
    req = route.request; url = req.url; drive['calls'].append(f'{req.method} {url.split("googleapis.com")[1][:60]}')
    if req.headers.get('authorization') != 'Bearer tok':
        return route.fulfill(status=401, body='{}')
    f = drive['file']
    info = lambda: {'id': 'F1', 'md5Checksum': hashlib.md5(f['body']).hexdigest(), 'modifiedTime': f['time']}
    if req.method == 'GET' and '/drive/v3/files?' in url:
        return route.fulfill(json={'files': [info()] if f else []})
    if req.method == 'GET' and 'alt=media' in url:
        return route.fulfill(body=f['body'], content_type='application/json')
    if req.method in ('POST', 'PATCH') and 'uploadType=multipart' in url:
        raw = req.post_data_buffer
        text = raw.decode()
        parts = text.split('\r\n--')[0:]
        content = re.split(r'\r\n\r\n', text, maxsplit=2)[2].rsplit('\r\n--', 1)[0]
        drive['file'] = f = {'body': content.encode(), 'time': '2026-10-12T10:00:00.000Z'}
        drive['last_meta'] = re.split(r'\r\n\r\n', text, maxsplit=2)[1].split('\r\n--')[0]
        return route.fulfill(json=info())
    route.fulfill(status=404, body='{}')

def device(ctx, name):
    p = ctx.new_page(); errs = []
    p.on('pageerror', lambda e: errs.append(str(e)))
    p.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
    p.route('https://accounts.google.com/gsi/client', lambda r: r.fulfill(body=GSI, content_type='text/javascript'))
    p.route('https://www.googleapis.com/**', drive_route)
    p.goto(URL); p.wait_for_selector('#view .home')
    return p, errs

def go(p, tab): p.click('[data-act=menu-open]'); p.click(f'#tabs [data-tab={tab}]'); p.wait_for_timeout(150)
def add_account(p, name, amount):
    go(p, 'money')
    p.click('[data-act=new-acc]'); p.fill('input[name=name]', name); p.click('#f .btn.primary'); p.wait_for_timeout(200)
def acc_names(p): return p.evaluate("import('/js/state.js').then(st => st.S.accounts.map(a => a.name))")
def sync_state(p):
    go(p, 'data'); p.wait_for_timeout(300); return p.locator('#sync-state').inner_text()

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        phone_ctx = b.new_context(viewport={'width':390,'height':800}, accept_downloads=True)
        pc_ctx = b.new_context(viewport={'width':1100,'height':800}, accept_downloads=True)
        msgs = []
        for c in (phone_ctx, pc_ctx): pass
        phone, e1 = device(phone_ctx, 'tel')
        pc, e2 = device(pc_ctx, 'pc')
        for pg in (phone, pc):
            pg.on('dialog', lambda d, pg=pg: (msgs.append(d.message), d.accept()))

        # ---- el ID de cliente viene incluido en la app
        go(phone, 'data')
        check('ya muestra «Enviar a la nube» y «Traer de la nube» sin configurar nada', phone.locator('[data-act=sync-push]').count()==1 and phone.locator('[data-act=sync-pull]').count()==1)
        check('estado inicial: sin sincronizar', phone.locator('#sync-state').inner_text()=='Sin sincronizar')
        check('el diseño cabe en el teléfono (sin desborde horizontal)', phone.evaluate("document.documentElement.scrollWidth <= innerWidth"))
        phone.screenshot(path=OUT+'sync_cfg.png', full_page=True)
        phone.click('[data-act=sync-setup]')
        check('la cuenta de Google no pide ID (viene incluido) y no ofrece desconectar sin haber sincronizado', 'viene incluido' in phone.locator('#f').inner_text() and phone.locator('#del').count()==0)
        phone.click('#cancel')

        # ---- traer sin nada en la nube
        phone.click('[data-act=sync-pull]'); phone.wait_for_timeout(600)
        check('traer con la nube vacía avisa y no cambia nada', 'Todavía no hay nada' in phone.locator('#toast').inner_text() and drive['file'] is None)

        # ---- el teléfono crea datos y los envía
        add_account(phone, 'Banco', 0); add_account(phone, 'Efectivo', 0)
        go(phone, 'data'); phone.wait_for_timeout(300)
        check('con datos nuevos dice «Sin sincronizar» o cambios pendientes', phone.locator('#sync-state').inner_text() in ('Sin sincronizar','Cambios sin enviar'))
        phone.click('[data-act=sync-push]'); phone.wait_for_timeout(900)
        check('se creó un único archivo en la carpeta privada de la app', drive['file'] is not None and 'appDataFolder' in drive.get('last_meta',''), drive.get('last_meta'))
        sent = json.loads(drive['file']['body'])
        check('el archivo trae las cuentas', sorted(a['name'] for a in sent['accounts'])==['Banco','Efectivo'])
        check('no viajan los ajustes propios del dispositivo (fuente, tema, Pomodoro)', not any(k in sent['settings'] for k in ('font','theme','pomo','gym','lastExport','includeFiles')), list(sent['settings']))
        check('el estado pasa a «Sin cambios pendientes»', sync_state(phone)=='Sin cambios pendientes')
        check('cambios de apariencia no cuentan como cambios', (phone.click('.font-opt:has(input[value=jetbrains])'), phone.wait_for_timeout(300), phone.locator('#sync-state').inner_text())[2]=='Sin cambios pendientes')
        check('«Última sincronización» ya no dice nunca', 'nunca' not in phone.locator('#sync .kv').first.inner_text())
        n = len(drive['calls'])
        phone.click('[data-act=sync-push]'); phone.wait_for_timeout(600)
        check('enviar otra vez sin cambios no sube nada', not any(c.startswith(('POST','PATCH')) for c in drive['calls'][n:]), drive['calls'][n:])

        # ---- la PC trae
        go(pc, 'data')
        msgs.clear(); pc.click('[data-act=sync-pull]'); pc.wait_for_timeout(1200)
        check('la PC pide confirmación antes de reemplazar', any('Se reemplazarán TODOS' in m for m in msgs), msgs)
        check('la PC recibe las cuentas del teléfono', acc_names(pc)==['Banco','Efectivo'], acc_names(pc))
        check('la PC conserva su propia fuente (no se pisa con la del teléfono)', pc.evaluate("document.documentElement.dataset.font")!='jetbrains')
        check('la PC queda «Sin cambios pendientes»', sync_state(pc)=='Sin cambios pendientes')
        msgs.clear(); pc.click('[data-act=sync-pull]'); pc.wait_for_timeout(600)
        check('traer otra vez sin cambios no pregunta nada', not msgs)

        # ---- edición en la PC y vuelta al teléfono
        add_account(pc, 'Ahorros', 0)
        check('la PC marca «Cambios sin enviar»', sync_state(pc)=='Cambios sin enviar')
        pc.click('[data-act=sync-push]'); pc.wait_for_timeout(900)
        check('la PC envía sin avisos de conflicto', not any('La nube tiene cambios' in m for m in msgs), msgs)
        msgs.clear(); phone.reload(); phone.wait_for_selector('#view .home'); go(phone, 'data')
        phone.click('[data-act=sync-pull]'); phone.wait_for_timeout(1200)
        check('el teléfono recibe lo de la PC', acc_names(phone)==['Ahorros','Banco','Efectivo'], acc_names(phone))
        check('y conserva su fuente JetBrains', phone.evaluate("document.documentElement.dataset.font")=='jetbrains')

        # ---- conflicto: los dos editan sin sincronizar entre medio
        add_account(phone, 'Del teléfono', 0)
        add_account(pc, 'De la PC', 0)
        go(pc, 'data'); pc.click('[data-act=sync-push]'); pc.wait_for_timeout(900)
        msgs.clear()
        go(phone, 'data')
        with phone.expect_download() as dl: phone.click('[data-act=sync-push]')
        phone.wait_for_timeout(900)
        check('el teléfono avisa que la nube tiene cambios que no ha traído', any('La nube tiene cambios' in m for m in msgs), msgs)
        copia = json.load(open(dl.value.path()))
        check('antes de reemplazar descarga una copia de lo que había en la nube', 'De la PC' in [a['name'] for a in copia['accounts']] and 'Del teléfono' not in [a['name'] for a in copia['accounts']])
        check('la nube quedó con lo del teléfono', 'Del teléfono' in [a['name'] for a in json.loads(drive['file']['body'])['accounts']])

        # ---- conflicto al traer: cambios locales sin enviar
        add_account(phone, 'Pendiente', 0)
        go(phone, 'data'); phone.wait_for_timeout(200)
        go(pc, 'data')
        pc.click('[data-act=sync-pull]'); pc.wait_for_timeout(1000)  # la PC trae lo del teléfono y agrega algo más
        add_account(pc, 'Otra más', 0); go(pc, 'data')
        pc.click('[data-act=sync-push]'); pc.wait_for_timeout(900)
        msgs.clear(); go(phone, 'data')
        with phone.expect_download() as dl2: phone.click('[data-act=sync-pull]')
        phone.wait_for_timeout(1200)
        check('traer con cambios sin enviar advierte que se perderían', any('no se han enviado' in m for m in msgs), msgs)
        loc = json.load(open(dl2.value.path()))
        check('y descarga antes una copia de lo local', 'Pendiente' in [a['name'] for a in loc['accounts']])
        check('después el teléfono tiene lo de la nube', 'Pendiente' not in acc_names(phone) and 'Otra más' in acc_names(phone), acc_names(phone))

        # ---- sesión vencida y datos dañados en la nube
        n = len(drive['calls'])
        drive['file'] = {'body': b'{"app":"otra-cosa"}', 'time': '2026-10-12T11:00:00.000Z'}
        before = acc_names(phone); msgs.clear()
        go(phone, 'data'); phone.click('[data-act=sync-pull]'); phone.wait_for_timeout(1000)
        check('un archivo dañado en la nube se rechaza sin tocar los datos', acc_names(phone)==before and any('no es un respaldo' in m for m in msgs), msgs)

        # ---- desconectar
        go(phone, 'data'); phone.click('[data-act=sync-setup]'); phone.click('#del'); phone.wait_for_timeout(300)
        check('desconectar olvida lo sincronizado: vuelve a «Sin sincronizar»', phone.locator('#sync-state').inner_text()=='Sin sincronizar')

        check('sin errores de consola en el teléfono', not [e for e in e1 if 'Failed to load resource' not in e], e1)
        check('sin errores de consola en la PC', not [e for e in e2 if 'Failed to load resource' not in e], e2)
        b.close()
finally:
    srv.terminate()
print('errors: []' if not fails else 'FALLAS:', fails)
sys.exit(1 if fails else 0)
