// The small "saved on this phone" line in the header (C4): shown only while offline or while writes wait to be sent.
import { h } from '../shared/dom.js';
import { onSyncChange } from './outbox.js';

export function syncBadge() {
  const el = h('p', { class: 'sync-note', role: 'status', hidden: true });
  onSyncChange(({ pending, offline }) => {
    el.hidden = !pending && !offline;
    el.textContent = pending
      ? 'Saved on this phone. It will sync when you’re back online.'
      : 'You’re offline. Your workouts still save on this phone.';
  });
  return el;
}
