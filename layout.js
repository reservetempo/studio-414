/*
  The site layout: how the owners arranged the public site on the preview page
  (preview.html), which is every visitor's starting layout: the photo's size, where
  the mailing-list card, the big 414 and the comment section start, the 414's text,
  and whether the comment section is shown. Visitors can still drag the card and the
  414 for themselves (boxes.js, "studio414.layout"), and that wins; they can't move
  the comment section.

  It is the "layout" row of the Supabase table site_settings (see supabase/layout.sql),
  read with the publishable key in comments-config.js. No row means today's CSS
  layout exactly, and so does any part left out of the value.

  The value. Every part is optional, and {} is the same as no row:

    {
      "photo":    { "scale": 0.8 },
      "card":     { "x": 0.34, "y": 0.86, "w": 0.32, "h": 0.3 },
      "big414":   { "x": 0.18, "y": -0.2, "w": 0.64 },
      "comments": { "x": 0.6, "y": 0.1, "w": 0.3, "h": 0.5 },
      "big414Text": "SALE",
      "commentsHidden": true
    }

    photo.scale  the photo's width, as a share of the hero's width: 0.25 to 2. 1 is
                 the CSS layout (the full width). The photo keeps its proportions and
                 stays centred in the hero (--photo-scale in styles.css).
    card         the mailing-list card (#signup): x, y its top-left corner, w, h its
                 width and height.
    big414       the big 414's box (#big-414): x, y its top-left corner, w its width.
                 Its height follows from its font, so it keeps its shape.
    comments     the comment section (#comments) where it floats over the first
                 screen: x, y its top-left corner, w, h its width and height, exactly
                 like card. Where it sits under the first screen (phones) it is not
                 used. Left out: its CSS spot.
    big414Text   the text shown in place of the big 414: a string of 1 to 20
                 characters (Unicode code points), on one line: no control characters
                 (U+0000-U+001F, U+007F-U+009F) and no U+2028 or U+2029. It is stored
                 trimmed: text that starts or ends with white space (what JavaScript's
                 trim() removes) is refused, so trim it before saving. Left out: 414.
    commentsHidden  true hides the comment section from visitors (its comments are
                 kept). Only true is allowed; left out: shown.
  No other keys, and all the numbers of a part are there. x and y run from -10 to
  10, w and h from above 0 up to 10 (they are fractions, see below, and a box may lie
  outside the photo).

  Positions and sizes are fractions of the FRAME: the visible photo, that is the
  photo (at its scale, centred) clipped to the hero (.hero, the first screen). x and
  w are fractions of the frame's width, from its left edge; y and h of its height,
  from its top edge. In page coordinates (px from the top-left corner of the page):
    left  = frame.left + x * frame.width      width  = w * frame.width
    top   = frame.top  + y * frame.height     height = h * frame.height
  On a screen wider than the photo (in proportion) the photo runs past the top and
  bottom of the hero, so the frame is the whole height of the hero; on a narrower
  one (a phone) it is the band of photo across the middle. So the 414 stays on the
  photo's window and the card on its bottom edge on every screen, as the CSS layout
  keeps them. frame(), toPage() and fromPage() below do these sums. The boxes still
  have to be fitted to the screen and to their content when placed (boxes.js).

  This file is loaded in <head>, without defer or async (after look.js). While the
  page is still being parsed, so before first paint, it applies the copy kept in
  localStorage under "studio414.siteLayout" (or nothing: the CSS layout). It applies
  only the photo's size itself (--photo-scale on <html>); the card and the 414 are
  placed from current() by boxes.js. Once the page has loaded it fetches the row,
  keeps the copy (or forgets it when no row is saved) and, unless another script has
  already called apply(), switches to it if it differs. If the request fails it
  leaves everything as it is. ?edit=1 (the preview page's frame) changes nothing here.

  window.studio414SiteLayout:
    KEY        the localStorage key of the copy
    valid(v)   true for a value of the shape above
    current()  a copy of the layout in force, or null for the CSS layout
    apply(v)   switches the page to v (null: the CSS layout) at once, and sends
               "studio414:sitelayout" on document ({ detail: { layout: current() } });
               false if invalid. Live, for the preview page.
    save(v)    keeps v as the copy (null forgets it); false if invalid
    frame()    the frame now, { left, top, width, height } in page px, or null
    toPage(b)  a part ({ x, y, w } or { x, y, w, h }) in page px, or null
    fromPage(r)  page px ({ x, y, w } or { x, y, w, h }) as a part's fractions, or null
  "studio414:sitelayout" is also sent when the fetched layout replaces the copy's.
*/
(function () {
  'use strict';

  var REQUEST_TIMEOUT_MS = 15000;
  var html = document.documentElement;
  var has = Object.prototype.hasOwnProperty;

  function inRange(n, lo, hi) { return typeof n === 'number' && isFinite(n) && n >= lo && n <= hi; }
  function position(n) { return inRange(n, -10, 10); }
  function size(n) { return inRange(n, 0, 10) && n > 0; }

  // Each part's keys, in order, and the check of its numbers.
  var PARTS = {
    photo: { keys: ['scale'], check: function (p) { return inRange(p.scale, 0.25, 2); } },
    card: {
      keys: ['x', 'y', 'w', 'h'],
      check: function (c) { return position(c.x) && position(c.y) && size(c.w) && size(c.h); }
    },
    big414: {
      keys: ['x', 'y', 'w'],
      check: function (b) { return position(b.x) && position(b.y) && size(b.w); }
    },
    comments: {
      keys: ['x', 'y', 'w', 'h'],
      check: function (c) { return position(c.x) && position(c.y) && size(c.w) && size(c.h); }
    }
  };

  // The other keys (not objects), in order, and their checks.
  var FLAGS = {
    big414Text: function (t) { return typeof t === 'string' && goodText(t); },
    commentsHidden: function (h) { return h === true; }
  };

  // The checks of big414Text; supabase/layout.sql makes exactly the same ones.
  var SURROGATE_PAIR = /[\uD800-\uDBFF][\uDC00-\uDFFF]/g;
  var LONE_SURROGATE = /[\uD800-\uDFFF]/;
  // Control characters (C0, DEL, C1) and the line and paragraph separators.
  var NOT_ONE_LINE = /[\u0000-\u001F\u007F-\u009F\u2028\u2029]/;
  // White space at either end: what String.prototype.trim() removes that is left once
  // the characters above are refused (the space separators and U+FEFF).
  var UNTRIMMED = /^[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]|[ \u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\uFEFF]$/;

  function goodText(t) {
    var single = t.replace(SURROGATE_PAIR, '_'); // one unit per code point, as Postgres counts
    return single.length >= 1 && single.length <= 20 &&
      !LONE_SURROGATE.test(single) && !NOT_ONE_LINE.test(t) && !UNTRIMMED.test(t);
  }

  function isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }
  // v has no keys but these.
  function only(v, keys) {
    for (var k in v) if (has.call(v, k) && keys.indexOf(k) < 0) return false;
    return true;
  }

  var KEYS = Object.keys(PARTS).concat(Object.keys(FLAGS));

  function valid(v) {
    if (!isObject(v) || !only(v, KEYS)) return false;
    for (var name in PARTS) {
      if (!has.call(v, name)) continue;
      var part = v[name];
      if (!isObject(part) || !only(part, PARTS[name].keys) || !PARTS[name].check(part)) return false;
    }
    for (var flag in FLAGS) {
      if (has.call(v, flag) && !FLAGS[flag](v[flag])) return false;
    }
    return true;
  }

  // A clean copy of a valid value (its parts, keys in order, then big414Text and
  // commentsHidden), or null when it has none.
  function copy(v) {
    if (!v) return null;
    var out = {};
    var any = false;
    for (var name in PARTS) {
      if (!has.call(v, name)) continue;
      out[name] = {};
      for (var i = 0; i < PARTS[name].keys.length; i++) {
        out[name][PARTS[name].keys[i]] = v[name][PARTS[name].keys[i]];
      }
      any = true;
    }
    for (var flag in FLAGS) {
      if (!has.call(v, flag)) continue;
      out[flag] = v[flag];
      any = true;
    }
    return any ? out : null;
  }

  var layout = null; // the layout in force (a clean copy), or null
  var touched = false; // apply() was called: the fetched layout no longer overrides it

  function scale() { return layout && layout.photo ? layout.photo.scale : 1; }

  // Sets the photo's size from layout (the CSS default, 1, needs nothing on <html>).
  function setPhoto() {
    if (scale() === 1) html.style.removeProperty('--photo-scale');
    else html.style.setProperty('--photo-scale', String(scale()));
  }

  // Switches to v (valid, or null) and tells the page.
  function show(v) {
    layout = copy(v);
    setPhoto();
    var event;
    try {
      event = new CustomEvent('studio414:sitelayout', { detail: { layout: api.current() } });
    } catch (e) {
      return; // a very old browser: the photo still changes
    }
    document.dispatchEvent(event);
  }

  function read() {
    try {
      var saved = JSON.parse(localStorage.getItem(api.KEY));
      return valid(saved) ? saved : null;
    } catch (e) {
      return null; // no copy yet, or no localStorage
    }
  }

  var api = window.studio414SiteLayout = {
    KEY: 'studio414.siteLayout',
    valid: valid,
    current: function () {
      return copy(layout);
    },
    apply: function (v) {
      if (v !== null && !valid(v)) return false;
      touched = true;
      show(v);
      return true;
    },
    save: function (v) {
      if (v !== null && !valid(v)) return false;
      var clean = copy(v);
      try {
        if (clean) localStorage.setItem(api.KEY, JSON.stringify(clean));
        else localStorage.removeItem(api.KEY);
      } catch (e) { /* no localStorage: the layout still shows, just not before first paint */ }
      return true;
    },
    frame: function () {
      var hero = document.querySelector('.hero');
      if (!hero) return null;
      var r = hero.getBoundingClientRect();
      var style = getComputedStyle(html);
      var bgWidth = parseFloat(style.getPropertyValue('--bg-width'));
      var bgHeight = parseFloat(style.getPropertyValue('--bg-height'));
      // The photo in the hero, as styles.css draws it (--photo-w, -h, -x, -y).
      var w = r.width * scale();
      var h = bgWidth > 0 && bgHeight > 0 ? w * bgHeight / bgWidth : r.height;
      var x = (r.width - w) / 2;
      var y = (r.height - h) / 2;
      // Clipped to the hero.
      var left = Math.max(0, x);
      var top = Math.max(0, y);
      var width = Math.min(r.width, x + w) - left;
      var height = Math.min(r.height, y + h) - top;
      if (!(width > 0 && height > 0)) return null;
      return {
        left: r.left + window.pageXOffset + left,
        top: r.top + window.pageYOffset + top,
        width: width,
        height: height
      };
    },
    toPage: function (b) {
      var f = api.frame();
      if (!f || !b) return null;
      var out = { x: f.left + b.x * f.width, y: f.top + b.y * f.height, w: b.w * f.width };
      if (typeof b.h === 'number') out.h = b.h * f.height;
      return out;
    },
    fromPage: function (r) {
      var f = api.frame();
      if (!f || !r) return null;
      var out = { x: (r.x - f.left) / f.width, y: (r.y - f.top) / f.height, w: r.w / f.width };
      if (typeof r.h === 'number') out.h = r.h / f.height;
      return out;
    }
  };

  // Before first paint: the copy, else the CSS layout.
  layout = copy(read());
  setPhoto();

  // After load: fetch the saved layout, keep the copy, and switch to it if it differs.
  function sync() {
    var config = window.COMMENTS_CONFIG || {};
    var supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/+$/, '');
    var supabaseKey = String(config.supabaseAnonKey || '').trim();
    if (!supabaseUrl || !supabaseKey || typeof fetch !== 'function') return;

    function use(value) {
      api.save(value);
      if (touched) return;
      if (JSON.stringify(copy(value)) !== JSON.stringify(layout)) show(value);
    }

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var headers = { apikey: supabaseKey, Accept: 'application/json' };
    // The legacy anon key is a JWT (eyJ...) and goes in Authorization as well (as in comments.js).
    if (/^eyJ/.test(supabaseKey)) headers.Authorization = 'Bearer ' + supabaseKey;

    fetch(supabaseUrl + '/rest/v1/site_settings?key=eq.layout&select=value', {
      headers: headers,
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Layout request failed: ' + response.status);
        return response.json();
      })
      .then(function (rows) {
        if (!Array.isArray(rows)) return;
        var value = rows.length ? rows[0] && rows[0].value : null;
        // No row, or a value this site doesn't understand: the CSS layout.
        use(valid(value) ? value : null);
      })
      .catch(function () { /* offline or Supabase unreachable: leave the layout as it is */ })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
