const LEGACY_KEY = 'guancha.save.v1';
export const SLOT_COUNT = 3;
const key = slot => {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOT_COUNT) throw new RangeError('Invalid save slot');
  return `guancha.save.v1.slot${slot}`;
};

// Copy the original single save into slot 1 exactly once. Keep it if storage is unavailable.
export function migrateSave() {
  try {
    const old = localStorage.getItem(LEGACY_KEY);
    if (!old) return;
    const slots = Array.from({ length: SLOT_COUNT }, (_, i) => localStorage.getItem(key(i + 1)));
    if (!slots.includes(old)) {
      const empty = slots.findIndex(s => !s);
      if (empty < 0) return; // never discard a distinct old save when all slots are full
      localStorage.setItem(key(empty + 1), old);
    }
    localStorage.removeItem(LEGACY_KEY);
  } catch (e) { /* storage unavailable */ }
}

export function readSave(slot) {
  const info = slotInfo(slot);
  return info.status === 'ok' ? info.save : null;
}

// What a slot holds: 'empty', 'ok', or 'bad' when it can't be loaded by this version (unreadable,
// or from the very first release, which stored progress by list order and no longer lines up).
export function slotInfo(slot) {
  let raw;
  try { raw = localStorage.getItem(key(slot)); } catch (e) { return { status: 'empty' }; }
  if (!raw) return { status: 'empty' };
  let save;
  try { save = JSON.parse(raw); } catch (e) { return { status: 'bad' }; }
  const list = v => v === undefined || Array.isArray(v);
  const obj = v => v === undefined || (v && typeof v === 'object' && !Array.isArray(v));
  const ok = save && typeof save === 'object' && save.v === 2
    && ['coins', 'conchas', 'masks', 'flags', 'crates', 'spots'].every(k => list(save[k]))
    && ['q', 'rv', 'shop'].every(k => obj(save[k]))
    && (save.wallet === undefined || Number.isFinite(save.wallet));
  return ok ? { status: 'ok', save } : { status: 'bad', save };
}

// A slot that failed while loading is marked so the save screen can explain it.
export function markBad(slot) {
  try { localStorage.setItem(key(slot) + '.bad', '1'); } catch (e) { /* ignore */ }
}
export function isMarkedBad(slot) {
  try { return localStorage.getItem(key(slot) + '.bad') === '1'; } catch (e) { return false; }
}

export function writeSave(slot, save) {
  try { localStorage.setItem(key(slot), JSON.stringify(save)); return true; }
  catch (e) { return false; }
}

export function copySave(from, to) {
  const save = readSave(from);
  if (save) { try { localStorage.removeItem(key(to) + '.bad'); } catch (e) { /* ignore */ } }
  return !!save && from !== to && writeSave(to, save);
}

export function moveSave(from, to) {
  return copySave(from, to) && deleteSave(from);
}

export function deleteSave(slot) {
  try { localStorage.removeItem(key(slot)); localStorage.removeItem(key(slot) + '.bad'); return true; }
  catch (e) { return false; }
}
