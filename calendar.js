/*
  The workshop calendar at Studio 414: the workshops (workshop.js) on a month grid, in
  a 90s window like the Workshops window and the sign-up window.

  - "See in calendar", under the list in the Workshops window (#workshops-calendar),
    closes that window and opens this one (#calendar). It starts on the month of the
    next workshop (this month, once none are left), and its arrow buttons step a month
    back or on, from this month to the month of the last workshop.
  - The month is a table, Sunday first, always six weeks tall so the window keeps its
    size from month to month. Each workshop's day is marked: a raised button that opens
    its sign-up window, with the workshop's name in a tooltip under the pointer or the
    keyboard focus, and its full date and name for screen readers ("Saturday 7
    November 2026: Paint a piece"). One workshop a day: a second one on the same day
    would only show in the list. Days gone by (in the studio's time zone, as
    workshop.js counts them) and workshops that are over are greyed out, and today is
    outlined.
  - "All workshops" goes back to the list. The window closes, drags and moves as the
    others do (workshop.js's makeWindow), opens fresh each time, and only one of the
    three is open at a time.
  - It needs workshop.js, which hands it what it uses as window.studioWorkshops. Without
    that, "See in calendar" stays hidden and nothing here runs.
*/
(function () {
  'use strict';

  var api = window.studioWorkshops;
  var opener = document.getElementById('workshops-calendar');
  var win = document.getElementById('calendar');
  if (!api || !opener || !win || typeof win.showModal !== 'function') return;

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  var closeButton = document.getElementById('calendar-close');
  var backButton = document.getElementById('calendar-back');
  var prevButton = document.getElementById('calendar-prev');
  var nextButton = document.getElementById('calendar-next');
  var monthEl = document.getElementById('calendar-month');
  var weekdaysEl = document.getElementById('calendar-weekdays');
  var daysEl = document.getElementById('calendar-days');

  var calendarWindow = api.makeWindow(win, closeButton, 'Move the workshop calendar');

  // Months are counted from year 0 (year * 12 + month, January being 0), so stepping
  // one is adding one.
  var shown = 0;                  // the month on the grid
  var first = 0;                  // this month, the earliest one to step back to
  var last = 0;                   // the month of the last workshop, the latest one
  var today = '';                 // YYYY-MM-DD in the studio's time zone

  // The month of a YYYY-MM-DD date.
  function monthOf(date) {
    var p = date.split('-');
    return +p[0] * 12 + (+p[1] - 1);
  }

  function pad(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function hiddenText(parent, text) {
    var span = document.createElement('span');
    span.className = 'visually-hidden';
    span.textContent = text;
    parent.appendChild(span);
  }

  // The weekday headings: "Su" seen, "Sunday" heard.
  DAYS.forEach(function (name) {
    var th = document.createElement('th');
    th.scope = 'col';
    var seen = document.createElement('span');
    seen.setAttribute('aria-hidden', 'true');
    seen.textContent = name.slice(0, 2);
    th.appendChild(seen);
    hiddenText(th, name);
    weekdaysEl.appendChild(th);
  });

  // One day of the month: a button for a workshop coming up, or just its number.
  function makeDay(year, month, n, byDate) {
    var date = year + '-' + pad(month + 1) + '-' + pad(n);
    var w = byDate[date];
    var past = date < today;
    var el = document.createElement(w && !past ? 'button' : 'span');
    el.className = 'calendar__day';
    var number = document.createElement('span');
    number.textContent = n;
    el.appendChild(number);
    if (w) {
      el.classList.add('calendar__day--workshop');
      if (past) {
        hiddenText(el, ': ' + w.name + ', over');
      } else {
        el.type = 'button';
        el.dataset.id = w.id;
        el.setAttribute('aria-haspopup', 'dialog');
        // "Saturday 7 November 2026: Paint a piece"
        el.setAttribute('aria-label', DAYS[new Date(Date.UTC(year, month, n)).getUTCDay()] +
          ' ' + n + ' ' + MONTHS[month] + ' ' + year + ': ' + w.name);
      }
      // The tooltip, for the eye only: screen readers have the name already.
      var tip = document.createElement('span');
      tip.className = 'calendar__tip';
      tip.setAttribute('aria-hidden', 'true');
      tip.textContent = past ? w.name + ' (over)' : w.name;
      el.appendChild(tip);
    }
    if (past) el.classList.add('calendar__day--past');
    if (date === today) el.setAttribute('aria-current', 'date');
    return el;
  }

  // Draws the month shown: its name, the arrows (off at either end) and its days.
  function render() {
    var year = Math.floor(shown / 12);
    var month = shown % 12;
    monthEl.textContent = MONTHS[month] + ' ' + year;
    prevButton.disabled = shown <= first;
    nextButton.disabled = shown >= last;

    var byDate = {};
    api.all().forEach(function (w) {
      if (!byDate[w.date]) byDate[w.date] = w;
    });

    var start = new Date(Date.UTC(year, month, 1)).getUTCDay();
    var length = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    daysEl.textContent = '';
    for (var week = 0; week < 6; week++) {
      var row = document.createElement('tr');
      var empty = true;
      for (var weekday = 0; weekday < 7; weekday++) {
        var cell = document.createElement('td');
        var n = week * 7 + weekday - start + 1;
        if (n >= 1 && n <= length) {
          cell.appendChild(makeDay(year, month, n, byDate));
          empty = false;
        }
        row.appendChild(cell);
      }
      // A week past the month's end is only there to keep the size: not heard.
      if (empty) row.setAttribute('aria-hidden', 'true');
      daysEl.appendChild(row);
    }
  }

  function step(by) {
    var to = Math.min(last, Math.max(first, shown + by));
    if (to === shown) return;
    var focused = document.activeElement;
    shown = to;
    render();
    // An arrow turned off at the end hands the focus to the other one.
    if (focused && focused.disabled) (focused === prevButton ? nextButton : prevButton).focus();
  }

  function open() {
    today = api.today();
    var next = api.upcoming()[0] || null;
    first = monthOf(today);
    shown = next ? monthOf(next.date) : first;
    last = api.all().reduce(function (latest, w) {
      return Math.max(latest, monthOf(w.date));
    }, shown);
    render();
    api.closeList();
    calendarWindow.open();
    // The focus on the next workshop's day, or else on the way back.
    var mark = null;
    if (next) {
      daysEl.querySelectorAll('button').forEach(function (button) {
        if (button.dataset.id === next.id) mark = button;
      });
    }
    (mark || backButton).focus();
  }

  prevButton.addEventListener('click', function () { step(-1); });
  nextButton.addEventListener('click', function () { step(1); });

  daysEl.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('button.calendar__day') : null;
    var w = button ? api.find(button.dataset.id, api.upcoming()) : null;
    if (!w) return;
    calendarWindow.close();
    api.openSignup(w, '');
  });

  backButton.addEventListener('click', function () {
    calendarWindow.close();
    api.openList(null, '');
    opener.focus();
  });

  opener.addEventListener('click', open);
  opener.hidden = false;
})();
