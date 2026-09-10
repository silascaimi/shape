const exercise = (id, name, sets, reps, rest, rir, substitute, options = {}) => ({
  id,
  name,
  sets,
  reps,
  rest,
  restSeconds: rest === '2 min' ? 120 : rest === '90 s' ? 90 : 60,
  rir,
  substitute,
  bodyweight: false,
  metric: 'repetições',
  ...options,
});

export const WORKOUT_SEQUENCE = ['push-a', 'pull-a', 'legs-a', 'push-b', 'pull-b', 'legs-b'];

export const WORKOUTS = [
  {
    id: 'push-a',
    name: 'Push A',
    focus: 'Peito, ombros e tríceps',
    exercises: [
      exercise('supino-inclinado-maquina', 'Supino inclinado em máquina', 3, '6–10', '2 min', '2', 'Supino inclinado com halteres e banco ajustável'),
      exercise('supino-maquina-reto', 'Supino máquina reto', 2, '8–12', '2 min', '2', 'Supino reto com halteres'),
      exercise('desenvolvimento-halteres', 'Desenvolvimento sentado com halteres', 2, '8–12', '2 min', '2', 'Desenvolvimento em máquina'),
      exercise('elevacao-lateral-halteres', 'Elevação lateral com halteres', 3, '12–20', '60–90 s', '2', 'Elevação lateral no cabo'),
      exercise('triceps-v', 'Tríceps na polia com barra V', 3, '10–15', '60–90 s', '1–2', 'Tríceps na polia com corda'),
      exercise('crucifixo-cabo-peck', 'Crucifixo no cabo ou peck deck', 2, '12–15', '60–90 s', '1–2', 'Crucifixo com halteres leve'),
      exercise('triceps-frances-cabo', 'Tríceps francês no cabo', 2, '10–15', '60–90 s', '1–2', 'Tríceps testa na polia'),
    ],
  },
  {
    id: 'pull-a',
    name: 'Pull A',
    focus: 'Costas, deltoide posterior e bíceps',
    exercises: [
      exercise('puxada-frontal', 'Puxada frontal na polia', 3, '8–12', '2 min', '2', 'Puxada com pegada neutra'),
      exercise('remada-maquina-neutra', 'Remada máquina neutra', 3, '8–12', '2 min', '2', 'Remada baixa no cabo'),
      exercise('remada-unilateral-halter', 'Remada unilateral com halter apoiado', 2, '10–15', '90 s', '2', 'Remada articulada, se houver'),
      exercise('crucifixo-inverso', 'Crucifixo inverso na máquina', 3, '12–20', '60–90 s', '2', 'Face pull no cabo'),
      exercise('rosca-direta-polia', 'Rosca direta na polia', 2, '10–15', '60–90 s', '1–2', 'Rosca direta com barra W'),
      exercise('pullover-cabo', 'Pullover no cabo', 2, '10–15', '90 s', '2', 'Pullover com halter no banco'),
      exercise('rosca-martelo-a', 'Rosca martelo com halteres', 2, '10–15', '60–90 s', '1–2', 'Rosca martelo com corda no cabo'),
    ],
  },
  {
    id: 'legs-a',
    name: 'Legs A — ênfase em quadríceps',
    focus: 'Quadríceps, posteriores, panturrilhas e core',
    exercises: [
      exercise('leg-press-45', 'Leg press 45°', 3, '8–12', '2 min', '2', 'Agachamento no smith, se disponível'),
      exercise('cadeira-extensora', 'Cadeira extensora', 2, '10–15', '90 s', '1–2', 'Afundo búlgaro com halteres'),
      exercise('romeno-halter-a', 'Levantamento romeno com halteres', 3, '8–12', '2 min', '2', 'Levantamento romeno no smith'),
      exercise('cadeira-flexora', 'Cadeira flexora', 2, '10–15', '90 s', '1–2', 'Mesa flexora'),
      exercise('panturrilha-leg-press-a', 'Panturrilha no leg press', 3, '10–15', '60–90 s', '1–2', 'Panturrilha em pé com halteres'),
      exercise('cadeira-abdutora', 'Cadeira abdutora', 2, '12–20', '60–90 s', '1–2', 'Abdução no cabo'),
      exercise('cadeira-adutora', 'Cadeira adutora', 2, '12–20', '60–90 s', '1–2', 'Adução no cabo'),
    ],
  },
  {
    id: 'push-b',
    name: 'Push B',
    focus: 'Peito, ombros e tríceps',
    exercises: [
      exercise('supino-reto-halteres', 'Supino reto com halteres', 3, '8–12', '2 min', '2', 'Supino máquina reto'),
      exercise('peck-deck-cabo', 'Peck deck ou crucifixo no cabo', 2, '12–15', '60–90 s', '1–2', 'Crucifixo com halteres leve'),
      exercise('desenvolvimento-maquina', 'Desenvolvimento em máquina', 2, '8–12', '2 min', '2', 'Desenvolvimento sentado com halteres'),
      exercise('elevacao-lateral-cabo', 'Elevação lateral no cabo ou halteres', 3, '12–20', '60–90 s', '2', 'Máquina de elevação lateral, se houver'),
      exercise('triceps-testa', 'Tríceps testa na polia', 3, '10–15', '60–90 s', '1–2', 'Tríceps francês no cabo'),
      exercise('crossover-cabo', 'Crossover no cabo', 2, '12–15', '60–90 s', '1–2', 'Peck deck'),
      exercise('triceps-corda', 'Tríceps na polia com corda', 2, '10–15', '60–90 s', '1–2', 'Tríceps na polia com barra V'),
    ],
  },
  {
    id: 'pull-b',
    name: 'Pull B',
    focus: 'Costas, deltoide posterior e bíceps',
    exercises: [
      exercise('puxada-triangulo', 'Puxada com triângulo', 3, '8–12', '2 min', '2', 'Puxada frontal com pegada neutra'),
      exercise('remada-baixa-cabo', 'Remada baixa no cabo', 3, '8–12', '2 min', '2', 'Remada máquina neutra'),
      exercise('pullover-cabo-b', 'Pullover no cabo', 2, '10–15', '90 s', '2', 'Pullover com halter no banco'),
      exercise('face-pull', 'Face pull no cabo', 2, '12–20', '60–90 s', '2', 'Crucifixo inverso na máquina'),
      exercise('rosca-scott', 'Rosca Scott em máquina', 3, '10–15', '60–90 s', '1–2', 'Rosca Scott com barra W'),
      exercise('rosca-martelo-b', 'Rosca martelo com halteres', 2, '10–15', '60–90 s', '1–2', 'Rosca martelo com corda no cabo'),
      exercise('rosca-inversa', 'Rosca inversa na polia', 2, '12–15', '60–90 s', '1–2', 'Rosca inversa com barra W'),
    ],
  },
  {
    id: 'legs-b',
    name: 'Legs B — ênfase em posteriores e glúteos',
    focus: 'Posteriores, glúteos, panturrilhas e core',
    exercises: [
      exercise('romeno-halter-b', 'Levantamento romeno com halteres', 3, '6–10', '2 min', '2', 'Levantamento romeno no smith'),
      exercise('flexora-b', 'Cadeira ou mesa flexora', 3, '10–15', '90 s', '1–2', 'Flexora disponível na unidade'),
      exercise('afundo-bulgaro', 'Afundo búlgaro com halteres', 2, '8–12/lado', '2 min', '2', 'Leg press unilateral'),
      exercise('cadeira-abdutora', 'Cadeira abdutora', 2, '12–20', '60–90 s', '1–2', 'Abdução no cabo'),
      exercise('panturrilha-leg-press-b', 'Panturrilha no leg press', 3, '10–15', '60–90 s', '1–2', 'Panturrilha em pé com halteres'),
      exercise('dead-bug', 'Dead bug', 2, '8–12/lado', '60 s', '—', 'Prancha lateral, 2 × 20–45 s/lado', { bodyweight: true }),
      exercise('elevacao-pelvica', 'Elevação pélvica', 2, '8–12', '90 s', '1–2', 'Elevação pélvica no smith ou com halter'),
    ],
  },
];

export const getWorkout = (id) => WORKOUTS.find((workout) => workout.id === id);
