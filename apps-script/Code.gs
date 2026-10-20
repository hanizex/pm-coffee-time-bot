const SECRET = PropertiesService.getScriptProperties().getProperty('SECRET');
const TITLE_PART = 'PM Coffee Time';
const MAX_ATTEMPTS = 3;
// Реєстрації: A час, B код, C назва, D telegram_id, E username, F ім'я, G email,
// H питання, I статус, J інвайт, K спроби, L помилка, M час інвайту

function doPost(e) {
  if (!SECRET || (e.parameter || {}).secret !== SECRET) return reply({ ok: false, error: 'forbidden' });
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(60000);
    const events = JSON.parse(e.postData.contents);
    (Array.isArray(events) ? events : [events]).forEach(ev => {
      const c = ev.contact || {};
      const v = c.variables || {};
      handle({
        action: e.parameter.action || 'register',
        event: e.parameter.event || v.event || '',
        telegram_id: c.telegram_id,
        username: c.username || '',
        name: v.name || '',
        tgName: c.name || '',
        email: v.email || '',
        rating: v.fb_rating || '',
        feedback: clean(v.fb_text),
        question: v.question || ''
      });
    });
    return reply({ ok: true });
  } catch (err) {
    notify('PMCT: помилка запиту', String(err) + '\n\n' + e.postData.contents);
    return reply({ ok: false });
  } finally {
    lock.releaseLock();
  }
}

function handle(d) {
  const ss = SpreadsheetApp.getActive();
  const id = String(d.telegram_id);
  const log = sheet(ss,'Реєстрації');
  const fbAction = ['feedback', 'fbstop', 'fblater'].includes(d.action);
if (fbAction && !d.event) throw new Error('Для фідбеку потрібен event в адресі');
const ev = activeEvent(ss, d.event, fbAction);
  if (!ev) throw new Error('Подію не знайдено або реєстрація закрита: ' + d.event);
  const rows = log.getDataRange().getValues();
  const i = rows.findIndex((r, n) => n > 0 && r[1] === ev.code && String(r[3]) === id);

  if (d.action === 'register') {
    const email = String(d.email || '').trim().toLowerCase();
    if (!email) throw new Error('Порожній email');
    const name = d.name || (i > 0 ? rows[i][5] : '') || d.tgName;
    const question = d.question || (i > 0 ? rows[i][7] : '');
    const oldEmail = i > 0 ? String(rows[i][6]).toLowerCase() : '';
    const same = i > 0 && oldEmail === email && rows[i][9] === 'sent';
    const row = [new Date(), ev.code, ev.name, id, d.username, name, email, question, 'registered',
      same ? 'sent' : 'pending', same ? rows[i][10] : 0, '', same ? rows[i][12] : '', ev.code + '|' + id];
    if (i > 0) log.getRange(i + 1, 1, 1, row.length).setValues([row]);
    else log.appendRow(row);
    tryRun(() => updateParticipant(ss, id, d, name, email, ev.code));
    if (oldEmail && oldEmail !== email) tryRun(() => removeGuest(ev, oldEmail));
    if (!same) processInvite(ss, ev, id);
  } else if (d.action === 'details' && i > 0) {
    const name = d.name || rows[i][5];
    log.getRange(i + 1, 6).setValue(name);
    log.getRange(i + 1, 8).setValue(d.question || rows[i][7]);
    updateParticipant(ss, id, d, name, rows[i][6], ev.code);
  } else if (d.action === 'cancel' && i > 0) {
    log.getRange(i + 1, 9).setValue('cancelled');
    tryRun(() => removeGuest(ev, rows[i][6]));
  } else if (fbAction) { saveFeedback(ss, ev, id, d);
  }
}


function processInvite(ss, ev, id) {
  const log = sheet(ss,'Реєстрації');
  const rows = log.getDataRange().getValues();
  const i = rows.findIndex((r, n) => n > 0 && r[1] === ev.code && String(r[3]) === id);
  if (i < 1) return;
  const attempts = (Number(rows[i][10]) || 0) + 1;
  try {
    inviteGuest(ev, String(rows[i][6]).toLowerCase());
    log.getRange(i + 1, 10, 1, 4).setValues([['sent', attempts, '', new Date()]]);
  } catch (err) {
    const status = attempts >= MAX_ATTEMPTS ? 'gave_up' : 'failed';
    log.getRange(i + 1, 10, 1, 4).setValues([[status, attempts, String(err), '']]);
    if (status === 'gave_up') {
      notify('PMCT: інвайт не надіслано', 'Telegram: @' + rows[i][4] + ' (' + id + ')\nEmail: ' + rows[i][6] + '\n' + String(err));
    }
  }
}

function retryInvites() {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return;
  try {
    const ss = SpreadsheetApp.getActive();
    const rows = sheet(ss,'Реєстрації').getDataRange().getValues();
    rows.forEach((r, n) => {
      if (n === 0 || r[8] !== 'registered' || !['pending', 'failed'].includes(r[9])) return;
      const ev = activeEvent(ss, r[1]);
      if (ev) processInvite(ss, ev, String(r[3]));
    });
  } finally {
    lock.releaseLock();
  }
}

// Запускай вручну, коли створив подію в календарі після того, як люди вже записались
function resendInvites() {
  const log = sheet(SpreadsheetApp.getActive(), 'Реєстрації');
  log.getDataRange().getValues().forEach((r, n) => {
    if (n > 0 && r[8] === 'registered' && !['sent', 'archived'].includes(r[9])) log.getRange(n + 1, 10, 1, 3).setValues([['pending', 0, '']]);
  });
  retryInvites();
}

function installTriggers() {
  ScriptApp.getProjectTriggers().filter(t => t.getHandlerFunction() === 'retryInvites')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('retryInvites').timeBased().everyMinutes(1).create();
}

function updateParticipant(ss, id, d, name, email, code) {
  const sh = sheet(ss,'Учасники');
  const rows = sh.getDataRange().getValues();
  const i = rows.findIndex((r, n) => n > 0 && String(r[0]) === id);
  const now = new Date();
  if (i > 0) {
    const events = String(rows[i][7]).split(',').map(s => s.trim()).filter(Boolean);
    if (!events.includes(code)) events.push(code);
    sh.getRange(i + 1, 1, 1, 8).setValues([[id, d.username, name, email, rows[i][4], now, events.length, events.join(', ')]]);
  } else {
    sh.appendRow([id, d.username, name, email, now, now, 1, code]);
  }
}

function activeEvent(ss, code, any) {
  const rows = sheet(ss,'Events').getDataRange().getDisplayValues();
  const isOn = x => any || ['true', 'yes', 'так'].includes(x[3].trim().toLowerCase());
  const r = rows.find((x, n) => n > 0 && isOn(x) && (!code || x[4].trim() === String(code).trim()));
  if (!r) return null;
  let date = r[1].trim();
  if (date.includes('.')) {
    const [d, m, y] = date.split('.');
    date = y + '-' + m.padStart(2, '0') + '-' + d.padStart(2, '0');
  }
  const [hh, mm] = r[2].trim().split(':');
  const start = Utilities.parseDate(date + ' ' + hh.padStart(2, '0') + ':' + mm, ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm');
  return { name: r[0], code: r[4].trim(), start: start };
}

function calendarIds(ev) {
  const cal = CalendarApp.getDefaultCalendar();
  const from = new Date(ev.start.getTime() - 3600000);
  const to = new Date(ev.start.getTime() + 3600000);
  const found = cal.getEvents(from, to, { search: TITLE_PART })
    .find(x => Math.abs(x.getStartTime().getTime() - ev.start.getTime()) < 5 * 60000);
  if (!found) throw new Error('У календарі немає події "' + TITLE_PART + '" на ' + ev.start + ' (' + ev.code + ')');
  return { calId: cal.getId(), eventId: found.getId().split('@')[0] };
}

function inviteGuest(ev, email) {
  const { calId, eventId } = calendarIds(ev);
  const attendees = Calendar.Events.get(calId, eventId).attendees || [];
  if (attendees.some(a => (a.email || '').toLowerCase() === email)) return;
  attendees.push({ email: email });
  Calendar.Events.patch({ attendees: attendees }, calId, eventId, { sendUpdates: 'all' });
}

function removeGuest(ev, email) {
  const { calId, eventId } = calendarIds(ev);
  const attendees = (Calendar.Events.get(calId, eventId).attendees || [])
    .filter(a => (a.email || '').toLowerCase() !== String(email).toLowerCase());
  Calendar.Events.patch({ attendees: attendees }, calId, eventId, { sendUpdates: 'none' });
}

function tryRun(fn) { try { fn(); } catch (err) { notify('PMCT: помилка', String(err)); } }
function notify(subject, body) { MailApp.sendEmail(Session.getEffectiveUser().getEmail(), subject, body); }
function reply(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function testRegister() {
  handle({ action: 'register', event: 'pmct-70', telegram_id: '1', username: 'test',
    name: 'Тест', tgName: 'Тест', email: 'test@example.com', question: 'Тестове питання' });
}

function sheet(ss, name) {
  const s = ss.getSheetByName(name);
  if (!s) throw new Error('Немає вкладки "' + name + '". Є: ' + ss.getSheets().map(x => x.getName()).join(', '));
  return s;
}

function saveFeedback(ss, ev, id, d) {
  const sh = sheet(ss, 'Фідбек');
  const rows = sh.getDataRange().getValues();
  const tag = { feedback: 'fb-done', fbstop: 'fb-stop', fblater: 'fb-later' }[d.action];
  const i = rows.findIndex((r, n) => n > 0 && r[1] === ev.code && String(r[2]) === id);
  const prev = i > 0 ? rows[i] : [];
  const rating = Number(d.rating);
  const row = [new Date(), ev.code, id, d.name || prev[3] || d.tgName,
    d.action === 'feedback' ? (rating >= 1 && rating <= 5 ? rating : '') : (prev[4] || ''),
    d.action === 'feedback' ? d.feedback : (prev[5] || ''),
    prev[6] || '', tag];
  if (i > 0) sh.getRange(i + 1, 1, 1, row.length).setValues([row]);
  else sh.appendRow(row);
}

function testFeedback() {
  handle({ action: 'feedback', event: 'pmct-69', telegram_id: '1', username: 'test',
    name: 'Тест', tgName: 'Тест', rating: '5', feedback: 'тест' });
}

function clean(s) { s = String(s || '').trim(); return s === '—' ? '' : s; }
