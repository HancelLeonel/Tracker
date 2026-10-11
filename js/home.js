import { esc } from './util.js';

// Frases con autoría documentada (obras, discursos o tradición). Se evitaron las de atribución dudosa.
export const QUOTES = [
  ['El que tiene un porqué para vivir puede soportar casi cualquier cómo.', 'Friedrich Nietzsche'],
  ['La vida no examinada no merece ser vivida.', 'Sócrates'],
  ['Somos lo que hacemos repetidamente. La excelencia, entonces, no es un acto, sino un hábito.', 'Will Durant'],
  ['El viaje de mil millas comienza con un solo paso.', 'Lao Tsé'],
  ['No es que tengamos poco tiempo, sino que perdemos mucho.', 'Séneca'],
  ['El alma se tiñe del color de sus pensamientos.', 'Marco Aurelio'],
  ['No son las cosas las que inquietan a las personas, sino las opiniones que tienen de ellas.', 'Epicteto'],
  ['La imaginación es más importante que el conocimiento.', 'Albert Einstein'],
  ['Caminante, no hay camino, se hace camino al andar.', 'Antonio Machado'],
  ['Lo esencial es invisible a los ojos.', 'Antoine de Saint-Exupéry'],
  ['Quien lee mucho y anda mucho, ve mucho y sabe mucho.', 'Miguel de Cervantes'],
  ['La libertad, Sancho, es uno de los más preciosos dones que a los hombres dieron los cielos.', 'Miguel de Cervantes'],
  ['Todo lo que somos es el resultado de lo que hemos pensado.', 'Buda (Dhammapada)'],
  ['La única manera de hacer un gran trabajo es amar lo que haces.', 'Steve Jobs'],
  ['Nada en la vida debe ser temido, solo comprendido.', 'Marie Curie'],
  ['Cuando ya no podemos cambiar una situación, se nos desafía a cambiarnos a nosotros mismos.', 'Viktor Frankl'],
  ['Lo que no me mata me hace más fuerte.', 'Friedrich Nietzsche'],
  ['Cuida los pequeños gastos: un pequeño agujero hunde un gran barco.', 'Benjamin Franklin'],
  ['El mejor momento para plantar un árbol fue hace veinte años. El segundo mejor momento es ahora.', 'Proverbio chino'],
  ['La gota perfora la piedra no por su fuerza, sino por su constancia.', 'Ovidio'],
  ['Hay que pedir una mente sana en un cuerpo sano.', 'Juvenal'],
  ['Vencer a otros es fuerza; vencerse a uno mismo es poder.', 'Lao Tsé'],
  ['No hay viento favorable para quien no sabe adónde va.', 'Séneca'],
  ['Aprender sin pensar es inútil; pensar sin aprender, peligroso.', 'Confucio'],
  ['Quien teme sufrir ya sufre lo que teme.', 'Michel de Montaigne'],
  ['La vida es un diez por ciento lo que te ocurre y un noventa por ciento cómo reaccionas.', 'Charles R. Swindoll'],
  ['Si quieres ir rápido, camina solo; si quieres llegar lejos, ve acompañado.', 'Proverbio africano'],
  ['Poco a poco se anda lejos.', 'Refrán'],
  ['La vida no es la que uno vivió, sino la que uno recuerda y cómo la recuerda para contarla.', 'Gabriel García Márquez'],
  ['Pies, ¿para qué los quiero si tengo alas para volar?', 'Frida Kahlo'],
  ['Que otros se jacten de las páginas que han escrito; a mí me enorgullecen las que he leído.', 'Jorge Luis Borges'],
  ['Ser culto es el único modo de ser libre.', 'José Martí'],
  ['No es pobre el que tiene poco, sino el que desea más.', 'Séneca'],
  ['Si tienes un jardín y una biblioteca, nada te faltará.', 'Cicerón'],
];

// Se mezclan todas y se reparten una a una: no se repite ninguna hasta haberlas visto todas
// (y la primera de una mezcla nueva nunca es la última de la anterior).
let bag = [], current = null;

export function nextQuote() {
  if (!bag.length) {
    bag = QUOTES.map((_, i) => i);
    for (let i = bag.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
    if (bag.length > 1 && bag.at(-1) === current) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  current = bag.pop();
}

const greeting = h => (h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches');
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function homeView() {
  if (current === null) nextQuote();
  const [text, author] = QUOTES[current];
  const now = new Date();
  const date = cap(now.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' }));
  return `
    <section class="home">
      <header class="home-top"><h2>${greeting(now.getHours())}</h2><small>${esc(date)}</small></header>
      <button class="home-quote" data-act="home-quote" aria-label="Mostrar otra frase">
        <blockquote><p>${esc(text)}</p><footer>${esc(author)}</footer></blockquote>
      </button>
    </section>`;
}

// Tocar la frase muestra otra (no hay botón visible para mantener la pantalla limpia).
export const actions = {
  'home-quote': () => nextQuote(),
};
