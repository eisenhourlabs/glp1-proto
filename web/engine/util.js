// Shared constants and small pure helpers for the engine. No DOM, no network, no clock.

export const PATTERNS = ['SQ', 'HI', 'SL', 'HP', 'VP', 'HR', 'VR', 'CA', 'CO', 'BA', 'HA', 'AR'];
export const LOWER_PATTERNS = new Set(['SQ', 'HI', 'SL']);
export const AREAS = ['knees', 'hips', 'low_back', 'upper_back_neck', 'shoulders', 'elbows_wrists'];
export const AGE_BANDS = ['40-49', '50-59', '60-69', '70+'];

/** "8-12" → {lo: 8, hi: 12}; "3" → {lo: 3, hi: 3}. */
export function parseRange(value) {
  const s = String(value ?? '').trim();
  const m = /^(\d+)-(\d+)$/.exec(s);
  if (m) return { lo: Number(m[1]), hi: Number(m[2]) };
  if (/^\d+$/.test(s)) return { lo: Number(s), hi: Number(s) };
  throw new Error(`Not a range: ${JSON.stringify(value)}`);
}

export const formatRange = ({ lo, hi }) => (lo === hi ? String(lo) : `${lo}-${hi}`);

export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** Age band of 60+ (60-69 or 70+). */
export const isSixtyPlus = (band) => band === '60-69' || band === '70+';

// ── Dates: always ISO 'YYYY-MM-DD' strings, computed in UTC so time zones can't shift a day. ──
const toUtc = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Error(`Not an ISO date: ${iso}`);
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const fromUtc = (ms) => new Date(ms).toISOString().slice(0, 10);

export const addDays = (iso, n) => fromUtc(toUtc(iso) + n * 86400000);
export const daysBetween = (fromIso, toIso) => Math.round((toUtc(toIso) - toUtc(fromIso)) / 86400000);
/** ISO weekday: 1 = Monday … 7 = Sunday. */
export const isoWeekday = (iso) => ((new Date(toUtc(iso)).getUTCDay() + 6) % 7) + 1;
/** Monday of the week containing iso. */
export const mondayOf = (iso) => addDays(iso, 1 - isoWeekday(iso));
