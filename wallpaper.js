/*
  Wallpaper: the photo behind the site, and where the mailing-list card sits on it,
  as the owners saved them on the owner page (admin.html).

  They are the "wallpaper" row of the Supabase table site_settings (see
  supabase/wallpaper.sql), read with the publishable key in comments-config.js:
    { url, width, height, spot: { cx, bottom, w, h } }
  The inline script at the top of index.html (window.studio414Wallpaper) checks such a
  value and sets it on <html> as the custom properties at the top of styles.css
  (--bg-image, --bg-width, --bg-height, --window-cx, --window-bottom, --window-w,
  --window-h). It does that before first paint from the copy kept in localStorage under
  "studio414.wallpaper", so returning visitors never see the old photo first.

  This script fetches the row on every visit and then:
  - a wallpaper is saved: loads and decodes the photo first, so it never paints in
    halfway, then swaps it in and keeps the copy;
  - nothing is saved ("Use the original photo" on the owner page): drops any wallpaper
    applied from the copy, so the site's own photo shows, and forgets the copy;
  - the request fails: leaves everything as it is.
*/
(function () {
  'use strict';

  var REQUEST_TIMEOUT_MS = 15000;

  var wallpaper = window.studio414Wallpaper;
  var config = window.COMMENTS_CONFIG || {};
  var supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/+$/, '');
  var supabaseKey = String(config.supabaseAnonKey || '').trim();
  if (!wallpaper || !supabaseUrl || !supabaseKey || typeof fetch !== 'function') return;

  function remember(value) {
    try {
      if (value) localStorage.setItem(wallpaper.KEY, JSON.stringify(value));
      else localStorage.removeItem(wallpaper.KEY);
    } catch (e) { /* no localStorage: the photo still shows, just not before first paint */ }
  }

  // Calls done(true) once the photo is loaded and decoded, done(false) if it can't load.
  function preload(src, done) {
    var img = new Image();
    img.onload = function () {
      if (typeof img.decode !== 'function') return done(true);
      img.decode().then(function () { done(true); }, function () { done(true); });
    };
    img.onerror = function () { done(false); };
    img.src = src;
  }

  function show(value) {
    if (!wallpaper.valid(value)) {
      // Not a wallpaper this site understands: keep to its own photo.
      wallpaper.clear();
      remember(null);
      return;
    }
    if (wallpaper.src(value) === wallpaper.current) {
      // The same photo (the copy was up to date, or only the spot moved).
      wallpaper.apply(value);
      remember(value);
      return;
    }
    preload(wallpaper.src(value), function (loaded) {
      if (!loaded) return;
      wallpaper.apply(value);
      remember(value);
    });
  }

  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, REQUEST_TIMEOUT_MS) : null;
  var headers = { apikey: supabaseKey, Accept: 'application/json' };
  // The legacy anon key is a JWT (eyJ...) and goes in Authorization as well (as in comments.js).
  if (/^eyJ/.test(supabaseKey)) headers.Authorization = 'Bearer ' + supabaseKey;

  fetch(supabaseUrl + '/rest/v1/site_settings?key=eq.wallpaper&select=value', {
    headers: headers,
    signal: controller ? controller.signal : undefined
  })
    .then(function (response) {
      if (!response.ok) throw new Error('Wallpaper request failed: ' + response.status);
      return response.json();
    })
    .then(function (rows) {
      if (!Array.isArray(rows)) return;
      if (rows.length === 0) {
        wallpaper.clear();
        remember(null);
        return;
      }
      show(rows[0] && rows[0].value);
    })
    .catch(function () { /* offline or Supabase unreachable: leave the wallpaper as it is */ })
    .then(function () { if (timer) clearTimeout(timer); });
})();
