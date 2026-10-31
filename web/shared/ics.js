// A calendar file (.ics) for workout reminders: one weekly repeating event on her workout days, with an alert.
// Floating local time (no time zone), so it lands at the same clock time wherever her phone is. Pure: no DOM.

const BYDAY = ['', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
const pad = (n) => String(n).padStart(2, '0');
const esc = (s) => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');

/** ISO weekday (1 = Monday … 7 = Sunday) of an ISO date. */
const weekday = (iso) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const addDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

/** Default workout days when she didn't pick any: spread across the week. */
export function defaultDays(perWeek) {
  return { 2: [2, 5], 3: [1, 3, 5], 4: [1, 2, 4, 5] }[perWeek] ?? [1, 3, 5];
}

/**
 * @param {object} o
 * @param {number[]} o.days     ISO weekdays
 * @param {string} o.time       'HH:MM' (24 h)
 * @param {string} o.startDate  ISO date; the first event is the first workout day on or after it
 * @param {number} o.minutes    event length
 * @param {string} o.title, o.url, o.uid, o.stamp (UTC 'YYYYMMDDTHHMMSSZ')
 */
export function buildIcs({ days, time, startDate, minutes = 30, title, url, uid, stamp }) {
  const sorted = [...new Set(days)].filter((d) => d >= 1 && d <= 7).sort();
  if (!sorted.length) throw new Error('No days');
  let first = startDate;
  while (!sorted.includes(weekday(first))) first = addDays(first, 1);
  const [hh, mm] = time.split(':').map(Number);
  const startMin = hh * 60 + mm;
  const endMin = Math.min(startMin + minutes, 23 * 60 + 59);
  const dt = (iso, min) => `${iso.replace(/-/g, '')}T${pad(Math.floor(min / 60))}${pad(min % 60)}00`;
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Strength Practice//Reminders//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${dt(first, startMin)}`,
    `DTEND:${dt(first, endMin)}`,
    `RRULE:FREQ=WEEKLY;BYDAY=${sorted.map((d) => BYDAY[d]).join(',')}`,
    `SUMMARY:${esc(title)}`,
    `DESCRIPTION:${esc(`Open your program: ${url}`)}`,
    `URL:${url}`,
    'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:PT0M', 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ];
  return `${lines.join('\r\n')}\r\n`;
}
