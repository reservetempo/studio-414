/*
  Edit mode, for the owners' preview page (preview.html), which frames the site as
  index.html?edit=1. index.html loads this file and edit.css only with ?edit=1, the
  script once the page's deferred scripts (boxes.js among them) have run.

  The owners arrange the site, and every change goes into the site layout (layout.js)
  through studio414SiteLayout.apply(), which places the photo, the card and the 414
  (boxes.js follows "studio414:sitelayout"). So apply() stays the one source of where
  things are, and current() always matches the page.

  Moving. The card (#signup) is moved by its title bar, the big 414 (#big-414) by
  holding it anywhere; the photo doesn't move. A press that moves less than SLOP px
  moves nothing (it is a tap).

  Selecting and resizing. A double-click (a double tap with a finger) on the card, the
  414 or the photo (the visible photo, see frame() in layout.js, where nothing else
  is) selects it: one thing at a time (the list THINGS, each with its own rules). A
  selected thing shows an outline with a handle at the middle of each side, and the
  whole side drags (a GRAB px wide strip, mostly outside the side where the page has
  room), so it still moves as above. A tap or click anywhere else, starting to move
  another thing, or Escape (once no drag is under way) unselects it.
  - The card: a side resizes it on its own axis; the opposite side stays put.
  - The 414 keeps its shape: the opposite side stays put, and it stays centred the
    other way.
  - The photo keeps its proportions and stays centred: the side follows the pointer
    (where it is not cut off by the hero, else the photo grows in proportion).
  A double-click selects no text: edit.css keeps text in the hero from being selected
  (the fields aside) and stops a double tap from zooming.

  A mouse, a finger and a pen alike (pointer events; the 414, the title bar and the
  sides take touch-action: none, so a finger drags at once). Escape during a drag
  puts everything back.
  Keyboard: the card's title bar (arrow keys move it, Shift+arrow keys resize it) and
  its grip (arrow keys resize it; edit.css leaves the grip to the keyboard), "Move 414"
  (arrow keys move it, Shift+arrow keys resize it) and "Resize photo" (up or right:
  larger, down or left: smaller), each shown when Tab reaches it.
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
  // Which way each side grows: [x, y].
  var SIDES = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
  var GRAB = 24;            // px: how wide a side's strip is to grab (a finger's width)
  var OUTSIDE = 18;         // px of it outside the side, where the page has room
  var SLOP = { mouse: 4, pen: 6, touch: 10 };   // px a press moves before it drags
  var DOUBLE_MS = 500;      // the most between the two taps of a double tap
  var DOUBLE_PX = { mouse: 8, pen: 16, touch: 32 };   // and how far apart they may be
  // Controls in the hero, which don't select the photo.
  var CONTROLS = 'a, button, input, textarea, select, label, summary, [contenteditable]';

  var gesture = null;       // the drag under way
  var selected = null;      // the selected thing (one of THINGS), or null

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

  // Resized from the side (sx or sy 0) or corner that grows (sx, sy); the opposite
  // side or corner stays put. A side leaves the other axis alone, but for the height
  // the content needs at the new width (it grows down).
  function cardSized(start, sx, sy, dx, dy) {
    var right = start.x + start.w;
    var bottom = start.y + start.h;
    var w = sx ? clamp(start.w + sx * dx, cardMinWidth(), sx > 0 ? viewportWidth() - start.x : right) : start.w;
    var minH = cardMinHeight(w);
    var maxH = Math.max(window.innerHeight, start.h);
    if (sy < 0) maxH = Math.min(maxH, bottom);
    var h = clamp(start.h + sy * dy, minH, maxH);
    return { x: sx < 0 ? right - w : start.x, y: sy < 0 ? bottom - h : start.y, w: w, h: h };
  }

  /* ---------- The 414 ---------- */

  function signMoved(start, dx, dy) {
    return { x: clamp(start.x + dx, 0, viewportWidth() - start.w), y: Math.max(0, start.y + dy), w: start.w };
  }

  // Resized keeping its shape. From a corner (the keyboard's), the corner follows the
  // pointer along the diagonal and the opposite corner stays put. From a side (sx or
  // sy 0), the side follows the pointer, the opposite side stays put and it stays
  // centred the other way.
  function signSized(start, sx, sy, dx, dy) {
    var right = start.x + start.w;
    var bottom = start.y + start.h;
    var ratio = start.h / start.w;
    var vw = viewportWidth();
    var w, max;
    if (sx && sy) {
      var t = (sx * dx * start.w + sy * dy * start.h) / (start.w * start.w + start.h * start.h);
      w = start.w * (1 + t);
      max = sx > 0 ? vw - start.x : right;
      if (sy < 0) max = Math.min(max, bottom / ratio);
    } else if (sx) {
      w = start.w + sx * dx;
      max = sx > 0 ? vw - start.x : right;
    } else {
      w = (start.h + sy * dy) / ratio;
      max = sy < 0 ? bottom / ratio : vw;
    }
    w = clamp(w, MIN_414, Math.min(max, vw));
    var h = w * ratio;
    var x = sx > 0 ? start.x : sx < 0 ? right - w : clamp(start.x + (start.w - w) / 2, 0, vw - w);
    var y = sy > 0 ? start.y : sy < 0 ? bottom - h : Math.max(0, start.y + (start.h - h) / 2);
    return { x: x, y: y, w: w };
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

  // True once a press of this pointer type has moved dx, dy px: past SLOP it is a
  // drag, else a tap.
  function beyond(dx, dy, type) {
    var s = SLOP[type] || SLOP.mouse;
    return Math.abs(dx) >= s || Math.abs(dy) >= s;
  }

  // Makes target start a drag of the thing owner() returns (outlined meanwhile) with
  // the given cursor. begin() is called as the press starts and returns step(dx, dy),
  // which applies the layout for the pointer moved by dx, dy px. Pressing another
  // thing than the selected one unselects it.
  function draggable(target, owner, cursor, begin) {
    target.addEventListener('pointerdown', function (event) {
      if (gesture || !event.isPrimary || event.button !== 0) return;
      // No text selection, no focus change, no scrolling.
      event.preventDefault();
      var thing = owner();
      if (selected && thing !== selected) select(null);
      gesture = {
        target: target,
        thing: thing,
        cursor: cursor,
        pointerId: event.pointerId,
        type: event.pointerType,
        x: event.clientX,
        y: event.clientY,
        moved: false,
        before: site.current(),
        step: begin()
      };
      try {
        target.setPointerCapture(event.pointerId);
      } catch (error) {
        // Without capture the drag still follows the pointer over the target.
      }
    });
    target.addEventListener('pointermove', function (event) {
      var g = gesture;
      if (!g || g.target !== target || event.pointerId !== g.pointerId) return;
      var dx = event.clientX - g.x;
      var dy = event.clientY - g.y;
      if (!g.moved) {
        if (!beyond(dx, dy, g.type)) return;
        g.moved = true;
        root.classList.add('is-edit-dragging');
        root.style.setProperty('--edit-cursor', g.cursor);
        g.thing.el.classList.add('is-edit-active');
      }
      g.step(dx, dy);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(function (type) {
      target.addEventListener(type, function (event) {
        if (gesture && gesture.target === target && event.pointerId === gesture.pointerId) finish(false);
      });
    });
  }

  // Ends the drag, put back (cancel) or finished. A tap changed nothing.
  function finish(cancel) {
    var g = gesture;
    if (!g) return;
    gesture = null;
    try {
      g.target.releasePointerCapture(g.pointerId);
    } catch (error) {
      // Already released.
    }
    if (!g.moved) return;
    root.classList.remove('is-edit-dragging');
    root.style.removeProperty('--edit-cursor');
    g.thing.el.classList.remove('is-edit-active');
    if (cancel) {
      site.apply(g.before);
    } else {
      done(g.before);
    }
  }

  // Escape puts a drag back; with no drag under way, it unselects.
  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape') return;
    if (gesture) {
      event.preventDefault();
      finish(true);
    } else if (selected) {
      event.preventDefault();
      select(null);
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

  /* ---------- Selecting ---------- */

  // What a double-click selects, first come first served (the photo, under the rest,
  // comes last). Each thing has:
  //   el                 its element (outlined while it is dragged)
  //   hit(target, x, y)  true when a press on target, at client x, y, is on it
  //   rect()             where it is in page px ({ x, y, w, h }), or null if not shown
  //   resize(sx, sy)     starts a drag of the side that grows (sx, sy), and returns
  //                      step(dx, dy), as draggable()'s begin() does
  //   inside             true: the outline runs just inside it (the photo fills the hero)
  var THINGS = [];

  // The selected thing's outline, and a strip along each side to drag, with a handle
  // at its middle (edit.css). In page px, in <body>; aria-hidden, as the keyboard has
  // its own controls.
  var chosen = make('div', 'edit-select');
  chosen.hidden = true;
  chosen.setAttribute('aria-hidden', 'true');
  var outline = make('div', 'edit-select__box');
  chosen.appendChild(outline);
  var strips = {};
  Object.keys(SIDES).forEach(function (key) {
    var s = SIDES[key];
    var strip = make('span', 'edit-side edit-side--' + key);
    strips[key] = strip;
    chosen.appendChild(strip);
    draggable(strip, function () { return selected; }, s[0] ? 'ew-resize' : 'ns-resize', function () {
      return selected.resize(s[0], s[1]);
    });
  });
  document.body.appendChild(chosen);

  var placed = '';    // where the outline was last placed
  var frameId = 0;

  function shown(el) {
    return el.getClientRects().length > 0;
  }

  // Places el in page px; at: where its handle sits across it (edit.css's --at).
  function setBox(el, x, y, w, h, at) {
    var s = el.style;
    s.left = x + 'px';
    s.top = y + 'px';
    s.width = w + 'px';
    s.height = h + 'px';
    if (at !== undefined) s.setProperty('--at', clamp(at, 7, GRAB - 7) + 'px');
  }

  // The outline on r, and the strips: GRAB px wide, OUTSIDE px of it out from the side
  // where the page has room, else moved in. line: where the outline runs, px out from
  // the sides (edit.css), so the handles sit on it.
  function arrange(r, vw, vh, line) {
    var right = r.x + r.w;
    var bottom = r.y + r.h;
    var inner = GRAB - OUTSIDE;
    setBox(outline, r.x, r.y, r.w, r.h);
    var top = clamp(r.y - OUTSIDE, 0, vh - GRAB);
    setBox(strips.n, r.x, top, r.w, GRAB, r.y - line - top);
    top = clamp(bottom - inner, 0, vh - GRAB);
    setBox(strips.s, r.x, top, r.w, GRAB, bottom + line - top);
    var left = clamp(r.x - OUTSIDE, 0, vw - GRAB);
    setBox(strips.w, left, r.y, GRAB, r.h, r.x - line - left);
    left = clamp(right - inner, 0, vw - GRAB);
    setBox(strips.e, left, r.y, GRAB, r.h, right + line - left);
  }

  // Keeps the outline on the selected thing: on each new layout and resize, and every
  // frame while there is one (new content, the wallpaper, can move it too). A thing no
  // longer shown is unselected.
  function place() {
    if (frameId) window.cancelAnimationFrame(frameId);
    frameId = 0;
    if (!selected) return;
    var r = selected.rect();
    if (!(r && r.w > 0 && r.h > 0)) {
      if (!gesture) select(null);
    } else {
      var vw = viewportWidth();
      var vh = Math.max(root.scrollHeight, document.body.scrollHeight);
      var key = [r.x, r.y, r.w, r.h, vw, vh].join();
      if (key !== placed) {
        placed = key;
        arrange(r, vw, vh, selected.inside ? -1 : 3);
      }
    }
    if (selected) frameId = window.requestAnimationFrame(place);
  }

  // Selects thing, or nothing (null).
  function select(thing) {
    thing = thing || null;
    if (thing === selected) return;
    if (selected) selected.el.classList.remove('is-edit-selected');
    selected = thing;
    placed = '';
    chosen.hidden = !thing;
    if (thing) {
      thing.el.classList.add('is-edit-selected');
      chosen.classList.toggle('edit-select--inside', !!thing.inside);
    }
    place();
  }

  document.addEventListener('studio414:sitelayout', place);
  window.addEventListener('resize', place);

  // The thing a press on target (at client x, y) is on, or null.
  function thingAt(target, x, y) {
    if (chosen.contains(target)) return selected;
    for (var i = 0; i < THINGS.length; i++) {
      if (THINGS[i].hit(target, x, y)) return THINGS[i];
    }
    return null;
  }

  // Taps: presses that move less than SLOP. Two on the same thing, close together in
  // time and place, select it; one anywhere but on the selected thing unselects it.
  // (Capture: seen before the things' own handlers, whatever they do.)
  var press = null;     // the press under way
  var lastTap = null;

  document.addEventListener('pointerdown', function (event) {
    press = null;
    if (!event.isPrimary || event.button !== 0 || !(event.target instanceof Element)) return;
    press = {
      id: event.pointerId,
      type: event.pointerType,
      x: event.clientX,
      y: event.clientY,
      thing: thingAt(event.target, event.clientX, event.clientY),
      moved: false
    };
  }, true);

  document.addEventListener('pointermove', function (event) {
    var p = press;
    if (p && event.pointerId === p.id && !p.moved && beyond(event.clientX - p.x, event.clientY - p.y, p.type)) {
      p.moved = true;
    }
  }, true);

  document.addEventListener('pointercancel', function (event) {
    if (press && event.pointerId === press.id) press = null;
  }, true);

  document.addEventListener('pointerup', function (event) {
    var p = press;
    if (!p || event.pointerId !== p.id) return;
    press = null;
    if (p.moved || beyond(event.clientX - p.x, event.clientY - p.y, p.type)) {
      lastTap = null;
      return;
    }
    var last = lastTap;
    var near = DOUBLE_PX[p.type] || DOUBLE_PX.mouse;
    lastTap = { thing: p.thing, x: p.x, y: p.y, time: event.timeStamp };
    if (selected && p.thing !== selected) select(null);
    if (p.thing && last && last.thing === p.thing && event.timeStamp - last.time <= DOUBLE_MS &&
        Math.abs(p.x - last.x) <= near && Math.abs(p.y - last.y) <= near) {
      lastTap = null;
      select(p.thing);
    }
  }, true);

  /* ---------- The things ---------- */

  if (card) {
    var cardThing = {
      el: card,
      hit: function (target) { return card.contains(target); },
      rect: function () { return shown(card) ? rectOf(card) : null; },
      resize: function (sx, sy) {
        var start = rectOf(card);
        return function (dx, dy) { set('card', part(cardSized(start, sx, sy, dx, dy))); };
      }
    };
    THINGS.push(cardThing);
    // The title bar's handle and the grip are boxes.js's (it doesn't drag them here;
    // edit.css leaves the grip to the keyboard).
    var handle = card.querySelector('.box__handle');
    var grip = card.querySelector('.box__grip');
    if (handle) {
      draggable(handle, function () { return cardThing; }, 'move', function () {
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
    var signThing = {
      el: sign,
      hit: function (target) { return sign.contains(target); },
      rect: function () { return shown(sign) ? rectOf(sign) : null; },
      resize: function (sx, sy) {
        var start = rectOf(sign);
        return function (dx, dy) { set('big414', part(signSized(start, sx, sy, dx, dy))); };
      }
    };
    THINGS.push(signThing);
    sign.title = 'Drag to move it. Double-click it, then drag a side to resize it.';
    // Held anywhere, it moves.
    draggable(sign, function () { return signThing; }, 'grabbing', function () {
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

  // The photo: an outline over the visible photo while its keyboard handle has focus.
  // A double-click on the visible photo where nothing else is (not on a control)
  // selects it; it doesn't move.
  var photo = make('div', 'edit-photo');
  hero.insertBefore(photo, hero.firstChild);
  THINGS.push({
    el: photo,
    inside: true,
    hit: function (target, x, y) {
      var f = site.frame();
      if (!f || !hero.contains(target) || target.closest(CONTROLS)) return false;
      x += window.pageXOffset;
      y += window.pageYOffset;
      return x >= f.left && x <= f.left + f.width && y >= f.top && y <= f.top + f.height;
    },
    rect: function () {
      var f = site.frame();
      return f ? { x: f.left, y: f.top, w: f.width, h: f.height } : null;
    },
    resize: function (sx, sy) {
      var start = photoStart(sx, sy);
      return function (dx, dy) { set('photo', photoSized(start, sx, sy, dx, dy)); };
    }
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
