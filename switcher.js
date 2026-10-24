/*
  Style switcher for Studio 414: the "Display" window on the public site.

  It lets a visitor change two things for themselves, on their own screen only: the
  colour of the whole page, and the face of the big 414 and "Opening soon!" (twenty
  display faces, fonts.css), so friends can say which they like in a comment by number
  ("font 6"). Font 0 is the default design (Terminal Grotesque); font 1 is EB Garamond,
  the original face. All other text is in the theme's font, whatever is picked here.

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

  The rows, top to bottom: Colour, 414 font, then two "Reset" buttons that show only
  while there is something to reset (Styles and Layout). Colour and 414 font are each a
  dropdown between ‹ › step buttons that go round in a loop.

  Colour starts with "Site colour", the default: the colour the owners picked (look.js,
  the "look" row), whatever it is now. Then come the 21 colours, named as in
  window.studio414Look.COLORS (0 "Classic" to 20 "Raku"). A colour picked here goes on
  <html data-color="N"> for this visitor only and is kept in localStorage under
  "studio414.style.pageColor" ("Site colour" removes the key). index.html's <head>
  script reads it before first paint and hands it to look.js (window.studio414PageColor),
  which puts it over the owners' colour, cached or fetched; this file changes it live
  with studio414Look.setPageColor(). The owner page never reads the key. Only a valid
  ?color= in the URL wins over it: the row then starts on "Site colour" (the URL's
  colour), and a pick takes ?color= out of the address bar so it shows and stays.
  Without look.js there is no Colour row. Keys left from Display's old colour picker
  ("studio414.style.color", "studio414.style.<part>.color") are ignored and left as
  they are.

  The 414's font lives on <html data-font="N">. The same <head> script sets it before
  first paint, from the URL (?font=6, which wins) or else from localStorage
  ("studio414.style.font"); this file keeps the attribute, localStorage and the URL in
  step as the choice changes. Values that are not a whole number from 0 to the last
  font (20) count as 0. Keys left from when each window could have its own font
  ("studio414.style.<part>.font") are ignored and left as they are.

  With ?edit=1 in the URL (the owner's preview page) the visitor's own colour and font
  are not read, and nothing is written to localStorage.

  "Reset" on the Styles row puts back the site colour and font 0, clears both keys and
  takes ?font= out of the address bar; it shows only while either is set.
  "Reset" on the Layout row is for the layout of the boxes, shown only while a box
  (this window included) has been moved or resized. boxes.js reports that with a
  "studio414:layoutchange" event ({ detail: { custom } }); the button asks it to reset
  with "studio414:layoutreset". Without boxes.js the row just stays hidden.
  Either button gives the focus to the font dropdown when it goes away under it.

  To remove the switcher: delete switcher.js, switcher.css, fonts.css and fonts/, their
  <link> / <script> tags and the inline script at the top of index.html's <head>
  (look.js's page colour hook then does nothing). The tokens in styles.css (--display-*
  and the rest) keep EB Garamond (font 1) as the display face on their own.
*/
(function () {
  'use strict';

  var FONT_KEY = 'studio414.style.font';
  var COLOR_KEY = 'studio414.style.pageColor';
  var OPEN_KEY = 'studio414.display';
  var root = document.documentElement;
  var params = new URLSearchParams(window.location.search);
  // The owner's preview page: the visitor's own choices are neither read nor written.
  var editing = params.get('edit') === '1';
  // The owners' look (look.js): the colour names and the hook that shows a page colour.
  var look = window.studio414Look;
  var COLORS = look && look.COLORS && typeof look.setPageColor === 'function' ? look.COLORS : null;

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
  /* ---------- Values, storage and the URL ---------- */

  // A whole number from 0 to max (the last font when left out), or else null.
  function check(value, max) {
    var text = String(value == null ? '' : value).trim();
    return /^(0|[1-9][0-9]?)$/.test(text) && Number(text) <= (max == null ? LAST : max) ? Number(text) : null;
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


  // A colour number from 0 to 20, or else null.
  function checkColor(value) {
    return check(value, COLORS.length - 1);
  }

  // The head script has already applied the font; read it back, or work it out again
  // the same way if that script is missing.
  function initialFont() {
    var attr = root.getAttribute('data-font');
    if (attr != null) return parse(attr);
    if (params.has('font')) return parse(params.get('font'));
    return editing ? 0 : parse(readStorage(FONT_KEY));
  }

  // The 414's font: a number from 0 to the last font.
  var font = initialFont();

  // The visitor's own page colour: a number, or null for "Site colour". A valid ?color=
  // in the URL wins, so the row starts on "Site colour" (look.js shows the URL's).
  var urlColor = COLORS ? checkColor(params.get('color')) : null;
  var pageColor = COLORS && !editing && urlColor === null ? checkColor(readStorage(COLOR_KEY)) : null;

  function apply() {
    root.setAttribute('data-font', String(font));
  }

  function save() {
    if (editing) return;
    if (font) writeStorage(FONT_KEY, String(font));
    else removeStorage(FONT_KEY);
  }

  // Shows the visitor's page colour, or the site colour for null (look.js).
  function applyColor() {
    look.setPageColor(pageColor);
  }

  function saveColor() {
    if (editing) return;
    if (pageColor === null) removeStorage(COLOR_KEY);
    else writeStorage(COLOR_KEY, String(pageColor));
  }

  // Sets (value: a string) or removes (null) a parameter in the address bar, keeping the
  // others and the hash, so the address can be copied and shared as it is.
  function setParam(name, value) {
    if (!window.history || typeof window.history.replaceState !== 'function') return;
    try {
      var url = new URL(window.location.href);
      if (value === null) url.searchParams.delete(name);
      else url.searchParams.set(name, value);
      if (url.href !== window.location.href) {
        window.history.replaceState(window.history.state, '', url.href);
      }
    } catch (error) {
      // Some sandboxed frames refuse replaceState; the choice still applies.
    }
  }

  // Puts ?font=N in the address bar.
  function reflectInUrl() {
    setParam('font', String(font));
  }

  /* ---------- The panel ---------- */

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  // The choices in words: "Font 6, Façade"; "Cerulean" or "Site colour".
  function describeFont() {
    return 'Font ' + font + ', ' + FONTS[font];
  }

  function describeColor() {
    return pageColor === null ? 'Site colour' : COLORS[pageColor];
  }

  // One step (by: 1 or -1) from value through count choices, round in a loop. With
  // withNull the loop starts with null (Colour's "Site colour"), before 0.
  function step(value, by, count, withNull) {
    if (!withNull) return (value + by + count) % count;
    var index = value === null ? 0 : value + 1;
    index = (index + by + count + 1) % (count + 1);
    return index === 0 ? null : index - 1;
  }

  // An Aqua window like the card: a title bar with the three gumdrops and the title,
  // then the rows. box--fixed tells boxes.js and boxes.css that it is fixed to the
  // screen rather than placed in the page.
  var panel = element('aside', 'switcher box box--fixed');
  panel.id = 'switcher';
  panel.setAttribute('aria-label', 'Display');

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
  // the dropdown and the buttons are set where each row is built.
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

  /* Colour (only with look.js, which has the names and shows the colour) */

  var colorControl = null;
  if (COLORS) {
    colorControl = buildRow('Colour', 'switcher__select--color');
    colorControl.select.setAttribute('aria-label', 'Page colour (Site colour, or one of ' + COLORS.length + ' colours)');
    colorControl.prev.setAttribute('aria-label', 'Previous colour');
    colorControl.next.setAttribute('aria-label', 'Next colour');
    var siteOption = element('option', null, 'Site colour');
    siteOption.value = '';
    colorControl.select.appendChild(siteOption);
    COLORS.forEach(function (name, index) {
      var item = element('option', null, name);
      item.value = String(index);
      colorControl.select.appendChild(item);
    });

    colorControl.prev.addEventListener('click', function () {
      setColor(step(pageColor, -1, COLORS.length, true));
    });
    colorControl.next.addEventListener('click', function () {
      setColor(step(pageColor, 1, COLORS.length, true));
    });
    colorControl.select.addEventListener('change', function () {
      var value = colorControl.select.value;
      setColor(value === '' ? null : checkColor(value));
    });

    body.appendChild(colorControl.row);
  }

  /* 414 font */

  var fontControl = buildRow('414 font', 'switcher__select--font');
  fontControl.select.setAttribute('aria-label', 'Font of the 414 and "Opening soon!" (0 to ' + LAST + ')');
  fontControl.prev.setAttribute('aria-label', 'Previous font for the 414');
  fontControl.next.setAttribute('aria-label', 'Next font for the 414');
  FONTS.forEach(function (name, index) {
    var item = element('option', null, index + ' — ' + name);
    item.value = String(index);
    fontControl.select.appendChild(item);
  });

  fontControl.prev.addEventListener('click', function () {
    setFont(step(font, -1, LAST + 1, false));
  });
  fontControl.next.addEventListener('click', function () {
    setFont(step(font, 1, LAST + 1, false));
  });
  fontControl.select.addEventListener('change', function () {
    setFont(parse(fontControl.select.value));
  });

  body.appendChild(fontControl.row);

  /* ---------- Resetting the visitor's colour and font ---------- */

  var stylesRow = element('div', 'switcher__row');
  stylesRow.setAttribute('role', 'group');
  stylesRow.setAttribute('aria-label', 'Styles');
  stylesRow.hidden = true;

  var stylesLabel = element('span', 'switcher__label', 'Styles');
  stylesLabel.setAttribute('aria-hidden', 'true');

  var stylesReset = element('button', 'switcher__reset aqua-pill', 'Reset');
  stylesReset.type = 'button';
  stylesReset.setAttribute('aria-label', 'Reset styles');
  stylesReset.title = 'Back to the site colour and font 0';
  stylesReset.addEventListener('click', function () {
    font = 0;
    apply();
    save();
    setParam('font', null);
    if (COLORS) {
      pageColor = null;
      applyColor();
      saveColor();
    }
    render();
    live.textContent = 'Styles reset: site colour and font 0.';
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
  toggle.setAttribute('aria-label', 'Display: colour and font');
  toggle.setAttribute('aria-controls', panel.id);
  toggle.title = 'Display: colour and font';
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

  // Shows the choices in their rows, and the Styles row while either is set.
  function render() {
    fontControl.select.value = String(font);
    fontControl.select.title = describeFont();
    if (colorControl) {
      colorControl.select.value = pageColor === null ? '' : String(pageColor);
      colorControl.select.title = describeColor();
    }
    var custom = font !== 0 || pageColor !== null;
    // Keep focus in the panel when the button it was on goes away.
    if (!custom && document.activeElement === stylesReset) fontControl.select.focus();
    stylesRow.hidden = !custom;
  }

  // Sets the 414's font.
  function setFont(value) {
    if (value === font) return;
    font = value;
    apply();
    save();
    reflectInUrl();
    render();
    live.textContent = '414 font: ' + describeFont() + '.';
  }

  // Sets the visitor's page colour (null: back to the site colour). A ?color= in the
  // URL would win over a pick on the next load, so a pick takes it out.
  function setColor(value) {
    if (value === pageColor) return;
    pageColor = value;
    applyColor();
    saveColor();
    if (value !== null) setParam('color', null);
    render();
    live.textContent = 'Colour: ' + describeColor() + '.';
  }

  /* ---------- Start ---------- */

  apply();
  render();
  document.body.appendChild(credit);
  // The paint roller just before the window, so Tab goes from one into the other.
  document.body.appendChild(toggle);
  document.body.appendChild(panel);
  // The head script has handed the page colour to look.js before first paint; show it
  // now if that script is missing.
  if (pageColor !== null && window.studio414PageColor !== pageColor) applyColor();

  // Keep a font that came from the URL or storage, and show it in the address bar
  // once it is anything other than the default design (or the URL already had it).
  if (params.has('font') || font) {
    save();
    reflectInUrl();
  }
})();
