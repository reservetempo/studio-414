/*
  Draggable, resizable boxes for Studio 414: the mailing-list card (#signup), the
  comments box (#comments-box) and the style switcher's "Display" window (#switcher,
  built by switcher.js), drawn as 90s windows by boxes.css.

  - Drag a box by its title bar; resize the card and the comments box with the grip in
    their bottom-right corner (Display has no grip: its rows have one size). Pointer
    events, so a mouse, a finger and a pen all work. Only the title bar and the grip
    take touch-action: none, so a finger anywhere else still scrolls the page.
  - Keyboard: the title bar and the grip are buttons. On the title bar the arrow keys
    move the box and Shift+arrow keys resize it (or, without a grip, move it too); on
    the grip the arrow keys resize it. Escape during a drag puts the box back.
  - The box last touched or focused comes to the front.
  - Until a box is moved or resized it keeps the default, responsive layout from the
    CSS. From then on it is "placed", and remembered in localStorage under
    "studio414.layout", with the order the boxes are stacked in. Without localStorage
    it all still works for the visit. The card and the comments box are then
    absolutely positioned at page coordinates (px from the top-left corner of the
    page, so they scroll with the page as the photo does). Display is fixed to the
    screen (box--fixed), so its coordinates are px from the top-left corner of the
    viewport and it stays put as the page scrolls.
  - Stored coordinates are kept as the visitor left them and fitted to the screen
    whenever they are applied (on load, and when the window is resized or rotated):
    no wider than the viewport and wholly inside it across, never smaller than the
    content needs, and with the title bar somewhere on the page (Display: wholly on
    screen). While dragging, the title bar stays inside the visible viewport. So a
    layout made on a wide window is squeezed onto a narrow one and comes back as it
    was when the window widens again.
  - "Reset" in Display sends "studio414:layoutreset", which puts every box back in
    the default layout. Every change sends "studio414:layoutchange"
    ({ detail: { custom } }), which shows or hides that button.
*/
(function () {
  'use strict';

  var STORAGE_KEY = 'studio414.layout';
  var STEP = 10;
  var KEYS = {
    ArrowLeft: [-1, 0],
    ArrowRight: [1, 0],
    ArrowUp: [0, -1],
    ArrowDown: [0, 1]
  };
  var root = document.documentElement;

  // Back to front, as they are stacked by default. fixed: positioned against the
  // screen (box--fixed in the CSS) rather than the page. grip: resizable.
  var boxes = [
    { id: 'signup', el: document.getElementById('signup'), grip: true },
    { id: 'comments', el: document.getElementById('comments-box'), grip: true },
    { id: 'switcher', el: document.getElementById('switcher'), grip: false }
  ].filter(function (box) {
    return box.el && box.el.querySelector('.box__titlebar');
  });
  if (!boxes.length || !window.PointerEvent) return;
  boxes.forEach(function (box) {
    box.fixed = box.el.classList.contains('box--fixed');
  });

  var byId = {};
  boxes.forEach(function (box) { byId[box.id] = box; });
  var DEFAULT_ORDER = boxes.map(function (box) { return box.id; });

  var placed = {};                     // id -> { x, y, w, h }, page px, as the visitor set it
  var order = DEFAULT_ORDER.slice();   // back to front
  var gesture = null;

  /* ---------- localStorage, always optional ---------- */

  function isRect(value) {
    return value && typeof value === 'object' &&
      ['x', 'y', 'w', 'h'].every(function (key) {
        return typeof value[key] === 'number' && isFinite(value[key]) && Math.abs(value[key]) < 1e6;
      }) && value.w > 0 && value.h > 0;
  }

  function load() {
    var data = null;
    try {
      data = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    } catch (error) {
      data = null;
    }
    if (!data || typeof data !== 'object') return;
    if (data.boxes && typeof data.boxes === 'object') {
      boxes.forEach(function (box) {
        if (isRect(data.boxes[box.id])) placed[box.id] = roundRect(data.boxes[box.id]);
      });
    }
    if (Array.isArray(data.order)) {
      var known = data.order.filter(function (id, index) {
        return byId[id] && data.order.indexOf(id) === index;
      });
      // Boxes the stored order doesn't know yet (Display, for layouts saved before
      // it was a window) go on top, as they would by default.
      order = known.concat(DEFAULT_ORDER.filter(function (id) { return known.indexOf(id) < 0; }));
    }
  }

  function save() {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, boxes: placed, order: order }));
    } catch (error) {
      // Storage is optional: the layout still holds for this visit.
    }
  }

  function forget() {
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
    // That shows or hides the Layout row in Display, which changes its height: keep
    // it on screen if it has been moved.
    boxes.forEach(function (box) {
      if (box.fixed && placed[box.id] && !gesture) render(box, fit(box, placed[box.id], false));
    });
  }

  /* ---------- Geometry (in page px; screen px for a fixed box) ---------- */

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

  // Where the box is now: in page px, or in screen px for a fixed box.
  function rectOf(box) {
    var r = box.el.getBoundingClientRect();
    var dx = box.fixed ? 0 : window.pageXOffset;
    var dy = box.fixed ? 0 : window.pageYOffset;
    return roundRect({ x: r.left + dx, y: r.top + dy, w: r.width, h: r.height });
  }

  // Where left: 0; top: 0 puts a placed box: the corner of the hero for the card, of
  // the page for the comments box.
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

  // How far below the top of the box its title bar ends.
  function titleBottom(el) {
    var bar = el.querySelector('.box__titlebar');
    return Math.ceil(bar.getBoundingClientRect().bottom - el.getBoundingClientRect().top);
  }

  // Fits a rectangle to the screen. live (while dragging): the title bar stays in the
  // visible viewport; otherwise anywhere on the page. A fixed box stays wholly on
  // screen (or, if it were ever taller than the screen, with its title bar at the top).
  // A box without a grip keeps the size its CSS gives it; only its place is fitted.
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
    var x = clamp(r.x, 0, Math.max(0, vp.width - w));
    var top, bottom;
    if (box.fixed) {
      top = 0;
      bottom = vp.height - h;
    } else {
      top = live ? vp.top : 0;
      bottom = (live ? vp.top + vp.height : pageBottom()) - titleBottom(el);
    }
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

  /* ---------- Rendering ---------- */

  function render(box, r) {
    var el = box.el;
    el.classList.add('is-placed');
    if (box.grip) {
      el.style.width = r.w + 'px';
      el.style.height = r.h + 'px';
    }
    var o = box.fixed ? { x: 0, y: 0 } : origin(el);
    el.style.left = (r.x - o.x) + 'px';
    el.style.top = (r.y - o.y) + 'px';
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
    boxes.forEach(function (box) {
      var r = placed[box.id];
      if (!r) {
        unplace(box);
        return;
      }
      box.el.classList.add('is-placed');
      render(box, fit(box, r, false));
    });
    stack();
  }

  function raise(box) {
    if (order[order.length - 1] === box.id) return;
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
    raise(box);
    var before = placed[box.id] || null;
    var start = place(box);
    gesture = {
      box: box,
      kind: kind,
      target: event.currentTarget,
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      before: before,
      start: start,
      rect: start
    };
    try {
      gesture.target.setPointerCapture(event.pointerId);
    } catch (error) {
      // Without capture the drag still follows the pointer over the handle.
    }
    root.classList.add(kind === 'move' ? 'is-moving-box' : 'is-sizing-box');
  }

  function track(event) {
    if (!gesture || event.pointerId !== gesture.pointerId) return;
    var dx = event.clientX - gesture.x;
    var dy = event.clientY - gesture.y;
    gesture.rect = gesture.kind === 'move'
      ? moved(gesture.box, gesture.start, dx, dy)
      : resized(gesture.box, gesture.start, dx, dy);
    render(gesture.box, gesture.rect);
  }

  function finish(cancel) {
    var g = gesture;
    if (!g) return;
    gesture = null;
    root.classList.remove('is-moving-box', 'is-sizing-box');
    try {
      g.target.releasePointerCapture(g.pointerId);
    } catch (error) {
      // Already released.
    }

    var r = g.rect;
    var unchanged = r.x === g.start.x && r.y === g.start.y && r.w === g.start.w && r.h === g.start.h;
    if (cancel || unchanged) {
      // Back to how it was: placed where it was, or in the default layout.
      if (g.before) {
        placed[g.box.id] = g.before;
        render(g.box, fit(g.box, g.before, false));
      } else {
        delete placed[g.box.id];
        unplace(g.box);
      }
    } else {
      placed[g.box.id] = r;
    }
    save();
    announce();
  }

  function end(event) {
    if (gesture && event.pointerId === gesture.pointerId) finish(false);
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
    el.querySelector('.box__titlebar').appendChild(handle);
    handle.addEventListener('pointerdown', function (event) { begin(box, 'move', event); });
    handle.addEventListener('keydown', function (event) { nudge(box, 'move', event); });
    var controls = [handle];

    if (box.grip) {
      var grip = button('box__grip', 'Resize the ' + name + ' box',
        'Drag to resize. Arrow keys resize it.');
      el.appendChild(grip);
      grip.addEventListener('pointerdown', function (event) { begin(box, 'size', event); });
      grip.addEventListener('keydown', function (event) { nudge(box, 'size', event); });
      controls.push(grip);
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

  document.addEventListener('studio414:layoutreset', function () {
    if (gesture) finish(true);
    placed = {};
    order = DEFAULT_ORDER.slice();
    applyAll();
    forget();
    announce();
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
