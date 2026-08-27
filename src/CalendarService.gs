/**
 * Kommandozentrale – canonical Google Calendar read service.
 *
 * Google Calendar is the source of truth. This module is the only runtime
 * implementation allowed to enumerate calendars or read Calendar events.
 * Selection/filter state remains presentation-only and never writes Calendar.
 */

function getCalendarViewV4(request, force) {
  if (typeof request === 'boolean') {
    force = request;
    request = null;
  }
  const req = request && typeof request === 'object' ? request : {};
  const view = ['day', 'week', 'month'].indexOf(String(req.view || '').toLowerCase()) >= 0
    ? String(req.view).toLowerCase()
    : 'week';
  const anchor = calendarV4ParseDate_(req.anchorDate) || calendarV4Today_();
  const allCalendars = CalendarApp.getAllCalendars();
  const calendarMeta = allCalendars.map(function (cal) {
    const name = cal.getName() || '(ohne Namen)';
    return {
      id: cal.getId(),
      name: name,
      color: cal.getColor() || '#1B4632',
      defaultVisible: !/möglichkeit/i.test(name)
    };
  });

  const requestedIds = Array.isArray(req.calendarIds) ? req.calendarIds.map(String) : null;
  const availableIds = {};
  calendarMeta.forEach(function (item) { availableIds[item.id] = true; });
  const selectedIds = requestedIds === null
    ? calendarMeta.filter(function (item) { return item.defaultVisible; }).map(function (item) { return item.id; })
    : requestedIds.filter(function (id) { return !!availableIds[id]; });

  const range = calendarV4Range_(view, anchor);
  const cacheShape = {
    view: view,
    anchorDate: Utilities.formatDate(anchor, TZ, 'yyyy-MM-dd'),
    calendarIds: selectedIds.slice().sort()
  };
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, JSON.stringify(cacheShape));
  const cacheKey = 'KZ_V4_CAL_' + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '').slice(0, 24);

  return cachedJson_(cacheKey, 60, !!force, function () {
    const selectedLookup = {};
    selectedIds.forEach(function (id) { selectedLookup[id] = true; });
    const events = [];

    allCalendars.forEach(function (cal) {
      const id = cal.getId();
      if (!selectedLookup[id]) return;
      try {
        cal.getEvents(range.start, range.end).forEach(function (ev) {
          events.push({
            id: ev.getId(),
            title: ev.getTitle() || '(ohne Titel)',
            start: ev.getStartTime().toISOString(),
            end: ev.getEndTime().toISOString(),
            allDay: ev.isAllDayEvent(),
            calendarId: id,
            calendar: cal.getName() || '(ohne Namen)',
            color: cal.getColor() || '#1B4632',
            location: ev.getLocation() || ''
          });
        });
      } catch (e) {
        // An inaccessible calendar must not break the complete cockpit view.
      }
    });

    events.sort(function (a, b) { return new Date(a.start) - new Date(b.start); });
    return {
      generatedAt: new Date().toISOString(),
      view: view,
      anchorDate: Utilities.formatDate(anchor, TZ, 'yyyy-MM-dd'),
      rangeStart: range.start.toISOString(),
      rangeEnd: range.end.toISOString(),
      dayCount: range.dayCount,
      periodLabel: calendarV4PeriodLabel_(view, anchor, range.start, range.end),
      calendars: calendarMeta,
      selectedCalendarIds: selectedIds,
      events: events
    };
  });
}

function calendarV4Range_(view, anchor) {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);

  if (view === 'day') {
    const endDay = new Date(start);
    endDay.setDate(endDay.getDate() + 1);
    return { start: start, end: endDay, dayCount: 1 };
  }

  if (view === 'month') {
    start.setDate(1);
    const weekday = start.getDay() || 7;
    start.setDate(start.getDate() - weekday + 1);
    const endMonth = new Date(start);
    endMonth.setDate(endMonth.getDate() + 42);
    return { start: start, end: endMonth, dayCount: 42 };
  }

  const weekday = start.getDay() || 7;
  start.setDate(start.getDate() - weekday + 1);
  const endWeek = new Date(start);
  endWeek.setDate(endWeek.getDate() + 7);
  return { start: start, end: endWeek, dayCount: 7 };
}

function calendarV4PeriodLabel_(view, anchor, start, end) {
  if (view === 'day') return Utilities.formatDate(anchor, TZ, 'dd.MM.yyyy');
  if (view === 'month') return Utilities.formatDate(anchor, TZ, 'MMMM yyyy').toUpperCase();
  const inclusiveEnd = new Date(end);
  inclusiveEnd.setDate(inclusiveEnd.getDate() - 1);
  return Utilities.formatDate(start, TZ, 'dd.MM.') + '–' + Utilities.formatDate(inclusiveEnd, TZ, 'dd.MM.');
}

function calendarV4ParseDate_(value) {
  const m = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

function calendarV4Today_() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
}
