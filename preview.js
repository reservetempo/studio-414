/*
  Owner preview page (preview.html): the public site in a frame beside the owner
  sections, kept in this page's theme and colour.

  - Once the owner page opens (studioAdmin.onReady, admin.js), the frame loads
    index.html?edit=1&theme=<id>&color=<n>, in the look on this page then. ?theme= and
    ?color= make it a preview (look.js): it shows that look and never switches to the
    saved one by itself. (?edit=1 is the framed site's edit mode, see index.html.)
  - Whenever this page's look changes (the Look section, admin-look.js, switching it with
    studio414Look.apply, or look.js itself), the framed site is switched to it too, with
    its own studio414Look.apply; and again each time the frame loads, in case the look
    changed while it was loading. Same origin, so the frame's window is reachable.

  window.studioPreview is for the section modules (load them after this file):
    studioPreview.frame   the <iframe> element
    studioPreview.site()  the framed site's window once it has loaded (its
                          studio414Look, studio414SiteLayout...), else null
  To act on each load of the framed site, listen for 'load' on studioPreview.frame.
*/
(function () {
  'use strict';

  var admin = window.studioAdmin;
  var look = window.studio414Look;
  var frame = document.getElementById('preview-frame');
  if (!admin || !look || !frame) {
    console.error('preview.js: load it in preview.html, after look.js and admin.js');
    return;
  }

  var loaded = false; // the frame has finished loading its current src

  window.studioPreview = {
    frame: frame,
    site: site
  };

  frame.addEventListener('load', function () {
    loaded = frame.src !== '' && frame.src !== 'about:blank';
    sync();
  });

  admin.onReady(function () {
    if (frame.getAttribute('src')) return; // already showing the site
    var v = look.current();
    loaded = false;
    frame.src = 'index.html?edit=1&theme=' + encodeURIComponent(v.theme) + '&color=' + v.color;
  });

  // look.js sets data-theme and data-color on <html> once a switch is done (after the
  // theme's stylesheet has loaded), whoever asked for it.
  new MutationObserver(sync).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme', 'data-color']
  });

  // The framed site's window, if it has loaded and can be reached; else null.
  function site() {
    if (!loaded) return null;
    try {
      var win = frame.contentWindow;
      return win && win.document && win.studio414Look ? win : null;
    } catch (e) {
      return null; // not reachable (it shouldn't happen: same origin)
    }
  }

  // Switches the framed site to this page's look, if it shows another.
  function sync() {
    var win = site();
    if (!win) return;
    var v = look.current();
    var there = win.studio414Look.current();
    if (there.theme !== v.theme || there.color !== v.color) win.studio414Look.apply(v);
  }
})();
