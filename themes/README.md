# Writing a theme

The site (`index.html`) and the owner page (`admin.html`) are drawn as Mac OS X Aqua. A
theme is one CSS file that redraws that chrome as another system, on the same markup.
This guide lists what to restyle, where the Aqua rules live and what in them to undo, so
a theme can be written without reading the Aqua CSS in full.

## 1. How themes work

| id        | Name           | After        | File                 |
|-----------|----------------|--------------|----------------------|
| `aqua`    | Aqua           | (today)      | none: the base CSS   |
| `win98`   | Windows 98     | 98.css       | `themes/win98.css`   |
| `system6` | Mac System 6   | system.css   | `themes/system6.css` |
| `nes`     | NES            | NES.css      | `themes/nes.css`     |
| `psone`   | PlayStation    | PSone.css    | `themes/psone.css`   |
| `dos`     | DOS            | Bootstra.386 | `themes/dos.css`     |

- Both pages carry `<html data-theme="<id>" data-color="<n>">` (colour 0-20, 0 "Classic"
  by default). The loader sets them before first paint and loads only the active theme's
  file, on top of the Aqua base CSS (which always loads); Aqua loads none.
- `?theme=<id>&color=<n>` on either page previews a look without saving it.
- **Every selector starts `:root[data-theme="<id>"]`.** That adds (0,2,0) to the base
  selector it mirrors, so it wins whatever the load order. Mirror the base selector
  exactly (or more specifically): `:root[data-theme="x"] .aqua-pill` (0,3,0) only *ties*
  `.calendar__day--workshop.aqua-pill[aria-current="date"]` (0,3,0).
- **Never redefine the palette** (`--face`, `--title`, ...; section 2): that breaks the 21
  colours. Build the theme's own tokens from it. Tokens built from the palette must be
  declared on `:root[data-theme="x"], :root[data-theme="x"] [data-color]`, as aqua.css
  does: a custom property is computed where it is declared, and elements with their own
  `data-color` (the Look section's swatches) must get their own tint.
- No library CSS is loaded. Recreate the original's shapes in our CSS; credit the library
  and its licence in the file's header comment.
- **Fonts:** the chrome (title bars, buttons, labels, fields, menus, calendar) takes the
  original's font; page text keeps the visitor's Display font (`--body-font`,
  `--display-font`, set per `data-font` by fonts.css; windows may carry their own
  `data-font`). Self-host under `fonts/<id>/` (OFL/MIT or similar, licence in a comment)
  and declare `@font-face` in the theme file, so it downloads only with the theme.
  Setting `--aqua-font` on `:root[data-theme="x"]` swaps the chrome font of the windows,
  pills, Display, the calendar and the whole owner page in one go. Labels in the windows
  use `--display-font` and fields the body font, so set those explicitly.
- **Contrast**, for all 21 colours: text 4.5:1 or more, edges and borders 3:1 or more
  against what they sit on. The palette is built for exactly the pairs in section 2;
  stick to those pairs or check new mixes with a script.
- **Reduced motion:** inside `@media (prefers-reduced-motion: reduce)` set
  `animation: none` and `transition: none` on everything the theme animates.
- **High contrast:** boxes.css, workshop.css and calendar.css have
  `@media (forced-colors: active)` blocks; keep window frames and button edges visible.
- **Out of scope:** the photo (`.hero`, `body::before` on the owner page), the big 414
  (`.big-414`, `.big-414__name`), "Opening soon!" (`.opening-soon`), the page background.

```css
/* Windows 98, after 98.css (MIT, github.com/jdan/98.css). */
@font-face { font-family: "S414 W98"; src: url("../fonts/win98/x.woff2") format("woff2"); font-display: swap; }
:root[data-theme="win98"] { --aqua-font: "S414 W98", Tahoma, sans-serif; --aqua-radius: 0; }
:root[data-theme="win98"], :root[data-theme="win98"] [data-color] { --w98-title: var(--title); }
:root[data-theme="win98"] .box { border-radius: 0; background: var(--face); box-shadow: var(--bevel-raised); }
```

## 2. Tokens

**Palette** (aqua.css: colour 0 on `:root, [data-color="0"]`; colors.css: 1-20 on
`[data-color="N"]`, each with its name in a comment).

| Token | Meaning | Per colour? |
|---|---|---|
| `--face` | window fill and buttons on it | yes |
| `--face-text` | text on the face (#000) | fixed |
| `--face-muted` | notes, messages; 4.5:1 on face | yes |
| `--hilight` / `--light` | bevel: lit outer / inner edge | yes |
| `--shadow` | bevel: shaded inner edge; 3:1 on face and field | yes |
| `--dk-shadow` | bevel: shaded outer edge, frames (#000) | fixed |
| `--field` / `--field-text` | text fields (#fff / #000) | fixed |
| `--placeholder` | placeholder text (#686868) | fixed |
| `--title` / `--title-text` | title bar colour and its text, 4.5:1; also the page | yes |
| `--accent-ink` | names and links; 4.5:1 on face and field | yes |
| `--error` (#9c0000), `--focus` (#000) | errors; dotted focus lines | fixed |

Light title colours take black `--title-text`, deep ones white, so never assume either.

**Built from the palette** (styles.css, on `:root, [data-color]` unless noted):
`--button`, `--button-text` (= face), `--bevel-raised`, `--bevel-pressed` (stacks of
inset 1px lines, Win98-style), `--sunken-border`, `--sunken-edge` (fields); on `:root`
only: `--page-bg` (= `--title`), `--page-text` (= `--title-text`), `--page-text-muted`.

**Aqua, fixed** (aqua.css, `:root`): `--aqua-font` (Lucida Grande), `--aqua-radius` (7px,
window tops), `--aqua-window-shadow`, `--aqua-light-size` (13px) / `--aqua-light-gap`
(7px), `--aqua-red|yellow|green` with `-rim` and `-glow` (gumdrops, status lights, notice
icons).

**Aqua, tinted** (aqua.css, `:root, [data-color]`). Retargeting these is the cheapest way
to restyle many places at once; the gradients baked into rules still need overriding.

| Token | Built from | Used by |
|---|---|---|
| `--aqua-pinstripes` (`--aqua-stripe`) | face | `.box` background |
| `--aqua-edge` | face-text 40% | `.box` border |
| `--aqua-titlebar` (`-title-top/-mid/-bottom`) | title into face | `.box__titlebar` background |
| `--aqua-title-line`, `--aqua-title-text` | | title bar bottom border, title text |
| `--aqua-tint`, `-tint-text`, `-deep`, `-rim`, `-glow`, `-pressed` | title | tinted pills, today, ticked box, alert icon, barber pole, spot box, handles, progress |
| `--aqua-plain`, `-plain-text`, `-deep`, `-rim`, `-glow`, `-pressed` | face to white | plain and disabled pills, check box, past day, disabled field |
| `--aqua-field-edge`, `-edge-top`, `--aqua-field-shadow` | face-text into field | fields, menus, calendar grid, list views, image well, progress |
| `--aqua-focus` | title 50% black (3:1 on face and field) | focus outlines |
| `--aqua-halo`, `--aqua-focus-ring` | title | field, menu, check box, spot box, triangle focus; `::selection` |

## 3. Public site

### Shared pieces (boxes.css; also used on the owner page)

**Window** `.box` (markup: `.box > .box__titlebar > .box__lights + .box__title`, then the
body). Undo: `border` (1px `--aqua-edge`), `border-radius` (top corners), `background`
(pinstripes), `box-shadow` (soft drop shadow), `color-scheme`, font smoothing;
`.box ::selection` (halo). `.is-placed`, `.box--fixed`, `html.is-moving-box` and
`.is-sizing-box` are layout: leave them.
- `.box__titlebar`: `background` (stripes + gradient), `border-bottom`, `border-radius`,
  `min-height` 22px (32px on `pointer: coarse`), `font-family`. Its `::after` (when it has
  lights) is a spacer as wide as the gumdrops that centres the title: `content: none` or
  resize it if the title moves.
- `.box__title`: 13px, centred, ellipsis, `text-shadow` (white).
- `.box__lights` > `.box__light` + `--close`, `--min`, `--zoom`: 13px circles with three
  radial gradients, rim `border`, `box-shadow`, `--drop*` variables. Windows without a
  real close (card, owner windows) have three decorative `<span>`s (`aria-hidden`); hide
  `--min`/`--zoom` if the original has none.
- Real close: `button.box__light--close.box__close` (Display, both Workshops dialogs)
  with an × `<svg viewBox="0 0 7 7">` in `currentColor`, `opacity: 0` until `:hover` /
  `:focus-visible` (always shown on `hover: none`); `::before` is a transparent hit area
  (`inset: -6px`); `:active` changes `--drop`; `:focus-visible` outline.
- JS adds `button.box__handle` (boxes.js on `#signup`, `#switcher`; workshop.js on both
  dialogs): transparent, absolute over the title bar, `cursor: move`, inset outline on
  `:focus-visible`. Keep it transparent; restyle only its focus.
- JS adds `button.box__grip` (boxes.js, `#signup` only): bottom-right 22px (32px coarse);
  `::after` draws ridges (`repeating-linear-gradient` + `clip-path`). Redraw or blank it,
  but keep the button.

**Pill** `.aqua-pill`, `.aqua-pill--tint` (in the colour), `.aqua-pill--pulse` (default
button). Local variables `--pill`, `--pill-text`, `--pill-deep`, `--pill-rim`,
`--pill-glow`, `--pill-pressed`. Undo: `border-radius: 999px`, `background` (radial glow
+ linear gradient), `box-shadow` (drop + inset), `::after` (the shine: gradient, radius;
`content: none`), `--pulse::before` (glow, `animation: aqua-pulse 1.1s infinite`; set
`content: none` or `animation: none`), `:active` / `[aria-expanded="true"]` (pressed
gradient, deeper inset shadow, `::after` opacity), `:focus-visible` (2px `--aqua-focus`
outline), `:disabled` (plain, faded text, no pulse). Font: `--aqua-font` 13px,
`text-transform: none`. Map `--tint --pulse` to the original's default button.

**Field** `.aqua-field`: `border` (top darker), `border-radius: 0`, `background:
--field`, inset `box-shadow`; `::placeholder`; `:focus-visible` swaps `border-color` and
adds `--aqua-focus-ring` (outline transparent for high contrast).

**Pop-up menu** `.aqua-popup` (`<select>`, `appearance: none`): `border`,
`border-radius: 6px`, `box-shadow`, and four background layers set by variables:
`--popup-arrows` (black up/down arrows, SVG data URI), `--popup-gloss`, `--popup-cap`
(the tinted cap at the right), `--popup-body`, placed by `--popup-position` and
`--popup-size`. Replace `background-image` with the original's arrow; keep the ~30px
right padding. Focus as fields.

### Components

| Component | Selectors (file) | Notes |
|---|---|---|
| Mailing-list card | `form#signup.signup.box` (styles.css places it on the photo's window) | decorative gumdrops; `.box__title#signup-title`; `.signup__body`, `.signup__label` (spaced caps, `--display-font`), `.signup__row`, `#email.signup__input.aqua-field` (body font, 17px+), Sign up, `.signup__message` (`[data-state="error"]` → `--error`), `a.signup__email` (muted, hover `--accent-ink`, 1px dotted `--focus`). JS: handle + grip. |
| Display | `#switcher.switcher.box.box--fixed` (switcher.css), built by switcher.js | real close + min/zoom spans, title "Display"; `.switcher` sets `--aqua-font` 13px; `.switcher__body` grid of `.switcher__row` (Part, Font, Styles, Layout; rows `[hidden]` when nothing to reset); `.switcher__label`; `.switcher__step.aqua-pill` ‹ ›; `select.switcher__select.aqua-popup` (`--part`, `--font`); `.switcher__reset.aqua-pill` "Reset"; `.switcher__live` (visually hidden). Phone media queries shrink it. JS: handle, no grip. |
| Workshops window | `dialog#workshops.workshop.workshop--list.box` (workshop.css) | close `#workshops-close`; `::backdrop` (black 32%); `.is-moved` (dragged); `#workshops-status.workshop__status`, `#workshops-retry.workshop__retry.aqua-pill`; links list below; calendar above. |
| Workshop links | `ul#workshops-list.workshop__list > li > button.workshop__link[data-id]` (workshop.js builds them, with a `<time>` and a spots `<span>`) | dressed as early-web links in **fixed** colours: #0000ee, `[data-visited]` #551a8b, `:active` #ee0000, underline, `border-radius: 0`, `background: none`; focus: 2px `--aqua-focus`. Use `--accent-ink` (4.5:1 on face and field) if the theme changes the face. |
| Calendar | `.calendar#workshops-calendar` (calendar.css, built by calendar.js) | `.calendar__head`: `#calendar-prev/#calendar-next.calendar__step.aqua-pill`, `h3.calendar__month` (`--display-font`); `table.calendar__grid` (field well: `background`, `border`, inset `box-shadow`, `border-spacing: 2px`, `--aqua-font`); `th` weekdays (muted, bold, bottom line); `.calendar__day` (a `<span>` holding a number `<span>`; a `<button>` for an upcoming workshop); `:not(.aqua-pill)` round, no fill; `--past` (`--placeholder`); `[aria-current="date"]` today (tint wash + inset ring); `--workshop` (bold) + `.aqua-pill.aqua-pill--tint` (upcoming; JS adds); `--workshop.--past` faded plain pill (gradient); `span.calendar__tip` (JS adds; yellow #ffffc7 tooltip with shadow, shown on `:hover` / `:focus-visible`). |
| Sign-up window | `dialog#workshop.workshop.box` (workshop.css) | close `#workshop-close`; `#workshop-title` (tabular figures); `#workshop-back.workshop__back.aqua-pill` "‹ All workshops"; `.workshop__result` with `svg#workshop-result-icon` (pixel icon, `currentColor` = `--accent-ink`, JS draws), `-title`, `-text`; `.workshop__name` (`--display-font`), `.workshop__description`; `dl.workshop__facts` (`dt` in `--display-font`); `.workshop__price`, `.workshop__quantity` (`output.workshop__times`, `#workshop-less/#workshop-more.workshop__step.aqua-pill` with `currentColor` − / + SVGs); `#workshop-spots.workshop__spots` (italic, muted) whose `::before` is a glossy status light (yellow; grey for `[data-state="unavailable"]`, `[data-state="gone"]`); `.workshop__form`, `.workshop__label` (`--display-font`), `input.workshop__input.aqua-field` (`[aria-invalid="true"]` inset `--error` ring; `:disabled` plain fill, muted); check box; `#workshop-friend`; Pay; `.workshop__message` (`[data-state="error"]`), `.workshop__note`; OK. |
| Check box | `.workshop__check > input#workshop-for-friend` (workshop.css) | `appearance: none`; 15px, `border-radius: 4px`, rim border; `background`: tick SVG + gloss + gradient (`--check-top/-bottom`); `box-shadow`; `:checked` (tint gel, black tick data URI), `:active`, `:focus-visible` (`--aqua-focus-ring`), `:disabled` (opacity .55), `.workshop__check:has(input:disabled)` (muted label). High contrast returns it to `appearance: auto`. |
| Comment box | `section#comments.comments > .comments__inner` (comments.css; comments.js fills it) | not a window: no fill, 1px `--page-text` line, text `--page-text` in `--body-font`, straight on the page colour. On wide screens (1100x640+) it floats over the photo with `backdrop-filter` blur + tone (`@container style(--page-text: ...)`): keep it, or give the box a face fill and switch to `--face-text`. Parts: `.comments__title`, `.comments__note`, `.comments__pane` (scrolls, focusable), `ol.comments__list > li.comment` (dotted separators; `.comment__name`, `.comment__body`), `.comments__state`, `#comments-status`, `.comments__form`, `.comments__field`, `.comments__label`, `.comments__identity`, `.comments__input` / `.comments__textarea` (transparent, 1px line, `[aria-invalid]` doubled line), `.comments__link` ("Try again", "change") and `.comments__submit` ("Post comment"): underlined text buttons; `.comments__message`. Focus: 2px `--page-text`. |
| Sign up button | `.signup__button.aqua-pill.aqua-pill--tint.aqua-pill--pulse` | the default button. |
| Workshops button | `button#workshop-button.workshop-button.aqua-pill.aqua-pill--tint` (workshop.css) | fixed top right on the page, 36px, uppercase, `letter-spacing`; `[hidden]` until workshop.js runs; `[data-state="soldout"]` reads "Sold out"; `::before` is a transparent hit area (don't paint it); focus: 2px `--page-text` (it sits on the page). |
| Other pills | Pay `#workshop-pay.workshop__pay` (tint, pulse; `:disabled` until the form is valid; `[aria-busy]`), OK `#workshop-ok.workshop__ok`, All workshops, Try again, − / +, Display ‹ › and Reset, calendar ‹ › and workshop days | all `.aqua-pill`; restyle the pill once, then tune sizes. |
| Paint roller | `button.switcher-toggle.aqua-pill` (switcher.css, built by switcher.js) | fixed bottom left, 44px, `border-radius: 11px`; 16px pixel roller SVG at 32px: `.switcher-toggle__paint` (fill `--title`), `__shine` (white .55), `__shade` (black .22); `[aria-expanded="true"]` while Display is open (pressed, z-index 0); focus: 2px `--page-text`. |
| Move 414 | `button.big-414__handle.aqua-pill` (boxes.js adds it; styles.css) | clipped to 1px until focused (`:not(:focus)`), then a 32px pill under the 414; focus: 1px dotted `--focus`, offset -5px. Leave `.big-414:focus-within` alone. |

**Focus rings** to restyle: `.aqua-pill:focus-visible`; `.aqua-field`, `.aqua-popup`
`:focus-visible`; `.box__handle`, `.box__close`, `.box__grip` `:focus-visible`;
`.workshop__link:focus-visible`; `.workshop__check input:focus-visible`;
`.signup__email:focus-visible`; `.big-414__handle:focus`; on the page (use a colour that
reads on `--page-bg`): `.workshop-button`, `.switcher-toggle`, `.comments__*`
`:focus-visible`. Many originals use a dotted inner line: `outline: 1px dotted`.

**Disabled states:** `.aqua-pill:disabled` (Pay until valid), `.workshop__input:disabled`,
`.workshop__check input:disabled` and its label, past workshop days
(`.calendar__day--workshop.calendar__day--past`, a `<span>`),
`.comments__submit:disabled` (dotted underline, muted). Text must still be 4.5:1 unless
it is truly inert.

## 4. Owner page only (admin.css)

| Component | Selectors | Notes |
|---|---|---|
| Page | `html` (bg `--title`), `body` (`--aqua-font` 14px, `--face-text`), `body::before` | `body::before` is the site photo, dimmed: out of scope. |
| Menu bar | `header.admin-header` | sticky; `background` (stripes + white gradient), `border-bottom`, `box-shadow`, `backdrop-filter: blur`; `.admin-title` (`<b>` app name), `#admin-account.admin-account` (`[hidden]` until signed in), `.admin-account-text`, `.admin-email`, Sign out `.admin-header .admin-button` (22px, 12px text). |
| Alerts | `section.admin-view.admin-dialog.box`: `#admin-loading`, `#admin-signin`, `#admin-denied`, `#admin-error` | decorative gumdrops; `.admin-dialog-body` (88px left padding for the icon) whose `::before` is the "414" icon (tinted square: gradients, `border-radius: 11px`, `box-shadow`, `text-shadow`); `.admin-dialog-lead` (bold), `.admin-status`, `.admin-hint` (muted), `.admin-message.admin-message-error` (`#admin-signin-error`, `#admin-error-text`; fixed `--admin-error` / `--admin-error-bg`, radius 6px), `.admin-actions` (right-aligned pills). Sign-in: `form#admin-signin-form.admin-signin-form` (a column, gap 10px) of two `.admin-signin-field` (a `label.admin-label` above an `input.admin-field.aqua-field`, full width, 13px; email and password), then `.admin-actions` with `#admin-signin-submit.admin-button.admin-button-primary.aqua-pill--tint.aqua-pill--pulse` ("Sign in"; "Signing in…" and the fields disabled while it runs). Loading: `.admin-barber` (barber pole: `::before` stripes with `animation: admin-barber 0.8s`, `::after` gloss + inset shadow, radius 6px). `#admin-signout-error` sits outside the windows. |
| Section windows | `#admin-owner > section.admin-section.box[data-section]` | decorative gumdrops; `.admin-section-body[data-section-body]`; `.admin-soon` placeholder. Buttons: `.admin-button.aqua-pill` (+ `.admin-button-primary.aqua-pill--tint`); bigger on `pointer: coarse`. |
| Notices (every section) | `.look .admin-message`, `.wallpaper .admin-message`, `.workshops .admin-message` + `-error` / `-ok` | small panel: gradient `background`, `border`, `border-radius: 4px`, `box-shadow`; `::before` icon: caution = yellow gel triangle with "!" (`clip-path`, gradient), ok = green gumdrop with "✓" (radial gradient, inset rim). In the form and list rows an error is a bare red line (`.workshops-form .admin-message-error`, `.workshops-item .admin-message-error`). |
| Wallpaper | `.wallpaper` (admin-wallpaper.js builds all of it) | `.wallpaper-loading`, `.wallpaper-current`; image well `figure.wallpaper-figure` (`--field` fill, `box-shadow` edge; `::after` inset shadow overlay) with `img.wallpaper-photo`; `.wallpaper-spot` (selection rectangle: tint border, glow wash, `--wallpaper-lines` white box-shadows); `.wallpaper-caption`, `.wallpaper-readout`, `.wallpaper-note`, `.wallpaper-hint`; progress `.wallpaper-progress` > `.wallpaper-progress-text` + `progress.wallpaper-progress-bar` (`appearance: none`; `--progress-track`, `-gloss`, `-stripes`, `-dark`, `-light`; `::-webkit-progress-bar`, `::-webkit-progress-value`, `::-moz-progress-bar`, `:indeterminate`; `animation: wallpaper-progress 0.8s`); hidden `input.wallpaper-file` ("Choose photo" is a pill); editor `.wallpaper-editor`, `h3.wallpaper-editor-title`, `.wallpaper-editor-intro`, `figure.wallpaper-figure.wallpaper-figure-editor` > `.wallpaper-box` (draggable spot box; `:focus-visible` ring + lines; `.is-dragging` stronger wash) > `span.wallpaper-handle.wallpaper-handle-nw/-ne/-sw/-se` (JS adds; tinted glossy dots: radial gradient, border, shadow; `::before` hit area; bigger on coarse pointers). |
| Workshops: list view | `.workshops` (admin-workshops.js builds all of it; sets `--workshops-row`, the alternate-row tint) | `.workshops-loading`, `.workshops-top` ("Add workshop"), `.workshops-list-panel`, `.workshops-list-retry`, `.workshops-empty`; `ul.workshops-list` (white well, field edge, white under-line `box-shadow`) > `li.workshops-item` (grid; even rows `--workshops-row`; `.is-past` greyed): `.workshops-item-head`, `.workshops-item-name`, `.workshops-item-when`, `.workshops-item-meta` (`-spots`, `-price`, `-sep`), `.workshops-item-actions` (smaller pills on `pointer: fine`; `.admin-button[aria-disabled="true"]` at opacity .6), `.workshops-reason`. |
| Workshops: capsules | `span.workshops-badge` ("Hidden"), `.workshops-badge.workshops-badge-past` ("Past") | `border-radius: 999px`, grey gradient, inset highlight `box-shadow`, 10px bold. |
| Workshops: disclosure | `button.workshops-past-toggle[aria-expanded]` > past list `ul.workshops-list.workshops-list-past` | `::before` "▸" rotated 90deg when expanded, `transition: transform 0.15s` (off under reduced motion); focus: `--aqua-focus-ring` box-shadow. |
| Workshops: sign-ups | `.workshops-signups` (`#workshops-signups-N`), `.workshops-signups-title`, `-status`, `.workshops-signups-wrap` (well), `table.workshops-signups-table` | `th` header gradient; even rows `--workshops-row`; `.workshops-signups-number`, `-date`, `.workshops-signups-email`, `.workshops-signups-total`. Under 560px rows become blocks with `td::before { content: attr(data-label) }`. |
| Workshops: form | `.workshops-form` (group box: `border`, `border-radius: 5px`, dark rgba fill, inset `box-shadow`) | `.workshops-form-title`, `.workshops-field`, `.workshops-label` (right-aligned, `::after ":"`), `.workshops-field-hint`, `input.workshops-input.aqua-field` (text, date, time, number), `textarea.workshops-textarea`, `[aria-invalid="true"]` red edge + ring, `.workshops-form-row`, `.workshops-price` + `.workshops-price-symbol` ("$"), `.workshops-form-note`, `#workshops-form-error`; Save / Cancel pills (`:disabled` while saving). |

### Look section

The first section window (`data-section="look"`); `admin-look.js` builds all of it and
the "Look section" block at the end of admin.css styles it. What the JS adds: `checked`
on the radios, `hidden` on the loading line, the form and the notices, `disabled` on
Save (while saving) and Undo (while the picks are the saved look), and a pick switches
`data-theme` / `data-color` on `<html>` at once (`studio414Look.apply`), so theme files
load and drop while the page is open.

| Component | Selectors | Notes |
|---|---|---|
| Section | `.look` > `p.look-loading.admin-status`, `.look-form` > `p.look-intro.admin-hint` | `.look` sets `--look-label-width`, `--look-selection` / `--look-selection-text` (the picked name: the page's `--title` / `--title-text`), `--look-selection-ring` and `--look-focus-ring` (the page's `--aqua-focus-ring`). They are declared on `.look` so the swatches, which carry their own `data-color`, show the page's selection and focus colours: redeclare them there, not on the swatches. |
| Groups | `.look-field` > `span.look-label` (`#look-theme-label`, `#look-color-label`) + `[role="radiogroup"]` | grid: label column `--look-label-width`, right-aligned 13px label with `::after ":"`; under 560px a flex column with the label above, left-aligned. The notices (`.look .admin-message`) and buttons (`.admin-actions.look-actions`) have a `margin-left` to line up with the groups (0 under 560px). |
| Themes | `.look-themes` (flex column) > `label.look-theme` > `input[type="radio"].look-theme-input[name="look-theme"]` + `span.look-theme-name` | the radio is drawn in CSS (`appearance: none`): 15px (18px on coarse pointers), `border` (`--aqua-plain-rim`), `border-radius: 50%`, gel `background` gradients, `box-shadow`. `:checked` is a `--aqua-tint` bead with a `--aqua-tint-text` dot, all in `background`. `:focus-visible`: `--aqua-focus-ring` + transparent outline. `appearance: auto` under `forced-colors`. |
| Colours | `.look-colors` (grid, `repeat(auto-fill, minmax(5rem, 1fr))`, wraps) > `label.look-color` > `input[type="radio"].look-color-input[name="look-color"]` + `span.look-color-chip[data-color="N"][aria-hidden]` + `span.look-color-name` | the radio is invisible (`opacity: 0`) and laid over the whole swatch (`label` `position: relative`; input `position: absolute; inset: 0; z-index: 1`): keep that, or the swatches stop taking clicks. Chip: 44 × 32px, `border-radius: 4px`, `background` a white gloss over `--title` with a `--face` band (keep those two tokens: they are the colour), edge and drop `box-shadow`. Picked (`.look-color-input:checked ~ …`): a grey `box-shadow` ring on the chip, the name a capsule (`border-radius: 999px`) in `--look-selection`. Focus (`.look-color-input:focus-visible ~ .look-color-chip`): `--look-focus-ring` + transparent outline. Under `forced-colors` the chip keeps its colours and the picked name is `Highlight`. |
| Buttons and notices | `.look-actions` > Save (`.admin-button-primary.aqua-pill--tint`, "Saving…" while saving), "Undo changes", "Preview the site" (opens `index.html?theme=&color=` in a new tab); `.look .admin-message-error` (the saved look didn't load, or not saved), `.look .admin-message-ok` (saved; focused) | pills and notices as in the other sections. |

Aqua to undo in a theme: the radio bead (`background` gradients, `border-radius: 50%`,
`box-shadow`, and the `:checked` bead), the chip's gloss gradient, rounding and shadow,
the grey ring and the name capsule's rounding, and the focus rings (`box-shadow`).

## 5. Previewing

Start the `studio-414` launch config (`python -m http.server 8000`), then open
`http://localhost:8000/index.html?theme=<id>&color=<n>`. Try a light title colour
(2 Saffron), a deep one (11 Oxblood), Classic (0) and Porcelain (19), and 375px wide (no
sideways scroll). `?theme=aqua` must look unchanged. To reach everything: the paint
roller opens Display; Tab reaches "Move 414"; the Workshops button opens the calendar
and links (they load from the back end); a link or a marked day opens the sign-up
window, whose Pay stays disabled until the form is valid.

**Owner page, signed out:** `admin.html?theme=<id>&color=<n>` shows Loading, then Sign in.
For the other alerts, in the console:
`document.querySelectorAll('.admin-view').forEach(function (v) { v.hidden = v.id !== 'admin-denied'; });`
(or `admin-loading`, `admin-signin`, `admin-error`).

**Owner page, signed in:** admin.js has no test hook (its views and sections are private,
and the sections only render once `is_owner` says yes), and the earlier owner-page
commits don't record a way. Either the user signs in with an owner's email and password
(the session stays across reloads, so `?theme=` can be changed afterwards), or, for
previews only, use a stubbed copy: copy `admin.html` to an untracked
`zz-admin-preview.html` in the repo root, replace its supabase-js `<script src=...>` tag
(the three lines) with the script below, open `zz-admin-preview.html?theme=<id>`, and
delete the copy when done. Never commit it. (Checked on 23 Oct 2026: both sections
render, with the list, the past toggle, the sign-ups table and the form. Set
`is_owner: false` to see "Not an owner".) The Look section keeps a `?theme=` / `?color=`
preview: its picks start from it and it doesn't switch the page to the saved look (the
stub has none, so Aqua in Classic, which "Undo changes" goes back to).

```html
<script>
  // PREVIEW ONLY, never commit: a fake signed-in owner with sample rows, no network.
  (function () {
    var rows = {
      is_owner: true, workshop_spots_taken: [], site_settings: null,
      workshops: [
        { id: 'w1', name: 'Paint a piece', date: '2026-11-07', start_time: '13:00:00', end_time: '16:00:00',
          description: 'Glaze a mug.', capacity: 8, price_cents: 4500, hidden: false },
        { id: 'w2', name: 'Wheel basics', date: '2026-01-10', start_time: '10:00:00', end_time: '12:00:00',
          description: '', capacity: 6, price_cents: 6000, hidden: true }
      ],
      workshop_signups: [{ name: 'Ana', email: 'ana@example.com', friend_name: null, quantity: 2,
        paid_at: '2026-10-01T10:00:00Z', created_at: '2026-10-01T09:58:00Z' }]
    };
    function query(data) { // any chain (.select().eq().order()...) resolves to { data }
      var q = new Proxy({}, { get: function (t, key) {
        if (key === 'then') return function (ok, no) { return Promise.resolve({ data: data, error: null }).then(ok, no); };
        return function () { return q; };
      } });
      return q;
    }
    var session = { user: { id: 'preview', email: 'owner@example.com' }, access_token: 'preview' };
    var done = Promise.resolve({ data: { session: session }, error: null });
    window.supabase = { createClient: function () { return {
      auth: {
        initialize: function () { return done; },
        getSession: function () { return done; },
        onAuthStateChange: function (fn) { setTimeout(function () { fn('SIGNED_IN', session); }, 0);
          return { data: { subscription: { unsubscribe: function () {} } } }; },
        signInWithPassword: function () { return done; },
        signOut: function () { return Promise.resolve({ error: null }); }
      },
      rpc: function (name) { return query(rows[name]); },
      from: function (table) { return query(rows[table]); }
    }; } };
  })();
</script>
```
