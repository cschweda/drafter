/**
 * The file's one script, the same text in every file, so its hash in the CSP is known before
 * anything is written. It sits in `<head>`, so a remembered light palette is set before anything
 * is drawn; the rest waits for the page. It shows the switches (which do nothing without it),
 * presses them, and remembers the reader's choices in `localStorage`. Every use of the store is
 * inside `try`: Safari on a `file://` page, an email client's preview, or blocked cookies can make
 * even reaching it throw, and then the switches still work, for the visit. It never asks the
 * system for its color scheme: with nothing remembered the file stays dark (design §2.1, Call).
 *
 * A band link is a plain `#b-<n>` anchor to the Pages view's line, which works with no script. In
 * Reading the same block's heading is `r-b-<n>`, and the script sends the link there instead.
 *
 * Plain ES5 in plain ASCII with no `</`, for every browser that might open an attachment.
 */
export const CLIENT_SCRIPT = `(function () {
  'use strict';
  var root = document.documentElement;
  var THEME = 'drafter-export-theme';
  var VIEW = 'drafter-export-view';

  function recall(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      return null;
    }
  }
  function keep(key, value) {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {}
  }
  function toggle(name) {
    return document.querySelector('button[data-toggle="' + name + '"]');
  }
  function views() {
    return document.querySelector('main[data-view]');
  }

  function showTheme(theme) {
    root.setAttribute('data-theme', theme);
    var button = toggle('theme');
    if (button) button.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
  }
  function showView(view) {
    var main = views();
    if (!main) return;
    main.setAttribute('data-view', view);
    var pages = main.querySelector('.pages');
    var reading = main.querySelector('.reading');
    if (pages) pages.hidden = view !== 'pages';
    if (reading) reading.hidden = view !== 'reading';
    var button = toggle('view');
    if (button) button.setAttribute('aria-pressed', view === 'reading' ? 'true' : 'false');
  }

  if (recall(THEME) === 'light') root.setAttribute('data-theme', 'light');

  function start() {
    showTheme(root.getAttribute('data-theme') === 'light' ? 'light' : 'dark');
    if (recall(VIEW) === 'reading') showView('reading');
    var switches = document.querySelector('.switches');
    if (switches) switches.hidden = false;

    document.addEventListener('click', function (event) {
      var target = event.target;
      if (!target || !target.closest) return;
      var button = target.closest('button[data-toggle]');
      if (button) {
        var name = button.getAttribute('data-toggle');
        var on = button.getAttribute('aria-pressed') !== 'true';
        if (name === 'theme') {
          showTheme(on ? 'light' : 'dark');
          keep(THEME, on ? 'light' : 'dark');
        } else if (name === 'view') {
          showView(on ? 'reading' : 'pages');
          keep(VIEW, on ? 'reading' : 'pages');
        }
        return;
      }
      var link = target.closest('a[href^="#b-"]');
      var main = views();
      if (link && main && main.getAttribute('data-view') === 'reading') {
        var there = document.getElementById('r-' + link.getAttribute('href').slice(1));
        if (there) {
          event.preventDefault();
          there.scrollIntoView();
        }
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
`;
