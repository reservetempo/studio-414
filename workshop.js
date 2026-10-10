/*
  Workshops at Studio 414: a calendar and a list of the workshops coming up, and a
  sign-up window for each, paid with Stripe Checkout (Stripe charges it in CAD, which
  the windows leave unsaid).

  - The workshops (ids, names, dates and prices) are in WORKSHOPS below, so their names
    and dates show even when the sign-up server can't be reached. A workshop drops off
    once its day has ended in the studio's time zone (STUDIO_TIME_ZONE), as on the
    server. Once none are left, the button at the top right hides.
  - The plain underlined "Workshops" fixed at the top right of the screen (a button,
    #workshop-button) opens the Workshops window (#workshops): the month calendar
    (calendar.js, drawn each time the window opens, through the function it hands
    setCalendar in window.studioWorkshops, at the end), and under it the list, one
    link per workshop, soonest first: its name and date ("Paint a piece, Sat 7 Nov")
    in the classic web's underlined blue, purple once opened, whatever the switcher's
    colours, then in plain text, once they are in, its spots left ("7 spots left",
    "Sold out"). A sold-out workshop stays in the list. The links are buttons dressed
    as links, as they open a window rather than a page.
  - A workshop's link, or its day on the calendar, closes that window and opens its
    sign-up window (#workshop): its name, date and price, a form, and an "All
    workshops" button back to the Workshops window, onto that workshop's link. The
    dialog is named after the workshop ("Paint a piece sign-up").
  - Both windows are modal <dialog>s drawn as 90s windows like the boxes (boxes.css,
    workshop.css), one open at a time. Each closes with its close button, Escape or a
    click outside it. Its title bar drags it, and on the title bar the arrow keys move
    it, as on the boxes (they aren't boxes.js's boxes: each opens fresh, centred, and
    nothing about where it was is remembered). See makeWindow.
  - The spots come from the workshop-checkout Edge Function of the Supabase project
    set in comments-config.js (the same URL and anon / publishable key). Its API is
    described at the top of supabase/functions/workshop-checkout/index.ts:
      GET  -> 200 { workshops: [{ id, capacity, taken, remaining, ... }] }
      POST { workshop, email, name, quantity, friendName? } -> 200 { url }: Stripe
           Checkout, where the visitor is sent to pay for price × quantity; or an
           { error } (invalid_name, invalid_email, already_signed_up, full,
           not_enough_spots with { remaining }, ...)
    They are fetched each time either window opens. Until they are in, the list shows
    no counts and the sign-up window says "Checking spots…"; if they can't be fetched
    (the function isn't deployed yet, or the network is down) it says sign-ups aren't
    open yet and the pay button stays off. Once in, the sign-up window's title bar says
    how many are left, ticking down quickly from the capacity to that number the first
    time; until then it says "Workshop sign-up". Screen readers hear the count once,
    from a live region of its own. Once a workshop is sold out its form is off, and
    once every listed workshop is, the button at the top right says "Sold out".
  - The form asks for your name and email, and has a "Buying for a friend" box that
    shows a "Friend's name" field, required while it's ticked (and not sent when it
    isn't). Beside the price, "× 1" with − and + sets how many spots the order is for:
    1 to the spots left (to QUANTITY_MAX until they are in), its buttons greyed at the
    limits; the pay button gives the total ("Pay $119.98 with Stripe"). The form checks
    what the server checks before sending; a field that's wrong is marked (aria-invalid,
    and aria-describedby to the message saying what). If fewer spots are left than
    asked for (not_enough_spots), the message says how many and the count comes down
    to that. The count goes back to × 1 each time the window opens; what was typed
    stays, as the email always has.
  - Stripe sends the visitor back to /?workshop=success, or to /?workshop=cancelled if
    they leave the checkout. Either one opens the window on load with a thank-you or a
    "nothing was charged" message, and the parameter is taken out of the address (any
    others, such as ?font= and ?color=, stay). The workshop's id is kept in
    sessionStorage on the way to Stripe, so the message shows in that workshop's
    sign-up window; without it, it shows in the Workshops window.
*/
(function () {
  'use strict';

  // The workshops, soonest first: id, name, date (YYYY-MM-DD, the day in the studio's
  // time zone) and price per spot in cents. They match the WORKSHOPS list in
  // supabase/functions/workshop-checkout/index.ts, which holds the spots and is what
  // the sign-ups go by: change both together.
  var WORKSHOPS = [
    { id: 'paint-a-piece', name: 'Paint a piece', date: '2026-11-07', price: 5999 },
    { id: 'hand-building', name: 'Hand building', date: '2026-12-05', price: 5999 }
  ];

  // The studio's time zone: a workshop's day ends at midnight here (the same as
  // STUDIO_TIME_ZONE in workshop-checkout/index.ts).
  var STUDIO_TIME_ZONE = 'America/Toronto';

  var REQUEST_TIMEOUT_MS = 15000;
  var EMAIL_MAX = 254;
  var NAME_MAX = 100;             // your name and your friend's, as on the server
  var QUANTITY_MAX = 10;          // spots in one order until the spots left are in
  var STEP = 10;
  // The count in the title ticks down a step every TICK_MS, and takes TICK_MAX_MS at most.
  var TICK_MS = 80;
  var TICK_MAX_MS = 900;
  var KEYS = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  };
  // Where the workshop on its way to Stripe is kept, for the message on the way back.
  var RETURN_KEY = 'studio414-workshop';

  var DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July',
    'August', 'September', 'October', 'November', 'December'];

  // Pixel icons for the message after Stripe (16 x 16, drawn like the title-bar icons):
  // a disc with a tick cut out of it, and a disc with an "i".
  var ICONS = {
    success: 'M5 0h6v1H5zM3 1h10v1H3zM2 2h12v1H2zM1 3h14v2H1zM0 5h16v6H0zM1 11h14v2H1zM2 13h12v1H2zM3 14h10v1H3zM5 15h6v1H5z' +
      'M11 5h2v1h-2zM10 6h2v1h-2zM3 7h2v1H3zM9 7h2v1H9zM4 8h2v1H4zM8 8h2v1H8zM5 9h4v1H5zM6 10h2v1H6z',
    cancelled: 'M5 0h6v1H5zM3 1h10v1H3zM2 2h12v1H2zM1 3h14v2H1zM0 5h16v6H0zM1 11h14v2H1zM2 13h12v1H2zM3 14h10v1H3zM5 15h6v1H5z' +
      'M7 3h2v2H7zM6 6h3v1H6zM7 7h2v4H7zM6 11h4v1H6z'
  };

  // The message after Stripe, for a workshop, or for none when it isn't known which
  // (then it shows at the top of the Workshops window).
  var MESSAGES = {
    success: function (w) {
      return w ? {
        title: 'You’re in! See you on ' + dayMonth(w) + '.',
        text: 'Thanks for signing up to ' + w.name + '. Stripe has emailed you a receipt.'
      } : {
        title: 'You’re in!',
        text: 'Thanks for signing up. Stripe has emailed you a receipt.'
      };
    },
    cancelled: function (w) {
      return {
        title: 'Payment cancelled, nothing was charged.',
        text: w ? 'Your spot isn’t booked. You can try again below.'
          : 'Your spot isn’t booked. You can pick a workshop below and try again.'
      };
    }
  };

  var root = document.documentElement;
  var launcher = document.getElementById('workshop-button');
  var listDialog = document.getElementById('workshops');
  var dialog = document.getElementById('workshop');
  // Without <dialog> support the button stays hidden.
  if (!launcher || !listDialog || !dialog || typeof dialog.showModal !== 'function') return;

  var launcherLabel = document.getElementById('workshop-button-label');
  var listBody = document.getElementById('workshops-body');
  var listEl = document.getElementById('workshops-list');
  var listClose = document.getElementById('workshops-close');
  var titleEl = document.getElementById('workshop-title');
  var countEl = document.getElementById('workshop-count');
  var closeButton = document.getElementById('workshop-close');
  var backButton = document.getElementById('workshop-back');
  var resultEl = document.getElementById('workshop-result');
  var resultIcon = document.getElementById('workshop-result-icon');
  var resultTitle = document.getElementById('workshop-result-title');
  var resultText = document.getElementById('workshop-result-text');
  var nameEl = document.getElementById('workshop-name');
  var dateEl = document.getElementById('workshop-date');
  var priceEl = document.getElementById('workshop-price');
  var quantityNumber = document.getElementById('workshop-quantity-number');
  var quantityUnit = document.getElementById('workshop-quantity-unit');
  var lessButton = document.getElementById('workshop-less');
  var moreButton = document.getElementById('workshop-more');
  var spotsEl = document.getElementById('workshop-spots');
  var form = document.getElementById('workshop-form');
  var yourNameInput = document.getElementById('workshop-your-name');
  var emailInput = document.getElementById('workshop-email');
  var friendCheck = document.getElementById('workshop-for-friend');
  var friendBox = document.getElementById('workshop-friend');
  var friendInput = document.getElementById('workshop-friend-name');
  var payButton = document.getElementById('workshop-pay');
  var messageEl = document.getElementById('workshop-message');
  var noteEl = document.getElementById('workshop-note');
  var okButton = document.getElementById('workshop-ok');
  var TITLE = titleEl.textContent;

  var config = window.COMMENTS_CONFIG || {};
  var supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/+$/, '');
  var supabaseKey = String(config.supabaseAnonKey || '').trim();
  var endpoint = supabaseUrl && supabaseKey ? supabaseUrl + '/functions/v1/workshop-checkout' : '';

  /* ---------- The workshops ---------- */

  // Today in the studio's time zone, as YYYY-MM-DD (the visitor's own day if the
  // browser doesn't know the zone).
  function studioToday() {
    var now = new Date();
    try {
      var parts = new Intl.DateTimeFormat('en-US', {
        timeZone: STUDIO_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).formatToParts(now);
      var part = function (type) {
        for (var i = 0; i < parts.length; i++) if (parts[i].type === type) return parts[i].value;
        return '';
      };
      return part('year') + '-' + part('month') + '-' + part('day');
    } catch (error) {
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      return now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());
    }
  }

  // The workshops whose day hasn't ended yet, soonest first.
  function upcoming() {
    var today = studioToday();
    return WORKSHOPS.filter(function (w) { return w.date >= today; })
      .sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
  }

  function find(id, list) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }

  // The workshop's day as a Date at midnight UTC, to read its parts in UTC.
  function day(w) {
    var p = w.date.split('-');
    return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]));
  }

  // "Saturday 7 November 2026"
  function longDate(w) {
    var d = day(w);
    return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
  }

  // "Sat 7 Nov"
  function shortDate(w) {
    var d = day(w);
    return DAYS[d.getUTCDay()].slice(0, 3) + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()].slice(0, 3);
  }

  // "7 November"
  function dayMonth(w) {
    var d = day(w);
    return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()];
  }

  // "$59.99" for one spot, or "$119.98" for two.
  function priceText(w, quantity) {
    return '$' + (w.price * (quantity || 1) / 100).toFixed(2);
  }

  /* ---------- The checkout function ---------- */

  // Resolves with { ok, status, data }, data being the JSON answer (errors come as
  // JSON too), or null when the answer isn't JSON (a function that isn't deployed).
  // Rejects only when there is no answer at all (offline, blocked, timed out).
  function request(method, body) {
    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var headers = {
      apikey: supabaseKey,
      'Content-Type': 'application/json'
    };
    // The legacy anon key is a JWT (eyJ...) and goes in Authorization as well. The newer
    // publishable key (sb_publishable_...) is not a JWT and goes in apikey only.
    if (/^eyJ/.test(supabaseKey)) headers.Authorization = 'Bearer ' + supabaseKey;

    return fetch(endpoint, {
      method: method,
      headers: headers,
      body: body == null ? undefined : JSON.stringify(body),
      cache: 'no-store',
      signal: controller ? controller.signal : undefined
    }).then(function (response) {
      return response.json().then(function (data) {
        return { ok: response.ok, status: response.status, data: data };
      }, function () {
        return { ok: false, status: response.status, data: null };
      });
    }).finally(function () {
      if (timer) clearTimeout(timer);
    });
  }

  // { capacity, remaining } from a workshop in the GET answer, or null if it doesn't
  // make sense.
  function readSpots(data) {
    if (!data || typeof data !== 'object') return null;
    var capacity = Number(data.capacity);
    var remaining = data.remaining != null ? Number(data.remaining) : capacity - Number(data.taken);
    if (!isFinite(capacity) || !isFinite(remaining) || capacity < 0) return null;
    capacity = Math.round(capacity);
    return { capacity: capacity, remaining: Math.max(0, Math.min(capacity, Math.round(remaining))) };
  }

  // { id: { capacity, remaining } } from the GET answer, or null if it has no list.
  function readWorkshops(data) {
    if (!data || !Array.isArray(data.workshops)) return null;
    var byId = {};
    data.workshops.forEach(function (item) {
      var spots = item && typeof item.id === 'string' ? readSpots(item) : null;
      if (spots) byId[item.id] = spots;
    });
    return byId;
  }

  // Only ever go on to a web page: never a javascript: or data: address.
  function checkoutUrl(value) {
    if (typeof value !== 'string' || !value) return '';
    try {
      var url = new URL(value, window.location.href);
      return /^https?:$/.test(url.protocol) ? url.href : '';
    } catch (error) {
      return '';
    }
  }

  function isEmail(value) {
    return value.length <= EMAIL_MAX && /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(value);
  }

  // A name as the server keeps it: trimmed, runs of spaces made one.
  function cleanName(value) {
    return value.trim().replace(/\s+/g, ' ');
  }

  /* ---------- The spots ---------- */

  var spotsState = 'loading';     // the last fetch: 'loading', 'ready' or 'unavailable'
  var spotsById = {};             // { id: { capacity, remaining } } from the last fetch
  var loadId = 0;

  // A workshop's state: 'loading', 'open', 'soldout' or 'unavailable' (sign-ups can't
  // be reached, or the server doesn't list it). Spots already in stand while they are
  // fetched again.
  function availabilityOf(w) {
    var spots = w && spotsById[w.id];
    if (spots) return spots.remaining > 0 ? 'open' : 'soldout';
    return w && spotsState === 'loading' ? 'loading' : 'unavailable';
  }

  // "7 spots left", "1 spot left" or "Sold out".
  function countText(remaining) {
    if (remaining <= 0) return 'Sold out';
    return remaining === 1 ? '1 spot left' : remaining + ' spots left';
  }

  function renderAll() {
    renderLauncher();
    renderList();
    render();
  }

  // Fetched each time a window opens, for both windows and the button.
  function loadSpots() {
    var id = ++loadId;
    if (!endpoint) {
      spotsState = 'unavailable';
      renderAll();
      return;
    }
    spotsState = 'loading';
    renderAll();
    request('GET').then(function (result) {
      if (id !== loadId) return;
      var next = result.ok ? readWorkshops(result.data) : null;
      if (next) {
        spotsById = next;
        spotsState = 'ready';
        renderAll();
        showCount();
        keepFocus();
      } else {
        noSpots();
      }
    }, function () {
      // Not open yet, or offline: the sign-up window says so. The failed request
      // itself is all the console needs.
      if (id === loadId) noSpots();
    });
  }

  function noSpots() {
    spotsById = {};
    spotsState = 'unavailable';
    stopCount();
    heard = null;
    renderAll();
  }

  /* ---------- The button at the top right ---------- */

  // "Workshops", or "Sold out" once every workshop listed is; hidden once none are left.
  function renderLauncher() {
    var list = upcoming();
    var soldOut = list.length > 0 && list.every(function (w) {
      return availabilityOf(w) === 'soldout';
    });
    launcher.hidden = !list.length;
    launcherLabel.textContent = soldOut ? 'Sold out' : 'Workshops';
    launcher.setAttribute('aria-label', soldOut ? 'Workshops sold out' : 'Workshops');
    if (soldOut) launcher.dataset.state = 'soldout';
    else delete launcher.dataset.state;
  }

  /* ---------- A window: opening, closing and moving it ---------- */

  // The behaviour both windows share: opened fresh and centred; closed by its close
  // button, Escape or a click outside it; moved by dragging its title bar, or with the
  // arrow keys on it, as the boxes move (boxes.js), and kept on screen.
  function makeWindow(win, closeBtn, moveLabel) {
    var titlebar = win.querySelector('.box__titlebar');
    var drag = null;

    // A drag handle over the title bar, as boxes.js gives the boxes (boxes.css).
    var handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'box__handle';
    handle.setAttribute('aria-label', moveLabel);
    handle.title = 'Drag to move. Arrow keys move it.';
    titlebar.insertBefore(handle, closeBtn);

    function close() {
      if (win.open) win.close();
    }

    closeBtn.addEventListener('click', close);

    // A click on the dimmed page around the window (the dialog's backdrop) closes it.
    win.addEventListener('click', function (event) {
      if (event.target !== win) return;
      var r = win.getBoundingClientRect();
      if (event.clientX < r.left || event.clientX > r.right ||
          event.clientY < r.top || event.clientY > r.bottom) {
        close();
      }
    });

    win.addEventListener('close', function () {
      if (drag) endDrag(true);
    });

    function clamp(value, min, max) {
      return Math.max(min, Math.min(value, max));
    }

    // Keeps the window wholly on screen (or, if it is taller than the screen, at the top).
    function moveTo(x, y) {
      var w = win.offsetWidth;
      var h = win.offsetHeight;
      win.classList.add('is-moved');
      win.style.left = Math.round(clamp(x, 0, Math.max(0, root.clientWidth - w))) + 'px';
      win.style.top = Math.round(clamp(y, 0, Math.max(0, window.innerHeight - h))) + 'px';
    }

    function unmove() {
      win.classList.remove('is-moved');
      win.style.removeProperty('left');
      win.style.removeProperty('top');
    }

    function corner() {
      var r = win.getBoundingClientRect();
      return { x: r.left, y: r.top };
    }

    function endDrag(cancel) {
      var d = drag;
      if (!d) return;
      drag = null;
      root.classList.remove('is-moving-box');
      try {
        handle.releasePointerCapture(d.pointerId);
      } catch (error) {
        // Already released.
      }
      if (cancel) {
        if (d.wasMoved) moveTo(d.start.x, d.start.y);
        else unmove();
      }
    }

    handle.addEventListener('pointerdown', function (event) {
      if (drag || !event.isPrimary || event.button !== 0) return;
      // No text selection and no focus change.
      event.preventDefault();
      drag = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        start: corner(),
        wasMoved: win.classList.contains('is-moved')
      };
      try {
        handle.setPointerCapture(event.pointerId);
      } catch (error) {
        // Without capture the drag still follows the pointer over the handle.
      }
      root.classList.add('is-moving-box');
    });

    handle.addEventListener('pointermove', function (event) {
      if (!drag || event.pointerId !== drag.pointerId) return;
      moveTo(drag.start.x + event.clientX - drag.x, drag.start.y + event.clientY - drag.y);
    });

    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
      handle.addEventListener(type, function (event) {
        if (drag && event.pointerId === drag.pointerId) endDrag(false);
      });
    });

    handle.addEventListener('keydown', function (event) {
      var d = KEYS[event.key];
      if (!d || event.altKey || event.ctrlKey || event.metaKey || drag) return;
      event.preventDefault();
      var p = corner();
      moveTo(p.x + d[0] * STEP, p.y + d[1] * STEP);
    });

    // Escape during a drag puts the window back rather than closing it.
    win.addEventListener('cancel', function (event) {
      if (!drag) return;
      event.preventDefault();
      endDrag(true);
    });

    // Keep a moved window on screen when the browser window is resized or rotated.
    window.addEventListener('resize', function () {
      if (win.open && win.classList.contains('is-moved') && !drag) {
        var p = corner();
        moveTo(p.x, p.y);
      }
    });

    return {
      open: function () {
        unmove();
        win.showModal();
      },
      close: close
    };
  }

  var listWindow = makeWindow(listDialog, listClose, 'Move the Workshops window');
  var signupWindow = makeWindow(dialog, closeButton, 'Move the workshop sign-up window');

  /* ---------- The message after Stripe ---------- */

  // 'success' or 'cancelled' (and not, say, "toString").
  function isKind(kind) {
    return Object.prototype.hasOwnProperty.call(MESSAGES, kind);
  }

  // In the window given, at the top: the sign-up window (with its workshop) or the
  // Workshops window (with none). An empty kind takes it away.
  function showResult(kind, win, w) {
    var message = isKind(kind) ? MESSAGES[kind](w) : null;
    listDialog.removeAttribute('aria-describedby');
    dialog.removeAttribute('aria-describedby');
    resultEl.hidden = !message;
    if (!message) return;
    if (win === dialog) nameEl.parentNode.insertBefore(resultEl, nameEl);
    else listBody.insertBefore(resultEl, listBody.firstChild);
    resultIcon.innerHTML = '<path fill="currentColor" fill-rule="evenodd" d="' + ICONS[kind] + '"/>';
    resultTitle.textContent = message.title;
    resultText.textContent = message.text;
    win.setAttribute('aria-describedby', 'workshop-result');
  }

  /* ---------- The Workshops window ---------- */

  // The list's rows, as built when the window last opened: { w, button, spots }. More
  // rows or options go in buildList and renderList.
  var rows = [];
  // The workshops whose sign-up window has opened since the page loaded, by id: their
  // links are "visited" (purple).
  var visited = {};
  // The calendar's drawing (calendar.js hands it over through setCalendar): it draws
  // the month and returns the next workshop's day, for the focus, or null.
  var drawCalendar = null;

  // One link per workshop coming up, "Paint a piece, Sat 7 Nov" (a button, as it opens
  // a window), then its spots left in plain text (once in).
  function buildList() {
    listEl.textContent = '';
    rows = upcoming().map(function (w) {
      var item = document.createElement('li');
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'workshop__link';
      button.dataset.id = w.id;
      if (visited[w.id]) button.dataset.visited = '';
      button.setAttribute('aria-haspopup', 'dialog');
      button.appendChild(document.createTextNode(w.name + ', '));
      var time = document.createElement('time');
      time.dateTime = w.date;
      time.textContent = shortDate(w);
      button.appendChild(time);
      var spots = document.createElement('span');
      item.appendChild(button);
      item.appendChild(spots);
      listEl.appendChild(item);
      return { w: w, button: button, spots: spots };
    });
    if (!rows.length) {
      var none = document.createElement('li');
      none.className = 'workshop__none';
      none.textContent = 'No workshops coming up. Check back soon.';
      listEl.appendChild(none);
    }
    renderList();
  }

  // The counts, once they are in: " – 7 spots left".
  function renderList() {
    rows.forEach(function (row) {
      var spots = spotsById[row.w.id];
      var text = spots ? ' – ' + countText(spots.remaining) : '';
      if (row.spots.textContent !== text) row.spots.textContent = text;
    });
  }

  // Opens the Workshops window, with the focus on the workshop given (coming back from
  // its sign-up window), or else on the next workshop's day, or the first link; kind is
  // a message after Stripe, or ''.
  function openList(focusId, kind) {
    if (listDialog.open) return;
    signupWindow.close();
    buildList();
    var mark = drawCalendar ? drawCalendar() : null;
    showResult(kind || '', listDialog, null);
    listWindow.open();
    loadSpots();
    var row = rows.filter(function (r) { return r.w.id === focusId; })[0];
    if (row) row.button.focus();
    else if (mark) mark.focus();
    else (rows[0] ? rows[0].button : listClose).focus();
  }

  listEl.addEventListener('click', function (event) {
    var button = event.target.closest ? event.target.closest('.workshop__link') : null;
    var w = button ? find(button.dataset.id, upcoming()) : null;
    if (w) openSignup(w, '');
  });

  listDialog.addEventListener('close', function () {
    // The event comes a moment after the window closes; leave a new opening be.
    if (listDialog.open) return;
    if (resultEl.parentNode === listBody) showResult('');
  });

  launcher.addEventListener('click', function () {
    openList(null, '');
  });

  /* ---------- The sign-up window ---------- */

  var current = null;             // the workshop it is for
  var quantity = 1;               // the spots the order is for
  var paying = false;
  var mode = '';                  // '', or 'success' / 'cancelled' after Stripe
  var counting = 0;               // the animation frame of the count in the title, or 0
  var heard = null;               // the count shown (and heard) since it opened, or null

  // The line under the facts, only while the spots aren't in: once they are, the title
  // bar says how many are left and the line is hidden.
  function spotsText(availability) {
    if (availability === 'loading') return 'Checking spots…';
    if (availability === 'unavailable') return 'Sign-ups aren’t open yet, check back soon.';
    return '';
  }

  function setTitle(text) {
    if (titleEl.textContent !== text) titleEl.textContent = text;
  }

  // Fills in the workshop.
  function setWorkshop(w) {
    current = w;
    nameEl.textContent = w.name;
    dateEl.dateTime = w.date;
    dateEl.textContent = longDate(w);
    priceEl.textContent = priceText(w);
    dialog.setAttribute('aria-label', w.name + ' sign-up');
  }

  // The most spots the order can be for: the spots left once they are in (0 when sold
  // out), or QUANTITY_MAX until then. The server has the last word either way.
  function quantityMax() {
    var spots = current && spotsById[current.id];
    return spots ? spots.remaining : QUANTITY_MAX;
  }

  // The friend's name shows, and is required, only while the box is ticked.
  function showFriend() {
    var on = friendCheck.checked;
    friendBox.hidden = !on;
    friendInput.required = on;
  }

  function render() {
    var availability = availabilityOf(current);
    var spots = current && spotsById[current.id];
    var text = spotsText(availability);
    // Only when it changes, so screen readers hear it once.
    if (spotsEl.textContent !== text) spotsEl.textContent = text;
    spotsEl.dataset.state = availability;
    spotsEl.hidden = !text || mode === 'success';

    // While the count ticks down (countDown), it sets the title itself.
    if (!counting) setTitle(spots ? countText(spots.remaining) : TITLE);

    var soldOut = availability === 'soldout';
    yourNameInput.disabled = soldOut;
    emailInput.disabled = soldOut;
    friendCheck.disabled = soldOut;
    friendInput.disabled = soldOut;
    showFriend();

    // The spots, kept within the limits (fewer may be left than when it was set).
    var max = quantityMax();
    quantity = Math.max(1, Math.min(quantity, max));
    // Only when it changes, so screen readers hear "2 spots" once.
    if (quantityNumber.textContent !== String(quantity)) {
      quantityNumber.textContent = quantity;
      quantityUnit.textContent = quantity === 1 ? ' spot' : ' spots';
    }
    lessButton.disabled = paying || soldOut || quantity <= 1;
    moreButton.disabled = paying || soldOut || quantity >= max;

    payButton.disabled = paying || availability !== 'open';
    payButton.textContent = paying ? 'Opening Stripe…'
      : current ? 'Pay ' + priceText(current, quantity) + ' with Stripe' : 'Pay with Stripe';
    if (paying) payButton.setAttribute('aria-busy', 'true');
    else payButton.removeAttribute('aria-busy');
  }

  function stopCount() {
    if (counting) cancelAnimationFrame(counting);
    counting = 0;
  }

  // The number in the title ticks down from the capacity to the spots left, a step
  // every TICK_MS (TICK_MAX_MS at most in all), and stops on it. With reduced motion,
  // or all the spots left, render has already put it there.
  function countDown(spots) {
    stopCount();
    var from = spots.capacity;
    var steps = from - spots.remaining;
    var still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (steps <= 0 || still) return;
    var duration = Math.min(steps * TICK_MS, TICK_MAX_MS);
    var start = null;
    setTitle(countText(from));
    counting = requestAnimationFrame(function frame(now) {
      if (start === null) start = now;
      var done = Math.min(steps, Math.floor(steps * (now - start) / duration));
      setTitle(countText(from - done));
      counting = done < steps ? requestAnimationFrame(frame) : 0;
    });
  }

  // The count for screen readers, from a polite live region of its own (the title's
  // numbers going by aren't read out, and the dialog's name stays put). Emptied as the
  // window closes, so the same count is heard again next time.
  function announce(text) {
    countEl.textContent = text;
  }

  // Once the window has the spots for its workshop (when it opens, if they are in
  // already, or as they come in): the first time, the count ticks down and is heard
  // once; a different count later on is set at once and heard again.
  function showCount() {
    var spots = current && spotsById[current.id];
    if (!dialog.open || mode === 'success' || !spots || spots.remaining === heard) return;
    if (heard === null) countDown(spots);
    else stopCount();
    render();
    heard = spots.remaining;
    announce(countText(spots.remaining));
  }

  // Disabling the focused control (the field once sold out, the pay button while
  // paying) drops focus to the page; put it back in the window.
  function keepFocus() {
    var active = document.activeElement;
    if (dialog.open && !paying && (!active || active === document.body || active.disabled)) {
      (payButton.disabled ? closeButton : payButton).focus({ preventScroll: true });
    }
  }

  function setMessage(text, state) {
    messageEl.textContent = text;
    if (state) messageEl.dataset.state = state;
    else delete messageEl.dataset.state;
  }

  var fields = [yourNameInput, emailInput, friendInput];

  // Marks a field as wrong, tied to the message saying what, and goes to it.
  function markInvalid(field, text) {
    clearInvalid();
    field.setAttribute('aria-invalid', 'true');
    field.setAttribute('aria-describedby', messageEl.id);
    setMessage(text, 'error');
    field.focus();
  }

  function clearInvalid() {
    fields.forEach(function (field) {
      field.removeAttribute('aria-invalid');
      field.removeAttribute('aria-describedby');
    });
  }

  function setPaying(state) {
    paying = state;
    render();
  }

  // The thank-you or "cancelled" box at the top of the window, or none. After a
  // payment there is nothing left to fill in, so the form makes way for an OK button.
  function setMode(next) {
    mode = next;
    showResult(mode, dialog, current);
    var done = mode === 'success';
    form.hidden = done;
    noteEl.hidden = done;
    okButton.hidden = !done;
    // The spots line too.
    render();
  }

  // Opens the sign-up window for a workshop (closing the Workshops window); next is a
  // message after Stripe, or ''.
  function openSignup(w, next) {
    listWindow.close();
    visited[w.id] = true;
    if (current !== w) {
      setMessage('');
      clearInvalid();
      quantity = 1;
    }
    setWorkshop(w);
    setMode(next || '');
    if (dialog.open) return;
    signupWindow.open();
    heard = null;
    announce('');
    showCount();
    if (mode !== 'success') loadSpots();
    // Into the form with a keyboard or a mouse; on a touch screen, where that would
    // bring up the keyboard over the window, onto the close button instead.
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (mode === 'success') okButton.focus();
    else if (!coarse && !yourNameInput.disabled) yourNameInput.focus();
    else closeButton.focus();
  }

  okButton.addEventListener('click', signupWindow.close);

  backButton.addEventListener('click', function () {
    openList(current && current.id, '');
  });

  dialog.addEventListener('close', function () {
    // The event comes a moment after the window closes. If it has been opened again by
    // then, leave that opening's message, spots, count and announcement be.
    if (dialog.open) return;
    if (!paying) setMessage('');
    clearInvalid();
    quantity = 1;
    stopCount();
    heard = null;
    announce('');
    setMode('');
  });

  /* ---------- Paying ---------- */

  function remember(id) {
    try {
      window.sessionStorage.setItem(RETURN_KEY, id);
    } catch (error) {
      // Without storage, the message on the way back shows in the Workshops window.
    }
  }

  function recall() {
    try {
      var id = window.sessionStorage.getItem(RETURN_KEY);
      window.sessionStorage.removeItem(RETURN_KEY);
      return id;
    } catch (error) {
      return null;
    }
  }

  // Clear an earlier error once the visitor carries on filling in the form.
  function edited() {
    clearInvalid();
    if (!paying && messageEl.textContent) setMessage('');
  }

  fields.forEach(function (field) {
    field.addEventListener('input', edited);
  });

  friendCheck.addEventListener('change', function () {
    showFriend();
    edited();
  });

  // − and +. At a limit the button greys out: the focus moves to the other one.
  function step(button, other, by) {
    var focused = document.activeElement === button;
    quantity += by;
    render();
    if (focused && button.disabled) {
      if (!other.disabled) other.focus({ preventScroll: true });
      else keepFocus();
    }
  }

  lessButton.addEventListener('click', function () {
    step(lessButton, moreButton, -1);
  });

  moreButton.addEventListener('click', function () {
    step(moreButton, lessButton, 1);
  });

  // Fewer spots are left than the order was for: the window's count, the list and the
  // button take the new number, and the order comes down to it.
  function fewerLeft(w, left) {
    var spots = spotsById[w.id];
    spotsById[w.id] = { capacity: spots ? spots.capacity : Math.max(QUANTITY_MAX, left), remaining: left };
    stopCount();
    heard = left;
    if (current === w) quantity = Math.min(quantity, left);
    renderAll();
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    var w = current;
    if (paying || !w || availabilityOf(w) !== 'open') return;

    clearInvalid();
    // The same checks as the server's, in the form's order.
    var name = cleanName(yourNameInput.value);
    var email = emailInput.value.trim();
    var forFriend = friendCheck.checked;
    var friendName = forFriend ? cleanName(friendInput.value) : '';
    var max = quantityMax();
    if (!name) {
      markInvalid(yourNameInput, 'Please enter your name.');
      return;
    }
    if (name.length > NAME_MAX) {
      markInvalid(yourNameInput, 'Please shorten your name to ' + NAME_MAX + ' characters or fewer.');
      return;
    }
    if (!email) {
      markInvalid(emailInput, 'Please enter your email address.');
      return;
    }
    if (!emailInput.checkValidity() || !isEmail(email)) {
      markInvalid(emailInput, 'Please check your email address: it should look like you@example.com.');
      return;
    }
    if (forFriend && !friendName) {
      markInvalid(friendInput, 'Please enter your friend’s name, or untick “Buying for a friend”.');
      return;
    }
    if (friendName.length > NAME_MAX) {
      markInvalid(friendInput, 'Please shorten your friend’s name to ' + NAME_MAX + ' characters or fewer.');
      return;
    }
    if (quantity !== Math.floor(quantity) || quantity < 1 || quantity > max) {
      setMessage('Please choose from 1 to ' + max + ' spots.', 'error');
      return;
    }

    var body = { workshop: w.id, email: email, name: name, quantity: quantity };
    if (forFriend) body.friendName = friendName;

    setMessage('');
    setPaying(true);

    request('POST', body).then(function (result) {
      var data = result.data && typeof result.data === 'object' ? result.data : {};
      var url = result.ok ? checkoutUrl(data.url) : '';
      if (url) {
        // Off to Stripe; the button keeps saying "Opening Stripe…" while the page goes.
        remember(w.id);
        window.location.href = url;
        return;
      }
      setPaying(false);
      var left = data.error === 'not_enough_spots' ? data.remaining : null;
      var leftKnown = typeof left === 'number' && left >= 0 && left === Math.floor(left);
      if (data.error === 'invalid_name') {
        markInvalid(yourNameInput, 'Please check your name: it can be up to ' + NAME_MAX + ' characters.');
      } else if (data.error === 'invalid_email') {
        markInvalid(emailInput, 'Stripe needs a working email address: please check yours.');
      } else if (data.error === 'invalid_friend_name' && forFriend) {
        markInvalid(friendInput, 'Please check your friend’s name: it can be up to ' + NAME_MAX + ' characters.');
      } else if (data.error === 'invalid_quantity') {
        setMessage('That many spots can’t go in one order. Please choose fewer; nothing was charged.', 'error');
      } else if (leftKnown && left > 0) {
        fewerLeft(w, left);
        setMessage('Sorry, only ' + countText(left) + ', so the order is now for × ' + left +
          '. Nothing was charged.', 'error');
      } else if (data.error === 'not_enough_spots' && !leftKnown) {
        loadSpots();
        setMessage('Fewer spots are left than that. Please choose fewer; nothing was charged.', 'error');
      } else if (data.error === 'already_signed_up') {
        setMessage('That email is already signed up for this workshop, so there’s nothing to pay. Look for the Stripe receipt in its inbox.', 'error');
      } else if (data.error === 'full' || leftKnown) {
        var spots = spotsById[w.id];
        spotsById[w.id] = { capacity: spots ? spots.capacity : 10, remaining: 0 };
        stopCount();
        heard = 0;
        renderAll();
        setMessage('Sorry, the last spot has just gone. Nothing was charged.', 'error');
      } else if (data.error === 'workshop_past' || data.error === 'unknown_workshop') {
        setMessage('Sign-ups for this workshop have closed. Nothing was charged.', 'error');
      } else {
        console.warn('Workshop checkout could not be started:', result.status, data);
        setMessage('Something went wrong on our side and nothing was charged. Please try again in a moment.', 'error');
      }
    }, function (error) {
      setPaying(false);
      console.warn('Workshop checkout could not be started:', error);
      setMessage(error && error.name === 'AbortError'
        ? 'The sign-up server took too long to answer. Nothing was charged; please try again.'
        : 'Couldn’t reach the sign-up server. Nothing was charged; please check your connection and try again.', 'error');
    }).finally(keepFocus);
  });

  // Coming back from Stripe with the Back button can restore the page as it was left,
  // still "Opening Stripe…": start again from the form.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted && paying) setPaying(false);
  });

  /* ---------- Start ---------- */

  // Back from Stripe: take ?workshop= out of the address (keeping the rest), then
  // open the workshop's window with the news.
  function takeReturn() {
    var value = new URLSearchParams(window.location.search).get('workshop');
    if (value === null) return '';
    if (window.history && typeof window.history.replaceState === 'function') {
      try {
        var url = new URL(window.location.href);
        url.searchParams.delete('workshop');
        window.history.replaceState(window.history.state, '', url.href);
      } catch (error) {
        // Some sandboxed frames refuse replaceState; the message still shows.
      }
    }
    return isKind(value) ? value : '';
  }

  renderAll();

  var returned = takeReturn();
  if (returned) {
    var paidFor = find(recall(), upcoming());
    if (paidFor) openSignup(paidFor, returned);
    else openList(null, returned);
  }

  // For the workshop calendar (calendar.js): the workshops, past ones too, the sign-up
  // window (which closes the Workshops window), and setCalendar, which takes its
  // drawing, run each time the Workshops window opens. If the window is open already
  // (back from Stripe, before calendar.js ran), the month is drawn into it at once.
  window.studioWorkshops = {
    all: function () { return WORKSHOPS.slice(); },
    today: studioToday,
    upcoming: upcoming,
    find: find,
    openSignup: openSignup,
    setCalendar: function (draw) {
      drawCalendar = draw;
      if (listDialog.open) draw();
    }
  };
})();
