import { WORKOUT_SEQUENCE, WORKOUTS, getWorkout } from './training-plan.mjs';
import { deleteItem, exportBackup, getAllWorkouts, getItem, importBackup, putItem } from './db.mjs';

const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const timer = document.querySelector('#timer');
const connectionStatus = document.querySelector('#connection-status');

const state = {
  view: 'home',
  history: [],
  active: null,
  settings: { key: 'app', lastCompletedWorkoutId: null },
  historyDetailId: null,
  timerEnd: null,
  timerInterval: null,
  saveTimeout: null,
};

const formatDate = (value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const formatNumber = (value) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });
const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

function setConnectionStatus() {
  const online = navigator.onLine;
  connectionStatus.textContent = online ? 'Pronto offline' : 'Offline';
  connectionStatus.style.color = online ? 'var(--accent)' : 'var(--warning)';
}

function toastMessage(message) {
  toast.textContent = message;
  toast.classList.remove('is-hidden');
  window.clearTimeout(toastMessage.timeout);
  toastMessage.timeout = window.setTimeout(() => toast.classList.add('is-hidden'), 3400);
}

function nextWorkoutId() {
  const last = state.settings.lastCompletedWorkoutId;
  const index = WORKOUT_SEQUENCE.indexOf(last);
  return WORKOUT_SEQUENCE[(index + 1 + WORKOUT_SEQUENCE.length) % WORKOUT_SEQUENCE.length];
}

function createSeries(isExtra = false) {
  return { id: crypto.randomUUID(), weight: '', reps: '', rir: '', completed: false, completedAt: null, isExtra };
}

function createWorkout(workoutId) {
  const template = getWorkout(workoutId);
  return {
    id: crypto.randomUUID(),
    workoutId,
    workoutName: template.name,
    startedAt: new Date().toISOString(),
    completedAt: null,
    exercises: template.exercises.map((exercise) => ({
      ...exercise,
      sets: Array.from({ length: exercise.sets }, () => createSeries()),
    })),
  };
}

async function persistDraft(immediate = false) {
  window.clearTimeout(state.saveTimeout);
  if (!state.active) return;
  const save = () => putItem('drafts', { key: 'active', data: state.active }).catch(() => toastMessage('Não foi possível salvar o treino agora.'));
  if (immediate) await save();
  else state.saveTimeout = window.setTimeout(save, 350);
}

function previousExercise(exerciseId) {
  for (const workout of state.history) {
    const result = workout.exercises.find((exercise) => exercise.id === exerciseId);
    if (result && result.sets.some((set) => set.completed)) return result;
  }
  return null;
}

function setSummary(set, bodyweight) {
  const weight = bodyweight || set.weight === '' ? '' : `${formatNumber(set.weight)} kg × `;
  const metric = set.reps === '' ? '—' : set.reps;
  const rir = set.rir === '' || set.rir === '—' ? '' : ` · RIR ${set.rir}`;
  return `${weight}${metric}${rir}`;
}

function inputValue(value) { return escapeHtml(value); }

function renderHome() {
  const suggested = getWorkout(nextWorkoutId());
  const resume = state.active ? `
    <section class="card notice">
      <strong>Treino em andamento: ${escapeHtml(state.active.workoutName)}</strong>
      <p class="small">Iniciado em ${formatDate(state.active.startedAt)}. Os dados já foram salvos neste iPhone.</p>
      <button class="button" type="button" data-resume>Retomar treino</button>
    </section>` : '';
  app.innerHTML = `
    <section class="screen-heading">
      <p class="eyebrow">Registro de cargas</p>
      <h1>Seu próximo treino</h1>
      <p class="muted">Registre cada série para aplicar a progressão dupla com segurança.</p>
    </section>
    ${resume}
    <section class="card card-accent">
      <p class="eyebrow">Sugerido pela sequência PPL</p>
      <h2>${escapeHtml(suggested.name)}</h2>
      <p class="muted">${escapeHtml(suggested.focus)} · 7 exercícios</p>
      <button class="button" type="button" data-start="${suggested.id}">Iniciar ${escapeHtml(suggested.name)}</button>
    </section>
    <section class="card">
      <h2>Escolher outro treino</h2>
      <p class="small">Você pode alterar a ordem quando precisar; a sugestão seguinte acompanhará o último treino concluído.</p>
      <select class="session-picker" aria-label="Escolher treino" id="workout-picker">
        ${WORKOUTS.map((workout) => `<option value="${workout.id}">${escapeHtml(workout.name)} — ${escapeHtml(workout.focus)}</option>`).join('')}
      </select>
      <button class="button secondary" type="button" data-start-selected>Iniciar treino selecionado</button>
    </section>
    <section class="card">
      <h2>Instalar no iPhone</h2>
      <ol class="install-steps"><li>Abra este site no Safari.</li><li>Toque em Compartilhar.</li><li>Escolha “Adicionar à Tela de Início”.</li></ol>
      <p class="small">Após a primeira abertura, os treinos e os registros funcionam offline.</p>
    </section>`;
}

function renderSet(exercise, series, exerciseIndex, seriesIndex) {
  const metric = exercise.metric === 'segundos' ? 'Seg.' : 'Reps';
  const weightDisabled = exercise.bodyweight ? 'disabled' : '';
  const completed = series.completed ? 'is-complete' : '';
  return `
    <div class="set-row ${completed}">
      <span class="set-number">${seriesIndex + 1}</span>
      <div class="field"><label>Carga kg</label><input ${weightDisabled} inputmode="decimal" type="number" min="0" step="0.5" value="${inputValue(series.weight)}" data-field="weight" data-exercise-index="${exerciseIndex}" data-series-index="${seriesIndex}" aria-label="Carga em quilogramas, série ${seriesIndex + 1}"></div>
      <div class="field"><label>${metric}</label><input inputmode="numeric" type="number" min="1" step="1" value="${inputValue(series.reps)}" data-field="reps" data-exercise-index="${exerciseIndex}" data-series-index="${seriesIndex}" aria-label="${metric}, série ${seriesIndex + 1}"></div>
      <div class="field"><label>RIR</label><input ${exercise.rir === '—' ? 'disabled' : ''} inputmode="numeric" type="number" min="0" max="5" step="1" value="${inputValue(series.rir)}" data-field="rir" data-exercise-index="${exerciseIndex}" data-series-index="${seriesIndex}" aria-label="RIR, série ${seriesIndex + 1}"></div>
      <button class="set-action ${series.isExtra ? 'remove' : ''}" type="button" data-toggle-set data-exercise-index="${exerciseIndex}" data-series-index="${seriesIndex}" aria-label="${series.isExtra ? 'Remover série extra' : series.completed ? 'Desmarcar série concluída' : 'Concluir série'}">${series.isExtra ? '×' : series.completed ? '↶' : '✓'}</button>
    </div>`;
}

function renderWorkout() {
  const workout = state.active;
  if (!workout) { state.view = 'home'; render(); return; }
  app.innerHTML = `
    <section class="screen-heading">
      <p class="eyebrow">Em andamento · ${formatDate(workout.startedAt)}</p>
      <h1>${escapeHtml(workout.workoutName)}</h1>
      <p class="muted">Preencha e marque cada série. O treino é salvo automaticamente neste iPhone.</p>
    </section>
    ${workout.exercises.map((exercise, exerciseIndex) => {
      const previous = previousExercise(exercise.id);
      const previousText = previous ? previous.sets.filter((set) => set.completed).map((set) => setSummary(set, exercise.bodyweight)).join(' · ') : 'Sem registro anterior.';
      return `<section class="card exercise-card">
        <div class="card-header"><h2>${exerciseIndex + 1}. ${escapeHtml(exercise.name)}</h2><span class="pill accent">${exercise.sets} séries</span></div>
        <div class="exercise-meta"><span class="pill">${escapeHtml(exercise.reps)}</span><span class="pill">RIR ${escapeHtml(exercise.rir)}</span><span class="pill">Descanso ${escapeHtml(exercise.rest)}</span></div>
        <p class="substitute">Alternativa: ${escapeHtml(exercise.substitute)}</p>
        <p class="previous"><strong>Último:</strong> ${escapeHtml(previousText)}</p>
        ${previous && !exercise.bodyweight ? `<button class="button secondary small-button" type="button" data-copy-last data-exercise-index="${exerciseIndex}">Reutilizar últimas cargas</button>` : ''}
        <div>${exercise.sets.map((series, seriesIndex) => renderSet(exercise, series, exerciseIndex, seriesIndex)).join('')}</div>
        <button class="button secondary small-button" type="button" data-add-set data-exercise-index="${exerciseIndex}">+ Série extra</button>
      </section>`;
    }).join('')}
    <section class="workout-actions">
      <button class="button" type="button" data-finish-workout>Concluir e salvar treino</button>
      <button class="button secondary" type="button" data-back-home>Voltar sem concluir</button>
    </section>`;
}

function renderHistory() {
  const records = state.history;
  const detail = records.find((workout) => workout.id === state.historyDetailId);
  app.innerHTML = `
    <section class="screen-heading"><p class="eyebrow">Histórico local</p><h1>Treinos concluídos</h1><p class="muted">${records.length} registro(s) salvo(s) neste iPhone.</p></section>
    ${records.length ? `<ul class="history-list">${records.map((workout) => `<li><button class="history-button" type="button" data-history-id="${workout.id}"><strong>${escapeHtml(workout.workoutName)}</strong><br><span class="small">${formatDate(workout.completedAt)}</span></button></li>`).join('')}</ul>` : '<section class="card"><p>Nenhum treino concluído ainda.</p></section>'}
    ${detail ? `<section class="card history-details"><div class="row-between"><h2>${escapeHtml(detail.workoutName)}</h2><button class="button secondary small-button" type="button" data-close-history>Fechar</button></div><p class="small">${formatDate(detail.completedAt)}</p>${detail.exercises.map((exercise) => `<div class="history-exercise"><strong>${escapeHtml(exercise.name)}</strong><br><span class="small">${exercise.sets.filter((set) => set.completed).map((set) => escapeHtml(setSummary(set, exercise.bodyweight))).join(' · ') || 'Sem séries concluídas'}</span></div>`).join('')}</section>` : ''}`;
}

function renderData() {
  app.innerHTML = `
    <section class="screen-heading"><p class="eyebrow">Dados no aparelho</p><h1>Backup e restauração</h1><p class="muted">Os dados não são enviados para nenhum servidor. Exporte um backup semanalmente.</p></section>
    <section class="card"><h2>Exportar backup</h2><p class="small">Baixe um arquivo JSON e guarde-o em Arquivos ou iCloud Drive. Ele contém histórico, treino em andamento e a próxima sessão.</p><button class="button" type="button" data-export>Exportar JSON</button></section>
    <section class="card"><h2>Importar backup</h2><p class="notice">A importação substitui todos os registros locais existentes. Exporte o estado atual antes de restaurar outro arquivo.</p><input id="import-file" type="file" accept="application/json,.json" hidden><button class="button secondary" type="button" data-import>Selecionar arquivo JSON</button></section>
    <section class="card"><h2>Proteção dos registros</h2><p class="small">Limpar os dados do Safari, usar navegação privada ou trocar de aparelho pode apagar os registros. O backup JSON é a forma de recuperação e transferência.</p></section>`;
}

function updateNav() {
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === state.view || (state.view === 'workout' && button.dataset.view === 'home')));
}

function render() {
  if (state.view === 'workout') renderWorkout();
  else if (state.view === 'history') renderHistory();
  else if (state.view === 'data') renderData();
  else renderHome();
  updateNav();
  app.focus({ preventScroll: true });
}

async function startWorkout(workoutId) {
  if (state.active && !window.confirm('Há um treino em andamento. Deseja substituí-lo?')) return;
  state.active = createWorkout(workoutId);
  await persistDraft(true);
  state.view = 'workout';
  render();
}

function numeric(value) { return Number(String(value).replace(',', '.')); }

function validSet(exercise, series) {
  const repsValid = Number.isInteger(numeric(series.reps)) && numeric(series.reps) > 0;
  const weightValid = exercise.bodyweight || (series.weight !== '' && Number.isFinite(numeric(series.weight)) && numeric(series.weight) >= 0);
  const rirValid = exercise.rir === '—' || (Number.isInteger(numeric(series.rir)) && numeric(series.rir) >= 0 && numeric(series.rir) <= 5);
  return repsValid && weightValid && rirValid;
}

function startTimer(seconds) {
  window.clearInterval(state.timerInterval);
  state.timerEnd = Date.now() + seconds * 1000;
  timer.classList.remove('is-hidden');
  const tick = () => {
    const remaining = Math.max(0, Math.ceil((state.timerEnd - Date.now()) / 1000));
    timer.textContent = `Descanso: ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
    if (remaining === 0) {
      window.clearInterval(state.timerInterval);
      timer.textContent = 'Descanso concluído';
      window.setTimeout(() => timer.classList.add('is-hidden'), 1800);
    }
  };
  tick();
  state.timerInterval = window.setInterval(tick, 1000);
}

async function toggleSet(exerciseIndex, seriesIndex) {
  const exercise = state.active.exercises[exerciseIndex];
  const series = exercise.sets[seriesIndex];
  if (series.isExtra) {
    exercise.sets.splice(seriesIndex, 1);
  } else if (!series.completed) {
    if (!validSet(exercise, series)) {
      toastMessage(exercise.bodyweight ? 'Preencha repetições/tempo e RIR antes de concluir.' : 'Preencha carga, repetições e RIR antes de concluir.');
      return;
    }
    series.completed = true;
    series.completedAt = new Date().toISOString();
    startTimer(exercise.restSeconds);
  } else {
    series.completed = false;
    series.completedAt = null;
  }
  await persistDraft(true);
  renderWorkout();
}

async function copyLast(exerciseIndex) {
  const exercise = state.active.exercises[exerciseIndex];
  const previous = previousExercise(exercise.id);
  if (!previous) return;
  exercise.sets.forEach((series, index) => {
    const prior = previous.sets.filter((set) => set.completed)[index];
    if (prior) series.weight = prior.weight;
  });
  await persistDraft(true);
  renderWorkout();
  toastMessage('Últimas cargas copiadas. Ajuste repetições e RIR após cada série.');
}

async function finishWorkout() {
  const incomplete = state.active.exercises.some((exercise) => exercise.sets.some((series) => !series.completed || !validSet(exercise, series)));
  if (incomplete) {
    toastMessage('Conclua ou remova todas as séries extras antes de finalizar.');
    return;
  }
  if (!window.confirm('Concluir este treino e adicioná-lo ao histórico?')) return;
  const completed = { ...state.active, completedAt: new Date().toISOString() };
  await putItem('workouts', completed);
  state.settings = { key: 'app', lastCompletedWorkoutId: completed.workoutId, lastCompletedAt: completed.completedAt };
  await putItem('settings', state.settings);
  await deleteItem('drafts', 'active');
  state.history.unshift(completed);
  state.active = null;
  state.view = 'home';
  render();
  toastMessage('Treino salvo no histórico.');
}

async function downloadBackup() {
  const backup = await exportBackup();
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `shape-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  toastMessage('Backup preparado. Salve-o em Arquivos ou iCloud Drive.');
}

async function restoreBackup(file) {
  if (!file) return;
  if (!window.confirm('A importação substituirá todos os dados locais. Continuar?')) return;
  try {
    const backup = JSON.parse(await file.text());
    await importBackup(backup);
    state.history = await getAllWorkouts();
    const storedDraft = await getItem('drafts', 'active');
    const storedSettings = await getItem('settings', 'app');
    state.active = storedDraft?.data ?? null;
    state.settings = storedSettings ?? { key: 'app', lastCompletedWorkoutId: null };
    state.view = 'home';
    render();
    toastMessage('Backup restaurado neste iPhone.');
  } catch (error) {
    toastMessage(error.message || 'Não foi possível importar este arquivo.');
  }
}

function bindAppEvents() {
  app.addEventListener('input', (event) => {
    const input = event.target;
    if (!input.matches('[data-field]') || !state.active) return;
    const exercise = state.active.exercises[Number(input.dataset.exerciseIndex)];
    const series = exercise.sets[Number(input.dataset.seriesIndex)];
    series[input.dataset.field] = input.value;
    persistDraft();
  });

  app.addEventListener('click', async (event) => {
    const button = event.target.closest('button');
    if (!button) return;
    if (button.dataset.resume !== undefined) { state.view = 'workout'; render(); }
    else if (button.dataset.start) await startWorkout(button.dataset.start);
    else if (button.dataset.startSelected !== undefined) await startWorkout(document.querySelector('#workout-picker').value);
    else if (button.dataset.backHome !== undefined) { state.view = 'home'; render(); }
    else if (button.dataset.toggleSet !== undefined) await toggleSet(Number(button.dataset.exerciseIndex), Number(button.dataset.seriesIndex));
    else if (button.dataset.addSet !== undefined) {
      state.active.exercises[Number(button.dataset.exerciseIndex)].sets.push(createSeries(true));
      await persistDraft(true); renderWorkout();
    } else if (button.dataset.copyLast !== undefined) await copyLast(Number(button.dataset.exerciseIndex));
    else if (button.dataset.finishWorkout !== undefined) await finishWorkout();
    else if (button.dataset.historyId) { state.historyDetailId = button.dataset.historyId; renderHistory(); }
    else if (button.dataset.closeHistory !== undefined) { state.historyDetailId = null; renderHistory(); }
    else if (button.dataset.export !== undefined) await downloadBackup();
    else if (button.dataset.import !== undefined) document.querySelector('#import-file').click();
  });

  app.addEventListener('change', (event) => {
    if (event.target.id === 'import-file') restoreBackup(event.target.files[0]);
  });
}

async function initialize() {
  try {
    const [history, storedDraft, storedSettings] = await Promise.all([
      getAllWorkouts(), getItem('drafts', 'active'), getItem('settings', 'app'),
    ]);
    state.history = history;
    state.active = storedDraft?.data ?? null;
    state.settings = storedSettings ?? state.settings;
  } catch {
    toastMessage('O navegador não conseguiu abrir o armazenamento local.');
  }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  setConnectionStatus();
  render();
}

document.querySelector('.bottom-nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  state.view = button.dataset.view;
  state.historyDetailId = null;
  render();
});
window.addEventListener('online', setConnectionStatus);
window.addEventListener('offline', setConnectionStatus);
bindAppEvents();
initialize();
