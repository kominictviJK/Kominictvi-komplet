/**
 * Pomocník Google pro aplikaci Kominictví Komplet
 * Běží zdarma pod účtem KominictviJK@gmail.com.
 * Umí: posílat e-maily, číst Gmail (poptávky, nákupy), kalendář „Kominictví“, zálohy na Disk, ARES, banku (Fio).
 *
 * Instalace: script.google.com → Nový projekt → vložit tento kód → Uložit → Nasadit → Nové nasazení →
 * typ „Webová aplikace“, Spustit jako: Já, Přístup: Kdokoli → Nasadit → povolit přístup → zkopírovat URL do aplikace.
 */
var TOKEN = '__TOKEN__'; // tajný klíč – vloží ho aplikace, nesdílej ho
var CAL_NAME = 'Kominictví';
var BACKUP_FOLDER = 'Kominictví – zálohy';

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.token !== TOKEN) throw new Error('Neplatný klíč pomocníka');
    var fn = ACTIONS[req.action];
    if (!fn) throw new Error('Neznámá akce: ' + req.action);
    out = { ok: true, data: fn(req.data || {}) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput('Pomocník Kominictví běží.');
}

var ACTIONS = {
  ping: function () {
    return { email: Session.getActiveUser().getEmail() || Session.getEffectiveUser().getEmail(), time: new Date().toISOString() };
  },

  // ---------- E-mail ----------
  sendEmail: function (d) {
    var atts = (d.attachments || []).map(function (a) {
      return Utilities.newBlob(Utilities.base64Decode(a.base64), a.type || 'application/pdf', a.name);
    });
    GmailApp.sendEmail(d.to, d.subject, d.body, { attachments: atts, name: d.fromName || 'Kominictví Klimesch' });
    return { sent: true };
  },

  // Nové e-maily (poptávky, potvrzení starostů, nákupy) od daného data
  scanGmail: function (d) {
    var res = [];
    (d.queries || []).forEach(function (q) {
      var threads = GmailApp.search(q.query, 0, q.max || 20);
      threads.forEach(function (t) {
        var m = t.getMessages()[t.getMessageCount() - 1];
        var item = {
          id: m.getId(), kind: q.kind, from: m.getFrom(), subject: m.getSubject(), date: m.getDate().toISOString(),
          text: m.getPlainBody().slice(0, 4000), attachments: [],
        };
        if (q.withAttachments) {
          m.getAttachments().slice(0, 2).forEach(function (a) {
            var type = a.getContentType();
            if ((type === 'application/pdf' || type.indexOf('image/') === 0) && a.getSize() < 3000000) {
              item.attachments.push({ name: a.getName(), type: type, base64: Utilities.base64Encode(a.getBytes()) });
            }
          });
        }
        res.push(item);
      });
    });
    return res;
  },

  // ---------- Kalendář ----------
  calendarSync: function (d) {
    var cal = getCalendar();
    var map = {};
    var from = new Date(d.from), to = new Date(d.to);
    cal.getEvents(from, to).forEach(function (ev) {
      var id = ev.getTag('appId');
      if (id) map[id] = ev;
    });
    var seen = {};
    (d.events || []).forEach(function (x) {
      seen[x.id] = true;
      var start = new Date(x.start), end = new Date(x.end);
      var ev = map[x.id];
      if (ev) {
        if (ev.getTitle() !== x.title) ev.setTitle(x.title);
        if (x.allDay) ev.setAllDayDate(start); else ev.setTime(start, end);
        ev.setDescription(x.description || '');
        ev.setLocation(x.location || '');
      } else {
        ev = x.allDay ? cal.createAllDayEvent(x.title, start, { description: x.description || '', location: x.location || '' })
          : cal.createEvent(x.title, start, end, { description: x.description || '', location: x.location || '' });
        ev.setTag('appId', x.id);
      }
    });
    // smazané v aplikaci → smazat i v Googlu
    Object.keys(map).forEach(function (id) { if (!seen[id]) map[id].deleteEvent(); });
    // osobní události z hlavního kalendáře (jen ke zobrazení)
    var personal = CalendarApp.getDefaultCalendar().getEvents(from, to).map(function (ev) {
      return { id: ev.getId(), title: ev.getTitle(), start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString(), allDay: ev.isAllDayEvent() };
    });
    return { pushed: (d.events || []).length, personal: personal };
  },

  // ---------- Zálohy ----------
  backupSave: function (d) {
    var folder = getFolder();
    var file = folder.createFile(Utilities.newBlob(d.content, 'application/octet-stream', d.name));
    // ponechat posledních 30 záloh
    var files = [], it = folder.getFiles();
    while (it.hasNext()) files.push(it.next());
    files.sort(function (a, b) { return b.getDateCreated() - a.getDateCreated(); });
    files.slice(30).forEach(function (f) { f.setTrashed(true); });
    return { id: file.getId(), name: file.getName(), size: file.getSize() };
  },
  backupList: function () {
    var it = getFolder().getFiles(), out = [];
    while (it.hasNext()) { var f = it.next(); out.push({ id: f.getId(), name: f.getName(), size: f.getSize(), date: f.getDateCreated().toISOString() }); }
    out.sort(function (a, b) { return b.date < a.date ? -1 : 1; });
    return out;
  },
  backupLoad: function (d) {
    return { content: DriveApp.getFileById(d.id).getBlob().getDataAsString() };
  },

  // ---------- ARES ----------
  ares: function (d) {
    var ok = function (x) { return x !== undefined && x !== null && x !== ''; };
    var ico = String(d.ico).replace(/\D/g, '');
    var r = UrlFetchApp.fetch('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/' + ico, { muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('IČO ' + ico + ' nenalezeno v ARES');
    var j = JSON.parse(r.getContentText());
    var s = j.sidlo || {};
    return {
      name: j.obchodniJmeno, ico: j.ico, dic: j.dic || '',
      street: [s.nazevUlice || s.nazevCastiObce || s.nazevObce, [s.cisloDomovni, s.cisloOrientacni].filter(ok).join('/')].filter(ok).join(' '),
      city: s.nazevObce || '', zip: s.psc ? String(s.psc).replace(/(\d{3})(\d{2})/, '$1 $2') : '', district: s.nazevOkresu || '',
    };
  },

  // ---------- Banka (Fio API) ----------
  fio: function (d) {
    var url = 'https://fioapi.fio.cz/v1/rest/periods/' + d.token + '/' + d.from + '/' + d.to + '/transactions.json';
    var r = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (r.getResponseCode() === 409) throw new Error('Banka dovoluje dotaz jen jednou za 30 sekund – zkus to za chvíli');
    if (r.getResponseCode() !== 200) throw new Error('Banka neodpověděla (' + r.getResponseCode() + ')');
    var j = JSON.parse(r.getContentText());
    var list = (j.accountStatement.transactionList && j.accountStatement.transactionList.transaction) || [];
    return list.map(function (t) {
      var v = function (k) { return t[k] ? t[k].value : ''; };
      return { id: String(v('column22')), date: String(v('column0')).slice(0, 10), amount: Number(v('column1')), vs: String(v('column5') || ''), counterparty: v('column10') || v('column2') || '', message: v('column16') || v('column25') || '', type: v('column8') || '' };
    });
  },
};

function getCalendar() {
  var cals = CalendarApp.getCalendarsByName(CAL_NAME);
  return cals.length ? cals[0] : CalendarApp.createCalendar(CAL_NAME, { color: CalendarApp.Color.BROWN });
}

function getFolder() {
  var it = DriveApp.getFoldersByName(BACKUP_FOLDER);
  return it.hasNext() ? it.next() : DriveApp.createFolder(BACKUP_FOLDER);
}

// Spusť jednou ručně (tlačítko ▶ Spustit) – Google se zeptá na povolení přístupu
function povolitPristup() {
  ACTIONS.ping();
  getCalendar();
  getFolder();
  GmailApp.getInboxUnreadCount();
  UrlFetchApp.fetch('https://ares.gov.cz/');
}
