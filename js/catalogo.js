import { norm } from './util.js';

// Catálogo de ejercicios del Gimnasio: los ejercicios se ELIGEN de aquí (rutinas y entrenamientos), no se escriben a mano.
// Grupos musculares, en el orden en que se muestran.
export const GROUPS = ['Pecho', 'Espalda', 'Hombros', 'Bíceps', 'Tríceps', 'Piernas', 'Glúteos', 'Abdomen', 'Cardio', 'Otro'];

// Ejercicios con los que arranca el catálogo (se pueden editar, quitar o ampliar). Se siembran una sola vez.
export const DEFAULT_EXERCISES = [
  ['Pecho', ['Press de banca', 'Press de banca inclinado', 'Press de banca declinado', 'Press con mancuernas', 'Press inclinado con mancuernas',
    'Aperturas con mancuernas', 'Cruces en polea', 'Máquina de aperturas (pec deck)', 'Fondos en paralelas', 'Flexiones']],
  ['Espalda', ['Dominadas', 'Jalón al pecho', 'Remo con barra', 'Remo con mancuerna', 'Remo en polea baja', 'Remo en máquina',
    'Peso muerto', 'Pullover con mancuerna', 'Hiperextensiones']],
  ['Hombros', ['Press militar', 'Press de hombros con mancuernas', 'Elevaciones laterales', 'Elevaciones frontales', 'Pájaros con mancuernas',
    'Face pull', 'Encogimientos con mancuernas', 'Remo al mentón']],
  ['Bíceps', ['Curl con barra', 'Curl con mancuernas', 'Curl martillo', 'Curl predicador', 'Curl en polea']],
  ['Tríceps', ['Extensión de tríceps en polea', 'Press francés', 'Fondos en banco', 'Patada de tríceps', 'Press cerrado',
    'Extensión de tríceps sobre la cabeza']],
  ['Piernas', ['Sentadilla', 'Sentadilla frontal', 'Sentadilla búlgara', 'Sentadilla goblet', 'Prensa de piernas', 'Zancadas',
    'Extensión de cuádriceps', 'Curl femoral tumbado', 'Curl femoral sentado', 'Peso muerto rumano', 'Elevación de talones']],
  ['Glúteos', ['Hip thrust', 'Patada de glúteo en polea', 'Abducción de cadera', 'Puente de glúteos']],
  ['Abdomen', ['Crunch', 'Plancha', 'Elevación de piernas', 'Rueda abdominal', 'Giros rusos', 'Crunch en polea']],
  ['Cardio', ['Caminadora', 'Caminata', 'Bicicleta estática', 'Elíptica', 'Ergómetro de remo', 'Escaladora', 'Saltar la cuerda']],
];

// Identidad de un ejercicio: su nombre sin tildes, mayúsculas ni espacios de más. Las rutinas y el historial guardan el nombre
// (no un id), así que el historial sigue legible aunque el ejercicio ya no esté en el catálogo.
export const exKey = name => norm(name).replace(/\s+/g, ' ').trim();
