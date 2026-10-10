/*
  Style switcher for Studio 414.

  Lets friends try ten display faces (fonts.css) and ten colours (switcher.css)
  independently, and quote what they like in a comment ("colour 1 and font 6").
  Option 0 of each is the original design (EB Garamond, gallery white) and the default.

  The choice lives on <html data-font="N" data-color="N">. A small inline script in
  index.html's <head> sets those before first paint, from the URL (?font=6&color=1,
  which wins) or else from localStorage; this file builds the panel and keeps the
  attributes, localStorage and the URL in step as the choice changes. Values that are
  not a whole number from 0 to 10 count as 0.

  To remove the switcher: delete switcher.js, switcher.css, fonts.css and fonts/,
  their <link> / <script> tags and the inline script in <head>. The tokens in
  styles.css (--display-*, --accent-ink) keep the original look on their own.
*/
(function () {
  'use strict';

  var MAX = 10;
  var KEY_PREFIX = 'studio414.style.';
  var root = document.documentElement;

  var OPTIONS = {
    font: {
      label: 'Font',
      names: [
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
        'Terminal Grotesque'
      ]
    },
    color: {
      label: 'Colour',
      names: [
        'Gallery white',
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
      // The accent of each colour, for the swatch in the panel (as in switcher.css).
      swatches: [
        '#e9e6df', '#f0532f', '#f5b83d', '#cdea3c', '#35c27a', '#4fc6ad',
        '#4db5f2', '#4766ff', '#b59dff', '#e455c8', '#ff88b1'
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

  var panel = element('aside', 'switcher');
  panel.setAttribute('aria-label', 'Font and colour switcher');

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

  panel.appendChild(buildRow('font'));
  panel.appendChild(buildRow('color'));
  panel.appendChild(live);

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
  document.body.appendChild(panel);

  // Keep a choice that came from the URL or storage, and show it in the address bar
  // once it is anything other than the original design (or the URL already had it).
  var params = new URLSearchParams(window.location.search);
  if (params.has('font') || params.has('color') || state.font || state.color) {
    save();
    reflectInUrl();
  }
})();
