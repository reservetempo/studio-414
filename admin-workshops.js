/*
  Owner page, "Events" section (admin.html): the events on the site (workshops, sales
  and the like; the table and the code keep the workshop names) and who has signed up
  for them.

  - Lists every row of public.workshops (supabase/workshops.sql), upcoming ones first
    (soonest first). Past ones (their day has ended in the studio's time zone) are
    greyed and folded away under "Past events (N)". Spots taken (signed up, paid or
    free, and held while someone is in checkout) come from workshop_spots_taken().
    A free event shows "Free" for its price, and one without sign-ups "No sign-up"
    for its spots.
  - "Add event" / "Edit": a form for the name, date, times, description, spots and
    price, checked against the table's limits before it's sent. "Free" hides the price
    and stores 0; a free event can then untick "People sign up", which hides the spots
    and stores signups false with no capacity (the database refuses that while spots
    are taken, and its message is shown). Unticking "Free" turns sign-ups back on. A
    new event's id is made from its name and date ("paint-a-piece-2026-11-07", then
    "-2", "-3"... if that's taken). Ids never change: sign-ups are stored under them.
  - "Hide" / "Show on site" flips hidden. "Delete" is offered only while nothing is
    signed up or held; the database refuses otherwise, and its message is shown.
  - "Show sign-ups": the paid and the free (confirmed) rows of public.workshop_signups
    for that event. Events without sign-ups don't have the button.

  Everything owners or customers typed is shown with textContent, never as HTML. The
  list is loaded again after every change.
*/
(function () {
  'use strict';

  var admin = window.studioAdmin;
  if (!admin) {
    console.error('admin-workshops.js: load it after admin.js');
    return;
  }

  var TIME_ZONE = 'America/Toronto';   // the studio's (STUDIO_TIME_ZONE in workshop-checkout)
  // The table's limits (supabase/workshops.sql).
  var MAX_NAME = 100;
  var MAX_DESCRIPTION = 2000;
  var MIN_SPOTS = 1;
  var MAX_SPOTS = 500;
  var MIN_CENTS = 50;
  var MAX_CENTS = 1000000;
  var MAX_ID = 64;
  var COLUMNS = 'id, name, date, start_time, end_time, description, capacity, price_cents, ' +
    'signups, hidden';
  // Sign-ups that hold their spots for good: paid in Stripe, or confirmed (free events).
  var SIGNED_UP = ['paid', 'confirmed'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  admin.registerSection('workshops', render);

  function render(body) {
    var disposed = false;
    var loaded = false;      // the list has loaded at least once
    var loadSeq = 0;         // bumped to drop answers to older loads
    var workshops = [];      // rows, each with paid and held spots added
    var showPast = false;
    var pending = {};        // id -> 'hide' | 'show' | 'delete' while that change runs
    var itemErrors = {};     // id -> a message shown on that workshop
    var openSignups = {};    // id -> true while its sign-ups are showing
    var signups = {};        // id -> { state: 'loading' | 'ready' | 'error', rows, error }
    var focusables = {};     // 'id:action' -> button, to keep focus across a re-render
    var editing = null;      // the workshop being edited; null while adding one
    var saving = false;
    var formOpen = false;
    var returnFocus = null;  // focus key (or 'add') to go back to when the form closes
    var uid = 0;

    var root = el('div', 'workshops');

    // Loading (and a failed first load).
    var loadingPanel = el('div', 'workshops-loading');
    var loadingText = el('p', 'admin-status', 'Loading events…');
    var loadError = message('error');
    var retryButton = button('Try again', true);
    loadingPanel.append(loadingText, loadError, retryButton);

    // The list.
    var listPanel = el('div', 'workshops-list-panel');
    var addButton = button('Add event', true);
    var listTop = el('div', 'admin-actions workshops-top');
    listTop.appendChild(addButton);
    var listOk = message('ok');
    listOk.tabIndex = -1;
    var listError = message('error');
    var listRetry = button('Try again');
    listRetry.classList.add('workshops-list-retry');
    listRetry.hidden = true;
    var upcomingEmpty = el('p', 'admin-hint workshops-empty');
    var upcomingList = el('ul', 'workshops-list');
    // A disclosure triangle with its label, not a pill.
    var pastToggle = el('button', 'workshops-past-toggle');
    pastToggle.type = 'button';
    pastToggle.setAttribute('aria-controls', 'workshops-past');
    pastToggle.setAttribute('aria-expanded', 'false');
    var pastList = el('ul', 'workshops-list workshops-list-past');
    pastList.id = 'workshops-past';
    listPanel.append(listTop, listOk, listError, listRetry, upcomingEmpty, upcomingList,
      pastToggle, pastList);

    // Adding or editing a workshop.
    var form = el('form', 'workshops-form');
    form.noValidate = true;
    var formTitle = el('h3', 'workshops-form-title');
    formTitle.tabIndex = -1;
    var nameInput = input('text', 'workshops-name');
    nameInput.maxLength = MAX_NAME;
    nameInput.autocomplete = 'off';
    var dateInput = input('date', 'workshops-date');
    var startInput = input('time', 'workshops-start');
    var endInput = input('time', 'workshops-end');
    var descriptionInput = el('textarea', 'workshops-input workshops-textarea aqua-field');
    descriptionInput.id = 'workshops-description';
    descriptionInput.rows = 4;
    descriptionInput.maxLength = MAX_DESCRIPTION;
    var spotsInput = input('number', 'workshops-spots');
    spotsInput.min = String(MIN_SPOTS);
    spotsInput.max = String(MAX_SPOTS);
    spotsInput.step = '1';
    spotsInput.inputMode = 'numeric';
    var priceInput = input('text', 'workshops-price');
    priceInput.inputMode = 'decimal';
    priceInput.autocomplete = 'off';
    priceInput.placeholder = '0.00';
    var priceBox = el('div', 'workshops-price');
    var priceSymbol = el('span', 'workshops-price-symbol', '$');
    priceSymbol.setAttribute('aria-hidden', 'true');
    priceBox.append(priceSymbol, priceInput);
    // "Free" decides whether the price shows; for a free event, "People sign up"
    // decides whether the spots do (paid events always have sign-ups).
    var freeInput = checkbox('workshops-free');
    var signupsInput = checkbox('workshops-signups');
    var freeField = checkField(freeInput, 'Free');
    var signupsField = checkField(signupsInput, 'People sign up',
      'Untick for an event people just come to, like a sale: no spots, no sign-up');

    var times = el('div', 'workshops-form-row');
    times.append(
      field(startInput, 'Start time', 'Optional'),
      field(endInput, 'End time', 'Optional, needs a start time')
    );
    var spotsField = field(spotsInput, 'Spots', MIN_SPOTS + ' to ' + MAX_SPOTS);
    var priceField = field(priceInput, 'Price per spot (CAD)', '$0.50 to $10,000', priceBox);
    var numbers = el('div', 'workshops-form-row');
    numbers.append(spotsField, priceField);
    var formNote = el('p', 'admin-hint workshops-form-note',
      'Dates and times are studio time (Toronto). The event shows on the site as soon ' +
      'as it\'s saved, unless it\'s hidden.');
    var formError = message('error');
    formError.id = 'workshops-form-error';
    var saveButton = button('Save', true);
    saveButton.type = 'submit';
    var cancelButton = button('Cancel');
    var formActions = el('div', 'admin-actions');
    formActions.append(saveButton, cancelButton);
    form.append(
      formTitle,
      field(nameInput, 'Name'),
      field(dateInput, 'Date'),
      times,
      field(descriptionInput, 'Short description', 'Optional, up to 2,000 characters'),
      freeField,
      signupsField,
      numbers,
      formNote,
      formError,
      formActions
    );
    var formFields = [nameInput, dateInput, startInput, endInput, descriptionInput,
      spotsInput, priceInput];

    root.append(loadingPanel, listPanel, form);
    body.appendChild(root);

    retryButton.addEventListener('click', function () { load(); });
    listRetry.addEventListener('click', function () {
      say(listError, '');
      listRetry.hidden = true;
      load();
    });
    addButton.addEventListener('click', function () { openForm(null, 'add'); });
    pastToggle.addEventListener('click', function () {
      showPast = !showPast;
      renderList();
    });
    form.addEventListener('submit', function (event) {
      event.preventDefault();
      save();
    });
    cancelButton.addEventListener('click', function () {
      if (!saving) closeForm(returnFocus);
    });
    form.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && !saving) closeForm(returnFocus);
    });
    formFields.forEach(function (node) {
      node.addEventListener('input', function () { markInvalid(node, false); });
    });
    freeInput.addEventListener('change', function () {
      if (!freeInput.checked) signupsInput.checked = true;
      showPriceAndSpots();
    });
    signupsInput.addEventListener('change', showPriceAndSpots);

    showPanel('loading');
    load();

    return function cleanup() {
      disposed = true;
    };

    // ---- Loading -------------------------------------------------------------------

    // Loads the workshops and their spots taken, then shows them. focusKey: a button
    // to focus once the list is redrawn ('id:action'), if any.
    function load(focusKey) {
      var seq = ++loadSeq;
      if (!loaded) {
        showPanel('loading');
        loadingText.hidden = false;
        retryButton.hidden = true;
        say(loadError, '');
      }
      Promise.all([
        admin.client.from('workshops').select(COLUMNS),
        admin.client.rpc('workshop_spots_taken')
      ])
        .then(function (results) {
          if (disposed || seq !== loadSeq) return;
          if (results[0].error) throw results[0].error;
          if (results[1].error) throw results[1].error;
          var taken = {};
          (results[1].data || []).forEach(function (row) {
            taken[row.workshop] = {
              paid: Number(row.paid_spots) || 0,
              held: Number(row.held_spots) || 0
            };
          });
          workshops = (results[0].data || []).map(function (row) {
            var spots = taken[row.id] || { paid: 0, held: 0 };
            var w = Object.assign({}, row);
            w.paid = spots.paid;
            w.held = spots.held;
            return w;
          });
          loaded = true;
          listRetry.hidden = true;
          // Sign-ups showing are loaded again too; forget the rest (and those of events
          // that no longer have sign-ups).
          var ids = {};
          workshops.forEach(function (w) { if (hasSignups(w)) ids[w.id] = true; });
          Object.keys(openSignups).forEach(function (id) {
            if (!ids[id]) delete openSignups[id];
          });
          signups = {};
          Object.keys(openSignups).forEach(loadSignups);
          if (!formOpen) showPanel('list');
          renderList(focusKey);
        })
        .catch(function (err) {
          if (disposed || seq !== loadSeq) return;
          if (!loaded) {
            loadingText.hidden = true;
            say(loadError, 'The events couldn\'t load. ' + describeDbError(err));
            retryButton.hidden = false;
          } else {
            say(listError, 'The list couldn\'t refresh. ' + describeDbError(err));
            listRetry.hidden = false;
          }
        });
    }

    function loadSignups(id) {
      signups[id] = { state: 'loading' };
      var started = signups[id];
      admin.client.from('workshop_signups')
        .select('name, email, friend_name, quantity, paid_at, created_at')
        .eq('workshop', id)
        .in('status', SIGNED_UP)
        .order('created_at', { ascending: true })
        .then(function (result) {
          if (disposed || signups[id] !== started) return;
          if (result.error) throw result.error;
          // In the order they signed up: when paid, or when confirmed (free, no paid_at).
          var rows = (result.data || []).slice().sort(function (a, b) {
            return signedUpAt(a) - signedUpAt(b);
          });
          signups[id] = { state: 'ready', rows: rows };
          renderList();
        })
        .catch(function (err) {
          if (disposed || signups[id] !== started) return;
          signups[id] = { state: 'error', error: 'The sign-ups couldn\'t load. ' + describeDbError(err) };
          renderList();
        });
    }

    // ---- The list ------------------------------------------------------------------

    // Draws the list from the state above. Keeps focus on the same button if it was in
    // the list, or moves it to focusKey's.
    function renderList(focusKey) {
      var active = document.activeElement;
      var activeKey = null;
      if (active && listPanel.contains(active)) activeKey = active.getAttribute('data-focus-key');
      focusables = {};

      var today = todayInStudio();
      var upcoming = [];
      var past = [];
      workshops.forEach(function (w) { (w.date < today ? past : upcoming).push(w); });
      upcoming.sort(function (a, b) { return compare(a, b); });
      past.sort(function (a, b) { return compare(b, a); });

      upcomingList.textContent = '';
      pastList.textContent = '';
      upcoming.forEach(function (w) { upcomingList.appendChild(renderItem(w, false)); });
      past.forEach(function (w) { pastList.appendChild(renderItem(w, true)); });

      upcomingEmpty.textContent = workshops.length
        ? 'No upcoming events.'
        : 'No events yet. Add one with "Add event".';
      upcomingEmpty.hidden = upcoming.length > 0;
      upcomingList.hidden = upcoming.length === 0;
      pastToggle.hidden = past.length === 0;
      pastToggle.textContent = 'Past events (' + past.length + ')';
      pastToggle.setAttribute('aria-expanded', showPast ? 'true' : 'false');
      pastList.hidden = !showPast || past.length === 0;

      if (formOpen) return;
      var key = focusKey || activeKey;
      var target = key && focusTarget(key);
      if (target) target.focus();
      else if (activeKey) addButton.focus();   // its workshop is gone
    }

    // The button for 'id:action', or that workshop's Edit button if it's disabled now.
    function focusTarget(key) {
      var node = focusables[key];
      if (node && !node.disabled) return node;
      var edit = focusables[key.split(':')[0] + ':edit'];
      return edit || null;
    }

    function renderItem(w, isPast) {
      var n = ++uid;
      var li = el('li', 'workshops-item' + (isPast ? ' is-past' : '') + (w.hidden ? ' is-hidden' : ''));
      var busy = pending[w.id];

      var head = el('div', 'workshops-item-head');
      head.appendChild(el('h3', 'workshops-item-name', w.name));
      if (w.hidden) head.appendChild(el('span', 'workshops-badge', 'Hidden'));
      if (isPast) head.appendChild(el('span', 'workshops-badge workshops-badge-past', 'Past'));

      var when = formatDate(w.date);
      var clock = formatTimes(w.start_time, w.end_time);
      var whenLine = el('p', 'workshops-item-when', when + (clock ? ' · ' + clock : ''));

      var taken = w.paid + w.held;
      var spots = !hasSignups(w) ? 'No sign-up' : taken + ' of ' + w.capacity + ' spots taken' +
        (w.held ? ' (' + w.held + ' held while someone pays)' : '');
      var price = isFree(w) ? 'Free' : formatPrice(w.price_cents) + ' a spot';
      // Spots and price: two lines in a right-hand column on wide screens, one line
      // (with the dot between them) on phones.
      var metaLine = el('p', 'workshops-item-meta');
      metaLine.append(
        el('span', 'workshops-item-spots', spots),
        el('span', 'workshops-item-sep', ' · '),
        el('span', 'workshops-item-price', price)
      );

      var editButton = actionButton(w, 'edit', 'Edit');
      var hideButton = actionButton(w, 'hide',
        busy === 'hide' ? 'Hiding…' : busy === 'show' ? 'Showing…' : w.hidden ? 'Show on site' : 'Hide');
      var deleteButton = actionButton(w, 'delete', busy === 'delete' ? 'Deleting…' : 'Delete');
      var signupsButton = actionButton(w, 'signups', openSignups[w.id] ? 'Hide sign-ups' : 'Show sign-ups');
      signupsButton.setAttribute('aria-expanded', openSignups[w.id] ? 'true' : 'false');
      signupsButton.setAttribute('aria-controls', 'workshops-signups-' + n);
      if (busy) {
        // Not disabled, so focus can stay on the button that was pressed; the click
        // handlers ignore a workshop with a change running.
        [editButton, hideButton, deleteButton].forEach(function (node) {
          node.setAttribute('aria-disabled', 'true');
        });
      }

      var reason = deleteBlocked(w);
      var reasonLine = null;
      if (reason) {
        deleteButton.disabled = true;
        reasonLine = el('p', 'admin-hint workshops-reason', reason);
        reasonLine.id = 'workshops-reason-' + n;
        deleteButton.setAttribute('aria-describedby', reasonLine.id);
      }

      editButton.addEventListener('click', function () {
        if (!pending[w.id]) openForm(w, w.id + ':edit');
      });
      hideButton.addEventListener('click', function () { setHidden(w, !w.hidden); });
      deleteButton.addEventListener('click', function () { remove(w); });
      signupsButton.addEventListener('click', function () {
        if (openSignups[w.id]) {
          delete openSignups[w.id];
          delete signups[w.id];
        } else {
          openSignups[w.id] = true;
          loadSignups(w.id);
        }
        renderList();
      });

      var actions = el('div', 'admin-actions workshops-item-actions');
      actions.append(editButton, hideButton, deleteButton);
      if (hasSignups(w)) actions.appendChild(signupsButton);
      else delete focusables[w.id + ':signups'];
      li.append(head, whenLine, metaLine, actions);
      if (reasonLine) li.appendChild(reasonLine);

      if (itemErrors[w.id]) {
        var error = message('error');
        say(error, itemErrors[w.id]);
        li.appendChild(error);
      }

      if (openSignups[w.id] && hasSignups(w)) {
        var panel = renderSignups(w, signups[w.id] || { state: 'loading' });
        panel.id = 'workshops-signups-' + n;
        li.appendChild(panel);
      }
      return li;
    }

    function actionButton(w, action, label) {
      var node = button(label);
      var key = w.id + ':' + action;
      node.setAttribute('data-focus-key', key);
      focusables[key] = node;
      return node;
    }

    function renderSignups(w, info) {
      var panel = el('div', 'workshops-signups');
      panel.appendChild(el('h4', 'workshops-signups-title', 'Sign-ups'));
      if (info.state === 'loading') {
        panel.appendChild(el('p', 'admin-status workshops-signups-status', 'Loading sign-ups…'));
        return panel;
      }
      if (info.state === 'error') {
        var error = message('error');
        say(error, info.error);
        var again = actionButton(w, 'signups-retry', 'Try again');
        again.addEventListener('click', function () {
          loadSignups(w.id);
          renderList(w.id + ':signups');
        });
        panel.append(error, again);
        return panel;
      }
      var rows = info.rows;
      if (!rows.length) {
        panel.appendChild(el('p', 'admin-hint workshops-signups-status', 'No sign-ups yet'));
        return panel;
      }

      var table = el('table', 'workshops-signups-table');
      // Roles kept explicit: on phones the rows are restyled as stacked blocks.
      table.setAttribute('role', 'table');
      var caption = el('caption', 'workshops-visually-hidden', 'Sign-ups for ' + w.name);
      var thead = el('thead');
      thead.setAttribute('role', 'rowgroup');
      var headRow = el('tr');
      headRow.setAttribute('role', 'row');
      var labels = ['Name', 'Email', 'Spots', 'Friend', 'Signed up'];
      labels.forEach(function (label) {
        var th = el('th', null, label);
        th.scope = 'col';
        th.setAttribute('role', 'columnheader');
        if (label === 'Spots') th.className = 'workshops-signups-number';
        headRow.appendChild(th);
      });
      thead.appendChild(headRow);
      var tbody = el('tbody');
      tbody.setAttribute('role', 'rowgroup');
      var total = 0;
      rows.forEach(function (row) {
        var quantity = Number(row.quantity) || 0;
        total += quantity;
        var tr = el('tr');
        tr.setAttribute('role', 'row');
        var email = String(row.email || '');
        var link = el('a', 'workshops-signups-email', email);
        link.href = 'mailto:' + encodeURIComponent(email).replace(/%40/g, '@');
        var when = row.paid_at || row.created_at;   // confirmed (free) rows have no paid_at
        tr.append(
          cell('Name', row.name || ''),
          cell('Email', link),
          cell('Spots', String(quantity), 'workshops-signups-number'),
          cell('Friend', row.friend_name || '—'),
          cell('Signed up', when ? formatDate(dateInStudio(when)) : '—', 'workshops-signups-date')
        );
        tbody.appendChild(tr);
      });
      table.append(caption, thead, tbody);
      var wrap = el('div', 'workshops-signups-wrap');
      wrap.appendChild(table);
      var totalLine = el('p', 'workshops-signups-total',
        'Total: ' + plural(total, 'spot') + ' from ' + plural(rows.length, 'sign-up'));
      panel.append(wrap, totalLine);
      return panel;
    }

    // ---- Hide, show, delete ----------------------------------------------------------

    function setHidden(w, hidden) {
      if (pending[w.id]) return;
      pending[w.id] = hidden ? 'hide' : 'show';
      delete itemErrors[w.id];
      clearListMessages();
      renderList(w.id + ':hide');
      admin.client.from('workshops').update({ hidden: hidden }).eq('id', w.id).select('id')
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          if (!result.data || !result.data.length) throw gone();
          delete pending[w.id];
          say(listOk, hidden
            ? '"' + w.name + '" is hidden. It\'s off the site; its sign-ups are kept.'
            : '"' + w.name + '" shows on the site again.');
          load(w.id + ':hide');
        })
        .catch(function (err) {
          if (disposed) return;
          delete pending[w.id];
          itemErrors[w.id] = (hidden ? 'Couldn\'t hide it. ' : 'Couldn\'t show it on the site. ') +
            describeDbError(err);
          load(w.id + ':hide');
        });
    }

    function remove(w) {
      if (pending[w.id] || deleteBlocked(w)) return;
      var when = formatDate(w.date);
      if (!window.confirm('Delete "' + w.name + '" (' + when + ')? It comes off the site ' +
          'and can\'t be brought back.')) return;
      pending[w.id] = 'delete';
      delete itemErrors[w.id];
      clearListMessages();
      renderList(w.id + ':delete');
      admin.client.from('workshops').delete().eq('id', w.id).select('id')
        .then(function (result) {
          if (disposed) return;
          if (result.error) throw result.error;
          if (!result.data || !result.data.length) throw gone();
          delete pending[w.id];
          delete openSignups[w.id];
          say(listOk, 'Deleted "' + w.name + '" (' + when + ').');
          listOk.focus();
          load();
        })
        .catch(function (err) {
          if (disposed) return;
          delete pending[w.id];
          itemErrors[w.id] = 'Couldn\'t delete it. ' + describeDbError(err);
          load(w.id + ':delete');
        });
    }

    // Why it can't be deleted, or null if it can.
    function deleteBlocked(w) {
      if (w.paid > 0) return 'Has sign-ups — hide it instead';
      if (w.held > 0) return 'Someone is paying for it right now — hide it, or try again in about half an hour';
      return null;
    }

    // ---- The form --------------------------------------------------------------------

    function openForm(w, focusBack) {
      editing = w;
      returnFocus = focusBack;
      formOpen = true;
      clearListMessages();
      formTitle.textContent = w ? 'Edit "' + w.name + '"' : 'Add an event';
      nameInput.value = w ? w.name : '';
      dateInput.value = w ? w.date : '';
      startInput.value = w ? hhmm(w.start_time) : '';
      endInput.value = w ? hhmm(w.end_time) : '';
      descriptionInput.value = w && w.description ? w.description : '';
      spotsInput.value = w && w.capacity != null ? String(w.capacity) : '';
      // A free event's price field starts empty (0 isn't a price a paid event can have).
      priceInput.value = w && !isFree(w) ? (w.price_cents / 100).toFixed(2) : '';
      freeInput.checked = !!w && isFree(w);
      signupsInput.checked = !w || hasSignups(w);
      showPriceAndSpots();
      formFields.forEach(function (node) { markInvalid(node, false); });
      say(formError, '');
      setSaving(false);
      showPanel('form');
      nameInput.focus();
    }

    function closeForm(focusKey) {
      formOpen = false;
      editing = null;
      showPanel('list');
      if (focusKey === 'add' || !focusKey) addButton.focus();
      else renderList(focusKey);
    }

    function save() {
      if (saving) return;
      formFields.forEach(function (node) { markInvalid(node, false); });
      say(formError, '');
      var checked = readForm();
      if (checked.problem) {
        say(formError, checked.problem);
        markInvalid(checked.field, true);
        checked.field.focus();
        return;
      }
      var row = checked.row;
      var wasEditing = editing;
      setSaving(true);
      var request = wasEditing ? updateWorkshop(wasEditing.id, row) : insertWorkshop(row);
      request
        .then(function (id) {
          if (disposed) return;
          setSaving(false);
          formOpen = false;
          editing = null;
          showPanel('list');
          say(listOk, wasEditing
            ? 'Saved the changes to "' + row.name + '".'
            : 'Added "' + row.name + '" (' + formatDate(row.date) + ').');
          load(id + ':edit');
        })
        .catch(function (err) {
          if (disposed) return;
          setSaving(false);
          say(formError, (wasEditing ? 'Couldn\'t save the changes. ' : 'Couldn\'t add the event. ') +
            describeDbError(err));
          saveButton.focus();
        });
    }

    function setSaving(on) {
      saving = on;
      saveButton.textContent = on ? 'Saving…' : (editing ? 'Save changes' : 'Add event');
      saveButton.disabled = on;
      cancelButton.disabled = on;
      formFields.forEach(function (node) { node.readOnly = on; });
      // Check boxes can't be read-only: they're disabled instead.
      freeInput.disabled = on;
      signupsInput.disabled = on;
      form.setAttribute('aria-busy', on ? 'true' : 'false');
    }

    // Shows the price only for paid events, "People sign up" only for free ones, and
    // the spots only for events with sign-ups. A field that goes is no longer marked.
    function showPriceAndSpots() {
      var free = freeInput.checked;
      var withSignups = !free || signupsInput.checked;
      priceField.hidden = free;
      signupsField.hidden = !free;
      spotsField.hidden = !withSignups;
      if (free) markInvalid(priceInput, false);
      if (!withSignups) markInvalid(spotsInput, false);
    }

    // The form's values as a row for the table, or { problem, field } for the first
    // thing that needs fixing.
    function readForm() {
      var name = nameInput.value.trim();
      var nameLength = Array.from(name).length;
      if (!name) return problem(nameInput, 'Give the event a name.');
      if (nameLength > MAX_NAME) {
        return problem(nameInput, 'Keep the name to ' + MAX_NAME + ' characters or fewer (it\'s ' +
          nameLength + ').');
      }

      var date = dateInput.value;
      if (!date) return problem(dateInput, 'Choose the date of the event.');
      if (!isDate(date)) return problem(dateInput, 'That date isn\'t valid. Choose it again.');
      if (!editing && date < todayInStudio()) {
        return problem(dateInput, 'That date has passed. Choose today or a later date.');
      }

      var start = hhmm(startInput.value);
      var end = hhmm(endInput.value);
      if (startInput.value && !start) return problem(startInput, 'That start time isn\'t valid.');
      if (endInput.value && !end) return problem(endInput, 'That end time isn\'t valid.');
      if (end && !start) return problem(startInput, 'Add a start time too, or clear the end time.');
      if (start && end && end <= start) {
        return problem(endInput, 'The end time needs to be after the start time.');
      }

      var description = descriptionInput.value.trim();
      var descriptionLength = Array.from(description).length;
      if (descriptionLength > MAX_DESCRIPTION) {
        return problem(descriptionInput, 'Keep the description to 2,000 characters or fewer ' +
          '(it\'s ' + descriptionLength.toLocaleString('en-CA') + ').');
      }

      // Paid events always have sign-ups; a free one has them if the box is ticked. Turning
      // them off while spots are taken is left to the database, whose message is shown.
      var free = freeInput.checked;
      var withSignups = !free || signupsInput.checked;

      var spots = null;
      if (withSignups) {
        var spotsText = spotsInput.value.trim();
        spots = /^\d+$/.test(spotsText) ? parseInt(spotsText, 10) : NaN;
        if (!(spots >= MIN_SPOTS && spots <= MAX_SPOTS)) {
          return problem(spotsInput, 'Enter the number of spots: a whole number from ' + MIN_SPOTS +
            ' to ' + MAX_SPOTS + '.');
        }
        if (editing) {
          var taken = editing.paid + editing.held;
          if (spots < taken) {
            return problem(spotsInput, plural(taken, 'spot is', 'spots are') + ' already taken ' +
              '(signed up, or held while someone pays), so the event needs at least ' + taken + '.');
          }
        }
      }

      var cents = 0;
      if (!free) {
        cents = parsePrice(priceInput.value);
        if (cents === null) return problem(priceInput, 'Enter the price in dollars, like 59.99.');
        if (cents < MIN_CENTS || cents > MAX_CENTS) {
          return problem(priceInput, 'The price needs to be from $0.50 to $10,000 a spot.');
        }
      }

      return {
        row: {
          name: name,
          date: date,
          start_time: start || null,
          end_time: end || null,
          description: description || null,
          capacity: spots,
          price_cents: cents,
          signups: withSignups
        }
      };
    }

    // ---- Saving ----------------------------------------------------------------------

    // Adds the workshop under a new id; resolves with the id.
    function insertWorkshop(row) {
      var base = baseId(row.name, row.date);
      var used = {};
      workshops.forEach(function (w) { used[w.id] = true; });
      function attempt(tries) {
        var id = freeId(base, used);
        return admin.client.from('workshops').insert(Object.assign({ id: id }, row)).select('id')
          .then(function (result) {
            if (result.error) {
              // Someone else took that id since the list loaded: try the next one.
              if (result.error.code === '23505' && tries < 5) {
                used[id] = true;
                return attempt(tries + 1);
              }
              throw result.error;
            }
            return id;
          });
      }
      return attempt(0);
    }

    function updateWorkshop(id, row) {
      return admin.client.from('workshops').update(row).eq('id', id).select('id')
        .then(function (result) {
          if (result.error) throw result.error;
          if (!result.data || !result.data.length) throw gone();
          return id;
        });
    }

    // ---- Helpers -----------------------------------------------------------------------

    function showPanel(name) {
      loadingPanel.hidden = name !== 'loading';
      listPanel.hidden = name !== 'list';
      form.hidden = name !== 'form';
    }

    // Marks a field as needing a fix (pointing it at the form's error) or not.
    function markInvalid(node, invalid) {
      var hint = document.getElementById(node.id + '-hint');
      var ids = hint ? [hint.id] : [];
      if (invalid) {
        node.setAttribute('aria-invalid', 'true');
        ids.push(formError.id);
      } else {
        node.removeAttribute('aria-invalid');
      }
      if (ids.length) node.setAttribute('aria-describedby', ids.join(' '));
      else node.removeAttribute('aria-describedby');
    }

    function clearListMessages() {
      say(listOk, '');
      if (listRetry.hidden) say(listError, '');
    }

    function field(control, label, hint, wrapper) {
      var box = el('div', 'workshops-field');
      var labelNode = el('label', 'workshops-label', label);
      labelNode.htmlFor = control.id;
      box.appendChild(labelNode);
      if (hint) {
        var hintNode = el('span', 'workshops-field-hint', hint);
        hintNode.id = control.id + '-hint';
        control.setAttribute('aria-describedby', hintNode.id);
        box.appendChild(hintNode);
      }
      box.appendChild(wrapper || control);
      return box;
    }

    // A check box with its words, in the fields' column, and any hint under it. The box
    // is the sign-up window's (.workshop__check) and the words are set as the labels
    // (.workshops-label), so themes draw both as they already do those.
    function checkField(control, label, hint) {
      var box = el('div', 'workshops-field workshops-check-field');
      if (hint) {
        var hintNode = el('span', 'workshops-field-hint', hint);
        hintNode.id = control.id + '-hint';
        control.setAttribute('aria-describedby', hintNode.id);
        box.appendChild(hintNode);
      }
      var labelNode = el('label', 'workshop__check workshops-check');
      labelNode.append(control, el('span', 'workshops-label', label));
      box.appendChild(labelNode);
      return box;
    }
  }

  // ---- Formatting and parsing (no state) --------------------------------------------

  function compare(a, b) {
    if (a.date !== b.date) return a.date < b.date ? -1 : 1;
    var at = a.start_time || '';
    var bt = b.start_time || '';
    if (at !== bt) return at < bt ? -1 : 1;
    return String(a.name).localeCompare(String(b.name));
  }

  function isFree(w) {
    return Number(w.price_cents) === 0;
  }

  // Whether people sign up for it (signups is false only for some free events).
  function hasSignups(w) {
    return w.signups !== false;
  }

  // When a sign-up went through, in ms: paid_at, or created_at for a free (confirmed)
  // one, which has no paid_at.
  function signedUpAt(row) {
    var time = new Date(row.paid_at || row.created_at).getTime();
    return isNaN(time) ? 0 : time;
  }

  // Today's date in the studio, 'YYYY-MM-DD'.
  function todayInStudio() {
    return dateInStudio(new Date());
  }

  function dateInStudio(when) {
    var date = when instanceof Date ? when : new Date(when);
    if (isNaN(date.getTime())) return '';
    var parts = {};
    new Intl.DateTimeFormat('en-CA', {
      timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date).forEach(function (p) { parts[p.type] = p.value; });
    return parts.year + '-' + parts.month + '-' + parts.day;
  }

  function isDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text || '');
    if (!m) return false;
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
  }

  // 'YYYY-MM-DD' -> "Sat 7 Nov 2026".
  function formatDate(text) {
    if (!isDate(text)) return String(text || '');
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
    var d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return DAYS[d.getUTCDay()] + ' ' + d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' +
      d.getUTCFullYear();
  }

  // 'HH:MM[:SS]' or '' -> 'HH:MM', or '' if it isn't a time of day.
  function hhmm(text) {
    var m = /^(\d{2}):(\d{2})/.exec(text || '');
    if (!m || +m[1] > 23 || +m[2] > 59) return '';
    return m[1] + ':' + m[2];
  }

  // "1:00–4:00 pm", "11:00 am–2:00 pm", "1:00 pm", or ''.
  function formatTimes(start, end) {
    var s = clock(start);
    var e = clock(end);
    if (!s) return '';
    if (!e) return s.text + ' ' + s.half;
    if (s.half === e.half) return s.text + '–' + e.text + ' ' + e.half;
    return s.text + ' ' + s.half + '–' + e.text + ' ' + e.half;
  }

  function clock(text) {
    var t = hhmm(text);
    if (!t) return null;
    var h = +t.slice(0, 2);
    return { text: (h % 12 || 12) + ':' + t.slice(3), half: h < 12 ? 'am' : 'pm' };
  }

  // 5999 -> "$59.99".
  function formatPrice(cents) {
    return '$' + (Number(cents) / 100).toLocaleString('en-CA', {
      minimumFractionDigits: 2, maximumFractionDigits: 2
    });
  }

  // "59.99", "$1,000", "59,99" -> cents, or null if it isn't a price.
  function parsePrice(text) {
    var t = String(text || '').replace(/\s+/g, '').replace(/^\$|\$$/g, '');
    if (/^\d+,\d{1,2}$/.test(t)) t = t.replace(',', '.');            // a decimal comma
    else if (/^\d{1,3}(,\d{3})+(\.\d{0,2})?$/.test(t)) t = t.replace(/,/g, '');
    if (!/^(\d+(\.\d{0,2})?|\.\d{1,2})$/.test(t)) return null;
    return Math.round(parseFloat(t) * 100);
  }

  // A new workshop's id: its name and date, e.g. "paint-a-piece-2026-11-07", short enough
  // to take a "-N" suffix and stay within the table's 64 characters.
  function baseId(name, date) {
    var slug = String(name)
      .normalize('NFKD').replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/['’]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    var room = MAX_ID - (date.length + 1) - 4;
    slug = slug.slice(0, room).replace(/-+$/, '');
    return (slug || 'workshop') + '-' + date;
  }

  function freeId(base, used) {
    if (!used[base]) return base;
    for (var n = 2; ; n++) {
      if (!used[base + '-' + n]) return base + '-' + n;
    }
  }

  function plural(n, one, many) {
    return n + ' ' + (n === 1 ? one : (many || one + 's'));
  }

  function problem(node, text) {
    return { problem: text, field: node };
  }

  function gone() {
    var err = new Error('That event isn\'t there any more; someone may have deleted it. ' +
      'The list has been refreshed.');
    err.code = 'gone';
    return err;
  }

  function describeDbError(err) {
    var code = err && err.code;
    var text = (err && err.message) || '';
    if (code === 'gone') return text;
    if (code === '42501') return 'This account isn\'t allowed to see or change events (only owners can).';
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST202' || code === '42883') {
      return 'Events aren\'t set up yet (run supabase/workshops.sql).';
    }
    if (code === 'PGRST301' || code === 'PGRST303' || /jwt/i.test(text)) {
      return 'Your sign-in has run out. Reload the page and sign in again.';
    }
    if (code === '23505') return 'An event with that id already exists. Try again.';
    if (/violates check constraint/i.test(text)) {
      return 'The database refused one of the details. Check them and try again.';
    }
    if (!text || /fetch|network|load failed/i.test(text)) {
      return 'Couldn\'t reach Supabase. Check your connection and try again.';
    }
    // The database's own refusals (workshops.sql) are written for owners; add the hint.
    return sentence(text) + (err.hint ? ' ' + sentence(err.hint) : '');
  }

  function sentence(text) {
    return String(text).trim().replace(/([^.!?])$/, '$1.');
  }

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function input(type, id) {
    var node = el('input', 'workshops-input aqua-field');
    node.type = type;
    node.id = id;
    return node;
  }

  function checkbox(id) {
    var node = el('input');
    node.type = 'checkbox';
    node.id = id;
    return node;
  }

  function cell(label, content, className) {
    var td = el('td', className || null);
    td.setAttribute('role', 'cell');
    td.setAttribute('data-label', label);
    if (typeof content === 'string') td.textContent = content;
    else td.appendChild(content);
    return td;
  }

  function button(label, primary) {
    var node = el('button', 'admin-button aqua-pill' + (primary ? ' admin-button-primary aqua-pill--tint' : ''), label);
    node.type = 'button';
    return node;
  }

  // A message line: 'error' (role alert) or 'ok' (role status), hidden while empty.
  function message(kind) {
    var node = el('p', 'admin-message admin-message-' + kind);
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
    node.hidden = true;
    return node;
  }

  function say(node, text) {
    node.textContent = text || '';
    node.hidden = !text;
  }
})();
