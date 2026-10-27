/* Short Final: the script of the home pages and the press page (served at /assets/site/brand/home.js). Three small parts, each
   optional, each does nothing when its markup is missing:
   1. The hero: approach paths and planes drawn on a canvas behind the hero text. Paused when off screen or when the tab is hidden;
      one still frame under prefers-reduced-motion; the static picture in the page is the fallback without script.
   2. The airport pick: loads the list of airports with maps the first time the field is used, filters it as you type, and goes
      to the airport on Enter or on a result. Nothing is loaded before that.
   3. The trailer: the poster is a link to YouTube; with script, the youtube-nocookie player replaces it on the first click. */
(function () {
  'use strict';

  var reduce = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var reduced = function () { return Boolean(reduce && reduce.matches); };

  /* ---------- 1. the hero ---------- */
  function setupHero(canvas) {
    var ctx = canvas.getContext && canvas.getContext('2d');
    if (!ctx) return;
    var W = 1, H = 1, dpr = 1, paths = [], planes = [], running = false, raf = 0, last = 0, inView = true;
    var ORANGE = '#ef8a2f';

    function build() {
      var ex = W * 0.7, ey = H * 0.8;
      var starts = [[0.28, -0.05], [0.55, -0.05], [1.05, 0.12], [1.05, 0.5], [0.96, 1.05], [0.62, 1.05], [1.05, 0.84]];
      paths = starts.map(function (s, i) {
        var sx = s[0] * W, sy = s[1] * H;
        var side = i % 2 ? -1 : 1;
        return { sx: sx, sy: sy, cx: (sx + ex) / 2 + side * W * 0.07, cy: (sy + ey) / 2 - H * 0.14, ex: ex, ey: ey };
      });
      var count = Math.max(5, Math.min(12, Math.round(W / 110)));
      planes = [];
      for (var i = 0; i < count; i++) planes.push({ path: paths[i % paths.length], t: i / count, speed: 0.03 + ((i * 37) % 10) / 300 });
    }

    function point(p, t) {
      var u = 1 - t;
      return {
        x: u * u * p.sx + 2 * u * t * p.cx + t * t * p.ex,
        y: u * u * p.sy + 2 * u * t * p.cy + t * t * p.ey,
        dx: 2 * u * (p.cx - p.sx) + 2 * t * (p.ex - p.cx),
        dy: 2 * u * (p.cy - p.sy) + 2 * t * (p.ey - p.cy),
      };
    }

    function draw(now) {
      ctx.clearRect(0, 0, W, H);
      var cx = W * 0.74, cy = H * 0.42, R = Math.max(W, H) * 0.5;
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(143,240,207,0.16)';
      for (var k = 1; k <= 3; k++) {
        ctx.beginPath();
        ctx.arc(cx, cy, (R * k) / 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      var angle = reduced() ? -0.7 : ((now / 6000) * Math.PI * 2) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, angle - 0.55, angle);
      ctx.closePath();
      ctx.fillStyle = 'rgba(143,240,207,0.09)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
      ctx.strokeStyle = 'rgba(143,240,207,0.45)';
      ctx.stroke();

      ctx.lineCap = 'round';
      ctx.lineWidth = 3;
      ctx.setLineDash([2, 12]);
      ctx.strokeStyle = 'rgba(239,138,47,0.42)';
      paths.forEach(function (p) {
        ctx.beginPath();
        ctx.moveTo(p.sx, p.sy);
        ctx.quadraticCurveTo(p.cx, p.cy, p.ex, p.ey);
        ctx.stroke();
      });
      ctx.setLineDash([]);

      var first = paths[0];
      ctx.save();
      ctx.translate(first.ex, first.ey);
      ctx.rotate(-0.35);
      ctx.fillStyle = 'rgba(255,246,227,0.2)';
      ctx.fillRect(-70, -6, 140, 12);
      ctx.restore();

      planes.forEach(function (plane) {
        var pt = point(plane.path, plane.t);
        var heading = Math.atan2(pt.dy, pt.dx);
        for (var j = 1; j <= 3; j++) {
          var back = point(plane.path, Math.max(0, plane.t - j * 0.02));
          ctx.fillStyle = 'rgba(239,138,47,' + (0.3 - j * 0.08) + ')';
          ctx.beginPath();
          ctx.arc(back.x, back.y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.save();
        ctx.translate(pt.x, pt.y);
        ctx.rotate(heading + Math.PI / 2);
        ctx.fillStyle = ORANGE;
        ctx.beginPath();
        ctx.moveTo(0, -8);
        ctx.lineTo(5.5, 6);
        ctx.lineTo(0, 3);
        ctx.lineTo(-5.5, 6);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
    }

    function frame(now) {
      raf = 0;
      if (!running) return;
      var dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
      last = now;
      planes.forEach(function (plane) {
        plane.t = (plane.t + plane.speed * dt) % 1;
      });
      draw(now);
      raf = window.requestAnimationFrame(frame);
    }

    function canRun() {
      return !reduced() && inView && !document.hidden;
    }

    function start() {
      if (running || !canRun()) return;
      running = true;
      last = window.performance.now();
      raf = window.requestAnimationFrame(frame);
    }

    function stop() {
      running = false;
      if (raf) window.cancelAnimationFrame(raf);
      raf = 0;
    }

    function resize() {
      var r = canvas.getBoundingClientRect();
      W = Math.max(1, r.width);
      H = Math.max(1, r.height);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (reduced()) {
        stop();
        draw(0);
      } else {
        draw(window.performance.now());
        start();
      }
    }

    resize();
    if (window.ResizeObserver) new window.ResizeObserver(resize).observe(canvas.parentElement || canvas);
    else window.addEventListener('resize', resize);
    if ('IntersectionObserver' in window) {
      new window.IntersectionObserver(function (entries) {
        inView = entries[0] ? entries[0].isIntersecting : true;
        if (inView) start();
        else stop();
      }).observe(canvas);
    }
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) stop();
      else start();
    });
    var onMotion = function () {
      if (reduced()) {
        stop();
        draw(0);
      } else {
        start();
      }
    };
    if (reduce && reduce.addEventListener) reduce.addEventListener('change', onMotion);
  }

  /* ---------- 2. the airport pick ---------- */
  function setupPick(form) {
    var input = form.querySelector('input[name="q"]');
    var list = form.querySelector('.results');
    var status = form.querySelector('.pick-status');
    var template = form.getAttribute('data-pick-template') || '/airports/{lower}/';
    var noResults = form.getAttribute('data-no-results') || '';
    var rows = null;
    var loading = null;

    function href(icao) {
      return template.replace('{lower}', icao.toLowerCase()).replace('{icao}', icao);
    }

    function load() {
      if (rows) return Promise.resolve(rows);
      if (loading) return loading;
      // The airports hub's index (/assets/site/airports-index.json): rows [ICAO, IATA, name, city, country code, has a page].
      // Its rows are in order of importance (the largest airports come first), so each match group keeps that order.
      loading = fetch('/assets/site/airports-index.json')
        .then(function (r) { return r.ok ? r.json() : { rows: [] }; })
        .then(function (data) {
          var names = data.countries || {};
          rows = (data.rows || []).filter(function (r) { return r[5] === 1; }).map(function (r) {
            var item = { icao: r[0], iata: r[1] || '', name: r[2] || '', city: r[3] || '', country: names[r[4]] || r[4] || '' };
            item.key = [item.icao, item.iata, item.name, item.city, item.country].join(' ').toLowerCase();
            return item;
          });
          return rows;
        })
        .catch(function () { rows = []; return rows; });
      return loading;
    }

    function search(text) {
      var q = text.trim().toLowerCase();
      if (!q || !rows) return [];
      var exact = [];
      var starts = [];
      var inside = [];
      rows.forEach(function (r) {
        var code = r.icao.toLowerCase();
        var iata = r.iata.toLowerCase();
        if (code === q || iata === q) exact.push(r);
        else if (code.indexOf(q) === 0 || iata.indexOf(q) === 0 || r.name.toLowerCase().indexOf(q) === 0 || r.city.toLowerCase().indexOf(q) === 0) starts.push(r);
        else if (r.key.indexOf(q) !== -1) inside.push(r);
      });
      return exact.concat(starts, inside).slice(0, 8);
    }

    function render(results) {
      while (list.firstChild) list.removeChild(list.firstChild);
      results.forEach(function (r) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = href(r.icao);
        var code = document.createElement('b');
        code.textContent = r.icao;
        var name = document.createElement('span');
        name.textContent = r.name;
        var place = document.createElement('small');
        place.textContent = [r.city, r.country].filter(Boolean).join(', ');
        a.appendChild(code);
        a.appendChild(name);
        a.appendChild(place);
        li.appendChild(a);
        list.appendChild(li);
      });
      if (status) status.textContent = results.length || !input.value.trim() ? '' : noResults;
    }

    function update() {
      load().then(function () { render(search(input.value)); });
    }

    input.addEventListener('focus', function () { load(); }, { once: true });
    input.addEventListener('input', update);
    form.addEventListener('submit', function (event) {
      var results = search(input.value);
      if (results.length) {
        event.preventDefault();
        window.location.href = href(results[0].icao);
        return;
      }
      if (rows === null) return;
      event.preventDefault();
      if (status) status.textContent = noResults;
    });
  }

  /* ---------- 3. the trailer ---------- */
  function setupTrailer(box) {
    var id = box.getAttribute('data-trailer');
    if (!id || !box.querySelector('[data-trailer-link]')) return;
    /* Both the poster and the caption under it are trailer links; one handler covers them. */
    box.addEventListener('click', function (event) {
      var link = event.target && event.target.closest ? event.target.closest('[data-trailer-link]') : null;
      if (!link || !box.contains(link)) return;
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      var frame = document.createElement('iframe');
      frame.className = 'trailer-frame';
      frame.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0&modestbranding=1';
      frame.title = box.getAttribute('data-title') || 'Short Final trailer';
      frame.setAttribute('allow', 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture');
      frame.setAttribute('allowfullscreen', '');
      frame.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
      while (box.firstChild) box.removeChild(box.firstChild);
      box.appendChild(frame);
    });
  }

  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    var canvas = document.querySelector('canvas[data-hero]');
    if (canvas) setupHero(canvas);
    var form = document.querySelector('form[data-pick]');
    if (form) setupPick(form);
    Array.prototype.forEach.call(document.querySelectorAll('[data-trailer]'), setupTrailer);
  });
})();
