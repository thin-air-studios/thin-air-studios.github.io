/* Short Final: airport search on /airports/ (served at /assets/site/airports-search.js). Optional: without it the lists on the page
   still work. The index (/assets/site/airports-index.json) loads once, on first use. Results are built with textContent only. */
(function () {
  'use strict';
  var form = document.getElementById('airport-search');
  if (!form) return;
  var input = document.getElementById('airport-q');
  var list = document.getElementById('airport-results');
  var status = document.getElementById('airport-status');
  var url = input.getAttribute('data-index') || '/assets/site/airports-index.json';
  var MAX = 40;
  var data = null;
  var loading = null;
  var timer = 0;

  function load() {
    if (data) return Promise.resolve(data);
    if (!loading) {
      loading = fetch(url, { credentials: 'omit' }).then(function (r) {
        if (!r.ok) throw new Error('index ' + r.status);
        return r.json();
      }).then(function (json) {
        data = json;
        return data;
      });
    }
    return loading;
  }

  /* lower score is better: exact code, code prefix, name or city prefix, word start, then anywhere in the name or city */
  function score(row, q) {
    var icao = row[0].toLowerCase(), iata = row[1].toLowerCase(), name = row[2].toLowerCase(), city = row[3].toLowerCase();
    if (icao === q || (iata && iata === q)) return 0;
    if (icao.indexOf(q) === 0 || (iata && iata.indexOf(q) === 0)) return 1;
    if (name.indexOf(q) === 0 || city.indexOf(q) === 0) return 2;
    if (name.indexOf(' ' + q) !== -1 || city.indexOf(' ' + q) !== -1) return 3;
    if (name.indexOf(q) !== -1 || city.indexOf(q) !== -1) return 4;
    return -1;
  }

  function search(text) {
    var q = text.trim().toLowerCase();
    list.textContent = '';
    if (!q) {
      status.textContent = '';
      return;
    }
    load().then(function (index) {
      if (input.value.trim().toLowerCase() !== q) return;
      var hits = [];
      var rows = index.rows;
      for (var i = 0; i < rows.length; i++) {
        var s = score(rows[i], q);
        if (s >= 0) hits.push([s, rows[i]]);
      }
      hits.sort(function (a, b) {
        if (a[0] !== b[0]) return a[0] - b[0];
        if (a[1][5] !== b[1][5]) return b[1][5] - a[1][5];
        return a[1][2] < b[1][2] ? -1 : a[1][2] > b[1][2] ? 1 : 0;
      });
      var total = hits.length;
      hits = hits.slice(0, MAX);
      if (!total) {
        status.textContent = 'No airports match. Try a shorter code or a city name.';
        return;
      }
      status.textContent = total > MAX ? 'Showing the first ' + MAX + ' of ' + total + ' airports. Type more letters to narrow the list.' : total + (total === 1 ? ' airport found.' : ' airports found.');
      hits.forEach(function (h) {
        var row = h[1];
        var li = document.createElement('li');
        var main = document.createElement(row[5] ? 'a' : 'span');
        main.textContent = row[2] + ' (' + (row[1] || row[0]) + ')';
        if (row[5]) main.href = '/airports/' + row[0].toLowerCase() + '/';
        li.appendChild(main);
        var small = document.createElement('small');
        var country = index.countries[row[4]] || row[4];
        small.textContent = [row[3], country].filter(Boolean).join(', ') + (row[5] ? '' : ' · no map yet');
        li.appendChild(small);
        list.appendChild(li);
      });
    }).catch(function () {
      status.textContent = 'Search is not available right now. Use the country list below.';
    });
  }

  input.addEventListener('focus', function () { load().catch(function () {}); }, { once: true });
  input.addEventListener('input', function () {
    window.clearTimeout(timer);
    timer = window.setTimeout(function () { search(input.value); }, 120);
  });
  form.addEventListener('submit', function (e) { e.preventDefault(); search(input.value); });
  var noScript = form.querySelector('.js-only');
  if (noScript) noScript.hidden = true;
  status.textContent = '';
})();
