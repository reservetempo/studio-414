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
  - A box can be closed (Display starts closed; switcher.js sets its hidden
    attribute). A closed box has no size, so it is never measured, fitted or saved
    while closed (its stored place is kept, and a drag of it is called off); when it
    opens again it is fitted to the screen where it was left and comes to the front.

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
*/
(function () {
  'use strict';

  var STORAGE_KEY = 'studio414.layout';
  var STEP = 10;
  // How long a finger rests on the 414 before it lifts (ms), and how far it may
  // wander meanwhile (px); moving further is a swipe, which scrolls the page.
  var HOLD = 450;
  var SLOP = 10;
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
  boxes.forEach(function (box) {
    box.fixed = box.el.classList.contains('box--fixed');
    box.stacked = true;
  });

  // Everything that moves: the boxes, and the big 414, which stays under them.
  var signEl = document.getElementById('big-414');
  var sign = signEl ? { id: '414', el: signEl, grip: false, fixed: false, stacked: false } : null;
  var items = sign ? boxes.concat(sign) : boxes.slice();
  if (!items.length || !window.PointerEvent) return;

  var byId = {};
  items.forEach(function (item) { byId[item.id] = item; });
  var DEFAULT_ORDER = boxes.map(function (box) { return box.id; });

  var placed = {};                     // id -> { x, y, w, h }, page px, as the visitor set it
  var order = DEFAULT_ORDER.slice();   // back to front (the boxes only)
  var gesture = null;
  var hold = null;                     // a finger resting on the 414, until it lifts

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
      items.forEach(function (item) {
        if (isRect(data.boxes[item.id])) placed[item.id] = roundRect(data.boxes[item.id]);
      });
    }
    if (Array.isArray(data.order)) {
      var known = data.order.filter(function (id, index) {
        return byId[id] && byId[id].stacked && data.order.indexOf(id) === index;
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
    // it on screen if it has been moved (and is open).
    if (gesture) return;
    boxes.forEach(function (box) {
      if (box.fixed) refit(box);
    });
  }

  /* ---------- Geometry (in page px; screen px for a fixed box) ---------- */

  function roundRect(r) {
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) };
  }

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  // False while the box is closed (hidden, so display: none): it has no size then.
  function isShown(box) {
    return !box.el.hidden && box.el.getClientRects().length > 0;
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

  // Where left: 0; top: 0 puts a placed box: the corner of the hero for the card and
  // the 414, of the page for the comments box.
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
  // 414) stays in the visible viewport; otherwise anywhere on the page. A fixed box
  // stays wholly on screen (or, if it were ever taller than the screen, with its title
  // bar at the top). A box without a grip, and the 414, keep the size their CSS gives
  // them; only their place is fitted.
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
      bottom = (live ? vp.top + vp.height : pageBottom()) - grabBottom(box);
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

  // Puts a placed box where it was left, fitted to the screen. A closed box is left
  // as it is; it is fitted when it opens.
  function refit(box) {
    var r = placed[box.id];
    if (!r || !isShown(box)) return;
    box.el.classList.add('is-placed');
    render(box, fit(box, r, false));
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
    items.forEach(function (item) {
      if (placed[item.id]) {
        refit(item);
      } else {
        unplace(item);
      }
    });
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
      rect: start
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
    gesture.rect = gesture.kind === 'move'
      ? moved(gesture.box, gesture.start, dx, dy)
      : resized(gesture.box, gesture.start, dx, dy);
    render(gesture.box, gesture.rect);
  }

  function finish(cancel) {
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

    var r = g.rect;
    var unchanged = r.x === g.start.x && r.y === g.start.y && r.w === g.start.w && r.h === g.start.h;
    if (cancel || unchanged) {
      // Back to how it was: placed where it was, or in the default layout.
      if (g.before) {
        placed[g.box.id] = g.before;
        refit(g.box);
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
    // At the end of the title bar, or before a close button there (Display's "x"), so
    // Tab reaches the bar first.
    var bar = el.querySelector('.box__titlebar');
    bar.insertBefore(handle, bar.querySelector('.box__close'));
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
    }, HOLD);
  }

  function holdMove(event) {
    if (!hold || event.pointerId !== hold.pointerId) return;
    hold.x = event.clientX;
    hold.y = event.clientY;
    if (Math.abs(hold.x - hold.x0) > SLOP || Math.abs(hold.y - hold.y0) > SLOP) holdCancel();
  }

  function holdCancel() {
    if (!hold) return;
    window.clearTimeout(hold.timer);
    hold = null;
  }

  if (sign) {
    signEl.title = 'Drag to move. On a touch screen, press and hold it first.';

    // For the keyboard: beside the heading, not in it (styles.css shows it on focus).
    var signHandle = document.createElement('button');
    signHandle.type = 'button';
    signHandle.className = 'big-414__handle';
    signHandle.textContent = 'Move 414 with the arrow keys';
    signEl.appendChild(signHandle);
    signHandle.addEventListener('keydown', function (event) { nudge(sign, 'move', event); });

    // A mouse or pen picks it up at once; a finger after a long press.
    signEl.addEventListener('pointerdown', function (event) {
      if (event.pointerType === 'touch') {
        holdStart(event);
      } else {
        begin(sign, 'move', event);
      }
    });
    signEl.addEventListener('pointermove', function (event) {
      holdMove(event);
      track(event);
    });
    ['pointerup', 'pointercancel'].forEach(function (type) {
      signEl.addEventListener(type, function (event) {
        if (hold && event.pointerId === hold.pointerId) holdCancel();
        end(event);
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

    // Its size follows the font: fit a moved 414 to the screen again when the font
    // changes, or a face finishes loading.
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
    forget();
    announce();
  });

  // A box closed (hidden) mid-drag puts the drag back; a box opened again is fitted
  // to the screen where it was left, and comes to the front.
  if (window.MutationObserver) {
    var observer = new MutationObserver(function (records) {
      records.forEach(function (record) {
        var box = boxes.filter(function (b) { return b.el === record.target; })[0];
        if (!box) return;
        if (!isShown(box)) {
          if (gesture && gesture.box === box) finish(true);
          return;
        }
        refit(box);
        raise(box);
      });
    });
    boxes.forEach(function (box) {
      observer.observe(box.el, { attributes: true, attributeFilter: ['hidden'] });
    });
  }

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
