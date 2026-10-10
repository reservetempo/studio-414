/*
  Workshop sign-up for Studio 414: "Paint a piece", Saturday 7 November 2026, for 10
  people at most, $59.99 CAD, paid with Stripe Checkout.

  - The flashy button fixed at the top right of the screen (#workshop-button) opens the
    sign-up window (#workshop): a modal <dialog> drawn as a 90s window like the boxes
    (boxes.css, workshop.css). It closes with its close button, Escape or a click
    outside it. Its title bar drags it, and on the title bar the arrow keys move it,
    as on the boxes (it isn't one of boxes.js's boxes: it is opened fresh, centred,
    each time, and nothing about it is remembered).
  - The spots come from the workshop-checkout Edge Function of the Supabase project
    set in comments-config.js (the same URL and anon / publishable key):
      GET  <supabaseUrl>/functions/v1/workshop-checkout
           -> 200 { capacity, taken, remaining }
      POST the same, { email }
           -> 200 { url }: Stripe Checkout, where the visitor is sent to pay
              400 { error: "invalid_email" }
              409 { error: "already_signed_up" } or { error: "full" }
              500 { error: "server_error" }
    They are fetched each time the window opens. Until they can be (the function isn't
    deployed yet, or the network is down) the window says sign-ups aren't open yet and
    the pay button stays off. Once sold out, the form is off and the button at the top
    right says so too.
  - Stripe sends the visitor back to /?workshop=success, or to /?workshop=cancelled if
    they leave the checkout. Either one opens the window on load, with a thank-you or a
    "nothing was charged" message, and the parameter is taken out of the address (any
    others, such as ?font= and ?color=, stay).
*/
(function () {
  'use strict';

  var REQUEST_TIMEOUT_MS = 15000;
  var EMAIL_MAX = 254;
  var STEP = 10;
  var KEYS = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  };

  // Pixel icons for the message after Stripe (16 x 16, drawn like the title-bar icons):
  // a disc with a tick cut out of it, and a disc with an "i".
  var ICONS = {
    success: 'M5 0h6v1H5zM3 1h10v1H3zM2 2h12v1H2zM1 3h14v2H1zM0 5h16v6H0zM1 11h14v2H1zM2 13h12v1H2zM3 14h10v1H3zM5 15h6v1H5z' +
      'M11 5h2v1h-2zM10 6h2v1h-2zM3 7h2v1H3zM9 7h2v1H9zM4 8h2v1H4zM8 8h2v1H8zM5 9h4v1H5zM6 10h2v1H6z',
    cancelled: 'M5 0h6v1H5zM3 1h10v1H3zM2 2h12v1H2zM1 3h14v2H1zM0 5h16v6H0zM1 11h14v2H1zM2 13h12v1H2zM3 14h10v1H3zM5 15h6v1H5z' +
      'M7 3h2v2H7zM6 6h3v1H6zM7 7h2v4H7zM6 11h4v1H6z'
  };

  var MESSAGES = {
    success: {
      title: 'You’re in! See you on 7 November.',
      text: 'Thanks for signing up to Paint a piece. Stripe has emailed you a receipt.'
    },
    cancelled: {
      title: 'Payment cancelled, nothing was charged.',
      text: 'Your spot isn’t booked. You can try again below.'
    }
  };

  var root = document.documentElement;
  var launcher = document.getElementById('workshop-button');
  var dialog = document.getElementById('workshop');
  // Without <dialog> support the button stays hidden.
  if (!launcher || !dialog || typeof dialog.showModal !== 'function') return;

  var launcherLabel = document.getElementById('workshop-button-label');
  var titlebar = dialog.querySelector('.box__titlebar');
  var closeButton = document.getElementById('workshop-close');
  var resultEl = document.getElementById('workshop-result');
  var resultIcon = document.getElementById('workshop-result-icon');
  var resultTitle = document.getElementById('workshop-result-title');
  var resultText = document.getElementById('workshop-result-text');
  var spotsEl = document.getElementById('workshop-spots');
  var form = document.getElementById('workshop-form');
  var emailInput = document.getElementById('workshop-email');
  var payButton = document.getElementById('workshop-pay');
  var messageEl = document.getElementById('workshop-message');
  var noteEl = document.getElementById('workshop-note');
  var okButton = document.getElementById('workshop-ok');
  var PAY_TEXT = payButton.textContent;

  var config = window.COMMENTS_CONFIG || {};
  var supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/+$/, '');
  var supabaseKey = String(config.supabaseAnonKey || '').trim();
  var endpoint = supabaseUrl && supabaseKey ? supabaseUrl + '/functions/v1/workshop-checkout' : '';

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

  // { capacity, remaining } from the GET answer, or null if it doesn't make sense.
  function readSpots(data) {
    if (!data || typeof data !== 'object') return null;
    var capacity = Number(data.capacity);
    var remaining = data.remaining != null ? Number(data.remaining) : capacity - Number(data.taken);
    if (!isFinite(capacity) || !isFinite(remaining) || capacity < 0) return null;
    capacity = Math.round(capacity);
    return { capacity: capacity, remaining: Math.max(0, Math.min(capacity, Math.round(remaining))) };
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

  /* ---------- State and rendering ---------- */

  var availability = 'loading';   // 'loading', 'open', 'soldout' or 'unavailable'
  var spots = null;               // the last { capacity, remaining } fetched
  var paying = false;
  var mode = '';                  // '', or 'success' / 'cancelled' after Stripe
  var loadId = 0;

  function spotsText() {
    if (availability === 'loading') return 'Checking spots…';
    if (availability === 'unavailable') return 'Sign-ups aren’t open yet, check back soon.';
    if (availability === 'soldout') {
      return spots ? 'Sold out: all ' + spots.capacity + ' spots are taken.' : 'Sold out.';
    }
    return spots.remaining + ' of ' + spots.capacity + ' spots left';
  }

  function render() {
    var text = spotsText();
    // Only when it changes, so screen readers hear it once.
    if (spotsEl.textContent !== text) spotsEl.textContent = text;
    spotsEl.dataset.state = availability;

    var soldOut = availability === 'soldout';
    emailInput.disabled = soldOut;
    payButton.disabled = paying || availability !== 'open';
    payButton.textContent = paying ? 'Opening Stripe…' : PAY_TEXT;
    if (paying) payButton.setAttribute('aria-busy', 'true');
    else payButton.removeAttribute('aria-busy');

    // The button at the top right: "Sold out" once it is.
    launcherLabel.textContent = soldOut ? 'Sold out' : 'Workshop';
    launcher.setAttribute('aria-label', soldOut ? 'Workshop sold out' : 'Workshop sign-up');
    if (soldOut) launcher.dataset.state = 'soldout';
    else delete launcher.dataset.state;
  }

  function setAvailability(next) {
    availability = next;
    render();
  }

  // Disabling the focused control (the field once sold out, the pay button while
  // paying) drops focus to the page; put it back in the window.
  function keepFocus() {
    var active = document.activeElement;
    if (dialog.open && !paying && (!active || active === document.body || active.disabled)) {
      (payButton.disabled ? closeButton : payButton).focus({ preventScroll: true });
    }
  }

  function loadSpots() {
    var id = ++loadId;
    if (!endpoint) {
      setAvailability('unavailable');
      return;
    }
    setAvailability('loading');
    request('GET').then(function (result) {
      if (id !== loadId) return;
      var next = result.ok ? readSpots(result.data) : null;
      if (next) spots = next;
      setAvailability(next ? (next.remaining > 0 ? 'open' : 'soldout') : 'unavailable');
      keepFocus();
    }, function () {
      // Not open yet, or offline: the window says so. The failed request itself is
      // all the console needs.
      if (id === loadId) setAvailability('unavailable');
    });
  }

  function setMessage(text, state) {
    messageEl.textContent = text;
    if (state) messageEl.dataset.state = state;
    else delete messageEl.dataset.state;
  }

  function markInvalid(text) {
    emailInput.setAttribute('aria-invalid', 'true');
    setMessage(text, 'error');
    emailInput.focus();
  }

  function clearInvalid() {
    emailInput.removeAttribute('aria-invalid');
  }

  function setPaying(state) {
    paying = state;
    render();
  }

  // The thank-you or "cancelled" box at the top of the window, or none. After a
  // payment there is nothing left to fill in, so the form makes way for an OK button.
  function setMode(next) {
    mode = next;
    var message = MESSAGES[mode];
    resultEl.hidden = !message;
    if (message) {
      resultIcon.innerHTML = '<path fill="currentColor" fill-rule="evenodd" d="' + ICONS[mode] + '"/>';
      resultTitle.textContent = message.title;
      resultText.textContent = message.text;
      dialog.setAttribute('aria-describedby', 'workshop-result');
    } else {
      dialog.removeAttribute('aria-describedby');
    }
    var done = mode === 'success';
    spotsEl.hidden = done;
    form.hidden = done;
    noteEl.hidden = done;
    okButton.hidden = !done;
  }

  /* ---------- Opening and closing ---------- */

  function open(next) {
    setMode(next || '');
    if (dialog.open) return;
    unmove();
    dialog.showModal();
    if (mode !== 'success') loadSpots();
    // Into the form with a keyboard or a mouse; on a touch screen, where that would
    // bring up the keyboard over the window, onto the close button instead.
    var coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
    if (mode === 'success') okButton.focus();
    else if (!coarse && !emailInput.disabled) emailInput.focus();
    else closeButton.focus();
  }

  function close() {
    if (dialog.open) dialog.close();
  }

  launcher.addEventListener('click', function () {
    open('');
  });

  closeButton.addEventListener('click', close);
  okButton.addEventListener('click', close);

  // A click on the dimmed page around the window (the dialog's backdrop) closes it.
  dialog.addEventListener('click', function (event) {
    if (event.target !== dialog) return;
    var r = dialog.getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right ||
        event.clientY < r.top || event.clientY > r.bottom) {
      close();
    }
  });

  dialog.addEventListener('close', function () {
    if (drag) endDrag(true);
    loadId++;
    if (!paying) setMessage('');
    clearInvalid();
    setMode('');
  });

  /* ---------- Paying ---------- */

  emailInput.addEventListener('input', function () {
    clearInvalid();
    // Clear an earlier error once the visitor carries on typing.
    if (!paying && messageEl.textContent) setMessage('');
  });

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (paying || availability !== 'open') return;

    clearInvalid();
    var email = emailInput.value.trim();
    if (!email) {
      markInvalid('Please enter your email address.');
      return;
    }
    if (!emailInput.checkValidity() || !isEmail(email)) {
      markInvalid('Please check your email address: it should look like you@example.com.');
      return;
    }

    setMessage('');
    setPaying(true);

    request('POST', { email: email }).then(function (result) {
      var data = result.data && typeof result.data === 'object' ? result.data : {};
      var url = result.ok ? checkoutUrl(data.url) : '';
      if (url) {
        // Off to Stripe; the button keeps saying "Opening Stripe…" while the page goes.
        window.location.href = url;
        return;
      }
      setPaying(false);
      if (data.error === 'invalid_email') {
        markInvalid('Stripe needs a working email address: please check yours.');
      } else if (data.error === 'already_signed_up') {
        setMessage('That email is already signed up for this workshop, so there’s nothing to pay. Look for the Stripe receipt in its inbox.', 'error');
      } else if (data.error === 'full') {
        spots = { capacity: spots ? spots.capacity : 10, remaining: 0 };
        setAvailability('soldout');
        setMessage('Sorry, the last spot has just gone. Nothing was charged.', 'error');
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

  /* ---------- Moving the window by its title bar, as the boxes move ---------- */

  var drag = null;

  // A drag handle over the title bar, as boxes.js gives the boxes (boxes.css).
  var handle = document.createElement('button');
  handle.type = 'button';
  handle.className = 'box__handle';
  handle.setAttribute('aria-label', 'Move the workshop sign-up window');
  handle.title = 'Drag to move. Arrow keys move it.';
  titlebar.insertBefore(handle, closeButton);

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  // Keeps the window wholly on screen (or, if it is taller than the screen, at the top).
  function moveTo(x, y) {
    var w = dialog.offsetWidth;
    var h = dialog.offsetHeight;
    dialog.classList.add('is-moved');
    dialog.style.left = Math.round(clamp(x, 0, Math.max(0, root.clientWidth - w))) + 'px';
    dialog.style.top = Math.round(clamp(y, 0, Math.max(0, window.innerHeight - h))) + 'px';
  }

  function unmove() {
    dialog.classList.remove('is-moved');
    dialog.style.removeProperty('left');
    dialog.style.removeProperty('top');
  }

  function corner() {
    var r = dialog.getBoundingClientRect();
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
      wasMoved: dialog.classList.contains('is-moved')
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
  dialog.addEventListener('cancel', function (event) {
    if (!drag) return;
    event.preventDefault();
    endDrag(true);
  });

  // Keep a moved window on screen when the browser window is resized or rotated.
  window.addEventListener('resize', function () {
    if (dialog.open && dialog.classList.contains('is-moved') && !drag) {
      var p = corner();
      moveTo(p.x, p.y);
    }
  });

  /* ---------- Start ---------- */

  // Back from Stripe: take ?workshop= out of the address (keeping the rest), then
  // open the window with the news.
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
    return MESSAGES[value] ? value : '';
  }

  launcher.hidden = false;
  render();

  var returned = takeReturn();
  if (returned) open(returned);
})();
