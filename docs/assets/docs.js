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

  // ── The recorded terminal ────────────────────────────────────────────────
  //
  // The markup already contains the whole transcript in a `<pre>`. This turns
  // it into a replay; if anything at all goes wrong, the `<pre>` is what the
  // reader keeps, so it is hidden only once the recording has parsed.
  //
  // Every node is built with createElement + textContent. The transcript is
  // real CLI output and contains `<`, `&` and box-drawing characters, so
  // innerHTML is not an option here.

  $$(".term[data-term-src]").forEach(function (fig) {
    var src = fig.getAttribute("data-term-src");
    if (!src || !window.fetch) return;
    fetch(src)
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.json();
      })
      .then(function (rec) {
        if (!rec || rec.schemaVersion !== 1 || !rec.steps || !rec.steps.length) {
          throw new Error("not a recording this player knows");
        }
        startTerm(fig, rec);
      })
      .catch(function () {
        // A blocked fetch, a file:// origin, a schema from the future.
        fig.classList.add("term--static");
      });
  });

  function reducedMotion() {
    return (
      window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
  }

  function startTerm(fig, rec) {
    var screen = $(".term__screen", fig);
    var caption = $(".term__caption", fig);
    var toggle = $(".term__btn--toggle", fig);
    var skip = $(".term__btn--skip", fig);
    var replay = $(".term__btn--replay", fig);
    if (!screen) return;

    var timers = [];
    var frame = null;
    var index = 0;
    var userPaused = false;
    var hoverPaused = false;
    var resume = null;

    function clearPending() {
      timers.forEach(clearTimeout);
      timers = [];
      if (frame) cancelAnimationFrame(frame);
      frame = null;
    }

    function later(fn, ms) {
      timers.push(setTimeout(fn, ms));
    }

    function paused() {
      return userPaused || hoverPaused || document.visibilityState === "hidden";
    }

    function lineNode(line) {
      var el = document.createElement("div");
      el.className = "term__line term__line--" + (line.c || "out");
      el.textContent = line.t;
      return el;
    }

    function stepNode(step) {
      var root = document.createElement("div");
      root.className = "term__step";

      var head = document.createElement("div");
      var prompt = document.createElement("span");
      prompt.className = "term__prompt";
      prompt.textContent = step.cwd + " $ ";
      var cmd = document.createElement("span");
      cmd.className = "term__cmd";
      head.appendChild(prompt);
      head.appendChild(cmd);
      root.appendChild(head);

      var out = document.createElement("div");
      out.className = "term__out";
      root.appendChild(out);

      return { root: root, cmd: cmd, out: out, head: head };
    }

    function emitOutput(step, nodes) {
      step.lines.forEach(function (line) {
        nodes.out.appendChild(lineNode(line));
      });
      if (step.truncated) {
        var more = document.createElement("div");
        more.className = "term__line term__more";
        more.textContent = "… " + step.omitted + " more lines";
        nodes.out.appendChild(more);
      }
      if (step.exit !== 0) {
        var exit = document.createElement("div");
        exit.className = "term__exit term__exit--fail";
        exit.textContent = "exit " + step.exit;
        nodes.out.appendChild(exit);
      }
      screen.scrollTop = screen.scrollHeight;
    }

    // Characters are computed from elapsed time rather than one per frame, so a
    // backgrounded tab catches up on return instead of queueing thousands of
    // timers.
    function typeCommand(nodes, text, msPerChar, whenDone) {
      var caret = document.createElement("span");
      caret.className = "term__caret";
      nodes.head.appendChild(caret);
      var started = null;

      function tick(now) {
        if (paused()) {
          resume = function () {
            started = null;
            frame = requestAnimationFrame(tick);
          };
          frame = null;
          return;
        }
        if (started === null) started = now - nodes.cmd.textContent.length * msPerChar;
        var shown = Math.min(text.length, Math.floor((now - started) / msPerChar));
        nodes.cmd.textContent = text.slice(0, shown);
        screen.scrollTop = screen.scrollHeight;
        if (shown >= text.length) {
          if (caret.parentNode) caret.parentNode.removeChild(caret);
          whenDone();
          return;
        }
        frame = requestAnimationFrame(tick);
      }
      frame = requestAnimationFrame(tick);
    }

    function setCaption(step) {
      if (caption) caption.textContent = step.caption || "";
    }

    function finish() {
      fig.classList.remove("term--playing");
      fig.classList.add("term--done");
      if (toggle) toggle.hidden = true;
      if (skip) skip.hidden = true;
      if (replay) replay.hidden = false;
    }

    function play() {
      if (index >= rec.steps.length) {
        finish();
        return;
      }
      var step = rec.steps[index];
      index += 1;
      setCaption(step);
      var nodes = stepNode(step);
      screen.appendChild(nodes.root);
      screen.scrollTop = screen.scrollHeight;

      typeCommand(nodes, step.command, step.typeMs || 26, function () {
        emitOutput(step, nodes);
        later(function () {
          if (paused()) {
            resume = play;
            return;
          }
          play();
        }, step.holdMs || 1200);
      });
    }

    function renderAll() {
      clearPending();
      screen.textContent = "";
      rec.steps.forEach(function (step) {
        var nodes = stepNode(step);
        nodes.cmd.textContent = step.command;
        screen.appendChild(nodes.root);
        emitOutput(step, nodes);
      });
      setCaption(rec.steps[rec.steps.length - 1]);
      screen.scrollTop = 0;
      finish();
    }

    // The transcript stays in the accessibility tree; it stops taking space.
    fig.classList.add("term--playing");

    if (reducedMotion()) {
      // No controls offered: a reader who asked for less motion is not looking
      // for a button that starts some.
      renderAll();
      if (replay) replay.hidden = true;
      return;
    }

    if (toggle) {
      toggle.hidden = false;
      toggle.addEventListener("click", function () {
        userPaused = !userPaused;
        toggle.textContent = userPaused ? "Resume" : "Pause";
        if (!paused() && resume) {
          var next = resume;
          resume = null;
          next();
        }
      });
    }
    if (skip) {
      skip.hidden = false;
      skip.addEventListener("click", renderAll);
    }
    if (replay) {
      replay.addEventListener("click", function () {
        clearPending();
        screen.textContent = "";
        index = 0;
        userPaused = false;
        resume = null;
        fig.classList.remove("term--done");
        fig.classList.add("term--playing");
        if (toggle) {
          toggle.hidden = false;
          toggle.textContent = "Pause";
        }
        if (skip) skip.hidden = false;
        replay.hidden = true;
        play();
      });
    }

    fig.addEventListener("mouseenter", function () {
      hoverPaused = true;
    });
    fig.addEventListener("mouseleave", function () {
      hoverPaused = false;
      if (!paused() && resume) {
        var next = resume;
        resume = null;
        next();
      }
    });
    document.addEventListener("visibilitychange", function () {
      if (!paused() && resume) {
        var next = resume;
        resume = null;
        next();
      }
    });

    // Nothing moves until the section is on screen, and it never loops.
    if (!window.IntersectionObserver) {
      play();
      return;
    }
    var started = false;
    var io = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!started && entry.isIntersecting) {
            started = true;
            io.disconnect();
            play();
          }
        });
      },
      { threshold: 0.4 }
    );
    io.observe(fig);
  }

})();
