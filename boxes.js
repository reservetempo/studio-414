/*
  Draggable, resizable boxes for Studio 414: the mailing-list card (#signup), drawn
  as a Mac OS X Aqua window by boxes.css, and the big 414 (below). The comment
  section and Display (switcher.js) are not windows: they stay put in the page, and
  anything stored for them from when they were is ignored.

  - Drag a box by its title bar; resize the card with the grip in its bottom-right
    corner (a box without a grip keeps the size its CSS gives it). Pointer events, so
    a mouse, a finger and a pen all work. Only the title bar and the grip take
    touch-action: none, so a finger anywhere else still scrolls the page.
  - Keyboard: the title bar and the grip are buttons. On the title bar the arrow keys
    move the box and Shift+arrow keys resize it (or, without a grip, move it too); on
    the grip the arrow keys resize it. Escape during a drag puts the box back.
  - The box last touched or focused comes to the front.
  - Until a box is moved or resized it keeps the default layout: where the owners put
    it on the preview page (the site layout, layout.js), or, where they left it out
    (or no layout is saved), the responsive layout from the CSS. Once the visitor
    moves or resizes it, it is "placed", and remembered in localStorage under
    "studio414.layout", with the order the boxes are stacked in; that wins over the
    owners' layout. Without localStorage it all still works for the visit. A box in
    the owners' layout or placed by the visitor is absolutely positioned at page
    coordinates (px from the top-left corner of the page, so it scrolls with the page
    as the photo does).
  - The owners' layout gives fractions of the visible photo (see layout.js), turned
    into page px afresh whenever the boxes are fitted, so it follows the photo on every
    screen. When it changes (fetched after load, or apply() from the preview page,
    "studio414:sitelayout"), the boxes the visitor hasn't moved go to their new place.
  - Stored coordinates are kept as the visitor left them and fitted to the screen
    whenever they are applied (on load, and when the window is resized or rotated):
    no wider than the viewport and wholly inside it across, never smaller than the
    content needs, and with the title bar somewhere on the page. While dragging, the
    title bar stays inside the visible viewport. So a layout made on a wide window is
    squeezed onto a narrow one and comes back as it was when the window widens again.
  - "Reset" on Display's Layout row sends "studio414:layoutreset", which puts the card
    and the 414 (unless it is bouncing, below) back in the default layout (the
    owners', else the CSS's). Every change sends "studio414:layoutchange"
    ({ detail: { custom } }: whether the visitor has moved anything), which shows or
    hides that row.
  - With ?edit=1 in the URL (the owners' preview page frames the site so) the
    visitor's "studio414.layout" is neither read nor written: the page starts from the
    owners' layout, and the preview page places the boxes through
    studio414SiteLayout.apply(). The handles are still made, but this file doesn't
    drag anything there: edit.js does, and its drags change the owners' layout itself
    (through apply(), which places the boxes again).

  The big 414 (#big-414, styles.css) moves the same way, though it is not a window:
  - It is picked up anywhere on its figures. A mouse or pen drags it at once (a grab
    cursor). A finger has to rest on it for a moment first (HOLD, below): a swipe over
    it scrolls the page as before, since it takes no touch-action, and only once it is
    lifted are the finger's moves kept from scrolling (touchmove is cancelled), so
    they move the 414 instead.
  - Keyboard: a "Move 414" button, added beside the heading (not in it, so the
    heading still reads "Studio 414"), shows when Tab reaches it; the arrow keys move
    the 414, as on the title bars. Escape during a drag puts it back.
  - It is placed, fitted, saved (under "414" with the boxes) and reset like a box, and
    fitted again when the font changes (which changes its size). While dragged it
    stays wholly in view, and once placed wholly on the page. It always stays under
    the windows: it is not restacked.
  - Visitors only move it; its size is the CSS's, or, where the owners' layout has
    big414, their width (no wider than the screen). Its height follows its font, so
    that width is set as a font size: width / --big-w (the advance width of "414" in
    em, styles.css and fonts.css), worked out again when the font changes.
  - Its text: the owners' big414Text where their layout has one (set with
    textContent, so never as HTML), else 414. It is set whenever the 414 is sized,
    so from the copy layout.js keeps (before the row is fetched) as soon as this
    file runs, and again on each "studio414:sitelayout" (the preview page's field,
    live). Its box keeps the width it has with 414 (the owners', else the CSS's) and
    the letters fill it: the font size is that width over the text's own advance
    width, measured in em on the page, so longer text gets smaller letters (and short
    text bigger ones, though never taller than the first screen). Measured
    again when the font changes, a face finishes loading and on a resize. The heading
    reads "Studio 414" with 414, else "Studio 414: " (visually hidden) and the text.
  - Unless the visitor asks for reduced motion (and never with ?edit=1) it bounces
    around the hero, the first screen (bounce.js). bounce.js frees it from the layout
    with window.studio414Sign.free(hooks): from then on bounce.js moves it, and this
    file only stops it (hooks.stop) when it is pressed and lets it carry on (hooks.go)
    when that is over: a tap, a finger's swipe, a drop (a drag keeps it inside the
    hero, hooks.keep) or Escape (back where it was picked up). A tap speeds it up
    (hooks.tap): a press and release that wanders no more than SLOP and ends within
    HOLD (for a finger, before it lifts the 414), or Enter or Space on "Move 414". A
    throw sends it off (hooks.fling): when a drag that went past SLOP is let go, the
    pointer's speed over its last FLING ms (bounce.js keeps a still release a plain
    drop). The arrow keys nudge it on its way. A resize or a font or layout change only sizes it (hooks.measure keeps
    it in the hero). Meanwhile its stored spot is neither read nor written (it stays
    in storage as it was), it doesn't count as moved for the Layout row, and Reset
    only puts the card back. free(null) stops it: it is placed where it stopped.
*/
(function () {
  'use strict';

  var STORAGE_KEY = 'studio414.layout';
  var STEP = 10;
  // How long a finger rests on the 414 before it lifts (ms), and how far it may
  // wander meanwhile (px); moving further is a swipe, which scrolls the page.
  var HOLD = 450;
  var SLOP = 10;
  // A throw of the bouncing 414 goes at the pointer's speed over its last FLING ms.
  var FLING = 100;
  var KEYS = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  };
  var root = document.documentElement;
  // The owners' preview page: the visitor's own layout is neither read nor written.
  var editing = new URLSearchParams(window.location.search).get('edit') === '1';
  // Each item's part of the owners' layout (layout.js).
  var PARTS = { signup: 'card', '414': 'big414' };

  // Back to front, as they are stacked by default. grip: resizable.
  var boxes = [
    { id: 'signup', el: document.getElementById('signup'), grip: true }
  ].filter(function (box) {
    return box.el && box.el.querySelector('.box__titlebar');
  });
  boxes.forEach(function (box) {
    box.stacked = true;
  });

  // Everything that moves: the boxes, and the big 414, which stays under them.
  var signEl = document.getElementById('big-414');
  var sign = signEl ? { id: '414', el: signEl, grip: false, stacked: false } : null;
  // Its visible text, and the visually hidden words read before it (index.html).
  var signText = signEl && signEl.querySelector('.big-414__text');
  var signLabel = signEl && signEl.querySelector('.big-414__label');
  var items = sign ? boxes.concat(sign) : boxes.slice();
  if (!items.length || !window.PointerEvent) return;

  var byId = {};
  items.forEach(function (item) { byId[item.id] = item; });
  var DEFAULT_ORDER = boxes.map(function (box) { return box.id; });

  var placed = {};                     // id -> { x, y, w, h }, page px, as the visitor set it
  var order = DEFAULT_ORDER.slice();   // back to front (the boxes only)
  var gesture = null;
  var hold = null;                     // a finger resting on the 414, until it lifts
  var motion = null;                   // while the 414 bounces: bounce.js's hooks
  var kept414 = null;                  // meanwhile, its stored spot, kept as it was

  /* ---------- localStorage, always optional ---------- */

  function isRect(value) {
    return value && typeof value === 'object' &&
      ['x', 'y', 'w', 'h'].every(function (key) {
        return typeof value[key] === 'number' && isFinite(value[key]) && Math.abs(value[key]) < 1e6;
      }) && value.w > 0 && value.h > 0;
  }

  function load() {
    if (editing) return;
    var data = null;
    try {
      data = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      data = null;
    }
    if (!data || typeof data !== 'object') return;
    // Only what still moves is read back: anything else stored (the comment section
    // and Display, from when they were windows) is left out, and so dropped at the
    // next save.
    if (data.boxes && typeof data.boxes === 'object') {
      items.forEach(function (item) {
        if (isRect(data.boxes[item.id])) placed[item.id] = roundRect(data.boxes[item.id]);
      });
    }
    if (Array.isArray(data.order)) {
      var known = data.order.filter(function (id, index) {
        return byId[id] && byId[id].stacked && data.order.indexOf(id) === index;
      });
      // Boxes the stored order doesn't know go on top, as they would by default.
      order = known.concat(DEFAULT_ORDER.filter(function (id) { return known.indexOf(id) < 0; }));
    }
  }

  function save() {
    if (editing) return;
    var stored = placed;
    if (kept414) {
      stored = { '414': kept414 };
      Object.keys(placed).forEach(function (id) { stored[id] = placed[id]; });
    }
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, boxes: stored, order: order }));
    } catch (error) {
      // Storage is optional: the layout still holds for this visit.
    }
  }

  function forget() {
    if (editing) return;
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      // Nothing stored, then.
    }
  }

  function announce() {
    document.dispatchEvent(new CustomEvent('studio414:layoutchange', {
      detail: { custom: Object.keys(placed).length > 0 }
    }));
  }

  /* ---------- Geometry (in page px) ---------- */

  function roundRect(r) {
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  function viewport() {
    return {
      top: window.pageYOffset,
      width: root.clientWidth,
      height: window.innerHeight
    };
  }

  // Where the box is now, in page px.
  function rectOf(box) {
    var r = box.el.getBoundingClientRect();
    return roundRect({ x: r.left + window.pageXOffset, y: r.top + window.pageYOffset, w: r.width, h: r.height });
  }

  // Where left: 0; top: 0 puts a placed box: the corner of the hero for the card and
  // the 414.
  function origin(el) {
    var parent = el.offsetParent;
    if (!parent || parent === document.body || parent === root) return { x: 0, y: 0 };
    var r = parent.getBoundingClientRect();
    return {
      x: r.left + window.pageXOffset + parent.clientLeft,
      y: r.top + window.pageYOffset + parent.clientTop
    };
  }

  // The bottom of the page's own content (not counting placed boxes).
  function pageBottom() {
    var bottom = window.pageYOffset + window.innerHeight;
    Array.prototype.forEach.call(document.body.children, function (child) {
      var position = window.getComputedStyle(child).position;
      if (position === 'absolute' || position === 'fixed') return;
      var r = child.getBoundingClientRect();
      if (r.height) bottom = Math.max(bottom, r.bottom + window.pageYOffset);
    });
    return bottom;
  }

  function minWidth(el) {
    return parseFloat(window.getComputedStyle(el).minWidth) || 0;
  }

  // The height the box's content needs at its current width. boxes.css gives every
  // box min-height: min-content, so asking for no height at all gives exactly that.
  function minHeight(el) {
    var saved = el.style.height;
    el.style.height = '0px';
    var height = Math.max(el.offsetHeight, el.scrollHeight + el.offsetHeight - el.clientHeight);
    el.style.height = saved;
    return height;
  }

  // How far below its top a box has to stay in reach: where its title bar ends, or,
  // for the 414, all of it.
  function grabBottom(box) {
    var el = box.el;
    if (!box.stacked) return el.offsetHeight;
    var bar = el.querySelector('.box__titlebar');
    return Math.ceil(bar.getBoundingClientRect().bottom - el.getBoundingClientRect().top);
  }

  // Fits a rectangle to the screen. live (while dragging): the title bar (all of the
  // 414) stays in the visible viewport; otherwise anywhere on the page. A box without
  // a grip, and the 414, keep the size they have (the CSS's, or for the 414 the one
  // sizeSign gives it); only their place is fitted.
  function fit(box, r, live) {
    var el = box.el;
    var vp = viewport();
    var w, h;
    if (box.grip) {
      var minW = minWidth(el);
      w = Math.max(minW, Math.min(r.w, vp.width));
      el.style.width = w + 'px';
      h = Math.max(r.h, minHeight(el));
    } else {
      w = el.offsetWidth;
      h = el.offsetHeight;
    }
    // Bouncing, the 414 stays inside the hero.
    if (motion && box === sign) return motion.keep({ x: r.x, y: r.y, w: w, h: h });
    var x = clamp(r.x, 0, Math.max(0, vp.width - w));
    var top = live ? vp.top : 0;
    var bottom = (live ? vp.top + vp.height : pageBottom()) - grabBottom(box);
    var y = clamp(r.y, top, Math.max(top, bottom));
    return roundRect({ x: x, y: y, w: w, h: h });
  }

  function moved(box, start, dx, dy) {
    return fit(box, { x: start.x + dx, y: start.y + dy, w: start.w, h: start.h }, true);
  }

  // Resizing keeps the top-left corner; the grip can't be pulled past the right edge
  // of the screen or below the bottom of the viewport, nor the box below its minimum.
  function resized(box, start, dw, dh) {
    var el = box.el;
    var vp = viewport();
    var minW = minWidth(el);
    var w = clamp(start.w + dw, minW, Math.max(minW, vp.width - start.x));
    el.style.width = w + 'px';
    var minH = minHeight(el);
    var maxH = Math.max(minH, start.h, vp.top + vp.height - start.y);
    var h = clamp(start.h + dh, minH, maxH);
    return roundRect({ x: start.x, y: start.y, w: w, h: h });
  }

  /* ---------- The owners' layout (layout.js): the default ---------- */

  // Where the owners put an item, in page px ({ x, y, w, h } for the card, { x, y, w }
  // for the 414), or null where they leave it to the CSS.
  function ownerRect(item) {
    var site = window.studio414SiteLayout;
    var layout = site && typeof site.current === 'function' ? site.current() : null;
    var part = layout && layout[PARTS[item.id]];
    return part ? site.toPage(part) : null;
  }

  // The 414's text: the owners' big414Text, else 414. Only ever textContent.
  function setSignText() {
    if (!signText) return;
    var site = window.studio414SiteLayout;
    var layout = site && typeof site.current === 'function' ? site.current() : null;
    var text = layout && typeof layout.big414Text === 'string' ? layout.big414Text.trim() : '';
    if (!text) text = '414';
    if (signText.textContent !== text) signText.textContent = text;
    var label = text === '414' ? 'Studio ' : 'Studio 414: ';
    if (signLabel && signLabel.textContent !== label) signLabel.textContent = label;
  }

  // Sizes the 414 to the owners' width r.w (no wider than the screen), or gives it
  // back the size the CSS gives it (no r). With 414 its box is --big-w em wide. With
  // other text the box keeps that width (r.w, else the CSS's size times --big-w) and
  // the font size is that width over the text's advance width, measured in em at the
  // CSS's size (capped to the hero's height).
  function sizeSign(r) {
    var bigW = parseFloat(window.getComputedStyle(signEl).getPropertyValue('--big-w'));
    if (!(bigW > 0)) bigW = 0;
    if (!signText || signText.textContent === '414') {
      if (r && bigW) {
        signEl.style.fontSize = (Math.min(r.w, viewport().width) / bigW) + 'px';
      } else {
        signEl.style.removeProperty('font-size');
      }
      return;
    }
    signEl.style.removeProperty('font-size');
    var size = parseFloat(window.getComputedStyle(signEl).fontSize);
    var w = r ? Math.min(r.w, viewport().width) : size * bigW;
    var em = size > 0 ? signText.getBoundingClientRect().width / size : 0;
    if (!(w > 0 && em > 0)) return;
    // Short text could make it taller than the hero (the first screen, where bounce.js
    // keeps it): no taller than that (--big-h em), narrower then.
    var font = w / em;
    var bigH = parseFloat(window.getComputedStyle(signEl).getPropertyValue('--big-h'));
    var room = signEl.offsetParent ? signEl.offsetParent.clientHeight : 0;
    if (bigH > 0 && room > 0) font = Math.min(font, room / bigH);
    signEl.style.fontSize = font + 'px';
  }

  /* ---------- Rendering ---------- */

  function render(box, r) {
    var el = box.el;
    el.classList.add('is-placed');
    if (box.grip) {
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
    }
    var o = origin(el);
    el.style.left = (r.x - o.x) + 'px';
    el.style.top = (r.y - o.y) + 'px';
  }

  // Puts an item where it belongs, fitted to the screen: where the visitor left it,
  // else where the owners put it, else in the CSS layout.
  function refit(item) {
    var owner = ownerRect(item);
    if (item === sign) {
      setSignText();
      sizeSign(owner);
    }
    // Bouncing, it is only sized: bounce.js keeps it in the hero, wherever it is.
    if (item === sign && motion) {
      motion.measure();
      return;
    }
    var r = placed[item.id] || owner;
    if (!r) {
      unplace(item);
      return;
    }
    item.el.classList.add('is-placed');
    render(item, fit(item, r, false));
  }

  function unplace(box) {
    var el = box.el;
    el.classList.remove('is-placed');
    ['left', 'top', 'width', 'height'].forEach(function (property) {
      el.style.removeProperty(property);
    });
  }

  function stack() {
    order.forEach(function (id, index) {
      byId[id].el.style.zIndex = String(index + 1);
    });
  }

  function applyAll() {
    items.forEach(refit);
    stack();
  }

  // Brings a box to the front (the 414 stays under the boxes).
  function raise(box) {
    if (!box.stacked || order[order.length - 1] === box.id) return;
    order = order.filter(function (id) { return id !== box.id; }).concat(box.id);
    stack();
    save();
  }

  // Lifts a box out of the default layout exactly where it is, before it moves.
  function place(box) {
    var r = rectOf(box);
    if (!placed[box.id]) render(box, r);
    return r;
  }

  /* ---------- Dragging and resizing ---------- */

  function begin(box, kind, event) {
    if (gesture || !event.isPrimary || event.button !== 0) return;
    // No text selection and no focus change; the box keeps whatever had focus.
    event.preventDefault();
    lift(box, kind, event.currentTarget, event.pointerId, event.clientX, event.clientY);
  }

  // Starts a drag of the box by the pointer at (x, y), captured by target.
  function lift(box, kind, target, pointerId, x, y) {
    raise(box);
    var before = placed[box.id] || null;
    var start = place(box);
    gesture = {
      box: box,
      kind: kind,
      target: target,
      pointerId: pointerId,
      x: x,
      y: y,
      before: before,
      start: start,
      rect: start,
      since: performance.now(),
      far: false,                      // gone past SLOP
      trail: [{ t: performance.now(), x: x, y: y }]
    };
    try {
      target.setPointerCapture(pointerId);
    } catch (error) {
      // Without capture the drag still follows the pointer over the handle.
    }
    if (box.stacked) {
      root.classList.add(kind === 'move' ? 'is-moving-box' : 'is-sizing-box');
    } else {
      root.classList.add('is-moving-414');
      box.el.classList.add('is-lifted');
    }
  }

  function track(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    var dx = event.clientX - gesture.x;
    var dy = event.clientY - gesture.y;
    note(gesture, event.clientX, event.clientY);
    gesture.rect = gesture.kind === 'move'
      ? moved(gesture.box, gesture.start, dx, dy)
      : resized(gesture.box, gesture.start, dx, dy);
    render(gesture.box, gesture.rect);
  }

  // Keeps the pointer's places over the last FLING ms (and the one before), for a
  // throw, and whether it has gone past SLOP.
  function note(g, x, y) {
    var now = performance.now();
    g.trail.push({ t: now, x: x, y: y });
    while (g.trail.length > 2 && g.trail[1].t <= now - FLING) g.trail.shift();
    if (Math.abs(x - g.x) > SLOP || Math.abs(y - g.y) > SLOP) g.far = true;
  }

  // The pointer's speed over the last FLING ms, px/s: none if it held still.
  function flingOf(g) {
    var now = performance.now();
    var from = now - FLING;
    var a = g.trail[0];
    for (var i = 1; i < g.trail.length && g.trail[i].t <= from; i++) a = g.trail[i];
    var b = g.trail[g.trail.length - 1];
    var dt = Math.max(16, now - Math.max(a.t, from)) / 1000;
    return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
  }

  // up: the pointerup that ends it, if it does.
  function finish(cancel, up) {
    var g = gesture;
    if (!g) return;
    gesture = null;
    root.classList.remove('is-moving-box', 'is-sizing-box', 'is-moving-414');
    g.box.el.classList.remove('is-lifted');
    try {
      g.target.releasePointerCapture(g.pointerId);
    } catch (error) {
      // Already released.
    }

    if (motion && g.box === sign) {
      // Bouncing: it carries on from where it was let go (cancelled, picked up),
      // quicker after a tap, or the way it was thrown.
      if (cancel) {
        render(sign, g.start);
      } else if (up) {
        note(g, up.clientX, up.clientY);
        if (g.far) {
          var v = flingOf(g);
          motion.fling(v.x, v.y);
        } else if (!g.held && performance.now() - g.since < HOLD) {
          motion.tap();
        }
      }
      motion.go();
      return;
    }

    var r = g.rect;
    var unchanged = r.x === g.start.x && r.y === g.start.y && r.w === g.start.w && r.h === g.start.h;
    if (cancel || unchanged) {
      // Back to how it was: placed where it was, or in the default layout.
      if (g.before) {
        placed[g.box.id] = g.before;
      } else {
        delete placed[g.box.id];
      }
      refit(g.box);
    } else {
      placed[g.box.id] = r;
    }
    save();
    announce();
  }

  function end(event) {
    if (gesture && event.pointerId === gesture.pointerId) {
      finish(false, event.type === 'pointerup' ? event : null);
    }
  }

  /* ---------- Keyboard ---------- */

  function nudge(box, kind, event) {
    var d = KEYS[event.key];
    if (!d || event.altKey || event.ctrlKey || event.metaKey || gesture) return;
    event.preventDefault();
    raise(box);
    var start = place(box);
    var r = box.grip && (kind === 'size' || event.shiftKey)
      ? resized(box, start, d[0] * STEP, d[1] * STEP)
      : moved(box, start, d[0] * STEP, d[1] * STEP);
    if (motion && box === sign) {
      // Bouncing: nudged on its way.
      render(box, r);
      motion.go();
      return;
    }
    placed[box.id] = r;
    render(box, r);
    save();
    announce();
  }

  document.addEventListener('keydown', function (event) {
    if (gesture && event.key === 'Escape') {
      event.preventDefault();
      finish(true);
    }
  });

  /* ---------- Setting up ---------- */

  function button(className, label, hint) {
    var node = document.createElement('button');
    node.type = 'button';
    node.className = className;
    node.setAttribute('aria-label', label);
    node.title = hint;
    return node;
  }

  boxes.forEach(function (box) {
    var el = box.el;
    var title = el.querySelector('.box__title');
    var name = (title ? title.textContent.trim() : box.id).toLowerCase();

    var handle = button('box__handle', 'Move the ' + name + ' box', box.grip
      ? 'Drag to move. Arrow keys move it, Shift+arrow keys resize it.'
      : 'Drag to move. Arrow keys move it.');
    // First in the title bar, before the gumdrops, so Tab reaches the bar first.
    var bar = el.querySelector('.box__titlebar');
    bar.insertBefore(handle, bar.firstChild);
    var controls = [handle];
    var grip = null;
    if (box.grip) {
      grip = button('box__grip', 'Resize the ' + name + ' box',
        'Drag to resize. Arrow keys resize it.');
      el.appendChild(grip);
      controls.push(grip);
    }

    // On the preview page (?edit=1) edit.js drags the box, into the owners' layout.
    if (editing) return;
    handle.addEventListener('pointerdown', function (event) { begin(box, 'move', event); });
    handle.addEventListener('keydown', function (event) { nudge(box, 'move', event); });
    if (grip) {
      grip.addEventListener('pointerdown', function (event) { begin(box, 'size', event); });
      grip.addEventListener('keydown', function (event) { nudge(box, 'size', event); });
    }

    controls.forEach(function (control) {
      control.addEventListener('pointermove', track);
      control.addEventListener('pointerup', end);
      control.addEventListener('pointercancel', end);
      control.addEventListener('lostpointercapture', end);
    });

    // Whatever is touched or focused in a box brings it to the front.
    el.addEventListener('pointerdown', function () { raise(box); }, true);
    el.addEventListener('focusin', function () { raise(box); });
  });

  /* ---------- The big 414 ---------- */

  // A finger resting on the 414 lifts it after HOLD ms, unless it lets go or moves
  // more than SLOP px first: that is a swipe, which the browser scrolls.
  function holdStart(event) {
    if (gesture || hold || !event.isPrimary) return;
    hold = {
      pointerId: event.pointerId,
      target: event.currentTarget,
      x0: event.clientX,
      y0: event.clientY,
      x: event.clientX,
      y: event.clientY
    };
    hold.timer = window.setTimeout(function () {
      var h = hold;
      hold = null;
      if (!h || gesture) return;
      // Its shadow (styles.css) says it has been picked up.
      lift(sign, 'move', h.target, h.pointerId, h.x, h.y);
      gesture.held = true;             // too late for a tap
    }, HOLD);
  }

  function holdMove(event) {
    if (!hold || event.pointerId !== hold.pointerId) return;
    hold.x = event.clientX;
    hold.y = event.clientY;
    if (Math.abs(hold.x - hold.x0) > SLOP || Math.abs(hold.y - hold.y0) > SLOP) {
      holdCancel();
      settle();
    }
  }

  function holdCancel() {
    if (!hold) return;
    window.clearTimeout(hold.timer);
    hold = null;
  }

  // Bouncing, it carries on once nothing holds it any more.
  function settle() {
    if (motion && !hold && !(gesture && gesture.box === sign)) motion.go();
  }

  // For bounce.js (see the top of this file). hooks: { stop(), go(), keep(r),
  // measure() }; home: it starts from its default spot, else from where it is.
  function free(hooks, home) {
    holdCancel();
    if (gesture && gesture.box === sign) finish(false);
    if (hooks) {
      if (!motion) {
        kept414 = placed['414'] || null;
        delete placed['414'];
        if (home) refit(sign);
      }
      motion = hooks;
    } else if (motion) {
      motion = null;
      kept414 = null;
      placed['414'] = rectOf(sign);
      save();
    }
    announce();
    return true;
  }

  if (sign) {
    signEl.title = 'Drag to move. On a touch screen, press and hold it first.';

    // For the keyboard: beside the heading, not in it (styles.css shows it on focus).
    var signHandle = document.createElement('button');
    signHandle.type = 'button';
    signHandle.className = 'big-414__handle aqua-pill';
    signHandle.textContent = 'Move 414 with the arrow keys';
    signEl.appendChild(signHandle);
  }

  // On the preview page (?edit=1) edit.js drags the 414, into the owners' layout.
  if (sign && !editing) {
    signHandle.addEventListener('keydown', function (event) {
      var mod = event.altKey || event.ctrlKey || event.metaKey;
      if (motion && !gesture && !mod && (event.key === 'Enter' || event.key === ' ')) {
        // Bouncing: Enter or Space is a tap.
        event.preventDefault();
        if (!event.repeat) motion.tap();
        return;
      }
      nudge(sign, 'move', event);
    });

    // A mouse or pen picks it up at once; a finger after a long press.
    // Bouncing, a press stops it at once, so it can be caught.
    signEl.addEventListener('pointerdown', function (event) {
      if (motion) motion.stop();
      if (event.pointerType === 'touch') {
        holdStart(event);
      } else {
        begin(sign, 'move', event);
      }
      settle();
    });
    signEl.addEventListener('pointermove', function (event) {
      holdMove(event);
      track(event);
    });
    ['pointerup', 'pointercancel'].forEach(function (type) {
      signEl.addEventListener(type, function (event) {
        if (hold && event.pointerId === hold.pointerId) {
          // A finger let go before the 414 lifted, within SLOP: a tap.
          var tap = type === 'pointerup' &&
            Math.abs(event.clientX - hold.x0) <= SLOP && Math.abs(event.clientY - hold.y0) <= SLOP;
          holdCancel();
          if (tap && motion) motion.tap();
        }
        end(event);
        settle();
      });
    });
    signEl.addEventListener('lostpointercapture', end);

    // Once it is lifted, the finger's moves drag it instead of scrolling the page.
    // Until then nothing is cancelled, so a swipe over it scrolls as usual.
    signEl.addEventListener('touchmove', function (event) {
      if (gesture && gesture.box === sign && event.cancelable) event.preventDefault();
    }, { passive: false });

    // No context menu for a long press.
    signEl.addEventListener('contextmenu', function (event) {
      if (hold || (gesture && gesture.box === sign)) event.preventDefault();
    });

    window.studio414Sign = { free: free };
  }

  if (sign) {

    // Its size follows the font: size it (to the owners' width, and to its text) and
    // fit it to the screen again when the font changes, or a face finishes loading.
    var refitSign = function () {
      if (!gesture) refit(sign);
    };
    if (window.MutationObserver) {
      new MutationObserver(refitSign).observe(root, { attributes: true, attributeFilter: ['data-font'] });
    }
    if (document.fonts && document.fonts.addEventListener) {
      document.fonts.addEventListener('loadingdone', refitSign);
    }
  }

  document.addEventListener('studio414:layoutreset', function () {
    holdCancel();
    if (gesture) finish(true);
    placed = {};
    order = DEFAULT_ORDER.slice();
    applyAll();
    // Bouncing, the 414's stored spot stays.
    if (kept414) save(); else forget();
    announce();
    settle();
  });

  // The owners' layout changed (fetched, or apply() from the preview page): what the
  // visitor hasn't moved goes to its new place, and the 414 takes its new size and text.
  document.addEventListener('studio414:sitelayout', function () {
    if (!gesture) applyAll();
  });

  // Refit placed boxes to a resized or rotated window, once per frame at most.
  var refitQueued = false;
  window.addEventListener('resize', function () {
    if (refitQueued) return;
    refitQueued = true;
    window.requestAnimationFrame(function () {
      refitQueued = false;
      if (!gesture) applyAll();
    });
  });

  load();
  applyAll();
  announce();
})();
