/*
  Style switcher for Studio 414.

  Lets friends try ten display faces (fonts.css) and ten colours (switcher.css)
  independently, and quote what they like in a comment ("colour 1 and font 6").
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

  The panel also holds "Reset" for the layout of the boxes, shown only while a box
  (this window included) has been moved or resized. boxes.js reports that with a
  "studio414:layoutchange" event ({ detail: { custom } }); the button asks it to reset
  with "studio414:layoutreset". Without boxes.js the row just stays hidden.

  The choice lives on <html data-font="N" data-color="N">. A small inline script in
  index.html's <head> sets those before first paint, from the URL (?font=6&color=1,
  which wins) or else from localStorage; this file builds the panel and keeps the
  attributes, localStorage and the URL in step as the choice changes. Values that are
  not a whole number from 0 to 10 count as 0.

  To remove the switcher: delete switcher.js, switcher.css, fonts.css and fonts/,
  their <link> / <script> tags and the inline script in <head>. The tokens in
  styles.css (--display-*, --face, --title and the rest) keep the default colours on
  their own, with EB Garamond (font 1) as the display face.
*/
(function () {
  'use strict';

  var MAX = 10;
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
        'Compagnon'
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
        'Flamingo'
      ],
      // The title bar of each colour, for the swatch in the panel (as in switcher.css).
      swatches: [
        '#0a246a', '#b5301a', '#f5b83d', '#cdea3c', '#35c27a', '#0f5e52',
        '#4db5f2', '#1a33d1', '#b59dff', '#9c1f86', '#ff88b1'
      ]
    }
  };

  /* ---------- Values, storage and the URL ---------- */

  function parse(value) {
    var text = String(value == null ? '' : value).trim();
    return /^(10|[0-9])$/.test(text) ? Number(text) : 0;
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

  // The head script has already applied the choice; read it back, or work it out
  // again the same way if that script is missing.
  function initialValue(kind) {
    var attr = root.getAttribute('data-' + kind);
    if (attr != null) return parse(attr);
    var params = new URLSearchParams(window.location.search);
    if (params.has(kind)) return parse(params.get(kind));
    return parse(readStorage(KEY_PREFIX + kind));
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

  // "Colour 1, font 6", the order people are likely to quote it in.
  function combo() {
    return 'Colour ' + state.color + ', font ' + state.font;
  }

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

  var controls = {};

  function buildRow(kind) {
    var option = OPTIONS[kind];
    var row = element('div', 'switcher__row');
    row.setAttribute('role', 'group');
    row.setAttribute('aria-label', option.label);

    var label = element('span', 'switcher__label', option.label);
    label.setAttribute('aria-hidden', 'true');

    var prev = element('button', 'switcher__step', '‹');
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Previous ' + option.label.toLowerCase());

    var select = element('select', 'switcher__select switcher__select--' + kind);
    select.setAttribute('aria-label', option.label + ' (0 to ' + MAX + ')');
    option.names.forEach(function (name, index) {
      var item = element('option', null, index + ' — ' + name);
      item.value = String(index);
      select.appendChild(item);
    });

    var next = element('button', 'switcher__step', '›');
    next.type = 'button';
    next.setAttribute('aria-label', 'Next ' + option.label.toLowerCase());

    prev.addEventListener('click', function () {
      set(kind, (state[kind] + MAX) % (MAX + 1));
    });
    next.addEventListener('click', function () {
      set(kind, (state[kind] + 1) % (MAX + 1));
    });
    select.addEventListener('change', function () {
      set(kind, parse(select.value));
    });

    row.appendChild(label);
    row.appendChild(prev);
    row.appendChild(select);
    row.appendChild(next);
    controls[kind] = { select: select };
    return row;
  }

  body.appendChild(buildRow('font'));
  body.appendChild(buildRow('color'));

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

  /* ---------- "Insert the combination" in the comment box ---------- */

  var bodyInput = document.getElementById('comments-body');
  var insertButton = null;

  if (bodyInput && bodyInput.parentNode) {
    insertButton = element('button', 'switcher-insert');
    insertButton.type = 'button';
    insertButton.addEventListener('click', function () {
      var text = combo() + ': ';
      // Where the caret was last (the start of an untouched box), spaced from any
      // word just before it.
      var start = bodyInput.selectionStart || 0;
      var end = bodyInput.selectionEnd || start;
      if (start > 0 && /\S/.test(bodyInput.value.charAt(start - 1))) text = ' ' + text;
      bodyInput.focus();
      bodyInput.setRangeText(text, start, end, 'end');
      // Lets comments.js clear any earlier error, as if typed.
      bodyInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    bodyInput.parentNode.insertBefore(insertButton, bodyInput);
  }

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

  function render() {
    controls.font.select.value = String(state.font);
    controls.color.select.value = String(state.color);
    controls.color.select.style.setProperty('--swatch', OPTIONS.color.swatches[state.color]);
    controls.font.select.title = describe('font', state.font);
    controls.color.select.title = describe('color', state.color);
    if (insertButton) {
      insertButton.textContent = 'Insert “' + combo() + '”';
      insertButton.setAttribute('aria-label', 'Insert “' + combo() + '” into your comment');
    }
  }

  function set(kind, value) {
    if (state[kind] === value) return;
    state[kind] = value;
    apply();
    save();
    reflectInUrl();
    render();
    live.textContent = describe(kind, value) + '.';
  }

  /* ---------- Start ---------- */

  apply();
  render();
  document.body.appendChild(credit);
  // The paint roller just before the window, so Tab goes from one into the other.
  document.body.appendChild(toggle);
  document.body.appendChild(panel);

  // Keep a choice that came from the URL or storage, and show it in the address bar
  // once it is anything other than the default design (or the URL already had it).
  var params = new URLSearchParams(window.location.search);
  if (params.has('font') || params.has('color') || state.font || state.color) {
    save();
    reflectInUrl();
  }
})();
