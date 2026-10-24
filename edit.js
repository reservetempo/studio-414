/*
  Edit mode, for the owners' preview page (preview.html), which frames the site as
  index.html?edit=1. index.html loads this file and edit.css only with ?edit=1, the
  script once the page's deferred scripts (boxes.js among them) have run.

  The owners hold and drag to arrange the site, and every change goes into the site
  layout (layout.js) through studio414SiteLayout.apply(), which places the photo, the
  card and the 414 (boxes.js follows "studio414:sitelayout"). So apply() stays the
  one source of where things are, and current() always matches the page.
  - The card (#signup): moved by its title bar, resized from any corner.
  - The big 414 (#big-414): moved by holding it anywhere, resized from any corner; it
    keeps its shape.
  - The photo: resized by holding and dragging any edge of it (the visible photo, see
    frame() in layout.js); it keeps its proportions and stays centred.
  A mouse, a finger and a pen alike (pointer events; the handles take touch-action:
  none, so a finger drags at once). Escape during a drag puts everything back.
  Keyboard: the card's title bar (arrow keys move it, Shift+arrow keys resize it) and
  its grip (arrow keys resize it), "Move 414" (arrow keys move it, Shift+arrow keys
  resize it) and "Resize photo" (up or right: larger, down or left: smaller), each
  shown when Tab reaches it.
  Sizes stay within: the card no smaller than its content needs (and its CSS
  min-width) and no wider than the screen; the 414 from MIN_414 px to the screen's
  width; the photo from 0.25 to 2 (layout.js's range).

  The message. After each finished change (a drag let go, an arrow key) that changed
  the layout, the page tells the page framing it, on the same origin only:

    parent.postMessage({ type: 'studio414:layoutedit', layout: layout }, location.origin)

  layout is studio414SiteLayout.current(): the whole layout now in force, of the shape
  documented in layout.js, with every part the owners have touched (an untouched part
  is left out: the CSS layout). Nothing is posted while a drag is under way, for a drag
  put back with Escape, or for layouts the parent applies itself with apply(). Nothing
  here talks to Supabase: saving is the preview page's job.

  Edit mode also hides Display (section#switcher and footer.switcher-credit, edit.css)
  and keeps the sign-up, comment and workshop forms from sending anything: every
  submit is stopped before the forms' own handlers see it. The visitor's own layout,
  colour and font are left alone: boxes.js, switcher.js and index.html's head script
  neither read nor write them with ?edit=1, and this file stores nothing.
*/
(function () {
  'use strict';

  // The forms send nothing (capture on window comes before the forms' handlers).
  window.addEventListener('submit', function (event) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }, true);

  var site = window.studio414SiteLayout;
  var root = document.documentElement;
  var hero = document.querySelector('.hero');
  var card = document.getElementById('signup');
  var sign = document.getElementById('big-414');
  if (!site || !hero || !window.PointerEvent) return;
  root.classList.add('is-editing');

  var STEP = 10;            // px per arrow key
  var SCALE_STEP = 0.02;    // the photo's scale per arrow key
  var MIN_SCALE = 0.25;
  var MAX_SCALE = 2;
  var MIN_414 = 60;         // px wide
  var KEYS = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  // Which way each corner and edge grows: [x, y].
  var CORNERS = { nw: [-1, -1], ne: [1, -1], sw: [-1, 1], se: [1, 1] };
  var EDGES = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };

  var gesture = null;

  /* ---------- Helpers ---------- */

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function round(n, places) {
    var f = Math.pow(10, places);
    return Math.round(n * f) / f;
  }

  function viewportWidth() {
    return root.clientWidth;
  }

  // Where an element is, in page px.
  function rectOf(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + window.pageXOffset, y: r.top + window.pageYOffset, w: r.width, h: r.height };
  }

  function make(tag, className) {
    var node = document.createElement(tag);
    node.className = className;
    return node;
  }

  // Page px as a part of the layout: fractions of the frame, in layout.js's ranges.
  function part(r) {
    var p = site.fromPage(r);
    if (!p) return null;
    var out = {
      x: round(clamp(p.x, -10, 10), 4),
      y: round(clamp(p.y, -10, 10), 4),
      w: round(clamp(p.w, 0.0001, 10), 4)
    };
    if (typeof p.h === 'number') out.h = round(clamp(p.h, 0.0001, 10), 4);
    return out;
  }

  // Sets one part of the layout and applies it (live: boxes.js places the boxes).
  function set(name, value) {
    if (!value) return;
    var v = site.current() || {};
    v[name] = value;
    site.apply(v);
  }

  /* ---------- The card ---------- */

  function cardMinWidth() {
    return parseFloat(window.getComputedStyle(card).minWidth) || 0;
  }

  // The height the card's content needs at width w (boxes.css: min-height:
  // min-content, so no height at all gives exactly that), as boxes.js measures it.
  function cardMinHeight(w) {
    var width = card.style.width;
    var height = card.style.height;
    card.style.width = w + 'px';
    card.style.height = '0px';
    var h = Math.max(card.offsetHeight, card.scrollHeight + card.offsetHeight - card.clientHeight);
    card.style.width = width;
    card.style.height = height;
    return h;
  }

  function cardMoved(start, dx, dy) {
    return {
      x: clamp(start.x + dx, 0, viewportWidth() - start.w),
      y: Math.max(0, start.y + dy),
      w: start.w,
      h: start.h
    };
  }

  // Resized from the corner that grows (sx, sy); the opposite corner stays put.
  function cardSized(start, sx, sy, dx, dy) {
    var right = start.x + start.w;
    var bottom = start.y + start.h;
    var w = clamp(start.w + sx * dx, cardMinWidth(), sx > 0 ? viewportWidth() - start.x : right);
    var minH = cardMinHeight(w);
    var maxH = Math.max(window.innerHeight, start.h);
    if (sy < 0) maxH = Math.min(maxH, bottom);
    var h = clamp(start.h + sy * dy, minH, maxH);
    return { x: sx > 0 ? start.x : right - w, y: sy > 0 ? start.y : bottom - h, w: w, h: h };
  }

  /* ---------- The 414 ---------- */

  function signMoved(start, dx, dy) {
    return { x: clamp(start.x + dx, 0, viewportWidth() - start.w), y: Math.max(0, start.y + dy), w: start.w };
  }

  // Resized from a corner, keeping its shape: the corner follows the pointer along
  // the diagonal, and the opposite corner stays put.
  function signSized(start, sx, sy, dx, dy) {
    var right = start.x + start.w;
    var bottom = start.y + start.h;
    var t = (sx * dx * start.w + sy * dy * start.h) / (start.w * start.w + start.h * start.h);
    var max = sx > 0 ? viewportWidth() - start.x : right;
    if (sy < 0) max = Math.min(max, bottom * start.w / start.h);
    var w = clamp(start.w * (1 + t), MIN_414, max);
    var h = w * start.h / start.w;
    return { x: sx > 0 ? start.x : right - w, y: sy > 0 ? start.y : bottom - h, w: w };
  }

  /* ---------- The photo ---------- */

  function scaleNow() {
    var v = site.current();
    return v && v.photo ? v.photo.scale : 1;
  }

  function photoScale(scale) {
    return { scale: round(clamp(scale, MIN_SCALE, MAX_SCALE), 3) };
  }

  // The scale now, and how far the edge that grows (ex, ey) is from the hero's centre.
  function photoStart(ex, ey) {
    var f = site.frame();
    var h = rectOf(hero);
    var cx = h.x + h.w / 2;
    var cy = h.y + h.h / 2;
    var d = ex > 0 ? f.left + f.width - cx
      : ex < 0 ? cx - f.left
      : ey > 0 ? f.top + f.height - cy
      : cy - f.top;
    return { scale: scaleNow(), d: Math.max(1, d) };
  }

  // The edge follows the pointer (where it is not cut off by the hero, else the
  // photo grows in proportion), and the photo stays centred.
  function photoSized(start, ex, ey, dx, dy) {
    return photoScale(start.scale * (start.d + ex * dx + ey * dy) / start.d);
  }

  /* ---------- Finished changes ---------- */

  // Writes what shows back into the layout, where boxes.js had to fit a box to the
  // screen or to its content, so current() matches the page.
  function settle() {
    var v = site.current();
    if (!v) return;
    var changed = false;
    if (v.card && card) {
      var want = site.toPage(v.card);
      var got = rectOf(card);
      if (want && (Math.abs(want.x - got.x) > 1 || Math.abs(want.y - got.y) > 1 ||
          Math.abs(want.w - got.w) > 1 || Math.abs(want.h - got.h) > 1)) {
        var c = part(got);
        if (c) { v.card = c; changed = true; }
      }
    }
    if (v.big414 && sign) {
      var wanted = site.toPage(v.big414);
      var is = rectOf(sign);
      var w = wanted ? Math.min(wanted.w, viewportWidth()) : 0;
      if (wanted && (Math.abs(wanted.x - is.x) > 1 || Math.abs(wanted.y - is.y) > 1 || w < wanted.w)) {
        var b = part({ x: is.x, y: is.y, w: w });
        if (b) { v.big414 = b; changed = true; }
      }
    }
    if (changed) site.apply(v);
  }

  // A change is finished: fit the layout to what shows, and tell the parent page.
  function done(before) {
    settle();
    var now = site.current();
    if (JSON.stringify(now) === JSON.stringify(before)) return;
    if (window.parent === window) return;
    try {
      window.parent.postMessage({ type: 'studio414:layoutedit', layout: now }, window.location.origin);
    } catch (error) {
      // No parent to tell.
    }
  }

  /* ---------- Dragging ---------- */

  // Makes target start a drag of active (outlined meanwhile) with the given cursor.
  // begin() is called as the drag starts and returns step(dx, dy), which applies the
  // layout for the pointer moved by dx, dy px.
  function draggable(target, active, cursor, begin) {
    target.addEventListener('pointerdown', function (event) {
      if (gesture || !event.isPrimary || event.button !== 0) return;
      // No text selection, no focus change, no scrolling.
      event.preventDefault();
      gesture = {
        target: target,
        active: active,
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        before: site.current(),
        step: begin()
      };
      try {
        target.setPointerCapture(event.pointerId);
      } catch (error) {
        // Without capture the drag still follows the pointer over the handle.
      }
      root.classList.add('is-edit-dragging');
      root.style.setProperty('--edit-cursor', cursor);
      active.classList.add('is-edit-active');
    });
    target.addEventListener('pointermove', function (event) {
      if (!gesture || gesture.target !== target || event.pointerId !== gesture.pointerId) return;
      gesture.step(event.clientX - gesture.x, event.clientY - gesture.y);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
      target.addEventListener(type, function (event) {
        if (gesture && gesture.target === target && event.pointerId === gesture.pointerId) finish(false);
      });
    });
  }

  function finish(cancel) {
    var g = gesture;
    if (!g) return;
    gesture = null;
    try {
      g.target.releasePointerCapture(g.pointerId);
    } catch (error) {
      // Already released.
    }
    root.classList.remove('is-edit-dragging');
    root.style.removeProperty('--edit-cursor');
    g.active.classList.remove('is-edit-active');
    if (cancel) {
      site.apply(g.before);
    } else {
      done(g.before);
    }
  }

  document.addEventListener('keydown', function (event) {
    if (gesture && event.key === 'Escape') {
      event.preventDefault();
      finish(true);
    }
  });

  // Arrow keys on target call act(dx, dy, shift) with dx, dy each -1, 0 or 1; each
  // press is a finished change.
  function keyed(target, act) {
    target.addEventListener('keydown', function (event) {
      var d = KEYS[event.key];
      if (!d || event.altKey || event.ctrlKey || event.metaKey || gesture) return;
      event.preventDefault();
      var before = site.current();
      act(d[0], d[1], event.shiftKey);
      done(before);
    });
  }

  function cornerCursor(c) {
    return c[0] === c[1] ? 'nwse-resize' : 'nesw-resize';
  }

  /* ---------- Setting up ---------- */

  if (card) {
    // The title bar's handle and the grip are boxes.js's (it doesn't drag them here).
    var handle = card.querySelector('.box__handle');
    var grip = card.querySelector('.box__grip');
    Object.keys(CORNERS).forEach(function (key) {
      var c = CORNERS[key];
      var corner = key === 'se' && grip ? grip : make('span', 'edit-corner edit-corner--' + key);
      if (corner !== grip) {
        corner.setAttribute('aria-hidden', 'true');
        card.appendChild(corner);
      }
      draggable(corner, card, cornerCursor(c), function () {
        var start = rectOf(card);
        return function (dx, dy) { set('card', part(cardSized(start, c[0], c[1], dx, dy))); };
      });
    });
    if (handle) {
      draggable(handle, card, 'move', function () {
        var start = rectOf(card);
        return function (dx, dy) { set('card', part(cardMoved(start, dx, dy))); };
      });
      keyed(handle, function (dx, dy, shift) {
        var start = rectOf(card);
        set('card', part(shift
          ? cardSized(start, 1, 1, dx * STEP, dy * STEP)
          : cardMoved(start, dx * STEP, dy * STEP)));
      });
    }
    if (grip) {
      keyed(grip, function (dx, dy) {
        set('card', part(cardSized(rectOf(card), 1, 1, dx * STEP, dy * STEP)));
      });
    }
  }

  if (sign) {
    sign.title = 'Drag to move it, or drag a corner to resize it.';
    Object.keys(CORNERS).forEach(function (key) {
      var c = CORNERS[key];
      var corner = make('span', 'edit-corner edit-corner--' + key);
      corner.setAttribute('aria-hidden', 'true');
      sign.appendChild(corner);
      draggable(corner, sign, cornerCursor(c), function () {
        var start = rectOf(sign);
        return function (dx, dy) { set('big414', part(signSized(start, c[0], c[1], dx, dy))); };
      });
    });
    // Anywhere else on it (its corners take the pointer first) moves it.
    draggable(sign, sign, 'grabbing', function () {
      var start = rectOf(sign);
      return function (dx, dy) { set('big414', part(signMoved(start, dx, dy))); };
    });
    var signHandle = sign.querySelector('.big-414__handle');
    if (signHandle) {
      signHandle.textContent = 'Move 414 with the arrow keys, resize it with Shift';
      keyed(signHandle, function (dx, dy, shift) {
        var start = rectOf(sign);
        set('big414', part(shift
          ? signSized(start, 1, 1, dx * STEP, dy * STEP)
          : signMoved(start, dx * STEP, dy * STEP)));
      });
    }
  }

  // The photo: an outline over the visible photo, with a strip along each edge.
  var photo = make('div', 'edit-photo');
  hero.insertBefore(photo, hero.firstChild);
  Object.keys(EDGES).forEach(function (key) {
    var e = EDGES[key];
    var edge = make('span', 'edit-edge edit-edge--' + key);
    edge.setAttribute('aria-hidden', 'true');
    photo.appendChild(edge);
    draggable(edge, photo, e[0] ? 'ew-resize' : 'ns-resize', function () {
      var start = photoStart(e[0], e[1]);
      return function (dx, dy) { set('photo', photoSized(start, e[0], e[1], dx, dy)); };
    });
  });
  var photoHandle = make('button', 'edit-photo__handle aqua-pill');
  photoHandle.type = 'button';
  photoHandle.textContent = 'Resize the photo with the arrow keys';
  photo.appendChild(photoHandle);
  keyed(photoHandle, function (dx, dy) {
    set('photo', photoScale(scaleNow() + (dx - dy) * SCALE_STEP));
  });

  // Keeps the outline on the visible photo (layout.js's frame), in the hero's px.
  function placePhoto() {
    var f = site.frame();
    photo.hidden = !f;
    if (!f) return;
    var h = rectOf(hero);
    photo.style.left = (f.left - h.x - hero.clientLeft) + 'px';
    photo.style.top = (f.top - h.y - hero.clientTop) + 'px';
    photo.style.width = f.width + 'px';
    photo.style.height = f.height + 'px';
  }

  document.addEventListener('studio414:sitelayout', placePhoto);
  window.addEventListener('resize', placePhoto);
  // The wallpaper (wallpaper.js) sets the photo's size on <html>.
  if (window.MutationObserver) {
    new MutationObserver(placePhoto).observe(root, { attributes: true, attributeFilter: ['style'] });
  }
  placePhoto();
})();
