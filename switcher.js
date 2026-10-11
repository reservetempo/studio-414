/*
  Style switcher for Studio 414.

  Lets friends try twenty display faces (fonts.css) and twenty colours (switcher.css)
  independently, and say which they like in a comment by number ("colour 1 and
  font 6").
  Option 0 of each is the default design (Terminal Grotesque, the Classic grey and
  navy); font 1 is EB Garamond, the original face.

  The panel is a third 90s window, "Display" (#switcher, styled by boxes.css and
  switcher.css), fixed to the screen. boxes.js lets it be dragged by its title bar
  like the other boxes.

  Display starts closed. A paint roller button fixed in the bottom-left corner
  (.switcher-toggle, a toolbar button that stays pressed in while Display is open)
  opens it and, pressed again, closes it; so do the "x" in its title bar and Escape
  anywhere inside it. Opening moves the focus to its title bar and closing gives it
  back to the button. Closed is just the hidden attribute: boxes.js leaves a hidden box
  alone and fits it to the screen again, where it was left, when it opens. Whether it
  was left open is kept in localStorage under "studio414.display" ("open" or
  "closed"), so a first visit starts closed.

  The rows, top to bottom: Part, Font, Colour, then two "Reset" buttons that show
  only while there is something to reset (Styles and Layout).

  Part picks what the Font and Colour rows show and change: "Everything" (the page
  and every window) or one window (PARTS below: the mailing list, the Workshops
  dialogs or Display itself with its paint roller). The comment section is not a
  window and follows Everything.

  Everything lives on <html data-font="N" data-color="N">. A small inline script in
  index.html's <head> sets those before first paint, from the URL (?font=6&color=1,
  which wins) or else from localStorage ("studio414.style.font" and ".color"); this
  file builds the panel and keeps the attributes, localStorage and the URL in step as
  the choice changes. Values that are not a whole number from 0 to the last option
  (20 for the font and for the colour) count as 0.

  A window's Font and Colour start with "Same as everything", its default; the ‹ ›
  steps go through it too. Any other choice puts data-font / data-color on that
  window's own elements, over Everything (switcher.css, fonts.css), and keeps it there
  when Everything changes; "Same as everything" removes the attribute again. Each is
  kept in localStorage under "studio414.style.<part>.font" and ".color" (the part's
  key in PARTS, e.g. "studio414.style.mailing.color"); a missing or invalid key means
  "Same as everything". They are not put in the URL, which carries Everything alone.
  A second inline script, in index.html's <body> just after the windows (before the
  deferred scripts), sets them on the windows in the page before first paint; this
  file sets Display's own as it builds it, and all of them again in case that script
  is missing. Its list of windows and their selectors must match PARTS.

  "Reset" on the Styles row puts every window back to "Same as everything" and clears
  their keys; it shows only while some window has its own font or colour.
  "Reset" on the Layout row is for the layout of the boxes, shown only while a box
  (this window included) has been moved or resized. boxes.js reports that with a
  "studio414:layoutchange" event ({ detail: { custom } }); the button asks it to reset
  with "studio414:layoutreset". Without boxes.js the row just stays hidden.
  Either button gives the focus to the Colour dropdown when it goes away under it.

  To remove the switcher: delete switcher.js, switcher.css, fonts.css and fonts/,
  their <link> / <script> tags and the two inline scripts that mention it (in <head>,
  and in <body> after the windows). The tokens in styles.css (--display-*, --face,
  --title and the rest) keep the default colours on their own, with EB Garamond
  (font 1) as the display face.
*/
(function () {
  'use strict';

  var KEY_PREFIX = 'studio414.style.';
  var OPEN_KEY = 'studio414.display';
  var root = document.documentElement;

  var OPTIONS = {
    font: {
      label: 'Font',
      names: [
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
      ]
    },
    color: {
      label: 'Colour',
      names: [
        'Classic',
        'Vermilion',
        'Saffron',
        'Chartreuse',
        'Malachite',
        'Verdigris',
        'Cerulean',
        'Klein Blue',
        'Wisteria',
        'Fuchsia',
        'Flamingo',
        'Oxblood',
        'Tangerine',
        'Umber',
        'Olive',
        'Turquoise',
        'Teal',
        'Ultraviolet',
        'Hot Pink',
        'Porcelain',
        'Raku'
      ],
      // The title bar of each colour, for the swatch in the panel (as in switcher.css).
      swatches: [
        '#0a246a', '#b5301a', '#f5b83d', '#cdea3c', '#35c27a', '#0f5e52',
        '#4db5f2', '#1a33d1', '#b59dff', '#9c1f86', '#ff88b1', '#701038',
        '#ff7a1a', '#634016', '#5d6a12', '#40e0d0', '#00a3a3', '#6a22c8',
        '#ff3fd2', '#ece6d8', '#1e1b1a'
      ]
    }
  };

  var KINDS = ['font', 'color'];

  // What the Part row can pick. Everything (key null) is <html>; each other part is a
  // window, its elements found by selector, that can carry its own font and colour.
  // key names it in localStorage ("studio414.style.<key>.font" / ".color"). The inline
  // script in index.html's <body>, after the windows, repeats these (all but Display,
  // which this file builds).
  var PARTS = [
    { key: null, label: 'Everything' },
    { key: 'mailing', label: 'Mailing list', selector: '#signup' },
    { key: 'workshops', label: 'Workshops', selector: '#workshops, #workshop' },
    { key: 'display', label: 'Display', selector: '#switcher, .switcher-toggle' }
  ];

  /* ---------- Values, storage and the URL ---------- */

  // The number of the last option of a kind: 20 for the font and for the colour.
  function last(kind) {
    return OPTIONS[kind].names.length - 1;
  }

  // A whole number from 0 to the last option, or else null.
  function check(value, kind) {
    var text = String(value == null ? '' : value).trim();
    return /^(0|[1-9][0-9]?)$/.test(text) && Number(text) <= last(kind) ? Number(text) : null;
  }

  function parse(value, kind) {
    var number = check(value, kind);
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
  function initialValue(kind) {
    var attr = root.getAttribute('data-' + kind);
    if (attr != null) return parse(attr, kind);
    var params = new URLSearchParams(window.location.search);
    if (params.has(kind)) return parse(params.get(kind), kind);
    return parse(readStorage(KEY_PREFIX + kind), kind);
  }

  var state = {
    font: initialValue('font'),
    color: initialValue('color')
  };

  function apply() {
    root.setAttribute('data-font', String(state.font));
    root.setAttribute('data-color', String(state.color));
  }

  function save() {
    writeStorage(KEY_PREFIX + 'font', String(state.font));
    writeStorage(KEY_PREFIX + 'color', String(state.color));
  }

  // Each window's own choice, by its key: { font, color }, null for "Same as
  // everything".
  var own = {};
  PARTS.forEach(function (part) {
    if (part.key === null) return;
    own[part.key] = {};
    KINDS.forEach(function (kind) {
      own[part.key][kind] = check(readStorage(KEY_PREFIX + part.key + '.' + kind), kind);
    });
  });

  // The part's choice of a kind: a number, or null for a window that follows Everything.
  function choice(part, kind) {
    return part.key === null ? state[kind] : own[part.key][kind];
  }

  // The option the part actually shows.
  function effective(part, kind) {
    var value = choice(part, kind);
    return value === null ? state[kind] : value;
  }

  function hasOwn() {
    return PARTS.some(function (part) {
      return part.key !== null && KINDS.some(function (kind) {
        return own[part.key][kind] !== null;
      });
    });
  }

  // Puts a window's own choice on its elements, or takes it off to follow <html>.
  function applyOwn(part) {
    var elements = document.querySelectorAll(part.selector);
    KINDS.forEach(function (kind) {
      var value = own[part.key][kind];
      Array.prototype.forEach.call(elements, function (node) {
        if (value === null) node.removeAttribute('data-' + kind);
        else node.setAttribute('data-' + kind, String(value));
      });
    });
  }

  function saveOwn(part) {
    KINDS.forEach(function (kind) {
      var key = KEY_PREFIX + part.key + '.' + kind;
      var value = own[part.key][kind];
      if (value === null) removeStorage(key);
      else writeStorage(key, String(value));
    });
  }

  // Puts ?font=N&color=N in the address bar (keeping any other parameters and the
  // hash), so the address can be copied and shared as it is.
  function reflectInUrl() {
    if (!window.history || typeof window.history.replaceState !== 'function') return;
    try {
      var url = new URL(window.location.href);
      url.searchParams.set('font', String(state.font));
      url.searchParams.set('color', String(state.color));
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

  function describe(kind, value) {
    return OPTIONS[kind].label + ' ' + value + ', ' + OPTIONS[kind].names[value];
  }

  // The part's choice in words: "Font 6, Façade", or for a window that follows
  // Everything, "Font same as everything (6, Façade)".
  function describeChoice(part, kind) {
    if (choice(part, kind) !== null) return describe(kind, choice(part, kind));
    return OPTIONS[kind].label + ' same as everything (' + state[kind] + ', ' +
      OPTIONS[kind].names[state[kind]] + ')';
  }

  // The part the Font and Colour rows show and change.
  var shown = PARTS[0];

  // A window like the boxes: a title bar with a pixel icon (a display showing three
  // swatches and a line of text), then the rows. box--fixed tells boxes.js and
  // boxes.css that it is fixed to the screen rather than placed in the page.
  var panel = element('aside', 'switcher box box--fixed');
  panel.id = 'switcher';
  panel.setAttribute('aria-label', 'Font and colour switcher');

  var titlebar = element('div', 'box__titlebar');
  titlebar.innerHTML =
    '<svg class="box__icon" viewBox="0 0 16 16" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' +
    '<path fill="currentColor" fill-rule="evenodd" d="M1 1h14v10H1zM2 2v8h12V2zM4 4h2v2H4zM7 4h2v2H7zM10 4h2v2h-2zM4 7h8v1H4zM7 11h2v2H7zM4 13h8v2H4z"/></svg>';
  titlebar.appendChild(element('span', 'box__title', 'Display'));

  // The "x" at the right of the title bar (boxes.css), over the drag handle.
  var closeButton = element('button', 'box__close');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Close Display');
  closeButton.title = 'Close';
  closeButton.innerHTML =
    '<svg viewBox="0 0 8 7" aria-hidden="true" focusable="false" shape-rendering="crispEdges">' +
    '<path fill="currentColor" d="M0 0h2v1H0zM6 0h2v1H6zM1 1h2v1H1zM5 1h2v1H5zM2 2h4v1H2zM3 3h2v1H3zM2 4h4v1H2zM1 5h2v1H1zM5 5h2v1H5zM0 6h2v1H0zM6 6h2v1H6z"/></svg>';
  titlebar.appendChild(closeButton);
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

    var prev = element('button', 'switcher__step', '‹');
    prev.type = 'button';
    var select = element('select', 'switcher__select ' + selectClass);
    var next = element('button', 'switcher__step', '›');
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

  /* Font and Colour */

  var controls = {};

  // The next value one step (by: 1 or -1) from value, round in a loop. A window's
  // loop starts with "Same as everything" (null), before 0.
  function step(kind, value, by) {
    var count = last(kind) + 1;
    if (shown.key === null) return (value + by + count) % count;
    var index = value === null ? 0 : value + 1;
    index = (index + by + count + 1) % (count + 1);
    return index === 0 ? null : index - 1;
  }

  KINDS.forEach(function (kind) {
    var option = OPTIONS[kind];
    var control = buildRow(option.label, 'switcher__select--' + kind);
    option.names.forEach(function (name, index) {
      var item = element('option', null, index + ' — ' + name);
      item.value = String(index);
      control.select.appendChild(item);
    });
    // First in the list while a window is shown (render() puts it in and takes it out).
    control.same = element('option', null, 'Same as everything');
    control.same.value = '';

    control.prev.addEventListener('click', function () {
      set(kind, step(kind, choice(shown, kind), -1));
    });
    control.next.addEventListener('click', function () {
      set(kind, step(kind, choice(shown, kind), 1));
    });
    control.select.addEventListener('change', function () {
      var value = control.select.value;
      set(kind, value === '' && shown.key !== null ? null : parse(value, kind));
    });

    controls[kind] = control;
    body.appendChild(control.row);
  });

  /* ---------- Resetting the windows' own styles ---------- */

  var stylesRow = element('div', 'switcher__row');
  stylesRow.setAttribute('role', 'group');
  stylesRow.setAttribute('aria-label', 'Styles');
  stylesRow.hidden = true;

  var stylesLabel = element('span', 'switcher__label', 'Styles');
  stylesLabel.setAttribute('aria-hidden', 'true');

  var stylesReset = element('button', 'switcher__reset', 'Reset');
  stylesReset.type = 'button';
  stylesReset.setAttribute('aria-label', 'Reset styles');
  stylesReset.title = 'Give every window the same font and colour as everything';
  stylesReset.addEventListener('click', function () {
    PARTS.forEach(function (part) {
      if (part.key === null) return;
      KINDS.forEach(function (kind) {
        own[part.key][kind] = null;
      });
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

  var resetButton = element('button', 'switcher__reset', 'Reset');
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
    if (!custom && document.activeElement === resetButton) controls.color.select.focus();
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

  // A 90s toolbar button with a pixel paint roller (16 x 16, drawn at twice the size):
  // a black outline and handle, and a roller covered in the colour's own title-bar
  // colour, with a lit top and a shaded bottom row (switcher.css).
  var toggle = element('button', 'switcher-toggle');
  toggle.type = 'button';
  toggle.setAttribute('aria-label', 'Display: fonts and colours');
  toggle.setAttribute('aria-controls', panel.id);
  toggle.title = 'Display: fonts and colours';
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
      // The drag handle over the title bar (boxes.js), or else the "x" beside it.
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

  // Shows the shown part's choices in the rows (with "Same as everything" first in the
  // list for a window), names that part in the labels, and shows the Styles row while
  // some window has its own choice.
  function render() {
    var isWindow = shown.key !== null;
    var part = shown.label.toLowerCase();
    partControl.select.value = String(PARTS.indexOf(shown));

    KINDS.forEach(function (kind) {
      var control = controls[kind];
      var select = control.select;
      var name = OPTIONS[kind].label.toLowerCase();
      var range = '0 to ' + last(kind);
      var value = choice(shown, kind);

      if (isWindow && control.same.parentNode !== select) {
        select.insertBefore(control.same, select.firstChild);
      } else if (!isWindow && control.same.parentNode === select) {
        select.removeChild(control.same);
      }
      select.value = value === null ? '' : String(value);
      select.title = describeChoice(shown, kind);
      select.setAttribute('aria-label', isWindow ?
        shown.label + ' ' + name + ' (Same as everything, or ' + range + ')' :
        OPTIONS[kind].label + ' for everything (' + range + ')');
      control.prev.setAttribute('aria-label', 'Previous ' + name + ' for ' + part);
      control.next.setAttribute('aria-label', 'Next ' + name + ' for ' + part);
    });
    // The colour the shown part actually has, even when it follows Everything.
    controls.color.select.style.setProperty('--swatch', OPTIONS.color.swatches[effective(shown, 'color')]);

    var custom = hasOwn();
    // Keep focus in the panel when the button it was on goes away.
    if (!custom && document.activeElement === stylesReset) controls.color.select.focus();
    stylesRow.hidden = !custom;
  }

  // Sets the shown part's choice of a kind (null: a window back to "Same as everything").
  function set(kind, value) {
    if (choice(shown, kind) === value) return;
    if (shown.key === null) {
      state[kind] = value;
      apply();
      save();
      reflectInUrl();
    } else {
      own[shown.key][kind] = value;
      applyOwn(shown);
      saveOwn(shown);
    }
    render();
    live.textContent = (shown.key === null ? '' : shown.label + ': ') + describeChoice(shown, kind) + '.';
  }

  // Shows another part in the Font and Colour rows.
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
  if (params.has('font') || params.has('color') || state.font || state.color) {
    save();
    reflectInUrl();
  }
})();
