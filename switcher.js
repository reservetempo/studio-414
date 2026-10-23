/*
  Style switcher for Studio 414.

  Lets friends try twenty display faces (fonts.css) and say which they like in a
  comment by number ("font 6").
  Font 0 is the default design (Terminal Grotesque); font 1 is EB Garamond, the
  original face. The colour is not picked here: the owner picks the site's colour
  (colors.css, data-color on <html>), and this file leaves it alone.

  The panel is a second Mac OS X Aqua window, "Display" (#switcher, styled by
  boxes.css and switcher.css), fixed to the screen. boxes.js lets it be dragged by
  its title bar like the other boxes.

  Display starts closed. A paint roller button fixed in the bottom-left corner
  (.switcher-toggle, a glossy button that stays pressed in while Display is open)
  opens it and, pressed again, closes it; so do the red gumdrop in its title bar and
  Escape anywhere inside it. Opening moves the focus to its title bar and closing
  gives it back to the button. Closed is just the hidden attribute: boxes.js leaves a hidden box
  alone and fits it to the screen again, where it was left, when it opens. Whether it
  was left open is kept in localStorage under "studio414.display" ("open" or
  "closed"), so a first visit starts closed.

  The rows, top to bottom: Part, Font, then two "Reset" buttons that show only while
  there is something to reset (Styles and Layout).

  Part picks what the Font row shows and changes: "Everything" (the page and every
  window) or one window (PARTS below: the mailing list, the Workshops dialogs or
  Display itself with its paint roller). The comment section is not a window and
  follows Everything.

  Everything's font lives on <html data-font="N">. A small inline script in
  index.html's <head> sets it before first paint, from the URL (?font=6, which wins)
  or else from localStorage ("studio414.style.font"); this file builds the panel and
  keeps the attribute, localStorage and the URL in step as the choice changes. Values
  that are not a whole number from 0 to the last font (20) count as 0.

  A window's Font starts with "Same as everything", its default; the ‹ › steps go
  through it too. Any other choice puts data-font on that window's own elements, over
  Everything (fonts.css), and keeps it there when Everything changes; "Same as
  everything" removes the attribute again. Each is kept in localStorage under
  "studio414.style.<part>.font" (the part's key in PARTS, e.g.
  "studio414.style.mailing.font"); a missing or invalid key means "Same as
  everything". They are not put in the URL, which carries Everything alone.
  A second inline script, in index.html's <body> just after the windows (before the
  deferred scripts), sets them on the windows in the page before first paint; this
  file sets Display's own as it builds it, and all of them again in case that script
  is missing. Its list of windows and their selectors must match PARTS.

  Display used to pick colours too. Any colour keys left in localStorage from then
  ("studio414.style.color", "studio414.style.<part>.color") are ignored and left as
  they are, and ?color= in the URL is neither read nor written here.

  "Reset" on the Styles row puts every window back to "Same as everything" and clears
  their keys; it shows only while some window has its own font.
  "Reset" on the Layout row is for the layout of the boxes, shown only while a box
  (this window included) has been moved or resized. boxes.js reports that with a
  "studio414:layoutchange" event ({ detail: { custom } }); the button asks it to reset
  with "studio414:layoutreset". Without boxes.js the row just stays hidden.
  Either button gives the focus to the Font dropdown when it goes away under it.

  To remove the switcher: delete switcher.js, switcher.css, fonts.css and fonts/,
  their <link> / <script> tags, the font part of the inline script in <head> and the
  inline script in <body> after the windows. The tokens in styles.css (--display-*
  and the rest) keep EB Garamond (font 1) as the display face on their own.
*/
(function () {
  'use strict';

  var KEY_PREFIX = 'studio414.style.';
  var OPEN_KEY = 'studio414.display';
  var root = document.documentElement;

  // The fonts, by number (fonts.css).
  var FONTS = [
    'Terminal Grotesque',
    'EB Garamond',
    'Basteleur',
    'Lineal',
    'Le Murmure',
    'Sligoil',
    'Ouroboros',
    'Façade',
    'Karrik',
    'Trickster',
    'Compagnon',
    'Anthony',
    'Victorianna',
    'Gulax',
    'BackOut',
    'Bluu Next',
    'Daubenton',
    'Grotesk',
    'Kaeru Kaeru',
    'Format 1452',
    'Flor de Ruina'
  ];

  // The number of the last font: 20.
  var LAST = FONTS.length - 1;

  // What the Part row can pick. Everything (key null) is <html>; each other part is a
  // window, its elements found by selector, that can carry its own font. key names it
  // in localStorage ("studio414.style.<key>.font"). The inline script in index.html's
  // <body>, after the windows, repeats these (all but Display, which this file builds).
  var PARTS = [
    { key: null, label: 'Everything' },
    { key: 'mailing', label: 'Mailing list', selector: '#signup' },
    { key: 'workshops', label: 'Workshops', selector: '#workshops, #workshop' },
    { key: 'display', label: 'Display', selector: '#switcher, .switcher-toggle' }
  ];

  /* ---------- Values, storage and the URL ---------- */

  // A whole number from 0 to the last font, or else null.
  function check(value) {
    var text = String(value == null ? '' : value).trim();
    return /^(0|[1-9][0-9]?)$/.test(text) && Number(text) <= LAST ? Number(text) : null;
  }

  function parse(value) {
    var number = check(value);
    return number === null ? 0 : number;
  }

  function readStorage(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function writeStorage(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (error) {
      // Storage is optional: the URL still carries the choice.
    }
  }

  function removeStorage(key) {
    try {
      window.localStorage.removeItem(key);
    } catch (error) {
      // Nothing to clear without storage.
    }
  }

  // The head script has already applied the choice; read it back, or work it out
  // again the same way if that script is missing.
  function initialValue() {
    var attr = root.getAttribute('data-font');
    if (attr != null) return parse(attr);
    var params = new URLSearchParams(window.location.search);
    if (params.has('font')) return parse(params.get('font'));
    return parse(readStorage(KEY_PREFIX + 'font'));
  }

  // Everything's font.
  var font = initialValue();

  function apply() {
    root.setAttribute('data-font', String(font));
  }

  function save() {
    writeStorage(KEY_PREFIX + 'font', String(font));
  }

  // Each window's own font, by its key: a number, or null for "Same as everything".
  var own = {};
  PARTS.forEach(function (part) {
    if (part.key !== null) own[part.key] = check(readStorage(KEY_PREFIX + part.key + '.font'));
  });

  // The part's font: a number, or null for a window that follows Everything.
  function choice(part) {
    return part.key === null ? font : own[part.key];
  }

  function hasOwn() {
    return PARTS.some(function (part) {
      return part.key !== null && own[part.key] !== null;
    });
  }

  // Puts a window's own font on its elements, or takes it off to follow <html>.
  function applyOwn(part) {
    var value = own[part.key];
    Array.prototype.forEach.call(document.querySelectorAll(part.selector), function (node) {
      if (value === null) node.removeAttribute('data-font');
      else node.setAttribute('data-font', String(value));
    });
  }

  function saveOwn(part) {
    var key = KEY_PREFIX + part.key + '.font';
    if (own[part.key] === null) removeStorage(key);
    else writeStorage(key, String(own[part.key]));
  }

  // Puts ?font=N in the address bar (keeping any other parameters, ?color= among them,
  // and the hash), so the address can be copied and shared as it is.
  function reflectInUrl() {
    if (!window.history || typeof window.history.replaceState !== 'function') return;
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('font', String(font));
      if (url.href !== window.location.href) {
        window.history.replaceState(window.history.state, '', url.href);
      }
    } catch (error) {
      // Some sandboxed frames refuse replaceState; the choice still applies.
    }
  }

  /* ---------- The panel ---------- */

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // The part's font in words: "Font 6, Façade", or for a window that follows
  // Everything, "Font same as everything (6, Façade)".
  function describeChoice(part) {
    var value = choice(part);
    if (value !== null) return 'Font ' + value + ', ' + FONTS[value];
    return 'Font same as everything (' + font + ', ' + FONTS[font] + ')';
  }

  // The part the Font row shows and changes.
  var shown = PARTS[0];

  // An Aqua window like the card: a title bar with the three gumdrops and the title,
  // then the rows. box--fixed tells boxes.js and boxes.css that it is fixed to the
  // screen rather than placed in the page.
  var panel = element('aside', 'switcher box box--fixed');
  panel.id = 'switcher';
  panel.setAttribute('aria-label', 'Font switcher');

  var titlebar = element('div', 'box__titlebar');
  var lights = element('span', 'box__lights');

  // The red gumdrop is the close button (boxes.css), over the drag handle; the yellow
  // and green ones are only decoration.
  var closeButton = element('button', 'box__light box__light--close box__close');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close Display');
  closeButton.title = 'Close';
  closeButton.innerHTML =
    '<svg viewBox="0 0 7 7" aria-hidden="true" focusable="false">' +
    '<path d="M1 1l5 5M6 1L1 6" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" fill="none"/></svg>';
  lights.appendChild(closeButton);
  ['min', 'zoom'].forEach(function (kind) {
    var light = element('span', 'box__light box__light--' + kind);
    light.setAttribute('aria-hidden', 'true');
    lights.appendChild(light);
  });
  titlebar.appendChild(lights);
  titlebar.appendChild(element('span', 'box__title', 'Display'));
  panel.appendChild(titlebar);

  var body = element('div', 'switcher__body');
  panel.appendChild(body);

  var live = element('p', 'switcher__live');
  live.setAttribute('aria-live', 'polite');
  live.setAttribute('role', 'status');

  // A row: a label, then a dropdown between ‹ and › step buttons. The aria-labels of
  // the dropdown and the buttons are set by render(), as they name the part shown.
  function buildRow(name, selectClass) {
    var row = element('div', 'switcher__row');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', name);

    var label = element('span', 'switcher__label', name);
    label.setAttribute('aria-hidden', 'true');

    var prev = element('button', 'switcher__step aqua-pill', '‹');
    prev.type = 'button';
    var select = element('select', 'switcher__select aqua-popup ' + selectClass);
    var next = element('button', 'switcher__step aqua-pill', '›');
    next.type = 'button';

    row.appendChild(label);
    row.appendChild(prev);
    row.appendChild(select);
    row.appendChild(next);
    return { row: row, prev: prev, select: select, next: next };
  }

  /* Part */

  var partControl = buildRow('Part', 'switcher__select--part');
  partControl.select.setAttribute('aria-label', 'Part of the page to change');
  partControl.prev.setAttribute('aria-label', 'Previous part');
  partControl.next.setAttribute('aria-label', 'Next part');
  PARTS.forEach(function (part, index) {
    var item = element('option', null, part.label);
    item.value = String(index);
    partControl.select.appendChild(item);
  });

  function stepPart(by) {
    show(PARTS[(PARTS.indexOf(shown) + by + PARTS.length) % PARTS.length]);
  }

  partControl.prev.addEventListener('click', function () {
    stepPart(-1);
  });
  partControl.next.addEventListener('click', function () {
    stepPart(1);
  });
  partControl.select.addEventListener('change', function () {
    show(PARTS[Number(partControl.select.value)] || PARTS[0]);
  });

  body.appendChild(partControl.row);

  /* Font */

  // The next font one step (by: 1 or -1) from value, round in a loop. A window's loop
  // starts with "Same as everything" (null), before 0.
  function step(value, by) {
    var count = LAST + 1;
    if (shown.key === null) return (value + by + count) % count;
    var index = value === null ? 0 : value + 1;
    index = (index + by + count + 1) % (count + 1);
    return index === 0 ? null : index - 1;
  }

  var fontControl = buildRow('Font', 'switcher__select--font');
  FONTS.forEach(function (name, index) {
    var item = element('option', null, index + ' — ' + name);
    item.value = String(index);
    fontControl.select.appendChild(item);
  });
  // First in the list while a window is shown (render() puts it in and takes it out).
  var sameOption = element('option', null, 'Same as everything');
  sameOption.value = '';

  fontControl.prev.addEventListener('click', function () {
    set(step(choice(shown), -1));
  });
  fontControl.next.addEventListener('click', function () {
    set(step(choice(shown), 1));
  });
  fontControl.select.addEventListener('change', function () {
    var value = fontControl.select.value;
    set(value === '' && shown.key !== null ? null : parse(value));
  });

  body.appendChild(fontControl.row);

  /* ---------- Resetting the windows' own styles ---------- */

  var stylesRow = element('div', 'switcher__row');
  stylesRow.setAttribute('role', 'group');
  stylesRow.setAttribute('aria-label', 'Styles');
  stylesRow.hidden = true;

  var stylesLabel = element('span', 'switcher__label', 'Styles');
  stylesLabel.setAttribute('aria-hidden', 'true');

  var stylesReset = element('button', 'switcher__reset aqua-pill', 'Reset');
  stylesReset.type = 'button';
  stylesReset.setAttribute('aria-label', 'Reset styles');
  stylesReset.title = 'Give every window the same font as everything';
  stylesReset.addEventListener('click', function () {
    PARTS.forEach(function (part) {
      if (part.key === null) return;
      own[part.key] = null;
      applyOwn(part);
      saveOwn(part);
    });
    render();
    live.textContent = 'Styles reset: every window is the same as everything.';
  });

  stylesRow.appendChild(stylesLabel);
  stylesRow.appendChild(stylesReset);
  body.appendChild(stylesRow);

  /* ---------- Resetting the layout of the boxes (boxes.js) ---------- */

  var layoutRow = element('div', 'switcher__row');
  layoutRow.setAttribute('role', 'group');
  layoutRow.setAttribute('aria-label', 'Layout');
  layoutRow.hidden = true;

  var layoutLabel = element('span', 'switcher__label', 'Layout');
  layoutLabel.setAttribute('aria-hidden', 'true');

  var resetButton = element('button', 'switcher__reset aqua-pill', 'Reset');
  resetButton.type = 'button';
  resetButton.setAttribute('aria-label', 'Reset layout');
  resetButton.title = 'Put the windows back where they were, at their original size';
  resetButton.addEventListener('click', function () {
    document.dispatchEvent(new CustomEvent('studio414:layoutreset'));
    live.textContent = 'Layout reset.';
  });

  document.addEventListener('studio414:layoutchange', function (event) {
    var custom = Boolean(event.detail && event.detail.custom);
    // Keep focus in the panel when the button it was on goes away.
    if (!custom && document.activeElement === resetButton) fontControl.select.focus();
    layoutRow.hidden = !custom;
  });

  layoutRow.appendChild(layoutLabel);
  layoutRow.appendChild(resetButton);
  body.appendChild(layoutRow);
  body.appendChild(live);

  /* ---------- Credit ---------- */

  var credit = element('footer', 'switcher-credit');
  credit.appendChild(document.createTextNode('Display fonts from '));
  var creditLink = element('a', null, 'Velvetyne');
  creditLink.href = 'https://velvetyne.fr';
  credit.appendChild(creditLink);
  credit.appendChild(document.createTextNode(', under the SIL Open Font License.'));

  /* ---------- Opening and closing: the paint roller ---------- */

  // A glossy Aqua button (aqua-pill) with a pixel paint roller (16 x 16, drawn at twice the size):
  // a black outline and handle, and a roller covered in the site colour's own title-bar
  // colour, with a lit top and a shaded bottom row (switcher.css).
  var toggle = element('button', 'switcher-toggle aqua-pill');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Display: fonts');
  toggle.setAttribute('aria-controls', panel.id);
  toggle.title = 'Display: fonts';
  toggle.innerHTML =
    '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' +
    '<path class="switcher-toggle__paint" d="M2 2h9v4H2z"/>' +
    '<path class="switcher-toggle__shine" d="M2 2h9v1H2z"/>' +
    '<path class="switcher-toggle__shade" d="M2 5h9v1H2z"/>' +
    '<path fill="currentColor" d="M1 1h11v1H1zM1 6h11v1H1zM1 2h1v4H1zM11 2h1v4h-1zM12 3h2v1h-2zM13 4h1v4h-1zM6 8h8v1H6zM6 9h1v1H6zM5 10h3v5H5zM6 15h1v1H6z"/></svg>';

  function isOpen() {
    return !panel.hidden;
  }

  // Opens or closes Display. focus: move the focus with it (into its title bar on
  // opening, back to the paint roller on closing), as when the visitor does it.
  function setOpen(open, focus) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    writeStorage(OPEN_KEY, open ? 'open' : 'closed');
    if (!focus) return;
    if (open) {
      // The drag handle over the title bar (boxes.js), or else the red gumdrop.
      (panel.querySelector('.box__handle') || closeButton).focus();
    } else {
      toggle.focus();
    }
  }

  toggle.addEventListener('click', function () {
    setOpen(!isOpen(), true);
  });

  closeButton.addEventListener('click', function () {
    setOpen(false, true);
  });

  panel.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' || event.defaultPrevented) return;
    // Escape during a drag puts the window back instead (boxes.js).
    if (root.classList.contains('is-moving-box') || root.classList.contains('is-sizing-box')) return;
    event.preventDefault();
    setOpen(false, true);
  });

  // Closed on a first visit; as the visitor left it after that.
  var startOpen = readStorage(OPEN_KEY) === 'open';
  panel.hidden = !startOpen;
  toggle.setAttribute('aria-expanded', String(startOpen));

  /* ---------- Updating ---------- */

  // Shows the shown part's font in its row (with "Same as everything" first in the
  // list for a window), names that part in the labels, and shows the Styles row while
  // some window has its own font.
  function render() {
    var isWindow = shown.key !== null;
    var part = shown.label.toLowerCase();
    var select = fontControl.select;
    var range = '0 to ' + LAST;
    var value = choice(shown);
    partControl.select.value = String(PARTS.indexOf(shown));

    if (isWindow && sameOption.parentNode !== select) {
      select.insertBefore(sameOption, select.firstChild);
    } else if (!isWindow && sameOption.parentNode === select) {
      select.removeChild(sameOption);
    }
    select.value = value === null ? '' : String(value);
    select.title = describeChoice(shown);
    select.setAttribute('aria-label', isWindow ?
      shown.label + ' font (Same as everything, or ' + range + ')' :
      'Font for everything (' + range + ')');
    fontControl.prev.setAttribute('aria-label', 'Previous font for ' + part);
    fontControl.next.setAttribute('aria-label', 'Next font for ' + part);

    var custom = hasOwn();
    // Keep focus in the panel when the button it was on goes away.
    if (!custom && document.activeElement === stylesReset) select.focus();
    stylesRow.hidden = !custom;
  }

  // Sets the shown part's font (null: a window back to "Same as everything").
  function set(value) {
    if (choice(shown) === value) return;
    if (shown.key === null) {
      font = value;
      apply();
      save();
      reflectInUrl();
    } else {
      own[shown.key] = value;
      applyOwn(shown);
      saveOwn(shown);
    }
    render();
    live.textContent = (shown.key === null ? '' : shown.label + ': ') + describeChoice(shown) + '.';
  }

  // Shows another part in the Font row.
  function show(part) {
    if (part === shown) return;
    shown = part;
    render();
    live.textContent = 'Part: ' + part.label + '.';
  }

  /* ---------- Start ---------- */

  apply();
  render();
  document.body.appendChild(credit);
  // The paint roller just before the window, so Tab goes from one into the other.
  document.body.appendChild(toggle);
  document.body.appendChild(panel);
  // Each window's own choice, Display's included now it is in the page (the inline
  // script in index.html's <body> has set the others already).
  PARTS.forEach(function (part) {
    if (part.key !== null) applyOwn(part);
  });

  // Keep a choice that came from the URL or storage, and show it in the address bar
  // once it is anything other than the default design (or the URL already had it).
  var params = new URLSearchParams(window.location.search);
  if (params.has('font') || font) {
    save();
    reflectInUrl();
  }
})();
