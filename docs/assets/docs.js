/*
 * Progressive enhancement for the documentation shell.
 *
 * Everything here is optional: the pages are rendered HTML and read fine with
 * this file blocked. What it adds is search, copy buttons, a theme toggle, the
 * mobile sidebar, and highlighting the heading you are currently reading.
 */
(function () {
  "use strict";

  var $ = function (sel, root) {
    return (root || document).querySelector(sel);
  };
  var $$ = function (sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  };

  // ── Theme ────────────────────────────────────────────────────────────────
  var themeBtn = $(".top__theme");
  if (themeBtn) {
    themeBtn.addEventListener("click", function () {
      var current =
        document.documentElement.getAttribute("data-theme") ||
        (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
      var next = current === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-theme", next);
      try {
        localStorage.setItem("csda-theme", next);
      } catch (e) {
        /* private browsing: the toggle still works for this page */
      }
    });
  }

  // ── Mobile navigation ────────────────────────────────────────────────────
  var menuBtn = $(".top__menu");
  var side = $("#side");
  if (menuBtn && side) {
    menuBtn.addEventListener("click", function () {
      var open = side.classList.toggle("is-open");
      menuBtn.setAttribute("aria-expanded", String(open));
    });
  }

  // ── Copy buttons ─────────────────────────────────────────────────────────
  $$(".code__copy").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var code = $("code", btn.parentNode);
      if (!code) return;
      var done = function () {
        btn.textContent = "Copied";
        btn.classList.add("is-done");
        setTimeout(function () {
          btn.textContent = "Copy";
          btn.classList.remove("is-done");
        }, 1600);
      };
      if (navigator.clipboard) {
        navigator.clipboard.writeText(code.textContent).then(done, function () {
          btn.textContent = "Press ⌘C";
        });
      } else {
        // Older browsers: select the text so the reader can copy it themselves
        // rather than press a button that silently does nothing.
        var range = document.createRange();
        range.selectNodeContents(code);
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        btn.textContent = "Press ⌘C";
      }
    });
  });

  // ── Search ───────────────────────────────────────────────────────────────
  var input = $("#search");
  var results = $("#results");
  if (input && results) {
    var index = null;
    var depth = (document.documentElement.getAttribute("data-slug") || "").split("/").length - 1;
    var up = new Array(depth + 1).join("../");

    var load = function () {
      if (index) return Promise.resolve(index);
      return fetch(up + "assets/search-index.json")
        .then(function (r) {
          return r.json();
        })
        .then(function (data) {
          index = data;
          return index;
        })
        .catch(function () {
          index = [];
          return index;
        });
    };

    var render = function (matches, query) {
      if (matches.length === 0) {
        results.innerHTML = '<div class="empty">Nothing matches “' + escapeHtml(query) + '”.</div>';
        results.hidden = false;
        return;
      }
      results.innerHTML = matches
        .slice(0, 8)
        .map(function (m, i) {
          return (
            '<a href="' + up + m.slug + '.html"' + (i === 0 ? ' class="is-active"' : "") + ">" +
            "<strong>" + escapeHtml(m.title) + "</strong>" +
            "<span>" + escapeHtml(m.snippet) + "</span></a>"
          );
        })
        .join("");
      results.hidden = false;
    };

    var escapeHtml = function (s) {
      return String(s).replace(/[&<>"]/g, function (c) {
        return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
      });
    };

    var search = function (query) {
      var q = query.trim().toLowerCase();
      if (q.length < 2) {
        results.hidden = true;
        return;
      }
      load().then(function (data) {
        var matches = [];
        data.forEach(function (page) {
          var title = page.title.toLowerCase();
          var text = page.text.toLowerCase();
          var at = text.indexOf(q);
          // A title match outranks a body match; otherwise the reference page
          // for a term loses to whichever document happens to mention it most.
          var score = title.indexOf(q) !== -1 ? 0 : at !== -1 ? 1 : -1;
          if (score === -1) return;
          matches.push({
            slug: page.slug,
            title: page.title,
            score: score,
            snippet: at !== -1 ? page.text.slice(Math.max(0, at - 40), at + 90) : page.text.slice(0, 110),
          });
        });
        matches.sort(function (a, b) {
          return a.score - b.score;
        });
        render(matches, query);
      });
    };

    input.addEventListener("input", function () {
      search(input.value);
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") {
        results.hidden = true;
        input.blur();
      }
      if (e.key === "Enter") {
        var first = $("a", results);
        if (first) window.location.href = first.getAttribute("href");
      }
    });
    document.addEventListener("click", function (e) {
      if (!results.contains(e.target) && e.target !== input) results.hidden = true;
    });
    // `/` focuses search, the shortcut every docs site has and readers try.
    document.addEventListener("keydown", function (e) {
      if (e.key === "/" && document.activeElement !== input) {
        e.preventDefault();
        input.focus();
      }
    });
  }

  // ── Highlight the section being read ─────────────────────────────────────
  var tocLinks = $$(".toc a");
  if (tocLinks.length > 0 && "IntersectionObserver" in window) {
    var byId = {};
    tocLinks.forEach(function (a) {
      byId[a.getAttribute("href").slice(1)] = a;
    });
    var seen = [];
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          var id = entry.target.id;
          if (entry.isIntersecting) {
            if (seen.indexOf(id) === -1) seen.push(id);
          } else {
            seen = seen.filter(function (s) {
              return s !== id;
            });
          }
        });
        tocLinks.forEach(function (a) {
          a.classList.remove("is-active");
        });
        if (seen.length > 0 && byId[seen[0]]) byId[seen[0]].classList.add("is-active");
      },
      { rootMargin: "-72px 0px -70% 0px" }
    );
    Object.keys(byId).forEach(function (id) {
      var el = document.getElementById(id);
      if (el) observer.observe(el);
    });
  }
})();
