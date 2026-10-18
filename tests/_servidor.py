"""Espera a que el servidor estático (puerto 8765) acepte conexiones. Con `run_all.py` ya está arriba (servidor compartido) y vuelve al
instante; si una prueba se ejecuta sola, espera lo justo a que arranque el suyo en vez de dormir un segundo fijo."""
import socket, time


def espera(puerto=8765, tope=10):
    fin = time.time() + tope
    while time.time() < fin:
        try:
            socket.create_connection(('localhost', puerto), timeout=0.2).close()
            return
        except OSError:
            time.sleep(0.05)
    raise RuntimeError(f'El servidor del puerto {puerto} no respondió en {tope} s')
