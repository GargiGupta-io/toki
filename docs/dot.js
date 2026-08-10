/* Toki — the page's motion.
 *
 * There is no animation library here, deliberately. The app's own window is
 * forbidden from reaching any remote origin, and it would be a poor advert for
 * that to ship a site that pulls a megabyte of JavaScript off someone else's
 * CDN. Everything below is a few hundred lines of vanilla, springs included.
 *
 * One idea: a soft dot trails your cursor and never replaces it, which is
 * exactly the promise the product makes. Left alone, it does the other half of
 * the demonstration — flying to a control and ringing it. It is born out of
 * the splatter on the logo, so the mark and the pointer are the same ink.
 *
 * The ring's inking, its un-inking on scroll, and the wordmark's build are all
 * pure CSS and live in the stylesheet.
 *
 * Everything degrades to a readable static page: if this file fails to parse,
 * never loads, or the visitor asks for reduced motion, the content is already
 * in the HTML and the CSS has drawn it.
 */

(() => {
  "use strict";

  const reduceMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  const finePointer = window.matchMedia("(pointer: fine)").matches;

  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

  /* ------------------------------------------------------------------ *
   * The marker
   *
   * The whole product in one element. It follows the cursor at a spring's
   * remove and it never becomes the cursor — the real pointer stays visible
   * and stays yours. When you leave it alone it demonstrates the other half
   * of the app: it flies to a control and rings it, the way it would after
   * you asked where something was.
   *
   * Any pointer movement cancels the demonstration immediately. The person
   * moving the mouse always outranks the animation, which is the same rule
   * the app itself follows.
   * ------------------------------------------------------------------ */

  function marker(dot, ring, stage, mark, trail) {
    const targets = Array.from(stage.querySelectorAll("[data-target]"));
    if (!targets.length) return;

    // Where the pointer is born.
    //
    // The ring has a splatter of ink at roughly two o'clock, measured at
    // 72.8% across and 22.7% down its box. Starting the marker there makes it
    // read as a blob that detaches from the stroke and goes off to do the
    // job, rather than a dot that fades in from nowhere — the mark and the
    // pointer are visibly the same ink.
    const SPLAT_X = 0.728;
    const SPLAT_Y = 0.227;

    function birthplace() {
      if (!mark) return { x: window.innerWidth / 2, y: window.innerHeight / 3 };
      const r = mark.getBoundingClientRect();
      return { x: r.left + r.width * SPLAT_X, y: r.top + r.height * SPLAT_Y };
    }

    const spring = birthplace();
    const vel = { x: 0, y: 0 };
    let goal = { ...spring };
    let mode = "demo"; // "demo" | "follow"
    let idleSince = performance.now();
    let step = 0;
    let holdUntil = 0;
    let ringOn = false;
    let running = false;
    let rafId = 0;

    const STIFF = 0.055;
    const DAMP = 0.82;

    function centreOf(el) {
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    // The ring takes the control's own proportions rather than a circle
    // circumscribing it. On a wide pill a circle has to be big enough to
    // contain the width, which then hangs well below the control and reads as
    // pointing at the space underneath it.
    function showRing(el) {
      const r = el.getBoundingClientRect();
      const w = r.width + 18;
      const h = r.height + 14;
      ring.style.width = w + "px";
      ring.style.height = h + "px";
      ring.style.transform = `translate3d(${r.left + r.width / 2 - w / 2}px, ${
        r.top + r.height / 2 - h / 2
      }px, 0)`;
      ring.classList.add("on");
      ringOn = true;
    }

    function hideRing() {
      if (!ringOn) return;
      ring.classList.remove("on");
      ringOn = false;
    }

    function clearCaptions() {
      stage
        .querySelectorAll("[data-caption]")
        .forEach((c) => c.classList.remove("on"));
    }

    /* -- the ink trail --------------------------------------------------
     *
     * A short history of where the marker has been, redrawn from scratch each
     * frame rather than accumulated onto the canvas. Accumulating and fading
     * is the usual trick, but it needs a translucent wash of the page colour
     * every frame, and the page behind this one is a gradient — so the wash
     * leaves a visible rectangle. Redrawing keeps the canvas honestly
     * transparent.
     *
     * The stroke is fattest at the marker and tapers to nothing behind it,
     * which is how a brush actually unloads.
     */
    const ctx = trail ? trail.getContext("2d") : null;
    const history = [];
    const TRAIL_MS = 340;
    let vw = 0;
    let vh = 0;

    function sizeTrail() {
      if (!trail) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      vw = window.innerWidth;
      vh = window.innerHeight;
      trail.width = vw * ratio;
      trail.height = vh * ratio;
      trail.style.width = vw + "px";
      trail.style.height = vh + "px";
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    // The trail is the pointer, so it follows the accent, not the body ink.
    function inkColour() {
      return getComputedStyle(document.documentElement)
        .getPropertyValue("--accent")
        .trim();
    }

    // One palette, so the ink colour is read once rather than watched.
    const stroke = inkColour();

    function drawTrail(now) {
      if (!ctx) return;
      ctx.clearRect(0, 0, vw, vh);
      while (history.length && now - history[0].t > TRAIL_MS) history.shift();
      if (history.length < 2) return;

      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = stroke;
      for (let i = 1; i < history.length; i++) {
        const a = history[i - 1];
        const b = history[i];
        const life = 1 - (now - b.t) / TRAIL_MS;
        if (life <= 0) continue;
        ctx.globalAlpha = life * life * 0.42;
        ctx.lineWidth = 0.5 + life * 8;
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    sizeTrail();
    window.addEventListener("resize", sizeTrail, { passive: true });

    // Only run the demonstration while the stage is actually on screen.
    let visible = true;
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        ([entry]) => {
          visible = entry.isIntersecting;
        },
        { threshold: 0.25 },
      ).observe(stage);
    }

    function advance(now) {
      if (now < holdUntil) return;
      const el = targets[step % targets.length];
      // A target with no box has not been laid out yet. Pointing at 0,0 in
      // that moment would fling the marker into the corner, so wait a frame.
      if (el.getBoundingClientRect().width === 0) return;
      goal = centreOf(el);
      showRing(el);
      clearCaptions();
      const caption = stage.querySelector(
        `[data-caption="${el.dataset.target}"]`,
      );
      if (caption) caption.classList.add("on");
      step++;
      holdUntil = now + 2600;
    }

    function frame(now) {
      if (!running) return;

      if (mode === "demo" && visible) {
        advance(now);
      }

      vel.x += (goal.x - spring.x) * STIFF;
      vel.y += (goal.y - spring.y) * STIFF;
      vel.x *= DAMP;
      vel.y *= DAMP;
      spring.x += vel.x;
      spring.y += vel.y;

      dot.style.transform = `translate3d(${spring.x}px, ${spring.y}px, 0) translate(-50%, -50%)`;

      history.push({ x: spring.x, y: spring.y, t: now });
      drawTrail(now);

      // Hand back to the demonstration once the cursor has been still a while.
      if (mode === "follow" && now - idleSince > 2800) {
        mode = "demo";
        holdUntil = 0;
        dot.classList.remove("chasing");
      }

      rafId = requestAnimationFrame(frame);
    }

    if (finePointer) {
      window.addEventListener(
        "pointermove",
        (e) => {
          if (!running) return;
          mode = "follow";
          idleSince = performance.now();
          goal = { x: e.clientX, y: e.clientY };
          dot.classList.add("chasing");
          hideRing();
          clearCaptions();
        },
        { passive: true },
      );
    }

    // The ring is fixed-position and placed from a viewport rect, so it goes
    // stale the moment the page scrolls or reflows. Re-pointing on the next
    // frame is cheaper than tracking the target continuously.
    const repoint = () => {
      if (mode === "demo") holdUntil = 0;
    };
    window.addEventListener("scroll", repoint, { passive: true });
    window.addEventListener("resize", repoint, { passive: true });

    /* Switching on and off.
     *
     * On: the marker is placed back on the splatter and released from there,
     * so every activation replays the same idea — the pointer is ink that came
     * off the mark. Off: the loop stops rather than idling, the canvas is
     * cleared, and nothing is left running in the background.
     */
    function activate() {
      if (running) return;
      running = true;
      const born = birthplace();
      spring.x = born.x;
      spring.y = born.y;
      vel.x = 0;
      vel.y = 0;
      goal = { ...born };
      mode = "demo";
      step = 0;
      history.length = 0;
      // A beat on the splatter before it sets off, so the eye registers where
      // it came from.
      holdUntil = performance.now() + 650;
      dot.classList.add("live");
      rafId = requestAnimationFrame(frame);
    }

    function deactivate() {
      if (!running) return;
      running = false;
      cancelAnimationFrame(rafId);
      dot.classList.remove("live", "chasing");
      hideRing();
      clearCaptions();
      history.length = 0;
      if (ctx) ctx.clearRect(0, 0, vw, vh);
    }

    return {
      toggle: () => (running ? deactivate() : activate()),
      isOn: () => running,
    };
  }

  /* ------------------------------------------------------------------ *
   * Reveals and tilt
   * ------------------------------------------------------------------ */

  function reveals() {
    const items = document.querySelectorAll("[data-reveal]");
    if (!("IntersectionObserver" in window)) {
      items.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("in");
          io.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    items.forEach((el) => io.observe(el));
  }

  /* Brackets snapping onto a region.
   *
   * The corners are eight background layers whose length is one custom
   * property, so growing that property from zero draws all four brackets at
   * once. Driven through a plain object rather than by naming the variable as
   * an animatable property, because writing it ourselves in onUpdate is
   * unambiguous about units and does not depend on how the library resolves
   * custom properties.
   *
   * Springs, because a bracket that eases to a stop reads as a drawing and one
   * that overshoots slightly reads as a mechanism snapping to a target.
   */
  const SVG_NS = "http://www.w3.org/2000/svg";

  /* Corner brackets, drawn rather than grown.
   *
   * The stylesheet already draws these as background layers, which is what a
   * visitor without JavaScript gets. When the library is available they are
   * replaced with four small SVGs whose strokes draw themselves on — a line
   * travelling around each corner reads as an instrument acquiring a target,
   * where a rectangle scaling up just reads as a box appearing.
   *
   * Each corner is its own 14×14 SVG rather than one stretched overlay,
   * because a single SVG sized to the region would distort the brackets on
   * anything that is not square.
   */
  const CORNERS = [
    ["tl", "M 13 1 L 1 1 L 1 13"],
    ["tr", "M 1 1 L 13 1 L 13 13"],
    ["br", "M 13 1 L 13 13 L 1 13"],
    ["bl", "M 1 1 L 1 13 L 13 13"],
  ];

  function injectBrackets(el) {
    const paths = [];
    CORNERS.forEach(([corner, d]) => {
      const svg = document.createElementNS(SVG_NS, "svg");
      svg.setAttribute("class", "bracket bracket--" + corner);
      svg.setAttribute("viewBox", "0 0 14 14");
      svg.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(SVG_NS, "path");
      path.setAttribute("d", d);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1");
      path.setAttribute("vector-effect", "non-scaling-stroke");
      svg.appendChild(path);
      el.appendChild(svg);
      paths.push(path);
    });
    return paths;
  }

  function annotate(A) {
    const regions = Array.from(document.querySelectorAll(".framed"));
    if (!regions.length) return;

    // Hand the brackets over to SVG only once we know we can animate them.
    document.documentElement.classList.add("svg-brackets");

    const prepared = regions.map((el) => {
      const tag = el.querySelector(".tag");
      const label = tag ? tag.textContent.trim() : "";

      // Wrap the paths and empty them immediately. Deferring this to the
      // moment the region scrolls into view would show four finished brackets
      // that then snap back to nothing before drawing — the flash is worse
      // than no animation at all.
      const drawables = injectBrackets(el).map(
        (p) => A.svg.createDrawable(p)[0],
      );
      A.utils.set(drawables, { draw: "0 0" });

      // Likewise the label: emptied up front so the scramble reveals it
      // rather than rewriting text that has already been read.
      if (tag) tag.textContent = "";

      return { el, tag, label, drawables };
    });

    const play = (r) => {
      A.animate(r.drawables, {
        draw: ["0 0", "0 1"],
        duration: 520,
        delay: A.stagger(70),
        ease: "outQuart",
      });

      if (r.tag && r.label) {
        A.animate(r.tag, {
          innerHTML: A.text.scrambleText({
            text: r.label,
            chars: "AZ#*·01",
            duration: 620,
          }),
          delay: 240,
        });
      }
    };

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          io.unobserve(entry.target);
          const r = prepared.find((x) => x.el === entry.target);
          if (r) play(r);
        });
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.15 },
    );
    prepared.forEach((r) => io.observe(r.el));
  }

  /* Two words closing in on an image, and going back out again.
   *
   * Scroll-linked, so it reverses: scrolling up sends the words back where
   * they came from. Written against the element's own rect rather than through
   * a scroll-observer API, because an earlier version bound to one silently
   * resolved to a range that never fired — leaving a section with no text in
   * it at all. This computes progress from numbers that can be read and
   * checked.
   *
   * From the reference: travel is ±150% of each word's own width, so long
   * words fly further and everything clears the frame at any size; and the
   * easing is quartic-out, GSAP's power4.out, which leaves at speed and spends
   * its time settling.
   *
   * The resting position lives in CSS, so if this never runs the words are
   * simply in place and readable.
   */
  function splitReveal() {
    const row = document.querySelector(".split-row");
    const left = document.getElementById("split-l");
    const right = document.getElementById("split-r");
    if (!row || !left || !right) return;

    const outQuart = (t) => 1 - Math.pow(1 - t, 4);
    let queued = false;

    function apply() {
      queued = false;
      const r = row.getBoundingClientRect();
      const vh = window.innerHeight;

      // 0 when the row's top is at the bottom of the screen; 1 once the row
      // has risen to sit centred. Symmetrical, so scrolling back down the
      // range plays it in reverse.
      const from = vh;
      const to = vh / 2 - r.height / 2;
      const p = clamp((from - r.top) / Math.max(1, from - to), 0, 1);
      const e = outQuart(p);

      const offset = (1 - e) * 150;
      left.style.transform = `translateX(${-offset}%)`;
      right.style.transform = `translateX(${offset}%)`;
      left.style.opacity = right.style.opacity = String(e);
    }

    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(apply);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    apply();
  }

  /* Keyword bubbles.
   *
   * Scatter and drift are both CSS; this only spreads the animation phases so
   * the group never pulses in unison. A fixed irregular sequence rather than
   * random, so the page looks the same on every load.
   */
  function keywords() {
    document.querySelectorAll(".bubble").forEach((el, i) => {
      el.style.animationDelay = (((i * 2.399) % 5) - 2.5).toFixed(2) + "s";
    });
  }

  /* Ink drifting through the slab.
   *
   * A slow field of specks in the slab's accent. Paused whenever the slab is
   * off screen, because a canvas running behind content nobody is looking at
   * is just heat.
   */
  function slabDrift() {
    const canvas = document.querySelector(".slab-ink");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const COUNT = 130;
    let w = 0;
    let h = 0;
    let running = false;
    let rafId = 0;
    const specks = [];

    function size() {
      const r = Math.min(window.devicePixelRatio || 1, 2);
      const box = canvas.getBoundingClientRect();
      w = box.width;
      h = box.height;
      canvas.width = w * r;
      canvas.height = h * r;
      ctx.setTransform(r, 0, 0, r, 0, 0);
    }

    function seed() {
      specks.length = 0;
      for (let i = 0; i < COUNT; i++) {
        specks.push({
          x: Math.random() * w,
          y: Math.random() * h,
          // Bigger and brighter than the first pass, which measured well on a
          // white preview and all but vanished against the slab's near-black.
          r: 1 + Math.random() * 2.2,
          vx: (Math.random() - 0.5) * 0.16,
          vy: -0.05 - Math.random() * 0.14,
          a: 0.45 + Math.random() * 0.55,
        });
      }
    }

    const colour = () =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--accent-on-ink")
        .trim() || "#BF6C63";

    let stroke = colour();

    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = stroke;
      for (const s of specks) {
        s.x += s.vx;
        s.y += s.vy;
        if (s.y < -4) {
          s.y = h + 4;
          s.x = Math.random() * w;
        }
        if (s.x < -4) s.x = w + 4;
        if (s.x > w + 4) s.x = -4;
        ctx.globalAlpha = s.a;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      rafId = requestAnimationFrame(frame);
    }

    size();
    seed();
    window.addEventListener(
      "resize",
      () => {
        size();
        seed();
      },
      { passive: true },
    );

    if ("IntersectionObserver" in window) {
      new IntersectionObserver(
        ([entry]) => {
          if (entry.isIntersecting && !running) {
            running = true;
            stroke = colour();
            rafId = requestAnimationFrame(frame);
          } else if (!entry.isIntersecting && running) {
            running = false;
            cancelAnimationFrame(rafId);
          }
        },
        { threshold: 0 },
      ).observe(canvas);
    } else {
      running = true;
      rafId = requestAnimationFrame(frame);
    }
  }

  /* The sticky bar.
   *
   * Three small jobs: frost its backdrop once the page has moved, open and
   * close the menu below the breakpoint, and mark which section you are in.
   * All three degrade to nothing — without this the bar is still a bar, and
   * its links are ordinary anchors that work.
   */
  function bar(el) {
    const toggle = document.getElementById("bar-toggle");
    const links = document.getElementById("bar-links");

    let queued = false;
    const onScroll = () => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => {
        queued = false;
        el.classList.toggle("stuck", window.scrollY > 8);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    if (toggle && links) {
      const setOpen = (open) => {
        links.classList.toggle("open", open);
        toggle.setAttribute("aria-expanded", String(open));
      };

      toggle.addEventListener("click", () => {
        setOpen(toggle.getAttribute("aria-expanded") !== "true");
      });

      // Following an anchor should close the menu, or the destination is
      // hidden behind the thing you just used to get there.
      links.addEventListener("click", (e) => {
        if (e.target.tagName === "A") setOpen(false);
      });

      window.addEventListener("keydown", (e) => {
        if (e.key === "Escape") setOpen(false);
      });
    }

    // Highlight the section currently occupying the upper part of the screen.
    if (links && "IntersectionObserver" in window) {
      const anchors = new Map();
      links.querySelectorAll("a[href^='#']").forEach((a) => {
        const target = document.getElementById(a.getAttribute("href").slice(1));
        if (target) anchors.set(target, a);
      });

      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const a = anchors.get(entry.target);
            if (!a) return;
            if (entry.isIntersecting) {
              links
                .querySelectorAll("a.current")
                .forEach((x) => x.classList.remove("current"));
              a.classList.add("current");
            }
          });
        },
        { rootMargin: "-56px 0px -72% 0px" },
      );
      anchors.forEach((_, target) => io.observe(target));
    }
  }

  function tilt(panel) {
    const MAX = 5;
    panel.addEventListener(
      "pointermove",
      (e) => {
        const r = panel.getBoundingClientRect();
        const nx = (e.clientX - r.left) / r.width - 0.5;
        const ny = (e.clientY - r.top) / r.height - 0.5;
        panel.style.setProperty("--ry", `${clamp(nx * MAX * 2, -MAX, MAX)}deg`);
        panel.style.setProperty("--rx", `${clamp(-ny * MAX * 2, -MAX, MAX)}deg`);
      },
      { passive: true },
    );
    panel.addEventListener("pointerleave", () => {
      panel.style.setProperty("--ry", "0deg");
      panel.style.setProperty("--rx", "0deg");
    });
  }

  /* ------------------------------------------------------------------ *
   * Start
   * ------------------------------------------------------------------ */

  /** Run one piece of setup so that its failure cannot reach the others. */
  function safely(label, fn) {
    try {
      fn();
    } catch (err) {
      // Deliberately quiet in the console rather than silent: the page still
      // works, but whoever is debugging should be able to see what dropped out.
      if (window.console) console.warn("Toki: " + label + " unavailable —", err);
    }
  }

  function start() {
    document.documentElement.classList.add("js");

    // The bar is navigation, not decoration, so it is wired up before the
    // reduced-motion return — someone who asks for less movement still needs
    // the menu to open.
    const barEl = document.getElementById("bar");
    if (barEl) safely("nav", () => bar(barEl));

    if (reduceMotion) {
      document.querySelectorAll("[data-reveal]").forEach((el) => {
        el.classList.add("in");
      });
      // The pointer never runs here, so the mark is not a switch and must not
      // advertise itself as one. Offering a control that does nothing is worse
      // than offering none.
      const mark = document.getElementById("mark");
      const hint = document.getElementById("mark-hint");
      if (mark) {
        mark.disabled = true;
        mark.removeAttribute("aria-pressed");
        mark.setAttribute("aria-label", "The Toki mark: a hand-drawn ink ring");
      }
      if (hint) hint.remove();
      return;
    }

    safely("reveals", reveals);

    /* Order matters here, and so does the isolation.
     *
     * Anything a visitor can *use* is set up before anything that merely looks
     * good, and every step is wrapped so that one failing cannot take the rest
     * with it. This is not hypothetical: a decorative feature that ran first
     * and unguarded once threw during startup and aborted it before the
     * pointer toggle was ever wired up — leaving the page's only real control
     * dead, with nothing in the console to explain why. */

    const stage = document.getElementById("stage");
    const dot = document.getElementById("marker");
    const ring = document.getElementById("ring");
    const mark = document.getElementById("mark");
    const trail = document.getElementById("trail");
    if (stage && dot && ring) {
      const pointer = marker(dot, ring, stage, mark, trail);

      if (mark && pointer) {
        const hint = document.getElementById("mark-hint");
        mark.addEventListener("click", () => {
          pointer.toggle();
          const on = pointer.isOn();
          document.documentElement.classList.toggle("pointer-on", on);
          mark.setAttribute("aria-pressed", String(on));
          mark.setAttribute(
            "aria-label",
            on ? "Switch the pointer off" : "Switch the pointer on",
          );
          if (hint) {
            hint.textContent = on
              ? "Move your cursor — your real one stays put. Click the mark again to stop."
              : "Click the mark to switch the pointer on";
          }
        });
      }
    }

    const panel = document.querySelector("[data-tilt]");
    if (panel && finePointer) safely("tilt", () => tilt(panel));

    // These need nothing but the DOM, so they must not sit behind the
    // library's availability check.
    safely("split reveal", splitReveal);
    safely("keywords", keywords);
    safely("slab drift", slabDrift);

    // Decoration last, each on its own, so a failure is contained to itself.
    const A = window.anime;
    if (A && A.svg && A.text) {
      safely("annotations", () => annotate(A));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
