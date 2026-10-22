/*
  Owner page (admin.html): Google sign-in through Supabase Auth, then the owner check.

  Uses supabase-js (loaded from jsDelivr in admin.html) for sign-in and, in the section
  modules, for owner data. The public site doesn't load it; it keeps plain fetch. The
  Supabase URL and publishable key come from comments-config.js.

  Views: loading -> sign-in -> (Google) -> checking -> owner page, "isn't an owner
  account", or an error. Whether an account is an owner is decided by the database:
  is_owner() in supabase/owners.sql.

  Section modules (admin-wallpaper.js, admin-workshops.js) plug in through
  window.studioAdmin. Load each with a plain <script> after admin.js.

    studioAdmin.client     the supabase-js client (signed in as the owner once ready)
    studioAdmin.session    the current Supabase session, or null (kept up to date)
    studioAdmin.isReady()  true while the owner page is showing
    studioAdmin.registerSection(name, render)
        name    the data-section of a <section> in admin.html ("wallpaper", "workshops")
        render  function (body, admin): fills body, the section's content element
                (emptied first), each time the owner page opens. It may return a
                function, called when the owner signs out, to clean up (timers,
                listeners); the "Coming soon" placeholder then comes back.
    studioAdmin.onReady(fn)
        calls fn(admin) each time the owner page opens, and straight away if it's open.

  For example:

    studioAdmin.registerSection('wallpaper', function (body, admin) {
      body.textContent = 'Signed in as ' + admin.session.user.email;
    });
*/
(function () {
  'use strict';

  // How long the owner check may take before the page gives up and offers a retry.
  var CHECK_TIMEOUT_MS = 15000;

  var config = window.COMMENTS_CONFIG || {};
  var supabaseUrl = String(config.supabaseUrl || '').trim().replace(/\/+$/, '');
  var supabaseKey = String(config.supabaseAnonKey || '').trim();

  var views = {
    loading: document.getElementById('admin-loading'),
    signin: document.getElementById('admin-signin'),
    denied: document.getElementById('admin-denied'),
    error: document.getElementById('admin-error'),
    owner: document.getElementById('admin-owner')
  };
  var loadingText = document.getElementById('admin-loading-text');
  var signinButton = document.getElementById('admin-signin-google');
  var signinLabel = signinButton.textContent;
  var signinError = document.getElementById('admin-signin-error');
  var errorText = document.getElementById('admin-error-text');
  var retryButton = document.getElementById('admin-retry');
  var errorSignout = views.error.querySelector('[data-admin-signout]');
  var signoutButtons = document.querySelectorAll('[data-admin-signout]');
  var signoutError = document.getElementById('admin-signout-error');

  // Sections by name: { body, placeholder, render, cleanup }.
  var sections = {};
  Array.prototype.forEach.call(document.querySelectorAll('[data-section]'), function (el) {
    var body = el.querySelector('[data-section-body]') || el;
    sections[el.getAttribute('data-section')] = {
      body: body,
      placeholder: body.innerHTML,
      render: null,
      cleanup: null
    };
  });

  var readyCallbacks = [];
  var ready = false;          // the owner page is showing
  var checkedUserId = null;   // user whose owner check has an answer (owner or not)
  var checkingUserId = null;  // user whose owner check is in flight
  var checkSeq = 0;           // bumped to drop answers to older checks
  var retryAction = null;

  // An error Supabase sent back after Google (e.g. the owner cancelled, or Google isn't
  // set up), and whether the address holds sign-in details at all.
  var urlError = readUrlError();
  var hadAuthParams = urlError !== '' || /[?&#](code|access_token)=/.test(location.href);

  var admin = window.studioAdmin = {
    client: null,
    session: null,
    isReady: function () { return ready; },
    registerSection: registerSection,
    onReady: onReady
  };

  retryButton.addEventListener('click', function () {
    if (retryAction) retryAction();
  });

  if (!supabaseUrl || !supabaseKey) {
    showError('The Supabase settings in comments-config.js are empty, so sign-in can\'t work.', reload);
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    showError('The sign-in library didn\'t load. Check your connection and reload the page.', reload);
    return;
  }

  // PKCE: Google sends the owner back with ?code=..., which supabase-js swaps for a
  // session (and removes from the address) as the page loads.
  var client = admin.client = window.supabase.createClient(supabaseUrl, supabaseKey, {
    auth: {
      flowType: 'pkce',
      detectSessionInUrl: true,
      persistSession: true,
      autoRefreshToken: true
    }
  });

  showLoading('Checking sign-in…');

  // Coming back from Google with a code that can't be used (e.g. sign-in started in
  // another browser) leaves no session; say why.
  client.auth.initialize().then(function (result) {
    if (result && result.error && hadAuthParams && !urlError) {
      urlError = result.error.message || 'unknown error';
      if (!views.signin.hidden) showSignIn();
    }
  }, function () {});

  client.auth.onAuthStateChange(function (event, session) {
    // supabase-js holds a lock while this runs, so other Supabase calls made here would
    // wait forever. Handle the change just after instead.
    setTimeout(function () { handleSession(event, session); }, 0);
  });

  signinButton.addEventListener('click', function () {
    signinButton.disabled = true;
    signinButton.textContent = 'Opening Google…';
    signinError.hidden = true;
    urlError = '';
    var start;
    try {
      start = client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: location.origin + location.pathname }
      });
    } catch (err) {
      start = Promise.resolve({ error: err });
    }
    // On success the browser is on its way to Google.
    Promise.resolve(start).then(function (result) {
      if (result && result.error) signInFailed(result.error);
    }, signInFailed);
  });

  // Coming back to this page with the Back button from Google (page restored from the
  // back-forward cache): make the button usable again.
  window.addEventListener('pageshow', function (event) {
    if (event.persisted) resetSignInButton();
  });

  Array.prototype.forEach.call(signoutButtons, function (button) {
    button.addEventListener('click', signOut);
  });

  // ---- Sign-in state -------------------------------------------------------------

  function handleSession(event, session) {
    if (event === 'INITIAL_SESSION') cleanUrl();
    admin.session = session || null;

    if (!session || !session.user) {
      checkSeq++;
      checkedUserId = null;
      checkingUserId = null;
      closeOwnerPage();
      showSignIn();
      return;
    }

    // Token refreshes (and repeat sign-in events) for the same account only update
    // admin.session above; the answer to the owner check stays.
    if (session.user.id === checkedUserId || session.user.id === checkingUserId) return;
    checkOwner();
  }

  function checkOwner() {
    var session = admin.session;
    if (!session || !session.user) {
      showSignIn();
      return;
    }
    var seq = ++checkSeq;
    var userId = session.user.id;
    checkingUserId = userId;
    checkedUserId = null;
    closeOwnerPage();
    setEmail(session.user.email || 'This account');
    showLoading('Checking your account…');

    var controller = typeof AbortController === 'function' ? new AbortController() : null;
    var timedOut = false;
    var timer = controller ? setTimeout(function () {
      timedOut = true;
      controller.abort();
    }, CHECK_TIMEOUT_MS) : null;

    var request = client.rpc('is_owner');
    if (controller) request = request.abortSignal(controller.signal);

    Promise.resolve(request).then(function (result) {
      finish(result.error, result.data);
    }, function (err) {
      finish(err || new Error('unknown error'));
    });

    function finish(error, isOwner) {
      if (timer) clearTimeout(timer);
      if (seq !== checkSeq) return; // signed out, or another check started since
      checkingUserId = null;
      if (error) {
        console.error('Owner check failed:', error);
        showError(describeCheckError(error, timedOut), checkOwner);
        return;
      }
      checkedUserId = userId;
      if (isOwner === true) openOwnerPage();
      else showView('denied');
    }
  }

  function describeCheckError(error, timedOut) {
    var message = String((error && error.message) || '');
    var code = String((error && error.code) || '');
    if (timedOut) {
      return 'Supabase didn\'t answer in time. Check your connection and try again.';
    }
    if (code === 'PGRST202' || code === '42883' ||
        /could not find the function|function .*does not exist/i.test(message)) {
      return 'The owner check isn\'t set up yet: supabase/owners.sql hasn\'t been run in ' +
        'the Supabase SQL Editor (see "Set up the owner page" in the README).';
    }
    if (code === '42501' || /permission denied/i.test(message)) {
      return 'The owner check isn\'t allowed: run supabase/owners.sql again in the ' +
        'Supabase SQL Editor.';
    }
    if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(message)) {
      return 'Your sign-in has expired. Sign out, then sign in again.';
    }
    if (/^(TypeError|FetchError|AbortError)\b/.test(message) ||
        /failed to fetch|networkerror|load failed/i.test(message)) {
      return 'Couldn\'t reach Supabase. Check your connection and try again.';
    }
    return 'Couldn\'t check your account (' + (message || 'unknown error') + ').';
  }

  function signInFailed(error) {
    resetSignInButton();
    signinError.textContent = 'Couldn\'t start Google sign-in: ' +
      ((error && error.message) || 'unknown error') + '.';
    signinError.hidden = false;
  }

  function signOut() {
    setSignoutDisabled(true);
    signoutError.hidden = true;
    var done;
    try {
      // Signs out on this device only, not on the owner's other devices.
      done = client.auth.signOut({ scope: 'local' });
    } catch (err) {
      done = Promise.resolve({ error: err });
    }
    // On success onAuthStateChange gets SIGNED_OUT and shows the sign-in screen.
    Promise.resolve(done).then(function (result) {
      setSignoutDisabled(false);
      if (result && result.error) signOutFailed(result.error);
    }, function (err) {
      setSignoutDisabled(false);
      signOutFailed(err);
    });
  }

  function signOutFailed(error) {
    signoutError.textContent = 'Couldn\'t sign out: ' +
      ((error && error.message) || 'unknown error') + '. Try again.';
    signoutError.hidden = false;
  }

  // ---- Owner page and sections ---------------------------------------------------

  function openOwnerPage() {
    showView('owner');
    ready = true;
    Object.keys(sections).forEach(function (name) {
      if (sections[name].render) renderSection(name);
    });
    readyCallbacks.slice().forEach(callReady);
  }

  function closeOwnerPage() {
    if (!ready) return;
    ready = false;
    Object.keys(sections).forEach(function (name) {
      var section = sections[name];
      if (section.cleanup) {
        try { section.cleanup(); } catch (err) { console.error(err); }
      }
      section.cleanup = null;
      section.body.innerHTML = section.placeholder;
    });
  }

  function registerSection(name, render) {
    if (typeof render !== 'function') {
      throw new TypeError('studioAdmin.registerSection: render must be a function');
    }
    var section = sections[name];
    if (!section) {
      console.error('studioAdmin.registerSection: admin.html has no data-section="' + name + '"');
      return;
    }
    if (section.render) {
      console.error('studioAdmin.registerSection: "' + name + '" is already registered');
      return;
    }
    section.render = render;
    if (ready) renderSection(name);
  }

  function renderSection(name) {
    var section = sections[name];
    section.body.textContent = '';
    try {
      var cleanup = section.render(section.body, admin);
      section.cleanup = typeof cleanup === 'function' ? cleanup : null;
    } catch (err) {
      console.error(err);
      section.cleanup = null;
      var note = document.createElement('p');
      note.className = 'admin-message admin-message-error';
      note.textContent = 'This section couldn\'t load: ' + ((err && err.message) || 'unknown error') + '.';
      section.body.textContent = '';
      section.body.appendChild(note);
    }
  }

  function onReady(fn) {
    if (typeof fn !== 'function') {
      throw new TypeError('studioAdmin.onReady: expects a function');
    }
    readyCallbacks.push(fn);
    if (ready) callReady(fn);
  }

  function callReady(fn) {
    try { fn(admin); } catch (err) { console.error(err); }
  }

  // ---- Views ---------------------------------------------------------------------

  function showView(name) {
    Object.keys(views).forEach(function (key) {
      views[key].hidden = key !== name;
    });
    signoutError.hidden = true;
  }

  function showLoading(text) {
    loadingText.textContent = text;
    showView('loading');
  }

  function showSignIn() {
    resetSignInButton();
    if (urlError) {
      signinError.textContent = 'Google sign-in didn\'t work: ' + urlError;
      signinError.hidden = false;
    } else {
      signinError.hidden = true;
    }
    showView('signin');
  }

  function resetSignInButton() {
    signinButton.disabled = false;
    signinButton.textContent = signinLabel;
  }

  function showError(message, retry) {
    errorText.textContent = message;
    retryAction = retry;
    errorSignout.hidden = !admin.session;
    showView('error');
  }

  function setEmail(email) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-admin-email]'), function (el) {
      el.textContent = email;
    });
  }

  function setSignoutDisabled(disabled) {
    Array.prototype.forEach.call(signoutButtons, function (button) {
      button.disabled = disabled;
    });
  }

  // ---- Address -------------------------------------------------------------------

  function readUrlError() {
    var search = new URLSearchParams(location.search);
    var hash = new URLSearchParams(location.hash.replace(/^#/, ''));
    return String(
      search.get('error_description') || hash.get('error_description') ||
      search.get('error') || hash.get('error') || ''
    ).trim();
  }

  // Once supabase-js has read the address, drop what's left of the sign-in details
  // (errors, and anything it didn't remove itself) so a reload starts clean.
  function cleanUrl() {
    if (!hadAuthParams) return;
    if (!location.search && !location.hash) return;
    try {
      history.replaceState(history.state, '', location.pathname);
    } catch (err) { /* leave the address as it is */ }
  }

  function reload() {
    location.reload();
  }
})();
