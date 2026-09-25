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
  try { return JSON.parse(localStorage.getItem(key(slot)) || 'null'); }
  catch (e) { return null; }
}

export function writeSave(slot, save) {
  try { localStorage.setItem(key(slot), JSON.stringify(save)); return true; }
  catch (e) { return false; }
}

export function copySave(from, to) {
  const save = readSave(from);
  return !!save && from !== to && writeSave(to, save);
}

export function moveSave(from, to) {
  return copySave(from, to) && deleteSave(from);
}

export function deleteSave(slot) {
  try { localStorage.removeItem(key(slot)); return true; }
  catch (e) { return false; }
}
