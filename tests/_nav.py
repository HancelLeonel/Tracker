"""Ayudante de navegación para las pruebas: `ir(page, 'habits')` va a una sección como lo haría una persona.
Usa la barra inferior (`#nav`) y, si el destino no está ahí, la hoja «Más». Así, si cambia cómo se navega, solo se toca este archivo."""


def ir(page, tab):
    if page.locator(f'#nav [data-tab={tab}]').count():
        page.click(f'#nav [data-tab={tab}]')
    else:
        page.click('#nav [data-act=more]')
        page.click(f'#dlg [data-tab={tab}]')
    page.wait_for_timeout(60)


def destinos(page):
    """Nombres de todas las secciones en el orden en que se ofrecen: primero la barra inferior y luego la hoja «Más» (que se cierra al leerla)."""
    barra = page.evaluate("[...document.querySelectorAll('#nav [data-tab]')].map(b => b.textContent.trim())")
    page.click('#nav [data-act=more]')
    mas = page.evaluate("[...document.querySelectorAll('#dlg [data-tab]')].map(b => b.textContent.trim())")
    page.keyboard.press('Escape')
    page.wait_for_timeout(120)
    return barra + mas
