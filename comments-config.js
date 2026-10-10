/*
  Comment section settings (read by comments.js).

  Fill these in with your Supabase project's values, found in the Supabase dashboard
  under Project Settings -> API Keys (older dashboards: Project Settings -> API); the
  "Connect" button at the top of the project dashboard also shows both:

    supabaseUrl      the Project URL, e.g. "https://abcdefghijklmnop.supabase.co"
    supabaseAnonKey  the "publishable" key (sb_publishable_...) or the legacy
                     "anon" public key (a long eyJ... string); either works

  The anon / publishable key is meant to be public, so it is safe to commit and serve
  with the site: Row Level Security on the comments table (see supabase/setup.sql) only
  lets it read comments and add new ones. Never put the service_role / secret key here.

  While either value is empty, the comment section runs in demo mode: comments are kept
  only in this browser's localStorage, and the section says it isn't connected yet.
*/
window.COMMENTS_CONFIG = {
  supabaseUrl: "",
  supabaseAnonKey: ""
};
