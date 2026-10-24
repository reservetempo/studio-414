/*
  The big 414 (#big-414) drifts around the first screen (.hero, over the photo) and
  bounces off its edges and corners, like an old screensaver logo. It scrolls away
  with the page, and stays under the windows as before (z-index 0, styles.css).

  - It starts from its default spot and size (the owners' layout, else the CSS's),
    heading off at a random angle, 15-35 degrees above or below the horizontal, to
    the left or the right. Its speed follows the screen: it covers the hero's width
    in about SECONDS_ACROSS, but never goes slower than MIN_SPEED.
  - It stays wholly inside the hero: it turns back on the left and right edges, and
    on the top and bottom ones (both at once in a corner). Where it is wider (or
    taller) than the hero it stays centred that way and only moves the other.
  - The motion is in px per second, the same at any frame rate; a frame counts for
    MAX_FRAME at most, so it doesn't jump after the tab was hidden. The sizes are
    measured only when they can change (boxes.js calls measure() on a resize, a font
    change or a new owners' layout), not every frame. It moves by left and top, as
    boxes.js does, so a focused "Move 414" button can still rise over the windows
    (a transform would make the 414 a stacking context and keep it under them).
  - boxes.js still drags it (see the top of that file): it frees the 414 through
    window.studio414Sign.free(hooks), stops it while it is pressed and dragged, and
    lets it carry on from where it is dropped, at the speed and direction it had.
  - Not with "reduce motion" (prefers-reduced-motion: reduce): then it holds still
    and boxes.js places it as before. A change of that setting while the page is
    open stops it where it is, or starts it from there. Nor with ?edit=1 (the owners'
    preview page, where edit.js moves it): there it holds still where it is placed,
    which is where it starts on the site.

  window.studio414Bounce, to change its speed and direction from outside:
    active()           true while it bounces (false with reduce motion)
    moving()           true while it bounces and nothing holds it
    baseSpeed()        its gentle speed on this screen, px/s
    velocity()         { x, y }, px/s (y down)
    setVelocity(x, y)  a new speed and direction at once (the edges only turn it)
    setSpeed(s)        a new speed, px/s, in the same direction
  A speed is kept in proportion to baseSpeed(), so it stays as quick for the screen
  when the window is resized.
*/
(function () {
  'use strict';

  // About how long it takes to cover the first screen's width (s), and the slowest
  // it ever goes (px/s).
  var SECONDS_ACROSS = 13;
  var MIN_SPEED = 30;
  // Its starting angle above or below the horizontal (degrees).
  var MIN_ANGLE = 15;
  var MAX_ANGLE = 35;
  // The longest a frame may count for (s).
  var MAX_FRAME = 0.05;

  var el = document.getElementById('big-414');
  var hero = el && (el.closest('.hero') || el.parentElement);
  var sign = window.studio414Sign;
  var editing = new URLSearchParams(window.location.search).get('edit') === '1';
  if (!el || !hero || !sign || editing || !window.requestAnimationFrame) return;

  var on = false;        // bouncing (no reduced motion)
  var held = false;      // pressed or dragged: boxes.js holds it
  var x = 0, y = 0;      // its top-left corner, px from the hero's
  var w = 0, h = 0;      // its size
  var roomW = 0, roomH = 0;
  var dirX = 1, dirY = 0; // its direction, a unit vector
  var boost = 1;         // its speed, in baseSpeed()s
  var base = MIN_SPEED;
  var raf = 0;
  var last = null;

  function clamp(value, min, max) {
    return Math.max(min, Math.min(value, max));
  }

  // Where a size fits along a room: anywhere from 0 to the far side, or, where it
  // doesn't fit, centred.
  function limit(value, size, room) {
    return size > room ? (room - size) / 2 : clamp(value, 0, room - size);
  }

  function pickDirection() {
    var angle = (MIN_ANGLE + Math.random() * (MAX_ANGLE - MIN_ANGLE)) * Math.PI / 180;
    dirX = Math.cos(angle) * (Math.random() < 0.5 ? -1 : 1);
    dirY = Math.sin(angle) * (Math.random() < 0.5 ? -1 : 1);
  }

  // The hero's padding corner (where left: 0; top: 0 puts the 414), in viewport px.
  function corner() {
    var r = hero.getBoundingClientRect();
    return { x: r.left + hero.clientLeft, y: r.top + hero.clientTop };
  }

  // Takes its place from where it is now (boxes.js may have moved it).
  function read() {
    var r = el.getBoundingClientRect();
    var c = corner();
    x = r.left - c.x;
    y = r.top - c.y;
  }

  function draw() {
    el.style.left = x + 'px';
    el.style.top = y + 'px';
  }

  // Measures the hero and the 414 again, and keeps it inside.
  function measure() {
    if (!on) return;
    roomW = hero.clientWidth;
    roomH = hero.clientHeight;
    var r = el.getBoundingClientRect();
    w = r.width;
    h = r.height;
    base =Math.max(MIN_SPEED, roomW / SECONDS_ACROSS);
    x = limit(x, w, roomW);
    y = limit(y, h, roomH);
    draw();
    kick();
  }

  // Moves along one axis by d, turning back at either end. Returns the new place and
  // direction sign.
  function along(p, d, dir, size, room) {
    var far = room - size;
    if (far <= 0) return [far / 2, dir];
    p += d;
    if (p < 0) {
      p = -p;
      dir = Math.abs(dir);
    } else if (p > far) {
      p = 2 * far - p;
      dir = -Math.abs(dir);
    }
    return [clamp(p, 0, far), dir];
  }

  // Whether it can move at all: bouncing, not held, with a speed and room to move.
  function canMove() {
    return on && !held && boost > 0 && (w < roomW || h < roomH);
  }

  function frame(now) {
    raf = 0;
    if (!canMove()) return;
    var dt = last === null ? 0 : Math.min(MAX_FRAME, Math.max(0, now - last) / 1000);
    last = now;
    var v = base * boost;
    var ax = along(x, dirX * v * dt, dirX, w, roomW);
    var ay = along(y, dirY * v * dt, dirY, h, roomH);
    x = ax[0];
    dirX = ax[1];
    y = ay[0];
    dirY = ay[1];
    draw();
    raf = window.requestAnimationFrame(frame);
  }

  // Starts the frames, unless they are already coming or it can't move.
  function kick() {
    if (raf || !canMove()) return;
    last = null;
    raf = window.requestAnimationFrame(frame);
  }

  function halt() {
    if (raf) window.cancelAnimationFrame(raf);
    raf = 0;
  }

  // What boxes.js calls (see the top of boxes.js).
  var hooks = {
    stop: function () {
      held = true;
      halt();
    },
    go: function () {
      if (!on) return;
      held = false;
      read();
      measure();
    },
    keep: function (r) {
      var c = corner();
      var ox = c.x + window.pageXOffset;
      var oy = c.y + window.pageYOffset;
      return {
        x: ox + limit(r.x - ox, r.w, hero.clientWidth),
        y: oy + limit(r.y - oy, r.h, hero.clientHeight),
        w: r.w,
        h: r.h
      };
    },
    measure: measure
  };

  function start(home) {
    if (on) return;
    if (!sign.free(hooks, home)) return;
    on = true;
    held = false;
    boost = 1;
    pickDirection();
    read();
    el.classList.add('is-placed');
    measure();
  }

  function stop() {
    if (!on) return;
    on = false;
    held = false;
    halt();
    sign.free(null);
  }

  window.studio414Bounce = {
    active: function () { return on; },
    moving: function () { return on && !held; },
    baseSpeed: function () { return base; },
    velocity: function () {
      var v = base * boost;
      return { x: dirX * v, y: dirY * v };
    },
    setVelocity: function (vx, vy) {
      var speed = Math.sqrt(vx * vx + vy * vy);
      if (!isFinite(speed)) return;
      if (speed > 0) {
        dirX = vx / speed;
        dirY = vy / speed;
      }
      boost = speed / base;
      kick();
    },
    setSpeed: function (s) {
      if (!isFinite(s) || s < 0) return;
      boost = s / base;
      kick();
    }
  };

  var query = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function follow() {
    if (query && query.matches) stop(); else start(false);
  }
  if (query) {
    if (query.addEventListener) query.addEventListener('change', follow);
    else if (query.addListener) query.addListener(follow);
  }
  if (!query || !query.matches) start(true);
})();
