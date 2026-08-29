/* Tally Arbiter — tallyarbiter.com
   Vanilla JS. No dependencies, no polyfills, no tracking. */

(function () {
  'use strict';

  var root = document.documentElement;
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------------------------------------------------------------
     Theme toggle
     The pre-paint script in <head> has already applied any saved choice;
     this only handles switching it afterwards.
     --------------------------------------------------------------------- */

  var themeToggle = document.getElementById('theme-toggle');

  function currentTheme() {
    // Must mirror the CSS, which paints dark for everything except an explicit
    // data-theme="light" — otherwise the first click would compute the theme the
    // page is already showing and appear to do nothing.
    return root.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  if (themeToggle) {
    themeToggle.addEventListener('click', function () {
      var next = currentTheme() === 'dark' ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('ta-theme', next); } catch (e) { /* private mode */ }
    });
  }

  /* ---------------------------------------------------------------------
     Header: shrink-to-solid on scroll, plus the back-to-top button
     --------------------------------------------------------------------- */

  var header = document.getElementById('site-header');
  var toTop = document.getElementById('to-top');
  var ticking = false;

  function onScroll() {
    var y = window.scrollY;
    if (header) header.classList.toggle('is-stuck', y > 12);
    if (toTop) toTop.classList.toggle('is-visible', y > 700);
    ticking = false;
  }

  window.addEventListener('scroll', function () {
    if (!ticking) {
      ticking = true;
      window.requestAnimationFrame(onScroll);
    }
  }, { passive: true });

  onScroll();

  /* ---------------------------------------------------------------------
     Mobile navigation
     --------------------------------------------------------------------- */

  var navToggle = document.getElementById('nav-toggle');
  var nav = document.getElementById('nav');

  function closeNav() {
    if (!nav) return;
    nav.classList.remove('is-open');
    if (navToggle) {
      navToggle.setAttribute('aria-expanded', 'false');
      navToggle.setAttribute('aria-label', 'Open menu');
    }
  }

  if (navToggle && nav) {
    navToggle.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    });

    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) closeNav();
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeNav();
    });

    // A resize past the breakpoint should not leave a stranded open panel.
    window.addEventListener('resize', function () {
      if (window.innerWidth > 1040) closeNav();
    });
  }

  /* ---------------------------------------------------------------------
     Scrollspy — highlight the section currently in view
     --------------------------------------------------------------------- */

  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll('.nav-list a[href^="#"]')
  );

  if (navLinks.length && 'IntersectionObserver' in window) {
    var sections = navLinks
      .map(function (link) { return document.querySelector(link.getAttribute('href')); })
      .filter(Boolean);

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          link.classList.toggle(
            'is-active',
            link.getAttribute('href') === '#' + entry.target.id
          );
        });
      });
    }, { rootMargin: '-20% 0px -70% 0px' });

    sections.forEach(function (section) { spy.observe(section); });
  }

  /* ---------------------------------------------------------------------
     Reveal on scroll
     --------------------------------------------------------------------- */

  var revealables = document.querySelectorAll('.reveal');

  if (reduceMotion || !('IntersectionObserver' in window)) {
    Array.prototype.forEach.call(revealables, function (el) {
      el.classList.add('is-in');
    });
  } else {
    var revealer = new IntersectionObserver(function (entries, obs) {
      entries.forEach(function (entry, i) {
        if (!entry.isIntersecting) return;
        // A short stagger reads as one motion rather than a popcorn effect.
        setTimeout(function () {
          entry.target.classList.add('is-in');
        }, Math.min(i, 5) * 60);
        obs.unobserve(entry.target);
      });
    }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });

    Array.prototype.forEach.call(revealables, function (el) {
      revealer.observe(el);
    });
  }

  /* ---------------------------------------------------------------------
     Copy-to-clipboard on the install commands
     --------------------------------------------------------------------- */

  Array.prototype.forEach.call(
    document.querySelectorAll('.copy-btn'),
    function (btn) {
      btn.addEventListener('click', function () {
        var text = btn.getAttribute('data-copy') || '';
        var done = function () {
          btn.classList.add('is-copied');
          btn.setAttribute('aria-label', 'Copied');
          setTimeout(function () {
            btn.classList.remove('is-copied');
            btn.setAttribute('aria-label', 'Copy command');
          }, 1800);
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText(text).then(done, function () { /* denied */ });
        } else {
          // Older Safari and any non-secure context.
          var ta = document.createElement('textarea');
          ta.value = text;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          try { document.execCommand('copy'); done(); } catch (e) { /* give up quietly */ }
          document.body.removeChild(ta);
        }
      });
    }
  );

  /* ---------------------------------------------------------------------
     YouTube facades — the iframe is only created on click, so the page
     loads nothing from youtube.com for visitors who never press play.
     --------------------------------------------------------------------- */

  Array.prototype.forEach.call(
    document.querySelectorAll('.video-embed[data-video]'),
    function (facade) {
      facade.addEventListener('click', function () {
        var id = facade.getAttribute('data-video');
        var frame = document.createElement('iframe');
        frame.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
        frame.title = facade.getAttribute('aria-label') || 'Video';
        frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture';
        frame.allowFullscreen = true;
        frame.referrerPolicy = 'strict-origin-when-cross-origin';
        facade.replaceChildren(frame);
      }, { once: true });
    }
  );

  /* ---------------------------------------------------------------------
     Hero demo — walk the producer panel through a plausible cut sequence.

     Each step lists the state of the four rows. The point being made is the
     one in the copy: Camera 2 is assigned to two sources, so it goes to
     program when either of them puts it there.
     --------------------------------------------------------------------- */

  var demo = document.getElementById('tally-demo');

  if (demo && !reduceMotion) {
    var rows = demo.querySelectorAll('.tally-row');

    var sequence = [
      ['program', 'preview', 'clear',   'clear'  ],
      ['clear',   'program', 'preview', 'clear'  ],
      ['clear',   'program', 'clear',   'preview'],
      ['preview', 'clear',   'clear',   'program'],
      ['preview', 'clear',   'program', 'clear'  ],
      ['clear',   'preview', 'program', 'clear'  ],
      ['clear',   'program', 'preview', 'clear'  ],
      ['program', 'clear',   'clear',   'preview']
    ];

    var labels = { program: 'Program', preview: 'Preview', clear: 'Clear' };
    var step = 0;
    var timer = null;

    function render() {
      var states = sequence[step % sequence.length];
      Array.prototype.forEach.call(rows, function (row, i) {
        var state = states[i];
        row.setAttribute('data-state', state);
        var badge = row.querySelector('.state');
        if (badge) badge.textContent = labels[state];
      });
      step += 1;
    }

    function start() {
      if (timer) return;
      render();
      timer = setInterval(render, 2600);
    }

    function stop() {
      clearInterval(timer);
      timer = null;
    }

    // Don't animate off-screen, and pause when the tab is hidden.
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        entries[0].isIntersecting ? start() : stop();
      }, { threshold: 0.2 }).observe(demo);
    } else {
      start();
    }

    document.addEventListener('visibilitychange', function () {
      document.hidden ? stop() : start();
    });
  }

  /* ---------------------------------------------------------------------
     Footer year
     --------------------------------------------------------------------- */

  var year = document.getElementById('year');
  if (year) year.textContent = String(new Date().getFullYear());

})();
