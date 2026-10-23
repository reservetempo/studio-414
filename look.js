/*
  The site look: the theme and the colour the owners picked for the whole site, on the
  public site (index.html) and the owner page (admin.html).

  It is the "look" row of the Supabase table site_settings (see supabase/look.sql),
  read with the publishable key in comments-config.js:
    { "theme": "<id>", "color": <0-20> }
  No row means Aqua and Classic (0). The theme is one of THEMES below; Aqua is the base
  CSS and has no file, every other theme is themes/<id>.css (see themes/README.md). The
  colour is data-color="N" on <html> (0 "Classic" in aqua.css, 1-20 in colors.css).

  This file is loaded in <head>, without defer or async, after the stylesheets. While
  the page is still being parsed, so before first paint, it:
  - sets data-theme and data-color on <html>, from ?theme= and ?color= in the URL (a
    preview: it isn't saved or kept), else from the copy kept in localStorage under
    "studio414.look", else Aqua and 0. A part missing or invalid in the URL comes from
    the copy (or the default);
  - writes in the active theme's stylesheet, after the base CSS, so the page never
    paints as Aqua first. Aqua loads nothing.
  Once the page has loaded it fetches the row, keeps the copy (or forgets it when no
  row is saved) and, unless the URL is a preview or another script has already
  switched the look, switches the page to it if it differs. If the request fails it
  leaves everything as it is.

  window.studio414Look is for the owner page's Look picker:
    THEMES     [{ id, name }], the six themes in order
    COLORS     the 21 colour names, 0 "Classic" to 20 "Raku"
    KEY        the localStorage key of the copy
    DEFAULT    { theme: 'aqua', color: 0 }
    preview    true when the URL has a valid ?theme= or ?color=
    valid(v)   true for { theme: one of the ids, color: a whole number 0-20 }
    current()  the { theme, color } on the page now
    apply(v)   switches the page to v (attributes and theme stylesheet); false if invalid
    save(v)    keeps v as the copy (null forgets it); false if invalid
*/
(function () {
  'use strict';

  var REQUEST_TIMEOUT_MS = 15000;
  var html = document.documentElement;

  var THEMES = [
    { id: 'aqua', name: 'Aqua' },
    { id: 'win98', name: 'Windows 98' },
    { id: 'system6', name: 'Mac System 6' },
    { id: 'nes', name: 'NES' },
    { id: 'psone', name: 'PlayStation' },
    { id: 'dos', name: 'DOS' }
  ];
  // 0 is in aqua.css, 1 to 20 in colors.css (the numbered comments there).
  var COLORS = [
    'Classic', 'Vermilion', 'Saffron', 'Chartreuse', 'Malachite', 'Verdigris', 'Cerulean',
    'Klein Blue', 'Wisteria', 'Fuchsia', 'Flamingo', 'Oxblood', 'Tangerine', 'Umber',
    'Olive', 'Turquoise', 'Teal', 'Ultraviolet', 'Hot Pink', 'Porcelain', 'Raku'
  ];

  function isTheme(id) {
    for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return true;
    return false;
  }
  function isColor(n) {
    return typeof n === 'number' && n % 1 === 0 && n >= 0 && n < COLORS.length;
  }
  // A colour from the URL ("6"), as a number, or null.
  function urlColor(value) {
    value = String(value).trim();
    return /^(0|[1-9][0-9]?)$/.test(value) && isColor(Number(value)) ? Number(value) : null;
  }

  // The theme stylesheets on the page carry data-look-theme="<id>".
  function themeLinks() {
    return document.querySelectorAll('link[data-look-theme]');
  }
  function linkTag(id) {
    return '<link rel="stylesheet" href="themes/' + id + '.css" data-look-theme="' + id + '">';
  }

  var pending = 0; // bumped by every switch, so only the latest one finishes
  var touched = false; // apply() was called: the fetched look no longer overrides it

  // Switches the page to look (valid). A theme file is loaded first and only then are
  // the attributes set and the other theme files dropped, so nothing paints unstyled.
  function show(look) {
    var token = ++pending;
    function finish() {
      if (token !== pending) return;
      html.setAttribute('data-theme', look.theme);
      html.setAttribute('data-color', String(look.color));
      var links = themeLinks();
      for (var i = 0; i < links.length; i++) {
        if (links[i].getAttribute('data-look-theme') !== look.theme && links[i].parentNode) {
          links[i].parentNode.removeChild(links[i]);
        }
      }
    }
    if (look.theme === 'aqua' ||
        (html.getAttribute('data-theme') === look.theme &&
         document.querySelector('link[data-look-theme="' + look.theme + '"]'))) {
      finish();
      return;
    }
    var link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'themes/' + look.theme + '.css';
    link.setAttribute('data-look-theme', look.theme);
    link.onload = link.onerror = finish;
    document.head.appendChild(link);
  }

  function read() {
    try {
      var copy = JSON.parse(localStorage.getItem(api.KEY));
      return api.valid(copy) ? copy : null;
    } catch (e) {
      return null; // no copy yet, or no localStorage
    }
  }

  var api = window.studio414Look = {
    THEMES: THEMES,
    COLORS: COLORS,
    KEY: 'studio414.look',
    DEFAULT: { theme: 'aqua', color: 0 },
    preview: false,
    valid: function (v) {
      return !!v && typeof v === 'object' && isTheme(v.theme) && isColor(v.color);
    },
    current: function () {
      var theme = html.getAttribute('data-theme');
      var color = urlColor(html.getAttribute('data-color'));
      return {
        theme: isTheme(theme) ? theme : api.DEFAULT.theme,
        color: color === null ? api.DEFAULT.color : color
      };
    },
    apply: function (v) {
      if (!api.valid(v)) return false;
      touched = true;
      show({ theme: v.theme, color: v.color });
      return true;
    },
    save: function (v) {
      if (v !== null && !api.valid(v)) return false;
      try {
        if (v) localStorage.setItem(api.KEY, JSON.stringify({ theme: v.theme, color: v.color }));
        else localStorage.removeItem(api.KEY);
      } catch (e) { /* no localStorage: the look still shows, just not before first paint */ }
      return true;
    }
  };

  // Before first paint: the URL's preview, else the copy, else the default.
  var params = new URLSearchParams(location.search);
  var saved = read() || api.DEFAULT;
  var theme = params.get('theme');
  theme = theme === null ? null : String(theme).trim();
  var color = params.get('color') === null ? null : urlColor(params.get('color'));
  if (!isTheme(theme)) theme = null;
  api.preview = theme !== null || color !== null;
  var look = {
    theme: theme !== null ? theme : saved.theme,
    color: color !== null ? color : saved.color
  };
  html.setAttribute('data-theme', look.theme);
  html.setAttribute('data-color', String(look.color));
  if (look.theme !== 'aqua') {
    // Written in while the page is parsed, the stylesheet holds up the first paint like
    // the ones above it. (If this file ever runs later, show() loads it instead.)
    if (document.readyState === 'loading') document.write(linkTag(look.theme));
    else show(look);
  }

  // After load: fetch the saved look, keep the copy, and switch to it if it differs.
  function sync() {
    var config = window.COMMENTS_CONFIG || {};
    var supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/+$/, '');
    var supabaseKey = String(config.supabaseAnonKey || '').trim();
    if (!supabaseUrl || !supabaseKey || typeof fetch !== 'function') return;

    function use(value) {
      api.save(value);
      if (api.preview || touched) return;
      var now = api.current();
      var next = value || api.DEFAULT;
      if (now.theme !== next.theme || now.color !== next.color) show(next);
    }

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
    var headers = { apikey: supabaseKey, Accept: 'application/json' };
    // The legacy anon key is a JWT (eyJ...) and goes in Authorization as well (as in comments.js).
    if (/^eyJ/.test(supabaseKey)) headers.Authorization = 'Bearer ' + supabaseKey;

    fetch(supabaseUrl + '/rest/v1/site_settings?key=eq.look&select=value', {
      headers: headers,
      signal: controller ? controller.signal : undefined
    })
      .then(function (response) {
        if (!response.ok) throw new Error('Look request failed: ' + response.status);
        return response.json();
      })
      .then(function (rows) {
        if (!Array.isArray(rows)) return;
        var value = rows.length ? rows[0] && rows[0].value : null;
        // No row, or a value this site doesn't understand: Aqua and Classic.
        use(api.valid(value) ? { theme: value.theme, color: value.color } : null);
      })
      .catch(function () { /* offline or Supabase unreachable: leave the look as it is */ })
      .then(function () { if (timer) clearTimeout(timer); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync);
  else sync();
})();
