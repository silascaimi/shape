import { getWorkout } from './training-plan.mjs';

const DB_NAME = 'shape-workout';
const DB_VERSION = 1;
let databasePromise;

function openDatabase() {
  if (databasePromise) return databasePromise;
  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('drafts')) db.createObjectStore('drafts', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('workouts')) {
        const store = db.createObjectStore('workouts', { keyPath: 'id' });
        store.createIndex('completedAt', 'completedAt');
        store.createIndex('workoutId', 'workoutId');
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
  return databasePromise;
}

async function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function getItem(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readonly');
  return requestResult(transaction.objectStore(storeName).get(key));
}

export async function putItem(storeName, value) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  await requestResult(transaction.objectStore(storeName).put(value));
}

export async function deleteItem(storeName, key) {
  const db = await openDatabase();
  const transaction = db.transaction(storeName, 'readwrite');
  await requestResult(transaction.objectStore(storeName).delete(key));
}

export async function getAllWorkouts() {
  const db = await openDatabase();
  const transaction = db.transaction('workouts', 'readonly');
  const result = await requestResult(transaction.objectStore('workouts').getAll());
  return result.map(normalizeWorkout).sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
}

export async function exportBackup() {
  const [settings, rawDraft, workouts] = await Promise.all([
    getItem('settings', 'app'),
    getItem('drafts', 'active'),
    getAllWorkouts(),
  ]);
  return {
    version: 2,
    exportedAt: new Date().toISOString(),
    settings: settings ?? null,
    draft: normalizeDraft(rawDraft),
    workouts,
  };
}

function lastRecordedValue(sets, key) {
  if (!Array.isArray(sets)) return '';
  const match = [...sets].reverse().find((set) => set.completed && set[key] !== '' && set[key] !== undefined && set[key] !== null);
  return match ? match[key] : '';
}

function normalizeExercise(exercise, templateExercise) {
  const legacySets = Array.isArray(exercise.sets) ? exercise.sets : [];
  const base = templateExercise ?? exercise;
  const completed = exercise.completed ?? legacySets.some((set) => set.completed);
  return {
    ...base,
    repsFinal: exercise.repsFinal ?? '',
    weightKg: exercise.weightKg ?? lastRecordedValue(legacySets, 'weight'),
    rirFinal: exercise.rirFinal ?? lastRecordedValue(legacySets, 'rir'),
    completed,
    completedAt: exercise.completedAt ?? lastRecordedValue(legacySets, 'completedAt') ?? null,
  };
}

export function normalizeWorkout(workout) {
  if (!workout || typeof workout !== 'object') return workout;
  const template = getWorkout(workout.workoutId);
  const byId = new Map((template?.exercises ?? []).map((exercise) => [exercise.id, exercise]));
  return {
    ...workout,
    recordVersion: 2,
    exercises: Array.isArray(workout.exercises)
      ? workout.exercises.map((exercise) => normalizeExercise(exercise, byId.get(exercise.id)))
      : [],
  };
}

export function normalizeDraft(draft) {
  if (!draft?.data) return draft ?? null;
  return { ...draft, data: normalizeWorkout(draft.data) };
}

function validBackup(value) {
  return value && (value.version === 1 || value.version === 2) && Array.isArray(value.workouts) &&
    value.workouts.every((workout) => typeof workout.id === 'string' && typeof workout.workoutId === 'string' && Array.isArray(workout.exercises));
}

export async function importBackup(backup) {
  if (!validBackup(backup)) throw new Error('Arquivo de backup inválido ou incompatível.');
  const db = await openDatabase();
  const transaction = db.transaction(['settings', 'drafts', 'workouts'], 'readwrite');
  for (const name of ['settings', 'drafts', 'workouts']) transaction.objectStore(name).clear();
  if (backup.settings) transaction.objectStore('settings').put(backup.settings);
  if (backup.draft) transaction.objectStore('drafts').put(normalizeDraft(backup.draft));
  backup.workouts.forEach((workout) => transaction.objectStore('workouts').put(normalizeWorkout(workout)));
  await new Promise((resolve, reject) => {
    transaction.oncomplete = resolve;
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}
