# Studio 414

A one-page site for Studio 414, an empty white-walled studio space: a photo hero with a mailing-list sign-up, and a small comment section below it.

## Run it locally

Plain HTML, CSS and JavaScript, with no build step. From this folder:

```sh
python -m http.server 8000
```

Then open <http://localhost:8000>.

## Comments setup

The comment section has no login: each visitor types a name with their first comment, and their browser remembers it. Comments are stored in [Supabase](https://supabase.com) (the free plan is plenty). Until it is connected, the section runs in a demo mode that keeps comments only in your own browser, and says so on the page.

1. Create a free Supabase project at <https://supabase.com/dashboard>.
2. In the project, open **SQL Editor**, paste in the contents of [`supabase/setup.sql`](supabase/setup.sql) and click **Run**. It creates the `comments` table and the Row Level Security rules (anyone may read comments and add new ones; nobody may edit or delete them through the site). It is safe to run again.
3. Copy the **Project URL** and the **publishable** key (`sb_publishable_…`; the legacy **anon** key, a long `eyJ…` string, works too). Both are under the **Connect** button at the top of the project dashboard, and the keys are also in **Project Settings → API Keys** (older dashboards: **Project Settings → API**).
4. Paste them into [`comments-config.js`](comments-config.js):

   ```js
   window.COMMENTS_CONFIG = {
     supabaseUrl: "https://your-project-ref.supabase.co",
     supabaseAnonKey: "your-anon-or-publishable-key"
   };
   ```

   The anon / publishable key is meant to be public; Row Level Security limits what it can do. Never use the `service_role` / secret key here.
5. Commit and push.

### Moderation

There is no login, so anyone who has the page's URL can post a comment under any name. To remove a comment, delete its row in the Supabase dashboard: **Table Editor → comments**, select the row, **Delete**.

Free Supabase projects are paused after a week or so without activity; if comments stop loading, restore the project from the dashboard.

## Font and colour switcher

A small panel in the corner lets visitors try 10 display fonts and 10 colours independently, so friends can browse combinations and say which they like in a comment ("colour 1 and font 6"). Option 0 of each is the original design (EB Garamond, gallery white) and the default, so nothing changes for anyone who never touches it.

- **Font** changes the display typography: the card label, the sign-up button, the Comments title, the field labels, the Post comment button, comment author names and the "Commenting as" line. The fields and the comment text stay in EB Garamond.
- **Colour** changes the accent (the button fills, focus rings, the Comments title, author names and links) and tints the sign-up card itself, with text, field and button colours to match so everything on it stays readable.
- A combination can be shared as a link: `?font=6&color=1` (numbers 0 to 10; anything else counts as 0). The link wins over the browser's saved choice, which is kept in `localStorage` under `studio414.style.font` and `studio414.style.color`.
- A small "Insert “Colour 1, font 6”" link above the comment box types the current combination into the comment.

It lives in [`switcher.js`](switcher.js), [`switcher.css`](switcher.css) (the colours and the panel), [`fonts.css`](fonts.css) (the fonts) and [`fonts/`](fonts). To remove it, delete those, their `<link>` / `<script>` tags and the small inline script at the top of `index.html`'s `<head>`; the tokens it sets in `styles.css` (`--display-*`, `--accent-ink`) fall back to the original look.

## Fonts

The 10 display fonts are from [Velvetyne](https://velvetyne.fr), a French libre type foundry. All are published under the [SIL Open Font License 1.1](https://openfontlicense.org): free to use, embed and redistribute, but not to sell on their own. Each folder in [`fonts/`](fonts) holds the one weight used here, as downloaded from the font's Velvetyne page, with its licence file.

| # | Font | Designers | Weight used |
|---|------|-----------|-------------|
| 0 | EB Garamond (original) | Georg Duffner, Octavio Pardo (via Google Fonts) | Medium |
| 1 | [Basteleur](https://velvetyne.fr/fonts/basteleur/) | Keussel | Moonlight |
| 2 | [Lineal](https://velvetyne.fr/fonts/lineal/) | Frank Adebiaye, Anton Moglia, Ariel Martín Pérez | Medium |
| 3 | [Le Murmure](https://velvetyne.fr/fonts/le-murmure/) | Jérémy Landes | Regular |
| 4 | [Sligoil](https://velvetyne.fr/fonts/sligoil/) | Ariel Martín Pérez, Đông Trúc Nguyễn | Micro Medium |
| 5 | [Ouroboros](https://velvetyne.fr/fonts/ouroboros/) | Ariel Martín Pérez, H·Alix Sanyas | Regular |
| 6 | [Façade](https://velvetyne.fr/fonts/facade/) | Éléonore Fines | Ouest |
| 7 | [Karrik](https://velvetyne.fr/fonts/karrik/) | Jean-Baptiste Morizot, Lucas Le Bihan | Regular |
| 8 | [Trickster](https://velvetyne.fr/fonts/trickster/) | Jean-Baptiste Morizot | Regular |
| 9 | [Compagnon](https://velvetyne.fr/fonts/compagnon/) | Juliette Duhé, Léa Pradine, Valentin Papon, Chloé Lozano, Sébastien Riollier | Medium |
| 10 | [Terminal Grotesque](https://velvetyne.fr/fonts/terminal-grotesque/) | Raphaël Bastide, Jérémy Landes | Regular |

## Colours

The accent is the button fill on the dark page; the card is a translucent tint of the colour on the frosted glass.

| # | Colour | Accent | Button text | Card tint |
|---|--------|--------|-------------|-----------|
| 0 | Gallery white (original) | `#e9e6df` | `#1d1c1a` | `rgba(22, 21, 20, 0.55)` |
| 1 | Vermilion | `#f0532f` | `#1d1c1a` | `rgba(168, 38, 15, 0.8)` |
| 2 | Saffron | `#f5b83d` | `#1d1c1a` | `rgba(242, 178, 58, 0.84)` |
| 3 | Chartreuse | `#cdea3c` | `#1d1c1a` | `rgba(201, 230, 54, 0.84)` |
| 4 | Malachite | `#35c27a` | `#1d1c1a` | `rgba(47, 189, 116, 0.9)` |
| 5 | Verdigris | `#4fc6ad` | `#1d1c1a` | `rgba(15, 94, 82, 0.8)` |
| 6 | Cerulean | `#4db5f2` | `#1d1c1a` | `rgba(69, 174, 240, 0.9)` |
| 7 | Klein Blue | `#4766ff` | `#ffffff` | `rgba(26, 51, 209, 0.8)` |
| 8 | Wisteria | `#b59dff` | `#1d1c1a` | `rgba(173, 148, 255, 0.9)` |
| 9 | Fuchsia | `#e455c8` | `#1d1c1a` | `rgba(156, 31, 134, 0.8)` |
| 10 | Flamingo | `#ff88b1` | `#1d1c1a` | `rgba(255, 134, 174, 0.88)` |
