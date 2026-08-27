/**
 * Kommandozentrale – dated wellbeing compatibility extension.
 *
 * Calendar server logic moved to CalendarService.gs in KZ 1.0 Phase 7 Wave 2.
 * This file intentionally contains only the dated wellbeing endpoint.
 */

/**
 * Uses the existing audited V1 upsert, but allows an explicit historical
 * entry date and rejects dates in the future.
 */
function saveWellbeingEntryV2(payload) {
  const p = Object.assign({}, payload || {});
  const today = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd');
  const entryDate = String(p.entryDate || today).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entryDate)) throw new Error('entryDate muss YYYY-MM-DD sein.');
  if (entryDate > today) throw new Error('Wohlbefindenseinträge können nicht für zukünftige Tage gespeichert werden.');
  p.entryDate = entryDate;
  return saveWellbeingEntryV1(p);
}
