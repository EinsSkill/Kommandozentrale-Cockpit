from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return (ROOT / path).read_text(encoding='utf-8')


def write(path, text):
    (ROOT / path).write_text(text, encoding='utf-8')


def replace_once(text, old, new, label):
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one match, got {count}')
    return text.replace(old, new, 1)


def sub_once(text, pattern, replacement, label, flags=0):
    new, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly one regex match, got {count}')
    return new


# ---------- Live adapter ----------
p = 'src/LiveAdapter.html'
s = read(p)

s = replace_once(s,
    "    raw: {},\n    loads:",
    "    raw: {},\n    calendarUi: { view: 'week', anchorDate: '', calendarIds: null, menuOpen: false },\n    wellbeingEntryDate: '',\n    loads:",
    'adapter state')

s = replace_once(s,
    "      tasks: [], projects: [], inbox: [], alerts: [], week: emptyWeek(), weekMeta: 'KALENDER LÄDT',",
    "      tasks: [], projects: [], inbox: [], alerts: [], week: emptyWeek(), weekMeta: 'KALENDER LÄDT',\n      calendars: [], selectedCalendarIds: [], calendarView: 'week', calendarAnchor: '',",
    'empty calendar data')

s = replace_once(s,
    "    connect(component) {\n      this.component = component;\n      this.load(false);\n    },",
    "    connect(component) {\n      this.component = component;\n      this.restoreCalendarPrefs();\n      if (!this.wellbeingEntryDate) this.wellbeingEntryDate = this.todayKey();\n      this.load(false).then(() => {\n        const ui = this.calendarUi;\n        if (ui.view !== 'week' || ui.anchorDate || Array.isArray(ui.calendarIds)) {\n          this.loadCalendarView(component, false);\n        }\n      });\n    },",
    'adapter connect')

s = replace_once(s,
    "        ['calendar', 'getCalendarWeekV3', value => this.applyCalendar(value)],",
    "        ['calendar', 'getCalendarViewV4', value => this.applyCalendar(value)],",
    'calendar endpoint')

calendar_method = r'''    applyCalendar\(value\) \{[\s\S]*?\n    \},\n\n    calendarKind'''
calendar_replacement = '''    applyCalendar(value) {
      this.raw.calendar = value || {};
      const start = date(value && (value.rangeStart || value.weekStart)) || mondayOfCurrentWeek();
      const events = asArray(value && value.events);
      const dayCount = Math.max(1, Math.min(42, number(value && value.dayCount) || 7));
      const days = Array.from({ length: dayCount }, (_, index) => {
        const current = new Date(start);
        current.setDate(start.getDate() + index);
        const dayEvents = events.filter(event => {
          const eventDate = date(event.start);
          return eventDate && eventDate.toDateString() === current.toDateString();
        });
        return {
          wd: DAY[current.getDay()], n: String(current.getDate()).padStart(2, '0'),
          today: current.toDateString() === new Date().toDateString(),
          ev: dayEvents.map((event, eventIndex) => ({
            id: text(event.id), t: event.allDay ? 'GANZTAG' : safeTime(event.start),
            l: text(event.title) || '(ohne Titel)',
            k: this.calendarKind(dayEvents, event, eventIndex), start: text(event.start), end: text(event.end),
            calendarId: text(event.calendarId), calendar: text(event.calendar), location: text(event.location), allDay: !!event.allDay
          }))
        };
      });
      const data = this.component.D;
      data.week = days;
      data.calendars = asArray(value && value.calendars).map(cal => ({
        id: text(cal.id), name: text(cal.name) || '(ohne Namen)', color: text(cal.color) || '#1B4632',
        defaultVisible: cal.defaultVisible !== false
      }));
      data.selectedCalendarIds = asArray(value && value.selectedCalendarIds).map(text);
      data.calendarView = text(value && value.view) || 'week';
      data.calendarAnchor = text(value && value.anchorDate) || this.todayKey();
      data.weekMeta = [text(value && value.periodLabel), events.length + ' TERMINE'].filter(Boolean).join(' · ');
      this.calendarUi.view = data.calendarView;
      this.calendarUi.anchorDate = data.calendarAnchor;
      if (Array.isArray(value && value.selectedCalendarIds)) this.calendarUi.calendarIds = data.selectedCalendarIds.slice();
      this.persistCalendarPrefs();
    },

    calendarKind'''
s = sub_once(s, calendar_method, calendar_replacement, 'generic calendar mapper')

adapter_methods = '''    todayKey() {
      return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
    },

    restoreCalendarPrefs() {
      try {
        const raw = window.localStorage && window.localStorage.getItem('kz.calendar.v1');
        const value = raw ? JSON.parse(raw) : null;
        if (!value || typeof value !== 'object') return;
        if (['day', 'week', 'month'].includes(value.view)) this.calendarUi.view = value.view;
        if (/^\\d{4}-\\d{2}-\\d{2}$/.test(text(value.anchorDate))) this.calendarUi.anchorDate = text(value.anchorDate);
        if (Array.isArray(value.calendarIds)) this.calendarUi.calendarIds = value.calendarIds.map(text);
      } catch (_) {}
    },

    persistCalendarPrefs() {
      try {
        if (!window.localStorage) return;
        window.localStorage.setItem('kz.calendar.v1', JSON.stringify({
          view: this.calendarUi.view,
          anchorDate: this.calendarUi.anchorDate || this.todayKey(),
          calendarIds: this.calendarUi.calendarIds
        }));
      } catch (_) {}
    },

    shiftCalendarDate(anchorDate, view, direction) {
      const base = /^\\d{4}-\\d{2}-\\d{2}$/.test(text(anchorDate)) ? new Date(anchorDate + 'T12:00:00') : new Date();
      if (view === 'month') base.setMonth(base.getMonth() + direction);
      else base.setDate(base.getDate() + direction * (view === 'week' ? 7 : 1));
      const y = base.getFullYear(), m = String(base.getMonth() + 1).padStart(2, '0'), d = String(base.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    },

    async loadCalendarView(component, force) {
      if (component) this.component = component;
      const request = {
        view: this.calendarUi.view || 'week',
        anchorDate: this.calendarUi.anchorDate || this.todayKey(),
        calendarIds: Array.isArray(this.calendarUi.calendarIds) ? this.calendarUi.calendarIds : null
      };
      const started = performance.now();
      try {
        this.loads.calendar = { state: 'loading', ms: 0, error: '' };
        this.refreshSystem(); this.touch();
        const value = await this.call('getCalendarViewV4', request, !!force);
        this.applyCalendar(value || {});
        this.loads.calendar = { state: 'ok', ms: Math.round(performance.now() - started), error: '' };
        this.refreshSystem(); this.touch();
      } catch (error) {
        this.loads.calendar = { state: 'error', ms: Math.round(performance.now() - started), error: compact(error && error.message ? error.message : error) };
        this.refreshSystem(); this.touch();
      }
    },

    calendarControls(component) {
      const data = component && component.D ? component.D : this.component.D;
      const ui = this.calendarUi;
      const selected = Array.isArray(ui.calendarIds) ? ui.calendarIds : asArray(data.selectedCalendarIds);
      const stop = e => { if (e && e.stopPropagation) e.stopPropagation(); };
      const reload = e => { stop(e); this.loadCalendarView(component, false); };
      const setView = view => e => { stop(e); ui.view = view; ui.anchorDate = ui.anchorDate || data.calendarAnchor || this.todayKey(); this.persistCalendarPrefs(); this.loadCalendarView(component, false); };
      return {
        title: ui.view === 'day' ? 'Kalendertag' : ui.view === 'month' ? 'Kalendermonat' : 'Kalenderwoche',
        view: ui.view,
        gridCols: ui.view === 'day' ? '1fr' : 'repeat(7,1fr)',
        gap: ui.view === 'month' ? '3px' : '6px',
        eventLimit: ui.view === 'day' ? 8 : ui.view === 'month' ? 1 : 2,
        views: ['day', 'week', 'month'].map(view => ({
          label: view === 'day' ? 'Tag' : view === 'week' ? 'Woche' : 'Monat',
          active: ui.view === view,
          bg: ui.view === view ? '#1B4632' : 'rgba(255,255,255,.34)',
          fg: ui.view === view ? '#F4EDDC' : '#4C5A4E',
          border: ui.view === view ? 'rgba(184,145,47,.55)' : 'rgba(20,45,32,.14)',
          pick: setView(view)
        })),
        prev: e => { stop(e); ui.anchorDate = this.shiftCalendarDate(ui.anchorDate || data.calendarAnchor, ui.view, -1); this.loadCalendarView(component, false); },
        next: e => { stop(e); ui.anchorDate = this.shiftCalendarDate(ui.anchorDate || data.calendarAnchor, ui.view, 1); this.loadCalendarView(component, false); },
        today: e => { stop(e); ui.anchorDate = this.todayKey(); this.loadCalendarView(component, false); },
        menuOpen: !!ui.menuOpen,
        toggleMenu: e => { stop(e); ui.menuOpen = !ui.menuOpen; this.touch(); },
        calendars: asArray(data.calendars).map(cal => ({
          id: cal.id, name: cal.name, color: cal.color,
          selected: selected.includes(cal.id),
          bg: selected.includes(cal.id) ? 'rgba(27,70,50,.11)' : 'rgba(255,255,255,.34)',
          border: selected.includes(cal.id) ? 'rgba(184,145,47,.55)' : 'rgba(20,45,32,.12)',
          toggle: e => {
            stop(e);
            const set = new Set(Array.isArray(ui.calendarIds) ? ui.calendarIds : selected);
            if (set.has(cal.id)) set.delete(cal.id); else set.add(cal.id);
            ui.calendarIds = Array.from(set);
            this.persistCalendarPrefs();
            this.loadCalendarView(component, false);
          }
        })),
        reload
      };
    },

    wellbeingDate() {
      return this.wellbeingEntryDate || this.todayKey();
    },

    setWellbeingDate(component, value) {
      const chosen = text(value);
      const today = this.todayKey();
      this.wellbeingEntryDate = /^\\d{4}-\\d{2}-\\d{2}$/.test(chosen) && chosen <= today ? chosen : today;
      if (component) component.setState({ wbSaved: false }); else this.touch();
    },

'''
s = replace_once(s, "    async saveWellbeing(component) {", adapter_methods + "    async saveWellbeing(component) {", 'adapter UI helpers')

s = replace_once(s,
    "      const payload = {\n        mood:",
    "      const payload = {\n        entryDate: this.wellbeingDate(),\n        mood:",
    'wellbeing entry date payload')
s = replace_once(s, "this.call('saveWellbeingEntryV1', payload)", "this.call('saveWellbeingEntryV2', payload)", 'wellbeing V2 endpoint')
write(p, s)


# ---------- Desktop ----------
p = 'src/Index.html'
s = read(p)

calendar_block = r'''      <div data-magnet data-tile="calendar"[\s\S]*?\n      </div>\n\n      <div data-magnet data-tile="inbox"'''
calendar_new = '''      <div data-magnet data-tile="calendar" onClick="{{ open.calendar }}" style="grid-column:9 / span 4;grid-row:3 / span 2;position:relative;overflow:visible;border-radius:5px;padding:18px;background:linear-gradient(180deg,#F5EFE2 0%,#EEE6D5 100%);border:1px solid rgba(20,45,32,.14);box-shadow:0 18px 38px -26px rgba(20,45,32,.5);cursor:pointer;transform:translate(var(--tx,0px),var(--ty,0px));transition:transform 260ms cubic-bezier(.16,1,.3,1);animation:kRise 700ms cubic-bezier(.16,1,.3,1) 340ms both" style-active="transform:translate(var(--tx,0px),var(--ty,0px)) scale(.988)">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:10px">
          <div style="font-family:'Bodoni Moda',serif;font-size:16px;color:#132A1D">{{ cal.title }}</div>
          <div style="font-family:'IBM Plex Mono',monospace;font-size:9.5px;color:#6C7B6E;letter-spacing:.05em">{{ cal.meta }}</div>
        </div>
        <div style="margin-top:9px;display:flex;align-items:center;gap:6px;flex-wrap:wrap" onClick="{{ cal.stop }}">
          <div style="display:flex;border:1px solid rgba(20,45,32,.12);border-radius:4px;overflow:hidden">
            <sc-for list="{{ cal.views }}" as="v" hint-placeholder-count="3">
              <span onClick="{{ v.pick }}" style="font-size:10px;padding:6px 9px;background:{{ v.bg }};color:{{ v.fg }};border-right:1px solid {{ v.border }};cursor:pointer;transition:background 160ms ease-out,color 160ms ease-out">{{ v.label }}</span>
            </sc-for>
          </div>
          <span onClick="{{ cal.prev }}" style="width:28px;height:28px;display:grid;place-items:center;border-radius:4px;border:1px solid rgba(20,45,32,.14);color:#1B4632;background:rgba(255,255,255,.34);cursor:pointer">‹</span>
          <span onClick="{{ cal.today }}" style="height:28px;display:flex;align-items:center;padding:0 9px;border-radius:4px;border:1px solid rgba(184,145,47,.38);color:#1B4632;background:rgba(184,145,47,.08);font-size:10px;cursor:pointer">Heute</span>
          <span onClick="{{ cal.next }}" style="width:28px;height:28px;display:grid;place-items:center;border-radius:4px;border:1px solid rgba(20,45,32,.14);color:#1B4632;background:rgba(255,255,255,.34);cursor:pointer">›</span>
          <span onClick="{{ cal.toggleMenu }}" style="margin-left:auto;height:28px;display:flex;align-items:center;gap:5px;padding:0 9px;border-radius:4px;border:1px solid rgba(184,145,47,.38);color:#1B4632;background:rgba(255,255,255,.34);font-size:10px;cursor:pointer">Kalender ▾</span>
        </div>
        <sc-if value="{{ cal.menuOpen }}" hint-placeholder-val="{{ false }}">
          <div style="position:absolute;right:18px;top:84px;z-index:20;width:230px;padding:9px;border-radius:5px;background:#F7F1E4;border:1px solid rgba(184,145,47,.42);box-shadow:0 18px 36px -18px rgba(10,31,21,.5)" onClick="{{ cal.stop }}">
            <sc-for list="{{ cal.calendars }}" as="c" hint-placeholder-count="4">
              <div onClick="{{ c.toggle }}" style="display:flex;align-items:center;gap:8px;padding:8px;border-radius:4px;background:{{ c.bg }};border:1px solid {{ c.border }};margin:3px 0;cursor:pointer">
                <span style="width:8px;height:8px;border-radius:50%;background:{{ c.color }}"></span><span style="font-size:11px;color:#39473B;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ c.name }}</span><span style="font-size:11px;color:#1B4632">{{ c.mark }}</span>
              </div>
            </sc-for>
          </div>
        </sc-if>
        <div style="margin-top:9px;display:grid;grid-template-columns:{{ cal.gridCols }};gap:{{ cal.gap }};height:calc(100% - 78px);min-height:0">
          <sc-for list="{{ cal.days }}" as="d" hint-placeholder-count="7">
            <div style="display:flex;flex-direction:column;gap:3px;padding:{{ d.pad }};border-radius:3px;background:{{ d.bg }};border:1px solid {{ d.border }};min-width:0;overflow:hidden">
              <div style="text-align:center"><div style="font-family:'IBM Plex Mono',monospace;font-size:8.5px;color:{{ d.labelColor }}">{{ d.wd }}</div><div style="font-family:'Bodoni Moda',serif;font-size:14px;color:{{ d.numColor }};line-height:1.15">{{ d.n }}</div></div>
              <div style="display:flex;flex-direction:column;gap:2px">
                <sc-for list="{{ d.ev }}" as="e" hint-placeholder-count="2">
                  <div style="padding:3px 4px;border-radius:2px;background:{{ e.bg }};border-top:2px solid {{ e.accent }};min-width:0"><div style="font-family:'IBM Plex Mono',monospace;font-size:8px;color:{{ e.timeColor }}">{{ e.t }}</div><div style="font-size:9px;color:{{ e.fg }};overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ e.l }}</div></div>
                </sc-for>
              </div>
            </div>
          </sc-for>
        </div>
      </div>

      <div data-magnet data-tile="inbox"'''
s = sub_once(s, calendar_block, calendar_new, 'desktop calendar block')

old_cal = r'''    const cal=\{meta:D\.weekMeta,days:D\.week\.map\(\(d,i\)=>\(\{\.\.\.d,delay:380\+i\*45,[\s\S]*?\}\)\)\};'''
new_cal = '''    const calCtl=window.KZLive.calendarControls(this);
    const cal={...calCtl,meta:D.weekMeta,stop:(e)=>e&&e.stopPropagation&&e.stopPropagation(),
      calendars:calCtl.calendars.map(c=>({...c,mark:c.selected?'✓':''})),
      days:D.week.map((d,i)=>({...d,delay:380+i*45,pad:calCtl.view==='month'?'3px 2px':'7px 5px',
      bg:d.today?'rgba(27,70,50,.1)':'rgba(255,255,255,.34)',border:d.today?'rgba(184,145,47,.55)':'rgba(20,45,32,.08)',
      labelColor:d.today?'#8C6B18':'#7A8A7C',numColor:d.today?GREEN:'#39473B',
      ev:d.ev.slice(0,calCtl.eventLimit).map(e=>({...e,bg:e.k==='g'?'rgba(184,145,47,.16)':e.k==='r'?'rgba(140,74,32,.13)':'rgba(27,70,50,.1)',
        accent:e.k==='g'?gold:e.k==='r'?RUST:GREENM,fg:'#1B2A1E',timeColor:'#6C7B6E'}))}))};'''
s = sub_once(s, old_cal, new_cal, 'desktop calendar model')

# Add date selector to wellbeing form.
desktop_heading = '''              <div style="display:flex;align-items:baseline;justify-content:space-between">
                <div style="font-family:'Bodoni Moda',serif;font-size:17px;color:#132A1D">Sechs Werte, 1 bis 10</div>
                <div style="font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:#6C7B6E;letter-spacing:.06em">{{ wbD.count }} / 6 GESETZT</div>
              </div>'''
desktop_heading_new = desktop_heading + '''
              <div style="margin-top:13px;display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:4px;background:rgba(255,255,255,.34);border:1px solid rgba(184,145,47,.28)">
                <label style="font-size:11.5px;color:#4C5A4E">Eintrag für</label>
                <input type="date" value="{{ wbD.entryDate }}" max="{{ wbD.maxDate }}" onChange="{{ wbD.dateChange }}" style="height:32px;padding:0 9px;border-radius:4px;border:1px solid rgba(20,45,32,.18);background:#F7F1E4;color:#1B4632;font-family:'IBM Plex Mono',monospace;font-size:11px;outline:none">
                <span style="font-size:10.5px;color:#7A8A7C">Nachtragen möglich · zukünftige Tage gesperrt</span>
              </div>'''
s = replace_once(s, desktop_heading, desktop_heading_new, 'desktop wellbeing date UI')
s = replace_once(s,
    "        count:wbCount,\n        canSave:",
    "        count:wbCount,\n        entryDate:window.KZLive.wellbeingDate(),maxDate:window.KZLive.todayKey(),dateChange:(e)=>window.KZLive.setWellbeingDate(this,e.target.value),\n        canSave:",
    'desktop wellbeing model')
write(p, s)


# ---------- Mobile ----------
p = 'src/MobileIndex.html'
s = read(p)

# Dynamic calendar controls in render.
s = replace_once(s,
    "    const calStrip=D.week.map((d)=>({wd:d.wd,n:d.n,",
    "    const cal=window.KZLive.calendarControls(this);\n    const calStrip=D.week.map((d)=>({wd:d.wd,n:d.n,",
    'mobile calendar controls model')

# Replace mobile calendar title/header with matching controls.
mobile_header = '''          <div style="display:flex;align-items:baseline;justify-content:space-between">
            <div style="font-family:'Bodoni Moda',serif;font-size:19.2px;color:#132A1D">Kalenderwoche</div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:12.2px;color:#6C7B6E">{{ cal.meta }}</div>
          </div>'''
mobile_header_new = '''          <div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px">
            <div style="font-family:'Bodoni Moda',serif;font-size:19.2px;color:#132A1D">{{ cal.title }}</div>
            <div style="font-family:'IBM Plex Mono',monospace;font-size:11px;color:#6C7B6E;text-align:right">{{ calMeta }}</div>
          </div>
          <div style="margin-top:10px;display:flex;gap:7px;flex-wrap:wrap;align-items:center">
            <sc-for list="{{ cal.views }}" as="v" hint-placeholder-count="3">
              <span onClick="{{ v.pick }}" style="min-height:44px;padding:0 13px;display:inline-flex;align-items:center;border-radius:9px;background:{{ v.bg }};color:{{ v.fg }};border:1px solid {{ v.border }};font-size:14px">{{ v.label }}</span>
            </sc-for>
            <span onClick="{{ cal.prev }}" style="width:44px;height:44px;display:grid;place-items:center;border-radius:9px;border:1px solid rgba(20,45,32,.14);background:rgba(255,255,255,.38);color:#1B4632">‹</span>
            <span onClick="{{ cal.today }}" style="min-height:44px;padding:0 13px;display:inline-flex;align-items:center;border-radius:9px;border:1px solid rgba(184,145,47,.4);background:rgba(184,145,47,.08);color:#1B4632;font-size:14px">Heute</span>
            <span onClick="{{ cal.next }}" style="width:44px;height:44px;display:grid;place-items:center;border-radius:9px;border:1px solid rgba(20,45,32,.14);background:rgba(255,255,255,.38);color:#1B4632">›</span>
            <span onClick="{{ cal.toggleMenu }}" style="min-height:44px;padding:0 13px;display:inline-flex;align-items:center;border-radius:9px;border:1px solid rgba(184,145,47,.4);background:rgba(255,255,255,.38);color:#1B4632;font-size:14px">Kalender ▾</span>
          </div>
          <sc-if value="{{ cal.menuOpen }}" hint-placeholder-val="{{ false }}">
            <div style="margin-top:8px;padding:8px;border-radius:10px;background:rgba(255,255,255,.42);border:1px solid rgba(184,145,47,.28)">
              <sc-for list="{{ cal.calendars }}" as="c" hint-placeholder-count="4">
                <div onClick="{{ c.toggle }}" style="min-height:44px;padding:8px 10px;display:flex;align-items:center;gap:9px;border-radius:8px;background:{{ c.bg }};border:1px solid {{ c.border }};margin:4px 0"><span style="width:9px;height:9px;border-radius:50%;background:{{ c.color }}"></span><span style="font-size:14px;color:#39473B;flex:1">{{ c.name }}</span><span style="color:#1B4632">{{ c.mark }}</span></div>
              </sc-for>
            </div>
          </sc-if>'''
s = replace_once(s, mobile_header, mobile_header_new, 'mobile calendar header')

# Ensure cal/calendar meta and marks are returned.
s = replace_once(s,
    "      projects,projectsMeta,goals,inbox,inboxMeta,mails,mailsMeta,weekFull,system,systemMeta,",
    "      projects,projectsMeta,goals,inbox,inboxMeta,mails,mailsMeta,weekFull,cal:{...cal,calendars:cal.calendars.map(c=>({...c,mark:c.selected?'✓':''}))},calMeta:D.weekMeta,system,systemMeta,",
    'mobile render return calendar')

# Mood date selector immediately before Hauptgefühl.
mobile_mood = '''          <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(20,45,32,.1)">
            <div style="font-size:15.4px;color:#39473B">Hauptgefühl</div>'''
mobile_mood_new = '''          <div style="margin-top:16px;padding:12px;border-radius:10px;background:rgba(255,255,255,.38);border:1px solid rgba(184,145,47,.28)">
            <label style="display:block;font-size:14px;color:#4C5A4E;margin-bottom:7px">Eintrag für</label>
            <input type="date" value="{{ wbEntryDate }}" max="{{ wbMaxDate }}" onChange="{{ wbDateChange }}" style="width:100%;min-height:44px;padding:0 12px;border-radius:9px;border:1px solid rgba(20,45,32,.18);background:#F7F1E4;color:#1B4632;font-family:'IBM Plex Mono',monospace;font-size:16px;box-sizing:border-box">
            <div style="margin-top:6px;font-size:12.8px;color:#7A8A7C">Vergangene Tage können nachgetragen werden.</div>
          </div>
          <div style="margin-top:16px;padding-top:14px;border-top:1px solid rgba(20,45,32,.1)">
            <div style="font-size:15.4px;color:#39473B">Hauptgefühl</div>'''
s = replace_once(s, mobile_mood, mobile_mood_new, 'mobile wellbeing date UI')

s = replace_once(s,
    "      wbValues,wbMoods,wbFactors,wbCount,wbLedger,wbHistory,wbAvg,wbPatternText,wbHighest,wbLowest,wbFeeling,",
    "      wbValues,wbMoods,wbFactors,wbCount,wbEntryDate:window.KZLive.wellbeingDate(),wbMaxDate:window.KZLive.todayKey(),wbDateChange:(e)=>window.KZLive.setWellbeingDate(this,e.target.value),wbLedger,wbHistory,wbAvg,wbPatternText,wbHighest,wbLowest,wbFeeling,",
    'mobile wellbeing return')
write(p, s)


# ---------- Tests / contract updates ----------
p = 'tests/claude-design-live.test.mjs'
s = read(p)
s = s.replace("'getHealthV31', 'getWellbeingV1', 'getCalendarWeekV3', 'getMailV3',", "'getHealthV31', 'getWellbeingV1', 'getCalendarViewV4', 'getMailV3',")
s = s.replace("'setTaskDone', 'acknowledgeAlert', 'reviewAiInbox', 'saveWellbeingEntryV1',", "'setTaskDone', 'acknowledgeAlert', 'reviewAiInbox', 'saveWellbeingEntryV2',")
write(p, s)

p = 'tests/mobile-design-live.test.mjs'
s = read(p)
s = s.replace("'getHealthV31', 'getWellbeingV1', 'getCalendarWeekV3', 'getMailV3',", "'getHealthV31', 'getWellbeingV1', 'getCalendarViewV4', 'getMailV3',")
s = s.replace("'setTaskDone', 'acknowledgeAlert', 'reviewAiInbox', 'saveWellbeingEntryV1',", "'setTaskDone', 'acknowledgeAlert', 'reviewAiInbox', 'saveWellbeingEntryV2',")
write(p, s)

# New focused test.
(Path(ROOT) / 'tests' / 'calendar-wellbeing-enhancements.test.mjs').write_text(r'''import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const backend = await readFile(join(root, 'src', 'CalendarEnhancements.gs'), 'utf8');
const adapter = await readFile(join(root, 'src', 'LiveAdapter.html'), 'utf8');
const desktop = await readFile(join(root, 'src', 'Index.html'), 'utf8');
const mobile = await readFile(join(root, 'src', 'MobileIndex.html'), 'utf8');

test('calendar supports day/week/month and per-calendar visibility', () => {
  assert.match(backend, /getCalendarViewV4/);
  assert.match(backend, /\['day', 'week', 'month'\]/);
  assert.match(backend, /defaultVisible: !\/möglichkeit\/i/);
  assert.match(adapter, /kz\.calendar\.v1/);
  assert.match(adapter, /calendarControls/);
  for (const label of ['Tag', 'Woche', 'Monat', 'Kalender ▾', 'Heute']) {
    assert.match(desktop + mobile, new RegExp(label));
  }
});

test('wellbeing entries can be backfilled but not dated in the future', () => {
  assert.match(backend, /saveWellbeingEntryV2/);
  assert.match(backend, /zukünftige Tage/);
  assert.match(adapter, /entryDate: this\.wellbeingDate\(\)/);
  assert.match(adapter, /saveWellbeingEntryV2/);
  assert.match(desktop, /type="date"/);
  assert.match(mobile, /type="date"/);
  assert.match(desktop + mobile, /max="\{\{ (wbD\.maxDate|wbMaxDate) \}\}"/);
});
''', encoding='utf-8')

print('Calendar/wellbeing patch applied successfully.')
