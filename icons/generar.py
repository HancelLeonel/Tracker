"""Regenera icon.svg y los tres PNG del manifiesto (192, 512 y maskable 512) y muestra el SVG que va en la pantalla de arranque de index.html.

Uso:  .venv/bin/python icons/generar.py
El logo es un aro de tres arcos con los colores de las secciones (Hábitos ámbar, Listas azul, Finanzas verde azulado; son los tokens
oscuros --yellow, --blue y --teal de css/style.css) y una palomita clara, sobre el fondo del tema oscuro (--base, también el
`background_color` del manifiesto). El maskable lleva la marca al 80 % para que la máscara circular de Android no la corte.
Si cambias la marca, regenera con este script, actualiza el SVG de `.boot` en index.html y reinstala la app en el teléfono (el icono y el
splash instalados solo cambian al reinstalar). tests/icono.py comprueba los píxeles."""
import math
from pathlib import Path
from playwright.sync_api import sync_playwright

HERE = Path(__file__).parent
BG, INK = '#111317', '#e8eaee'
ARCS = [(-60, '#d9bc7a'), (60, '#86a8e8'), (180, '#7cc4bb')]  # ángulo central (grados, horario) y color
R, SPAN, W = 184, 100, 28


def arc(mid, color):
    a0, a1 = math.radians(mid - SPAN / 2), math.radians(mid + SPAN / 2)
    p = lambda a: (256 + R * math.cos(a), 256 + R * math.sin(a))
    (x0, y0), (x1, y1) = p(a0), p(a1)
    return f'<path d="M{x0:.1f} {y0:.1f}A{R} {R} 0 0 1 {x1:.1f} {y1:.1f}" fill="none" stroke="{color}" stroke-width="{W}" stroke-linecap="round"/>'


MARK = ''.join(arc(m, c) for m, c in ARCS) + f'<path d="M175 262l62 66 102-116" fill="none" stroke="{INK}" stroke-width="{W}" stroke-linecap="round" stroke-linejoin="round"/>'


def svg(maskable=False, size=512):
    body = f'<rect width="512" height="512" fill="{BG}"/><g transform="translate(51.2 51.2) scale(.8)">{MARK}</g>' if maskable \
        else f'<rect width="512" height="512" rx="112" fill="{BG}"/>{MARK}'
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="{size}" height="{size}">{body}</svg>'


if __name__ == '__main__':
    (HERE / 'icon.svg').write_text(svg().replace('viewBox="0 0 512 512" width="512" height="512"', 'viewBox="0 0 512 512"', 1) + '\n')
    with sync_playwright() as p:
        b = p.chromium.launch()
        for name, size, mask in (('icon-512.png', 512, False), ('icon-192.png', 192, False), ('icon-maskable-512.png', 512, True)):
            page = b.new_page(viewport={'width': size, 'height': size})
            page.set_content(f'<body style="margin:0;background:transparent">{svg(mask, size)}</body>')
            page.screenshot(path=str(HERE / name), omit_background=True)
            print('escrito', name)
        b.close()
    print('\nSVG de la pantalla de arranque (.boot en index.html):\n' + svg(size=96))
