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
