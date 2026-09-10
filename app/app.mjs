import { WORKOUT_SEQUENCE, WORKOUTS, getWorkout } from './training-plan.mjs';
import { deleteItem, exportBackup, getAllWorkouts, getItem, importBackup, normalizeDraft, normalizeWorkout, putItem } from './db.mjs';
import { downloadGoogleBackup, hasActiveGoogleToken, isGoogleConfigured, listGoogleBackups, requestGoogleAccess, uploadGoogleBackup } from './google-drive.mjs';

const app = document.querySelector('#app');
const toast = document.querySelector('#toast');
const connectionStatus = document.querySelector('#connection-status');
const state = { view: 'home', history: [], active: null, settings: { key: 'app', lastCompletedWorkoutId: null }, detailId: null, saveId: null, remoteBackups: [] };

const html = (value) => String(value ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c]);
const numeric = (value) => Number(String(value).replace(',', '.'));
const dateTime = (value) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
const kg = (value) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 });

function message(text) {
  toast.textContent = text; toast.classList.remove('is-hidden');
  clearTimeout(message.timeout); message.timeout = setTimeout(() => toast.classList.add('is-hidden'), 3400);
}

function setConnection() {
  connectionStatus.textContent = navigator.onLine ? 'Pronto offline' : 'Offline';
  connectionStatus.style.color = navigator.onLine ? 'var(--accent)' : 'var(--warning)';
}

function googleState() {
  if (!state.settings.googleBackup) state.settings.googleBackup = { enabled: false, pending: false, lastBackupAt: null, lastError: '' };
  return state.settings.googleBackup;
}

async function saveSettings() {
  await putItem('settings', state.settings);
}

async function setGoogleState(patch) {
  Object.assign(googleState(), patch);
  await saveSettings();
}

async function refreshLocalState() {
  const [history, draft, settings] = await Promise.all([getAllWorkouts(), getItem('drafts', 'active'), getItem('settings', 'app')]);
  state.history = history;
  state.active = normalizeDraft(draft)?.data ?? null;
  state.settings = settings ?? { key: 'app', lastCompletedWorkoutId: null };
  googleState();
}

async function saveGoogleBackup({ interactive = false } = {}) {
  if (!isGoogleConfigured()) throw new Error('O Client ID Google ainda não foi configurado nesta PWA.');
  if (!navigator.onLine) throw new Error('Sem internet. O backup ficará pendente neste iPhone.');
  if (interactive || !hasActiveGoogleToken()) await requestGoogleAccess({ forcePrompt: interactive || !hasActiveGoogleToken() });
  const backup = await exportBackup();
  const file = await uploadGoogleBackup(backup);
  await setGoogleState({ enabled: true, pending: false, lastBackupAt: file.modifiedTime || new Date().toISOString(), lastError: '' });
  return file;
}

async function tryAutomaticGoogleBackup() {
  const google = googleState();
  if (!google.enabled) return;
  if (!navigator.onLine || !hasActiveGoogleToken()) {
    await setGoogleState({ pending: true, lastError: navigator.onLine ? 'Autorize o Google novamente para enviar o backup.' : 'Sem internet; backup pendente.' });
    return;
  }
  try {
    await saveGoogleBackup();
    message('Treino salvo e backup Google atualizado.');
  } catch (error) {
    await setGoogleState({ pending: true, lastError: error.message || 'Falha no backup Google.' });
    message('Treino salvo neste iPhone; backup Google pendente.');
  }
}

function nextWorkoutId() {
  const index = WORKOUT_SEQUENCE.indexOf(state.settings.lastCompletedWorkoutId);
  return WORKOUT_SEQUENCE[(index + 1 + WORKOUT_SEQUENCE.length) % WORKOUT_SEQUENCE.length];
}

function newWorkout(workoutId) {
  const workout = getWorkout(workoutId);
  return {
    id: crypto.randomUUID(), recordVersion: 2, workoutId, workoutName: workout.name,
    startedAt: new Date().toISOString(), completedAt: null,
    exercises: workout.exercises.map((exercise) => ({ ...exercise, repsFinal: '', weightKg: '', rirFinal: '', completed: false, completedAt: null })),
  };
}

async function saveDraft(now = false) {
  clearTimeout(state.saveId);
  if (!state.active) return;
  const save = () => putItem('drafts', { key: 'active', data: state.active }).catch(() => message('Não foi possível salvar o treino agora.'));
  if (now) await save(); else state.saveId = setTimeout(save, 350);
}

function lastExercise(exerciseId) {
  for (const workout of state.history) {
    const found = workout.exercises.find((exercise) => exercise.id === exerciseId && exercise.completed);
    if (found) return found;
  }
  return null;
}

function summary(exercise) {
  if (!exercise.completed) return 'Não concluído';
  const weight = exercise.bodyweight || exercise.weightKg === '' ? 'Peso corporal' : `${kg(exercise.weightKg)} kg`;
  const reps = exercise.repsFinal === '' || exercise.repsFinal === undefined ? '' : `${exercise.repsFinal} rep${Number(exercise.repsFinal) === 1 ? '' : 's'} · `;
  return `${reps}${weight}${exercise.rirFinal === '' || exercise.rirFinal === '—' ? '' : ` · RIR ${exercise.rirFinal}`}`;
}

function renderHome() {
  const suggested = getWorkout(nextWorkoutId());
  app.innerHTML = `
    <section class="screen-heading"><p class="eyebrow">Registro de treino</p><h1>Seu próximo treino</h1><p class="muted">Registre repetições, carga e RIR final por exercício.</p></section>
    ${state.active ? `<section class="card notice"><strong>Treino em andamento: ${html(state.active.workoutName)}</strong><p class="small">Iniciado em ${dateTime(state.active.startedAt)}.</p><button class="button" data-resume>Retomar treino</button></section>` : ''}
    <section class="card card-accent"><p class="eyebrow">Sugerido pela sequência PPL</p><h2>${html(suggested.name)}</h2><p class="muted">${html(suggested.focus)} · 7 exercícios</p><button class="button" data-start="${suggested.id}">Iniciar ${html(suggested.name)}</button></section>
    <section class="card"><h2>Escolher outro treino</h2><select class="session-picker" id="workout-picker" aria-label="Escolher treino">${WORKOUTS.map((workout) => `<option value="${workout.id}">${html(workout.name)} — ${html(workout.focus)}</option>`).join('')}</select><button class="button secondary" data-start-selected>Iniciar treino selecionado</button></section>
    <section class="card"><h2>Instalar no iPhone</h2><ol class="install-steps"><li>Abra no Safari.</li><li>Toque em Compartilhar.</li><li>Escolha “Adicionar à Tela de Início”.</li></ol><p class="small">Funciona offline após a primeira abertura.</p></section>`;
}

function renderExerciseCard(exercise, index) {
  const previous = lastExercise(exercise.id);
  return `<section class="card exercise-card ${exercise.completed ? 'is-complete' : ''}">
    <div class="card-header"><h2>${index + 1}. ${html(exercise.name)}</h2><span class="pill accent">${exercise.sets} séries</span></div>
    <div class="exercise-meta"><span class="pill">${html(exercise.reps)}</span><span class="pill">RIR alvo ${html(exercise.rir)}</span><span class="pill">Descanso ${html(exercise.rest)}</span></div>
    <p class="substitute">Alternativa: ${html(exercise.substitute)}</p>
    <p class="previous"><strong>Último:</strong> ${previous ? html(summary(previous)) : 'Sem registro anterior.'}</p>
    <div class="exercise-form">
      <div class="field"><label>Repetições</label><input type="number" min="1" step="1" inputmode="numeric" value="${html(exercise.repsFinal)}" placeholder="Ex.: 10" data-field="repsFinal" data-index="${index}" aria-label="Repetições finais"></div>
      <div class="field"><label>Carga (kg)</label><input ${exercise.bodyweight ? 'disabled' : ''} type="number" min="0" step="0.5" inputmode="decimal" value="${html(exercise.weightKg)}" placeholder="${exercise.bodyweight ? 'Peso corporal' : 'Ex.: 40'}" data-field="weightKg" data-index="${index}" aria-label="Carga em quilogramas"></div>
      <div class="field"><label>RIR final</label><input ${exercise.rir === '—' ? 'disabled' : ''} type="number" min="0" max="5" step="1" inputmode="numeric" value="${html(exercise.rirFinal)}" placeholder="${exercise.rir === '—' ? '—' : 'Ex.: 2'}" data-field="rirFinal" data-index="${index}" aria-label="RIR final"></div>
    </div>
    <div class="button-row">
      ${previous && !exercise.bodyweight ? `<button class="button secondary small-button" data-copy data-index="${index}">Usar última carga</button>` : ''}
      <button class="button ${exercise.completed ? 'secondary' : ''} small-button" data-toggle data-index="${index}">${exercise.completed ? 'Desmarcar' : 'Concluir exercício'}</button>
    </div>
  </section>`;
}

function renderWorkout() {
  if (!state.active) { state.view = 'home'; render(); return; }
  const workout = state.active;
  const pending = workout.exercises.map((exercise, index) => ({ exercise, index })).filter(({ exercise }) => !exercise.completed);
  const completed = workout.exercises.map((exercise, index) => ({ exercise, index })).filter(({ exercise }) => exercise.completed);
  app.innerHTML = `
    <section class="screen-heading"><p class="eyebrow">Em andamento · ${dateTime(workout.startedAt)}</p><h1>${html(workout.workoutName)}</h1><p class="muted">Registre as repetições, a carga e o RIR final de cada exercício.</p></section>
    ${pending.map(({ exercise, index }) => renderExerciseCard(exercise, index)).join('')}
    ${completed.length ? `<details class="completed-exercises"><summary>Exercícios concluídos (${completed.length})</summary><div class="completed-exercises-content">${completed.map(({ exercise, index }) => renderExerciseCard(exercise, index)).join('')}</div></details>` : ''}
    <section class="workout-actions" aria-label="Ações do treino"><div class="workout-actions-wrap"><div id="workout-action-menu" class="workout-action-menu" hidden><button class="workout-action-menu-button is-save" data-finish><span aria-hidden="true">✓</span> Concluir e salvar</button><button class="workout-action-menu-button" data-home><span aria-hidden="true">←</span> Voltar sem concluir</button></div><button class="workout-actions-toggle" data-workout-actions-toggle aria-expanded="false" aria-controls="workout-action-menu" aria-label="Abrir ações do treino" title="Abrir ações do treino">+</button></div></section>`;
}

function renderHistory() {
  const detail = state.history.find((workout) => workout.id === state.detailId);
  app.innerHTML = `
    <section class="screen-heading"><p class="eyebrow">Histórico local</p><h1>Treinos concluídos</h1><p class="muted">${state.history.length} registro(s) salvo(s) neste iPhone.</p></section>
    ${state.history.length ? `<ul class="history-list">${state.history.map((workout) => `<li><button class="history-button" data-history="${workout.id}"><strong>${html(workout.workoutName)}</strong><br><span class="small">${dateTime(workout.completedAt)}</span></button></li>`).join('')}</ul>` : '<section class="card"><p>Nenhum treino concluído ainda.</p></section>'}
    ${detail ? `<section class="card history-details"><div class="row-between"><h2>${html(detail.workoutName)}</h2><button class="button secondary small-button" data-close-history>Fechar</button></div><p class="small">${dateTime(detail.completedAt)}</p>${detail.exercises.map((exercise) => `<div class="history-exercise"><strong>${html(exercise.name)}</strong><br><span class="small">${html(summary(exercise))}</span></div>`).join('')}</section>` : ''}`;
}

function renderData() {
  const google = googleState();
  const status = !isGoogleConfigured()
    ? 'Configuração Google pendente'
    : google.pending
      ? 'Backup pendente'
      : google.lastBackupAt
        ? `Último backup: ${dateTime(google.lastBackupAt)}`
        : 'Google ainda não conectado';
  const versions = state.remoteBackups.length
    ? `<ul class="history-list">${state.remoteBackups.map((file) => `<li><div class="card"><div class="row-between"><div><strong>${dateTime(file.modifiedTime)}</strong><br><span class="small">${file.size ? `${Math.max(1, Math.round(Number(file.size) / 1024))} KB` : 'Tamanho indisponível'}</span></div><button class="button secondary small-button" data-restore-google="${html(file.id)}">Restaurar</button></div></div></li>`).join('')}</ul>`
    : '<p class="small">Toque em “Listar versões” para consultar os backups privados da app.</p>';
  app.innerHTML = `
    <section class="screen-heading"><p class="eyebrow">Dados no aparelho</p><h1>Backup e restauração</h1><p class="muted">O histórico permanece neste iPhone e pode ser protegido na pasta privada da app no Google Drive.</p></section>
    <section class="card"><h2>Backup Google</h2><p class="previous"><strong>${html(status)}</strong>${google.lastError ? `<br>${html(google.lastError)}` : ''}</p>${isGoogleConfigured() ? `<div class="button-row"><button class="button" data-google-connect>${google.enabled ? 'Autorizar Google novamente' : 'Conectar ao Google'}</button><button class="button secondary" data-google-backup>Fazer backup agora</button><button class="button secondary" data-google-list>Listar versões</button></div>` : '<p class="notice">Defina o Client ID OAuth em <code>app/google-config.mjs</code> antes de conectar sua conta.</p>'}</section>
    ${isGoogleConfigured() ? `<section class="card"><h2>Versões no Google Drive</h2>${versions}<p class="small">São mantidas as 7 versões mais recentes. Restaurar substitui todos os dados locais; não há mesclagem automática.</p></section>` : ''}
    <section class="card"><h2>Exportar arquivo local</h2><p class="small">Guarde um JSON em Arquivos ou iCloud Drive como cópia adicional.</p><button class="button secondary" data-export>Exportar JSON</button></section>
    <section class="card"><h2>Importar arquivo local</h2><p class="notice">A importação substitui todos os registros locais existentes.</p><input id="import-file" type="file" accept="application/json,.json" hidden><button class="button secondary" data-import>Selecionar arquivo JSON</button></section>
    <section class="card"><h2>Proteção dos registros</h2><p class="small">O Google recebe somente o arquivo de backup. Token OAuth e senha não são salvos pela app. Remover o acesso da app ou excluir seus dados dela no Google Drive torna essas cópias indisponíveis.</p></section>`;
}

function render() {
  if (state.view === 'workout') renderWorkout(); else if (state.view === 'history') renderHistory(); else if (state.view === 'data') renderData(); else renderHome();
  document.querySelectorAll('[data-view]').forEach((button) => button.classList.toggle('is-active', button.dataset.view === state.view || (state.view === 'workout' && button.dataset.view === 'home')));
}

async function start(workoutId) {
  if (state.active && !confirm('Há um treino em andamento. Deseja substituí-lo?')) return;
  state.active = newWorkout(workoutId); await saveDraft(true); state.view = 'workout'; render();
}

function isValid(exercise) {
  const hasReps = Number.isInteger(numeric(exercise.repsFinal)) && numeric(exercise.repsFinal) > 0;
  const hasWeight = exercise.bodyweight || (exercise.weightKg !== '' && Number.isFinite(numeric(exercise.weightKg)) && numeric(exercise.weightKg) >= 0);
  const hasRir = exercise.rir === '—' || (Number.isInteger(numeric(exercise.rirFinal)) && numeric(exercise.rirFinal) >= 0 && numeric(exercise.rirFinal) <= 5);
  return hasReps && hasWeight && hasRir;
}

async function toggle(index) {
  const exercise = state.active.exercises[index];
  if (!exercise.completed && !isValid(exercise)) { message(exercise.bodyweight ? 'Preencha repetições antes de concluir.' : 'Preencha repetições, carga e RIR final antes de concluir.'); return; }
  exercise.completed = !exercise.completed; exercise.completedAt = exercise.completed ? new Date().toISOString() : null;
  await saveDraft(true); renderWorkout();
}

async function copyLast(index) {
  const exercise = state.active.exercises[index]; const previous = lastExercise(exercise.id);
  if (!previous) return;
  exercise.weightKg = previous.weightKg; await saveDraft(true); renderWorkout(); message('Última carga copiada. Registre o RIR ao terminar.');
}

async function finish() {
  if (state.active.exercises.some((exercise) => !exercise.completed || !isValid(exercise))) { message('Conclua os sete exercícios e preencha repetições, carga e RIR antes de finalizar.'); return; }
  if (!confirm('Concluir este treino e adicioná-lo ao histórico?')) return;
  const complete = normalizeWorkout({ ...state.active, completedAt: new Date().toISOString() });
  await putItem('workouts', complete);
  state.settings = { ...state.settings, key: 'app', lastCompletedWorkoutId: complete.workoutId, lastCompletedAt: complete.completedAt };
  await saveSettings(); await deleteItem('drafts', 'active');
  state.history.unshift(complete); state.active = null; state.view = 'home'; render();
  await tryAutomaticGoogleBackup();
  if (!googleState().enabled) message('Treino salvo no histórico.');
}

async function backup() {
  const blob = new Blob([JSON.stringify(await exportBackup(), null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob); const link = Object.assign(document.createElement('a'), { href: url, download: `shape-backup-${new Date().toISOString().slice(0, 10)}.json` });
  document.body.append(link); link.click(); link.remove(); URL.revokeObjectURL(url); message('Backup preparado. Salve-o em Arquivos ou iCloud Drive.');
}

async function restore(file) {
  if (!file || !confirm('A importação substituirá todos os dados locais. Continuar?')) return;
  try {
    await importBackup(JSON.parse(await file.text()));
    await refreshLocalState(); state.view = 'home'; render(); message('Backup restaurado neste iPhone.');
  } catch (error) { message(error.message || 'Não foi possível importar este arquivo.'); }
}

async function connectGoogle() {
  try {
    await requestGoogleAccess({ forcePrompt: true });
    await setGoogleState({ enabled: true, pending: false, lastError: '' });
    await saveGoogleBackup();
    state.remoteBackups = await listGoogleBackups();
    renderData();
    message('Google conectado e primeiro backup criado.');
  } catch (error) {
    await setGoogleState({ pending: true, lastError: error.message || 'Não foi possível conectar ao Google.' });
    renderData();
    message('A conexão ou o backup Google não foi concluído.');
  }
}

async function backupGoogleNow() {
  try {
    await requestGoogleAccess({ forcePrompt: !hasActiveGoogleToken() });
    await setGoogleState({ enabled: true, pending: false, lastError: '' });
    await saveGoogleBackup();
    state.remoteBackups = await listGoogleBackups();
    renderData();
    message('Backup Google concluído.');
  } catch (error) {
    await setGoogleState({ pending: true, lastError: error.message || 'Falha no backup Google.' });
    renderData();
    message('O backup Google ficou pendente. Seus dados locais continuam salvos.');
  }
}

async function listGoogleVersions() {
  try {
    await requestGoogleAccess({ forcePrompt: !hasActiveGoogleToken() });
    await setGoogleState({ enabled: true, lastError: '' });
    state.remoteBackups = await listGoogleBackups();
    renderData();
  } catch (error) {
    await setGoogleState({ pending: true, lastError: error.message || 'Não foi possível listar os backups.' });
    renderData();
    message('Não foi possível consultar os backups Google.');
  }
}

async function restoreGoogleVersion(fileId) {
  if (!confirm('Restaurar esta versão substituirá todo o histórico local. Exporte um JSON local se desejar uma cópia antes de continuar.')) return;
  try {
    await requestGoogleAccess({ forcePrompt: !hasActiveGoogleToken() });
    const backupData = await downloadGoogleBackup(fileId);
    if (!confirm('Confirma a substituição dos dados deste iPhone pela versão escolhida?')) return;
    await importBackup(backupData);
    await refreshLocalState();
    state.view = 'home'; render();
    message('Backup Google restaurado neste iPhone.');
  } catch (error) {
    message(error.message || 'Não foi possível restaurar esta versão.');
  }
}

app.addEventListener('input', (event) => {
  if (!event.target.matches('[data-field]') || !state.active) return;
  state.active.exercises[Number(event.target.dataset.index)][event.target.dataset.field] = event.target.value; saveDraft();
});
app.addEventListener('change', (event) => { if (event.target.id === 'import-file') restore(event.target.files[0]); });
app.addEventListener('click', async (event) => {
  const button = event.target.closest('button'); if (!button) return;
  if (button.dataset.resume !== undefined) { state.view = 'workout'; render(); }
  else if (button.dataset.start) await start(button.dataset.start);
  else if (button.dataset.startSelected !== undefined) await start(document.querySelector('#workout-picker').value);
  else if (button.dataset.workoutActionsToggle !== undefined) {
    const menu = document.querySelector('#workout-action-menu');
    const isOpen = !menu.hidden;
    menu.hidden = isOpen;
    button.setAttribute('aria-expanded', String(!isOpen));
    button.setAttribute('aria-label', isOpen ? 'Abrir ações do treino' : 'Fechar ações do treino');
    button.setAttribute('title', isOpen ? 'Abrir ações do treino' : 'Fechar ações do treino');
    button.textContent = isOpen ? '+' : '×';
  }
  else if (button.dataset.home !== undefined) { state.view = 'home'; render(); }
  else if (button.dataset.toggle !== undefined) await toggle(Number(button.dataset.index));
  else if (button.dataset.copy !== undefined) await copyLast(Number(button.dataset.index));
  else if (button.dataset.finish !== undefined) await finish();
  else if (button.dataset.history) { state.detailId = button.dataset.history; renderHistory(); }
  else if (button.dataset.closeHistory !== undefined) { state.detailId = null; renderHistory(); }
  else if (button.dataset.export !== undefined) await backup();
  else if (button.dataset.import !== undefined) document.querySelector('#import-file').click();
  else if (button.dataset.googleConnect !== undefined) await connectGoogle();
  else if (button.dataset.googleBackup !== undefined) await backupGoogleNow();
  else if (button.dataset.googleList !== undefined) await listGoogleVersions();
  else if (button.dataset.restoreGoogle !== undefined) await restoreGoogleVersion(button.dataset.restoreGoogle);
});
document.querySelector('.bottom-nav').addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]'); if (!button) return;
  state.view = button.dataset.view; state.detailId = null; render();
});

async function initialize() {
  try {
    await refreshLocalState();
  } catch { message('O navegador não conseguiu abrir o armazenamento local.'); }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./service-worker.js').catch(() => {});
  setConnection(); render();
}
window.addEventListener('online', setConnection); window.addEventListener('offline', setConnection); initialize();
