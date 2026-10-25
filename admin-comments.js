/*
  Owner preview page (preview.html): deleting visitors' comments in the framed site.

  The framed site (index.html?edit=1, comments.js) gives each comment a Delete button
  only once this page says the owner is signed in, and asks this page to do the
  deleting, as it has only the publishable key. Messages, this origin only:
    to the frame    { type: 'studio414:owner' }, on each load of the frame while the
                    owner page is open, and when it opens after a load
    from the frame  { type: 'studio414:commentdelete', id }
    to the frame    { type: 'studio414:commentdeleted', id, ok: true }, or
                    { type: 'studio414:commentdeleted', id, ok: false, message }
  The delete runs with the owner's session (studioAdmin.client, admin.js). The database
  lets only owners do it: supabase/comments-owner.sql. Load this after preview.js.
*/
(function () {
  'use strict';

  var admin = window.studioAdmin;
  var preview = window.studioPreview;
  if (!admin || !preview) {
    console.error('admin-comments.js: load it in preview.html, after admin.js and preview.js');
    return;
  }
  var frame = preview.frame;

  // Tells the framed site the owner is signed in. Repeats are harmless.
  function tellOwner() {
    if (!admin.isReady()) return;
    var win = preview.site();
    if (win) win.postMessage({ type: 'studio414:owner' }, location.origin);
  }

  frame.addEventListener('load', tellOwner);
  admin.onReady(tellOwner);

  window.addEventListener('message', function (event) {
    if (event.source !== frame.contentWindow || event.origin !== location.origin) return;
    var data = event.data;
    if (!data || typeof data !== 'object' || data.type !== 'studio414:commentdelete') return;
    var id = data.id;
    if (id == null) return;
    var target = event.source;

    if (typeof id !== 'number' || !isFinite(id)) {
      answer(target, id, 'That comment couldn’t be deleted.');
      return;
    }
    if (!admin.isReady() || !admin.client) {
      answer(target, id, 'Sign in as an owner to delete comments.');
      return;
    }

    admin.client.from('comments').delete().eq('id', id).select('id')
      .then(function (result) {
        if (result.error) return describe(result.error);
        if (!result.data || !result.data.length) {
          return 'That comment couldn’t be deleted. It may already be gone.';
        }
        return null;
      }, describe)
      .then(function (message) {
        answer(target, id, message);
      });
  });

  // Answers the frame: no message means it worked.
  function answer(target, id, message) {
    var reply = message
      ? { type: 'studio414:commentdeleted', id: id, ok: false, message: message }
      : { type: 'studio414:commentdeleted', id: id, ok: true };
    try {
      target.postMessage(reply, location.origin);
    } catch (e) {
      // The frame has gone; nothing to tell.
    }
  }

  // A short, plain message for a failed delete (never the raw error text).
  function describe(err) {
    var code = err && err.code;
    var text = String((err && err.message) || '');
    if (code === '42501') {
      return 'The database doesn’t let owners delete comments yet (run supabase/comments-owner.sql).';
    }
    if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(text)) {
      return 'Your sign-in has run out. Reload the page and sign in again.';
    }
    if (!text || /fetch|network|load failed/i.test(text)) {
      return 'Couldn’t reach Supabase. Check your connection and try again.';
    }
    return 'Couldn’t delete the comment. Please try again.';
  }
})();
