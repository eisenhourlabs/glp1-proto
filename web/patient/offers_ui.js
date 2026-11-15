// In-cycle level-up offer on the reward screen (Framework §5.3, backlog B6, Amanda packet Q5): find it after a workout,
// show it, and save her answer. "Move up" raises the level and swaps that pattern's exercises for the rest of the cycle;
// "Not yet" changes nothing and the pattern isn't offered again for 2 weeks.
import { h } from '../shared/dom.js';
import { primary, secondary } from '../shared/ui.js';
import { levelUpOffers } from '../engine/offers.js';
import { levelCeilings, patternName } from '../engine/review.js';
import { engineProfile, acceptLevelUp, localToday } from './api.js';
import { exerciseHistory, cycleAdjustments, addAdjustment } from './log_api.js';

/**
 * The first offer this workout earns, or null. env: { patient, cycle, content, settings, week }; states: the workout's
 * exercise states ({ item, sets, skipped, swappedFrom }); slots: the cycle's slot rows (planner.cycleSlots).
 */
export async function findOffer(env, states, slots) {
  const { patient, cycle, content, settings, week } = env;
  const lines = states.filter((s) => !s.skipped && s.sets.length && !s.swappedFrom && !s.item.swappedFor && s.item.exercise)
    .map((s) => ({ slot: s.item.slot, exercise: s.item.exercise, range: s.item.range, measure: s.item.measure }));
  if (!lines.length) return null;
  const profile = engineProfile(patient);
  const [history, adjustments] = await Promise.all([
    exerciseHistory(patient.id, [...new Set(lines.map((l) => l.exercise.id))], { perExercise: 3 }), cycleAdjustments(cycle.id)]);
  const setup = content.setups.find((s) => s.setup === patient.setup) ?? null;
  const ceilings = levelCeilings(profile, setup, content.library.filter((e) => e.active));
  const [offer] = levelUpOffers(lines, history, { week, cycleItems: cycle.items, slots, profile, library: content.library, ceilings,
    ageBand: patient.age_band, adjustments, today: localToday(), settings, dumbbells: (patient.dumbbells_available || []).map(Number) });
  return offer ?? null;
}

/** The reward-screen card. onDone(accepted) runs after her answer is saved. */
export function offerCard(offer, { patient, cycle, onDone }) {
  const msg = h('p', { class: 'form-msg', role: 'status' });
  const card = h('div', { class: 'card soft offer', 'data-offer': offer.pattern });
  const answer = async (accept) => {
    msg.textContent = 'Saving…';
    try {
      if (accept) await acceptLevelUp(patient, cycle, offer);
      else {
        await addAdjustment(patient.id, cycle.id, { type: 'level_offer_declined', reason: 'in_cycle_offer',
          detail: { pattern: offer.pattern, level: offer.from, exercise: offer.exercise.id, next: offer.next.id } });
      }
      card.replaceChildren(h('p', {}, accept
        ? `Done. Next time you’ll do ${offer.next.name}. Start light: the first set finds your weight.`
        : 'No problem. You’ll stay with what you’re doing, and we’ll ask again in a couple of weeks.'));
      onDone?.(accept);
    } catch (e) { console.error(e); msg.textContent = 'Couldn’t save. Check your connection and try again.'; }
  };
  card.append(
    h('h2', {}, 'Ready for the next level?'),
    h('p', {}, `You’ve outgrown ${offer.exercise.name}: you hit the top of the range in 2 of your last 3 workouts. `
      + `Want to move up to ${offer.next.name} for the rest of this cycle?`),
    h('p', { class: 'small muted' }, `${patternName(offer.pattern)}: level ${offer.from} → ${offer.to}.`),
    msg,
    h('div', { class: 'row' }, primary('Move up', () => answer(true)), secondary('Not yet', () => answer(false))));
  return card;
}
