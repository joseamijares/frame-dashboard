/*
 * Frame Dashboard — the screen.
 *
 * Plain ES2019 in one classic script: it has to run in a 2022 Samsung Frame
 * (Tizen 6.5, about Chromium 85) and old Android TV WebViews, with no build.
 *
 * Query params: k (read key, remembered), lang (en|es), mode (day|night|auto),
 * layout (bleed|salon|painting), date (YYYY-MM-DD, preview another week),
 * at (HH:MM, pretend it's this time).
 */
(function () {
  'use strict';

  var REFRESH_MS = 5 * 60 * 1000; // full rebuild: picks up calendar-feed changes
  var VERSION_MS = 20 * 1000; // cheap "did anything change?" check
  var BROWSE_RESET_MS = 45 * 1000;
  var MAX_EVENTS = 4;
  var MAX_TASKS = 14; // the layout trims to what actually fits, see fitTasks()
  var EVENING_FROM = 19; // the wall goes dark and the right side turns to tomorrow
  var NIGHT_UNTIL = 6; // after midnight it stays dark, but shows the new day

  var STRINGS = {
    en: {
      todaysFocus: "Today's focus",
      tomorrowsFocus: "Tomorrow's focus",
      focusFor: 'Focus',
      schedule: 'Schedule',
      tomorrow: 'Tomorrow',
      tasks: 'To do',
      tasksTomorrow: 'To do tomorrow',
      meetings: ['No meetings', '1 meeting', '{n} meetings'],
      doneOf: '{d} of {n} done',
      planned: ['Nothing planned', '1 planned', '{n} planned'],
      now: 'Now',
      minLeft: '{m} min left',
      inMin: 'in {m} min',
      fromToday: 'From today',
      noMeetings: 'No meetings',
      doneForDay: 'No more meetings today',
      noTasks: 'Nothing planned',
      noFocus: 'No plan yet — plan the week with Claude',
      earlier: '{n} earlier',
      more: '+{n} more',
      wrapped: 'Today, wrapped',
      updated: 'Updated {t}',
      offline: 'Offline · showing {t}',
      keyTitle: 'Almost there',
      keyBody: 'Open this page with ?k=your-read-key, or set the URL in the TV app.',
      badKeyTitle: 'Key not accepted',
      badKeyBody: 'The read key in the URL does not match DASHBOARD_READ_KEY on the server.',
    },
    es: {
      todaysFocus: 'Enfoque de hoy',
      tomorrowsFocus: 'Enfoque de mañana',
      focusFor: 'Enfoque',
      schedule: 'Agenda',
      tomorrow: 'Mañana',
      tasks: 'Pendientes',
      tasksTomorrow: 'Pendientes de mañana',
      meetings: ['Sin juntas', '1 junta', '{n} juntas'],
      doneOf: '{d} de {n} hechas',
      planned: ['Nada planeado', '1 planeada', '{n} planeadas'],
      now: 'Ahora',
      minLeft: 'quedan {m} min',
      inMin: 'en {m} min',
      fromToday: 'De hoy',
      noMeetings: 'Sin juntas',
      doneForDay: 'No hay más juntas hoy',
      noTasks: 'Nada planeado',
      noFocus: 'Sin plan todavía — planea la semana con Claude',
      earlier: '{n} antes',
      more: '+{n} más',
      wrapped: 'El día, en resumen',
      updated: 'Actualizado {t}',
      offline: 'Sin conexión · mostrando {t}',
      keyTitle: 'Ya casi',
      keyBody: 'Abre esta página con ?k=tu-clave-de-lectura, o configura la URL en la app de la TV.',
      badKeyTitle: 'Clave no aceptada',
      badKeyBody: 'La clave de la URL no coincide con DASHBOARD_READ_KEY en el servidor.',
    },
  };

  var params = new URLSearchParams(location.search);
  var state = {
    data: null,
    offline: false,
    selected: null, // ymd being browsed with the remote, or null
    browseTimer: null,
    artShown: null,
    lastLoad: 0,
    version: null,
    build: null,
    skew: 0, // server clock minus TV clock; TVs drift, the server doesn't
  };

  function $(id) {
    return document.getElementById(id);
  }

  function store(key, value) {
    try {
      if (value === undefined) return localStorage.getItem(key);
      localStorage.setItem(key, value);
    } catch (e) {
      /* storage blocked: the screen still works, it just forgets */
    }
    return null;
  }

  function readKey() {
    var k = params.get('k');
    if (k) store('fd:key', k);
    return k || store('fd:key');
  }

  function lang() {
    var l = (params.get('lang') || (state.data && state.data.locale) || 'en').slice(0, 2).toLowerCase();
    return STRINGS[l] ? l : 'en';
  }

  function intlLocale() {
    return lang() === 'es' ? 'es-MX' : 'en-US';
  }

  function t(key, vars) {
    var s = STRINGS[lang()][key];
    if (s == null) s = STRINGS.en[key];
    Object.keys(vars || {}).forEach(function (k) {
      s = s.split('{' + k + '}').join(vars[k]);
    });
    return s;
  }

  // ['none', 'one', 'many'] forms.
  function plural(key, n) {
    var forms = STRINGS[lang()][key];
    var s = n === 0 ? forms[0] : n === 1 ? forms[1] : forms[2];
    return s.split('{n}').join(n);
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  // ── Time, always in the dashboard's zone (not the TV's) ──────────────

  function tz() {
    return (state.data && state.data.tz) || undefined;
  }

  // ?at=HH:MM fakes the time of day, for previewing the evening view.
  function now() {
    var base = new Date(Date.now() + state.skew);
    var at = params.get('at');
    if (!at || !state.data) return base;
    var p = at.split(':');
    var offsetHour = localParts(base).hour;
    var offsetMin = localParts(base).minute;
    var delta = (Number(p[0]) - offsetHour) * 60 + (Number(p[1] || 0) - offsetMin);
    return new Date(base.getTime() + delta * 60000);
  }

  function localParts(date) {
    var parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz(),
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    }).formatToParts(date);
    var out = {};
    parts.forEach(function (p) {
      out[p.type] = Number(p.value);
    });
    return out;
  }

  function timeParts(date) {
    var parts = new Intl.DateTimeFormat(intlLocale(), {
      timeZone: tz(),
      hour: 'numeric',
      minute: '2-digit',
    }).formatToParts(date);
    var main = '';
    var period = '';
    parts.forEach(function (p) {
      if (p.type === 'dayPeriod') period += p.value;
      else if (p.type !== 'literal' || main) main += p.value;
    });
    return { main: main.trim(), period: period.replace(/[\s.]/g, '').toUpperCase() };
  }

  function shortTime(iso) {
    return timeParts(new Date(iso)).main;
  }

  function ymdOf(date) {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz(),
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  }

  // Noon UTC keeps a bare date on the same calendar day in every zone.
  function fmtDay(ymd, opts) {
    return new Intl.DateTimeFormat(intlLocale(), Object.assign({ timeZone: 'UTC' }, opts)).format(
      new Date(ymd + 'T12:00:00Z')
    );
  }

  // ── Which day, which mode ─────────────────────────────────────────────

  function findDay(ymd) {
    var d = state.data;
    if (!d) return null;
    for (var i = 0; i < d.days.length; i++) if (d.days[i].date === ymd) return d.days[i];
    if (d.tomorrow && d.tomorrow.date === ymd) return d.tomorrow;
    return null;
  }

  function isNight() {
    var mode = params.get('mode') || 'auto';
    if (mode !== 'auto') return mode === 'night';
    var h = localParts(now()).hour;
    return h >= EVENING_FROM || h < NIGHT_UNTIL;
  }

  // In the evening, the wall text turns to tomorrow. After midnight it is the
  // new day already, so it shows "today" again, just with the lights down.
  function isEvening() {
    var mode = params.get('mode');
    if (mode === 'night') return true;
    if (mode === 'day') return false;
    return localParts(now()).hour >= EVENING_FROM;
  }

  // The design (Settings → layout): "bleed" is full bleed by day and the
  // salon after dark (a bright placard would glare in a dim room); "salon"
  // keeps the gallery wall all day; "painting" keeps full bleed day and night.
  function useBleed(art, night) {
    var layout = params.get('layout') || (state.data && state.data.layout) || 'bleed';
    if (layout === 'painting') return !!art;
    return layout === 'bleed' && !night && !!art;
  }

  // Full bleed: the painting at full height, centred in the area left of the
  // placard (x < 1228). Wide works simply fill the screen.
  function placeBleed(img, ratio) {
    var w = Math.round(1080 * ratio);
    if (w >= 1920) {
      img.style.left = '0px';
      img.style.width = '1920px';
      img.classList.remove('feathered');
      return;
    }
    var left = Math.max(0, Math.round((1228 - w) / 2));
    img.style.width = w + 'px';
    img.style.left = left + 'px';
    // A work flush with the screen's left edge keeps that edge crisp.
    img.classList.toggle('feathered', true);
    img.style.webkitMaskImage = img.style.maskImage = left === 0
      ? 'linear-gradient(90deg, #000 calc(100% - 60px), transparent 100%)'
      : '';
  }

  // ── Layout ───────────────────────────────────────────────────────────

  function fit() {
    var s = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
    var x = (window.innerWidth - 1920 * s) / 2;
    var y = (window.innerHeight - 1080 * s) / 2;
    $('stage').style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')';
  }

  // The painting is centred on the wall above the label shelf. Canvas gets a
  // gilt frame (16 + 5 liner); paper gets a black frame and a 48px mat.
  var HANG = { cx: 570, cy: 507, maxW: 888, maxH: 694 };

  function hangArt(art) {
    if (!art || state.artShown === art.image) return;
    state.artShown = art.image;

    var paper = art.kind === 'paper';
    var chrome = paper ? (14 + 48) * 2 : (16 + 5) * 2;
    var innerW = HANG.maxW - chrome;
    var innerH = HANG.maxH - chrome;
    var ratio = art.ratio || 1.3;
    var w = innerW;
    var h = w / ratio;
    if (h > innerH) {
      h = innerH;
      w = h * ratio;
    }
    var outerW = Math.round(w + chrome);
    var outerH = Math.round(h + chrome);
    var left = Math.round(HANG.cx - outerW / 2);
    var top = Math.round(HANG.cy - outerH / 2);

    var artBox = document.querySelector('.art');
    var bleed = $('bleed');
    var fill = $('bleed-fill');
    artBox.classList.remove('is-in');
    $('label').classList.remove('is-in');
    bleed.classList.remove('is-in');
    fill.classList.remove('is-in');

    var img = new Image();
    img.onload = function () {
      var frame = $('frame');
      frame.className = 'frame' + (paper ? ' paper' : '');
      frame.style.left = left + 'px';
      frame.style.top = top + 'px';
      frame.style.width = outerW + 'px';
      frame.style.height = outerH + 'px';

      var lamp = $('lamp');
      lamp.style.left = HANG.cx - 130 + 'px';
      lamp.style.top = top - 48 + 'px';
      var glow = $('glow');
      glow.style.left = HANG.cx - 460 + 'px';
      glow.style.top = top - 190 + 'px';

      var painting = $('painting');
      painting.src = img.src;
      painting.alt = art.title + ', ' + art.artist;

      $('label-artist').textContent = art.artist;
      $('label-title').textContent = art.title + (art.date ? ', ' + art.date : '');
      $('label-meta').textContent = [medium(art.medium), art.collection].filter(Boolean).join(' · ');

      bleed.src = img.src;
      bleed.alt = painting.alt;
      fill.src = img.src;
      placeBleed(bleed, ratio);
      $('credit-title').textContent = art.title;
      $('credit-meta').textContent = [art.artist + (art.date ? ', ' + art.date : ''), art.collection]
        .filter(Boolean)
        .join(' · ');
      var factEl = $('credit-fact');
      clear(factEl);
      if (art.fact) {
        factEl.appendChild(document.createTextNode(art.fact));
        factEl.appendChild(el('span', 'via', 'Wikipedia'));
      }

      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          artBox.classList.add('is-in');
          $('label').classList.add('is-in');
          bleed.classList.add('is-in');
          fill.classList.add('is-in');
        });
      });
    };
    // A museum image that fails to load is replaced by a local painting,
    // so the frame is never empty.
    img.onerror = function () {
      if (art.fallback && state.artShown === art.image) {
        state.artShown = null;
        hangArt(art.fallback);
      }
    };
    img.src = art.image;
  }

  // ── Rendering ────────────────────────────────────────────────────────

  function renderClock() {
    var p = timeParts(now());
    $('clock-time').textContent = p.main;
    $('clock-period').textContent = p.period;
  }

  function timedEvents(day) {
    return day.events.filter(function (e) {
      return !e.allDay;
    });
  }

  function renderEvents(day, live) {
    var allday = $('allday');
    var list = $('events');
    clear(allday);
    clear(list);

    day.events.forEach(function (e) {
      if (e.allDay) allday.appendChild(el('li', null, e.title));
    });

    var timed = timedEvents(day);
    $('schedule-count').textContent = plural('meetings', timed.length);
    if (!timed.length) {
      list.appendChild(el('li', 'empty-line', t('noMeetings')));
      return;
    }

    var t0 = now().getTime();
    var lead = null; // the meeting you're in, else the next one
    if (live) {
      for (var i = 0; i < timed.length; i++) {
        if (Date.parse(timed[i].end) > t0) {
          lead = timed[i];
          break;
        }
      }
    }

    // What's over is over: past meetings leave the list (the header counts
    // them), which frees rows for the to-dos.
    var shown = live
      ? timed.filter(function (e) {
          return Date.parse(e.end) > t0;
        })
      : timed.slice();
    var hidden = timed.length - shown.length;
    if (hidden) $('schedule-count').textContent += ' · ' + t('earlier', { n: hidden });
    if (!shown.length) list.appendChild(el('li', 'empty-line', t('doneForDay')));
    var overflow = Math.max(0, shown.length - MAX_EVENTS);

    shown.slice(0, MAX_EVENTS).forEach(function (e) {
      var s = Date.parse(e.start);
      var en = Date.parse(e.end);
      var inProgress = live && s <= t0 && en > t0;
      var cls = [];
      if (live && en <= t0) cls.push('past');
      if (e === lead) cls.push('lead');
      if (inProgress) cls.push('now');

      var li = el('li', cls.join(' '));
      li.appendChild(el('span', 'time', shortTime(e.start)));
      var what = el('div', 'what');
      what.appendChild(el('div', 'title', e.title));
      if (e === lead && e.location) what.appendChild(el('div', 'where', e.location.split('\n')[0]));
      li.appendChild(what);

      if (e === lead) {
        var tail = inProgress
          ? t('minLeft', { m: Math.max(1, Math.round((en - t0) / 60000)) })
          : s - t0 < 90 * 60000
          ? t('inMin', { m: Math.max(1, Math.round((s - t0) / 60000)) })
          : null;
        if (tail) li.appendChild(el('span', 'tail', tail));
      }
      list.appendChild(li);
    });
    if (overflow) list.appendChild(el('li', 'more', t('more', { n: overflow })));
  }

  // Plans written by hand may list tasks as plain strings.
  function tasksOf(day) {
    return (day.tasks || [])
      .map(function (x) {
        return typeof x === 'string' ? { text: x, done: false, tag: null } : x;
      })
      .filter(function (x) {
        return x && x.text;
      });
  }

  function renderTasks(day, carried, evening) {
    var list = $('tasks');
    clear(list);

    var own = tasksOf(day);
    var known = {};
    own.forEach(function (x) {
      known[x.text.toLowerCase()] = true;
    });
    var extra = (carried || []).filter(function (x) {
      return !known[x.text.toLowerCase()];
    });

    var open = own.filter(function (x) {
      return !x.done;
    });
    var done = own.filter(function (x) {
      return x.done;
    });
    var all = open
      .map(function (x) {
        return { task: x };
      })
      .concat(
        extra.map(function (x) {
          return { task: x, carried: true };
        })
      )
      .concat(
        done.map(function (x) {
          return { task: x };
        })
      );

    $('tasks-count').textContent = evening
      ? plural('planned', open.length + extra.length)
      : own.length
      ? t('doneOf', { d: done.length, n: own.length })
      : '';

    if (!all.length) {
      list.appendChild(el('li', 'empty-line', t('noTasks')));
      return;
    }

    all.slice(0, MAX_TASKS).forEach(function (item) {
      var li = el('li', item.task.done ? 'done' : '');
      li.appendChild(el('span', 'tick'));
      li.appendChild(el('span', 'task-text', item.task.text));
      if (item.carried) li.appendChild(el('span', 'tag carried', t('fromToday')));
      else if (item.task.tag) li.appendChild(el('span', 'tag', item.task.tag));
      list.appendChild(li);
    });
    fitTasks(list, all.length);
  }

  var MEDIUMS_ES = {
    'oil on canvas': 'Óleo sobre tela',
    'oil on linen canvas': 'Óleo sobre lino',
    'oil on jute canvas': 'Óleo sobre yute',
    'oil on panel': 'Óleo sobre tabla',
    'color woodblock print': 'Xilografía a color',
    watercolor: 'Acuarela',
    'transparent watercolor': 'Acuarela',
  };

  function medium(m) {
    if (!m || lang() !== 'es') return m;
    return MEDIUMS_ES[m.toLowerCase()] || m;
  }

  // Show as many to-dos as the column has room for: drop rows from the end
  // (finished ones sink there first) until nothing overflows, and say how
  // many are hidden. Uses layout sizes, which the stage's scale() ignores.
  function fitTasks(list, total) {
    var day = $('day');
    var fits = function () {
      return day.scrollHeight <= day.clientHeight + 1;
    };
    if (fits()) return;
    var more = el('li', 'more');
    list.appendChild(more);
    var rows = list.querySelectorAll('li:not(.more)');
    for (var i = rows.length - 1; i >= 1; i--) {
      list.removeChild(rows[i]);
      more.textContent = t('more', { n: total - i });
      if (fits()) return;
    }
  }

  var WORDS = {
    en: ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'],
    es: ['Ninguna', 'Una', 'Dos', 'Tres', 'Cuatro', 'Cinco', 'Seis', 'Siete', 'Ocho', 'Nueve', 'Diez'],
  };

  function word(n, lower) {
    var w = n <= 10 ? WORDS[lang()][n] : String(n);
    return lower ? w.toLowerCase() : w;
  }

  // "Four meetings, three of four done. One moves to tomorrow."
  function recapText(today, carried) {
    var m = timedEvents(today).length;
    var total = tasksOf(today).length;
    var done = tasksOf(today).filter(function (x) {
      return x.done;
    }).length;
    var c = carried.length;
    var out = [];
    if (lang() === 'es') {
      out.push(
        (m === 1 ? 'Una junta' : m === 0 ? 'Sin juntas' : word(m) + ' juntas') +
          (total ? ', ' + word(done, true) + ' de ' + word(total, true) + ' hechas.' : '.')
      );
      if (c) out.push(c === 1 ? 'Una pasa a mañana.' : word(c) + ' pasan a mañana.');
    } else {
      out.push(
        (m === 1 ? 'One meeting' : word(m) + ' meetings') +
          (total ? ', ' + word(done, true) + ' of ' + word(total, true) + ' done.' : '.')
      );
      if (c) out.push(word(c) + (c === 1 ? ' moves' : ' move') + ' to tomorrow.');
    }
    return out.join(' ');
  }

  function renderWeek(shownDate) {
    var list = $('week');
    var today = ymdOf(now());
    clear(list);
    state.data.days.forEach(function (d) {
      var cls = [];
      var dow = new Date(d.date + 'T12:00:00Z').getUTCDay();
      if (dow === 0 || dow === 6) cls.push('is-weekend');
      if (d.date < today) cls.push('is-past');
      if (d.date === today) cls.push('is-today');
      else if (d.date === shownDate) cls.push('is-selected');
      var li = el('li', cls.join(' '));
      li.appendChild(el('div', 'wk-day', fmtDay(d.date, { weekday: 'short' }).replace('.', '').toUpperCase()));
      li.appendChild(el('div', 'wk-num', String(Number(d.date.slice(8)))));
      var dots = el('div', 'wk-dots');
      var n = Math.min(4, timedEvents(d).length);
      for (var i = 0; i < n; i++) dots.appendChild(el('i'));
      li.appendChild(dots);
      list.appendChild(li);
    });
  }

  function renderStatus() {
    var d = state.data;
    var stamp = shortTime(d.generatedAt);
    var msg = state.offline ? t('offline', { t: stamp }) : t('updated', { t: stamp });
    if (d.errors && d.errors.length && !state.offline) msg = d.errors[0] + ' · ' + msg;
    $('status').textContent = msg;
  }

  // A bad record must never stop the screen from refreshing: log and carry on.
  function render() {
    try {
      draw();
    } catch (err) {
      if (window.console) console.error(err);
    }
  }

  function draw() {
    var night = isNight();
    renderClock();
    if (!state.data) {
      document.body.className = night ? 'night' : '';
      return;
    }

    var todayYmd = ymdOf(now());
    var today = findDay(todayYmd);
    // Trust the server's idea of today if the TV's clock disagrees anyway.
    if (!today && !params.get('date') && findDay(state.data.today)) {
      todayYmd = state.data.today;
      today = findDay(todayYmd);
    }
    // ?date= previews another week: treat its Monday as "today".
    if (!today && params.get('date')) {
      today = state.data.days[0];
      todayYmd = today.date;
    }
    if (!today && !state.selected) {
      // The week rolled over since the last fetch. Ask again, at most once a
      // minute, so a TV that is offline with a stale cache doesn't spin.
      if (Date.now() - state.lastLoad > 60 * 1000) load();
      return;
    }

    var evening = !state.selected && isEvening() && state.data.tomorrow;
    var day = state.selected ? findDay(state.selected) : evening ? state.data.tomorrow : today;
    var live = !state.selected && !evening; // "now", countdowns, past fading

    var art = (state.selected ? day : today).art;
    document.body.className =
      (night ? 'night' : '') + (useBleed(art, night) ? ' bleed' : '') + (state.selected ? ' browsing' : '');

    $('eyebrow').textContent = fmtDay(state.selected || todayYmd, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });

    $('focus-label').textContent = state.selected
      ? t('focusFor')
      : evening
      ? t('tomorrowsFocus')
      : t('todaysFocus');
    var focus = $('focus');
    focus.className = 'focus-text' + (day.focus ? '' : ' empty');
    focus.textContent = day.focus || (state.data.planned ? '' : t('noFocus'));

    $('schedule-label').textContent = evening ? t('tomorrow') : t('schedule');
    $('tasks-label').textContent = evening ? t('tasksTomorrow') : t('tasks');

    var carried =
      evening && today
        ? tasksOf(today).filter(function (x) {
            return !x.done;
          })
        : [];

    renderEvents(day, live);
    renderTasks(day, carried, evening);

    var recap = $('recap');
    recap.hidden = !(evening && today);
    if (evening && today) {
      $('recap-label').textContent = t('wrapped');
      $('recap-text').textContent = recapText(today, carried);
    }

    renderWeek(day.date);
    renderStatus();
    // The painting belongs to the calendar day, not to the view: tonight's
    // painting is still today's.
    hangArt(art);
    document.documentElement.lang = lang();
  }

  // ── Data ─────────────────────────────────────────────────────────────

  function notice(titleKey, bodyKey) {
    $('notice-title').textContent = t(titleKey);
    $('notice-body').textContent = t(bodyKey);
    $('notice').hidden = false;
  }

  function load() {
    state.lastLoad = Date.now();
    var key = readKey();
    var q = new URLSearchParams();
    if (key) q.set('k', key);
    if (params.get('date')) q.set('date', params.get('date'));

    return fetch('api/week?' + q.toString(), { cache: 'no-store' })
      .then(function (res) {
        if (res.status === 401) {
          notice(key ? 'badKeyTitle' : 'keyTitle', key ? 'badKeyBody' : 'keyBody');
          throw new Error('unauthorized');
        }
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        $('notice').hidden = true;
        state.skew = Date.parse(data.generatedAt) - Date.now();
        if (Math.abs(state.skew) < 60 * 1000) state.skew = 0;
        state.data = data;
        state.offline = false;
        store('fd:week', JSON.stringify(data));
        render();
      })
      .catch(function (err) {
        if (err.message === 'unauthorized') return;
        state.offline = true;
        render();
      });
  }

  // Edits from the Mac app or Claude bump a version on the server. Poll it
  // often (one tiny request) and reload the week only when it moves.
  function checkVersion() {
    var key = readKey();
    fetch('api/version' + (key ? '?k=' + encodeURIComponent(key) : ''), { cache: 'no-store' })
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (body) {
        if (!body) return;
        // A new deploy: reload the page itself so the screen runs the new code
        // (the TV app would otherwise keep the old page until it's reopened).
        if (state.build && body.build && body.build !== state.build) {
          location.reload();
          return;
        }
        state.build = body.build || state.build;
        if (state.version !== null && body.version !== state.version) load();
        state.version = body.version;
      })
      .catch(function () {
        /* offline: the next full refresh will notice */
      });
  }

  // ── Remote: ←/→ browse the week, OK/↑/↓ back to today ────────────────

  function browse(step) {
    if (!state.data) return;
    var dates = state.data.days.map(function (d) {
      return d.date;
    });
    var today = ymdOf(now());
    var from = dates.indexOf(state.selected || today);
    if (from < 0) from = 0;
    var to = Math.max(0, Math.min(dates.length - 1, from + step));
    state.selected = dates[to] === today ? null : dates[to];
    clearTimeout(state.browseTimer);
    if (state.selected) {
      state.browseTimer = setTimeout(function () {
        state.selected = null;
        render();
      }, BROWSE_RESET_MS);
    }
    render();
  }

  document.addEventListener('keydown', function (e) {
    var k = e.keyCode;
    if (k === 37) browse(-1);
    else if (k === 39) browse(1);
    else if (k === 13) {
      // OK: back to today, and fetch fresh data.
      state.selected = null;
      render();
      load();
    } else if (k === 38 || k === 40) {
      state.selected = null;
      render();
    } else if (k === 10009 && window.parent !== window) {
      // Back: the TV shell framing this page (tizen/main.js) never sees our
      // keys, so tell it; it opens the launcher.
      window.parent.postMessage({ type: 'frame-dashboard:back' }, '*');
    } else return;
    e.preventDefault();
  });

  // ── Boot ─────────────────────────────────────────────────────────────

  // The three painting <img>s start without a source, so they are created
  // here rather than shipped empty in the HTML.
  function makeImg(id, cls, parent, before) {
    var img = document.createElement('img');
    img.id = id;
    img.className = cls;
    img.alt = '';
    parent.insertBefore(img, before || null);
    return img;
  }
  var scrim = document.querySelector('.scrim');
  makeImg('bleed-fill', 'bleed-fill', scrim.parentNode, scrim).setAttribute('aria-hidden', 'true');
  makeImg('bleed', 'bleed-art', scrim.parentNode, scrim);
  makeImg('painting', 'painting', $('liner'));

  window.addEventListener('resize', fit);
  fit();
  try {
    state.data = JSON.parse(store('fd:week') || 'null');
  } catch (e) {
    state.data = null;
  }
  render();
  load();
  setInterval(load, REFRESH_MS);
  checkVersion();
  setInterval(checkVersion, VERSION_MS);
  // Coming back from Art Mode or another input: timers may have been paused,
  // so catch up at once instead of waiting for the next tick.
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) {
      checkVersion();
      load();
    }
  });
  window.addEventListener('focus', function () {
    checkVersion();
  });
  setInterval(render, 20 * 1000);
})();
