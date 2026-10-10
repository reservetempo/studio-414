/*
  The workshop calendar at Studio 414: the workshops (workshop.js) on a month grid, at
  the top of the Workshops window, over the list of links to them.

  - Each time the Workshops window opens, workshop.js runs draw (below, handed over
    through window.studioWorkshops.setCalendar). It starts on the month of the next
    workshop (this month, once none are left), and its arrow buttons step a month back
    or on, from this month to the month of the last workshop. The focus goes to the
    next workshop's day, unless the window opens onto a workshop's link (back from its
    sign-up window).
  - The month is a table, Sunday first, always six weeks tall so the window keeps its
    size from month to month. Each workshop's day is marked: a raised button that opens
    its sign-up window, with the workshop's name in a tooltip under the pointer or the
    keyboard focus, and its full date and name for screen readers ("Saturday 7
    November 2026: Paint a piece"). One workshop a day: a second one on the same day
    would only show in the list. Days gone by (in the studio's time zone, as
    workshop.js counts them) and workshops that are over are greyed out, and today is
    outlined.
  - It needs workshop.js, which hands it what it uses as window.studioWorkshops. Without
    that, the calendar (#workshops-calendar) stays hidden and nothing here runs; the
    list still works.
*/
(function () {
  'use strict';

  var api = window.studioWorkshops;
  var calendar = document.getElementById('workshops-calendar');
  if (!api || !calendar) return;

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  var prevButton = document.getElementById('calendar-prev');
  var nextButton = document.getElementById('calendar-next');
  var monthEl = document.getElementById('calendar-month');
  var weekdaysEl = document.getElementById('calendar-weekdays');
  var daysEl = document.getElementById('calendar-days');

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

  // Draws the month of the next workshop, as the Workshops window opens, and returns
  // that workshop's day (for workshop.js to focus), or null.
  function draw() {
    today = api.today();
    var next = api.upcoming()[0] || null;
    first = monthOf(today);
    shown = next ? monthOf(next.date) : first;
    last = api.all().reduce(function (latest, w) {
      return Math.max(latest, monthOf(w.date));
    }, shown);
    render();
    var mark = null;
    if (next) {
      daysEl.querySelectorAll('button').forEach(function (button) {
        if (button.dataset.id === next.id) mark = button;
      });
    }
    return mark;
  }

  prevButton.addEventListener('click', function () { step(-1); });
  nextButton.addEventListener('click', function () { step(1); });

  // A workshop's day: its sign-up window (which closes the Workshops window).
  daysEl.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('button.calendar__day') : null;
    var w = button ? api.find(button.dataset.id, api.upcoming()) : null;
    if (w) api.openSignup(w, '');
  });

  calendar.hidden = false;
  api.setCalendar(draw);
})();
