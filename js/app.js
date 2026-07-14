/**
 * Wedding site app — reads everything from window.WEDDING_CONFIG
 */
(function () {
  "use strict";

  const cfg = window.WEDDING_CONFIG;
  if (!cfg) {
    console.error("Missing WEDDING_CONFIG — check js/config.js");
    return;
  }

  /* ---------- State ---------- */
  let lang = cfg.i18n?.defaultLang || "vi";
  let lightboxIndex = 0;
  let galleryImages = [];
  let wishes = [];
  let cloudWishes = null; /* null = chưa dùng cloud; []|... = cache Firebase */
  let wishFilter = "all"; /* "all" | relationId | "rel:" + label */
  let wallTimer = null;
  let wallObjectUrls = [];
  let wishCloudUnsub = null;
  let wishRevealTimer = null;
  let wishRevealOpen = false;
  /** performance profile: full | balanced | low */
  let perfMode = "full";

  function detectPerfMode() {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return "low";
    }
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4;
    const saveData = !!(navigator.connection && navigator.connection.saveData);
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    if (saveData || mem <= 2 || cores <= 2) return "low";
    if (coarse || mem <= 4 || cores <= 4) return "balanced";
    return "full";
  }

  function applyPerfMode() {
    perfMode = detectPerfMode();
    document.body.classList.toggle("is-low-power", perfMode !== "full");
    document.body.dataset.perf = perfMode;
  }

  /* ---------- Helpers ---------- */
  function t(obj, fallback) {
    if (obj == null) return fallback ?? "";
    if (typeof obj === "string") return obj;
    return obj[lang] ?? obj.vi ?? obj.en ?? fallback ?? "";
  }

  function coupleNames() {
    const { bride, groom, displayOrder, joiner } = cfg.couple;
    const j = ` ${joiner || "&"} `;
    return displayOrder === "groom-bride" ? groom + j + bride : bride + j + groom;
  }

  function monogram() {
    return cfg.hero?.monogram || coupleNames();
  }

  function $(sel, root) {
    return (root || document).querySelector(sel);
  }

  function $$(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }

  function showToast(msg) {
    const el = $("#toast");
    if (!el) return;
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("is-show"));
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => {
      el.classList.remove("is-show");
      setTimeout(() => {
        el.hidden = true;
      }, 300);
    }, 2200);
  }

  function pad(n) {
    return String(n).padStart(2, "0");
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /* Nested path getter: "nav.home" → cfg.labels.nav.home or cfg path */
  function resolveI18nPath(path) {
    const parts = path.split(".");
    /* Prefer labels.* then root cfg */
    const tryRoots = [cfg.labels, cfg];
    for (const root of tryRoots) {
      let cur = root;
      for (const p of parts) {
        if (cur == null) break;
        cur = cur[p];
      }
      if (cur != null) return cur;
    }
    return null;
  }

  /* ---------- Meta / document ---------- */
  function applyMeta() {
    const title = cfg.meta?.title || coupleNames() + " Wedding";
    document.title = title;
    const desc = t(cfg.meta?.description);
    setMeta('meta[name="description"]', "content", desc);
    setMeta('meta[property="og:title"]', "content", title);
    setMeta('meta[property="og:description"]', "content", desc);
    setMeta('meta[property="og:image"]', "content", cfg.meta?.ogImage || "");
    document.documentElement.lang = lang;
  }

  function setMeta(sel, attr, val) {
    const el = $(sel);
    if (el) el.setAttribute(attr, val || "");
  }

  /* ---------- i18n apply ---------- */
  function applyI18n() {
    $$("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      const val = resolveI18nPath(key);
      if (val != null) el.textContent = t(val);
    });

    $$("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      const val = resolveI18nPath(key);
      if (val != null) el.setAttribute("placeholder", t(val));
    });

    /* Nested sections that live on cfg root */
    const map = {
      "hero.tagline": cfg.hero?.tagline,
      "story.title": cfg.story?.title,
      "story.subtitle": cfg.story?.subtitle,
      "gallery.title": cfg.gallery?.title,
      "gallery.subtitle": cfg.gallery?.subtitle,
      "gallery.youtubeTitle": cfg.gallery?.youtubeTitle,
      "guestbook.title": cfg.guestbook?.title,
      "guestbook.subtitle": cfg.guestbook?.subtitle,
      "footer.thankYou": cfg.footer?.thankYou,
      "footer.signature": cfg.footer?.signature,
      "scrollDown": cfg.labels?.scrollDown,
      "countdown.days": cfg.labels?.countdown?.days,
      "countdown.hours": cfg.labels?.countdown?.hours,
      "countdown.minutes": cfg.labels?.countdown?.minutes,
      "countdown.seconds": cfg.labels?.countdown?.seconds,
    };

    $$("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (map[key] != null) el.textContent = t(map[key]);
    });

    $$("[data-i18n-placeholder]").forEach((el) => {
      const key = el.getAttribute("data-i18n-placeholder");
      if (map[key] != null) el.setAttribute("placeholder", t(map[key]));
    });

    /* Bind simple fields */
    $$("[data-bind]").forEach((el) => {
      const key = el.getAttribute("data-bind");
      if (key === "monogram") {
        el.textContent = monogram();
        el.classList.add("couple-names-line");
      }
      if (key === "coupleNames") {
        el.textContent = coupleNames();
        el.classList.add("couple-names-line");
      }
      if (key === "dateDisplay") el.textContent = t(cfg.wedding?.dateDisplay);
      if (key === "timeDisplay") el.textContent = t(cfg.wedding?.timeDisplay);
    });

    applyMeta();
  }

  /* ---------- Hero ---------- */
  function setupHero() {
    const bg = $("#hero-bg");
    const overlay = $("#hero-overlay");
    if (bg && cfg.hero?.backgroundImage) {
      const url = cfg.hero.backgroundImage;
      const img = new Image();
      img.onload = () => {
        bg.style.backgroundImage = `url("${url}")`;
        bg.classList.add("has-image");
      };
      img.onerror = () => {
        /* keep gradient fallback */
      };
      img.src = url;
    }
    if (overlay) {
      const o = cfg.hero?.overlayOpacity ?? 0.45;
      overlay.style.background = `rgba(40, 28, 24, ${o})`;
    }
  }

  /* ---------- Countdown ---------- */
  function setupCountdown() {
    const root = $("#countdown");
    const ended = $("#countdown-ended");
    if (!root) return;

    /* soft float after entrance animation settles */
    setTimeout(() => root.classList.add("soft-float-ready"), 1600);

    const target = new Date(cfg.wedding?.datetime || Date.now()).getTime();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function setFlipUnit(unit, value) {
      const el = root.querySelector(`[data-unit="${unit}"]`);
      if (!el) return;
      const str = pad(value);
      const curr = el.querySelector(".countdown__curr");
      const next = el.querySelector(".countdown__next");
      if (!curr || !next) {
        el.textContent = str;
        return;
      }
      if (el.dataset.val === str) return;
      const prev = el.dataset.val;
      el.dataset.val = str;
      if (!prev || reduce) {
        curr.textContent = str;
        next.textContent = str;
        return;
      }
      next.textContent = str;
      el.classList.remove("is-flip");
      void el.offsetWidth;
      el.classList.add("is-flip");
      clearTimeout(el._flipT);
      el._flipT = setTimeout(() => {
        curr.textContent = str;
        el.classList.remove("is-flip");
      }, 480);
    }

    function tick() {
      const now = Date.now();
      let diff = target - now;

      if (diff <= 0) {
        root.hidden = true;
        if (ended) {
          ended.hidden = false;
          ended.textContent = t(cfg.labels?.countdown?.ended);
        }
        return;
      }

      const days = Math.floor(diff / 86400000);
      diff %= 86400000;
      const hours = Math.floor(diff / 3600000);
      diff %= 3600000;
      const minutes = Math.floor(diff / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);

      setFlipUnit("days", days);
      setFlipUnit("hours", hours);
      setFlipUnit("minutes", minutes);
      setFlipUnit("seconds", seconds);
    }

    tick();
    setInterval(tick, 1000);
  }

  /* ---------- Cursor glow + soft trail ---------- */
  function setupCursorFx() {
    if (perfMode === "low") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const glow = $("#cursor-glow");
    const dot = $("#cursor-dot");
    if (!glow || !dot) return;

    document.body.classList.add("has-cursor-fx");
    let x = window.innerWidth / 2;
    let y = window.innerHeight / 2;
    let gx = x;
    let gy = y;
    let raf = 0;
    const trails = [];
    const MAX_TRAIL = 10;

    function loop() {
      gx += (x - gx) * 0.12;
      gy += (y - gy) * 0.12;
      glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      dot.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      raf = requestAnimationFrame(loop);
    }

    window.addEventListener(
      "pointermove",
      (e) => {
        x = e.clientX;
        y = e.clientY;
        glow.classList.add("is-on");
        dot.classList.add("is-on");

        const t = document.createElement("span");
        t.className = "cursor-trail";
        t.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        document.body.appendChild(t);
        trails.push(t);
        if (trails.length > MAX_TRAIL) {
          const old = trails.shift();
          old?.remove();
        }
        requestAnimationFrame(() => {
          t.style.transition = "opacity 0.45s ease, transform 0.45s ease";
          t.style.opacity = "0";
          t.style.transform = `translate3d(${x}px, ${y}px, 0) scale(0.2)`;
        });
        setTimeout(() => t.remove(), 480);
      },
      { passive: true }
    );

    document.addEventListener(
      "pointerover",
      (e) => {
        const hit = e.target.closest(
          "a, button, .gallery__item, .wish-card, .wall-card, input, textarea, select, label"
        );
        dot.classList.toggle("is-hover", !!hit);
      },
      true
    );

    document.addEventListener("mouseleave", () => {
      glow.classList.remove("is-on");
      dot.classList.remove("is-on");
    });

    loop();
  }

  function enhanceGlassShine() {
    $$(".timeline__card, .wish-card, .gallery__item, .card-panel, .coming-soon__card").forEach(
      (el) => el.classList.add("glass-shine")
    );
    setupCardTilt();
  }

  /* ---------- 3D tilt on cards (desktop) ---------- */
  function setupCardTilt() {
    if (perfMode === "low") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    const maxDeg = 7;
    $$(".timeline__card, .wish-card, .gallery__item, .card-panel").forEach((card) => {
      if (card._tiltBound) return;
      card._tiltBound = true;
      card.classList.add("tilt-card");

      card.addEventListener(
        "pointermove",
        (e) => {
          const r = card.getBoundingClientRect();
          const px = (e.clientX - r.left) / r.width - 0.5;
          const py = (e.clientY - r.top) / r.height - 0.5;
          const rx = (-py * maxDeg * 2).toFixed(2);
          const ry = (px * maxDeg * 2).toFixed(2);
          card.classList.add("is-tilting");
          card.style.transform = `perspective(900px) rotateX(${rx}deg) rotateY(${ry}deg) translateZ(6px) scale(1.02)`;
        },
        { passive: true }
      );

      card.addEventListener(
        "pointerleave",
        () => {
          card.classList.remove("is-tilting");
          card.style.transform = "";
        },
        { passive: true }
      );
    });
  }

  /* ---------- Click ripple ---------- */
  function setupClickRipple() {
    if (perfMode === "low") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    document.addEventListener(
      "pointerdown",
      (e) => {
        if (e.button !== 0) return;
        const host = e.target.closest(
          "button, .btn, a.scroll-hint, .gallery__item, .wish-card, .wall-card, .sticker-btn, .template-swatch, .effect-chip, .frame-chip, .sticker-cat, .intro__enter"
        );
        if (!host) return;

        const r = host.getBoundingClientRect();
        const size = Math.max(r.width, r.height) * 2.2;
        const x = e.clientX - r.left - size / 2;
        const y = e.clientY - r.top - size / 2;

        const style = getComputedStyle(host);
        if (style.position === "static") host.style.position = "relative";
        host.classList.add("ripple-host");

        const ink = document.createElement("span");
        ink.className = "ripple-ink";
        /* dark surfaces use light ripple; light cards use darker ink */
        const isDark =
          host.closest(".hero, .intro, .letter-reveal, .wish-reveal, .header:not(.is-scrolled)") ||
          host.classList.contains("btn--primary");
        if (!isDark) ink.classList.add("is-dark");
        ink.style.width = size + "px";
        ink.style.height = size + "px";
        ink.style.left = x + "px";
        ink.style.top = y + "px";
        host.appendChild(ink);
        setTimeout(() => ink.remove(), 780);
      },
      { passive: true }
    );
  }

  /* ---------- Section scroll fade / blur ---------- */
  function setupSectionMotion() {
    const sections = $$("main > section");
    if (!sections.length) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      sections.forEach((s) => s.classList.add("is-section-in"));
      return;
    }

    /* hero always visible */
    $("#hero")?.classList.add("is-section-in");

    if (!("IntersectionObserver" in window)) {
      sections.forEach((s) => s.classList.add("is-section-in"));
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting && e.intersectionRatio > 0.12) {
            e.target.classList.add("is-section-in");
          }
        });
      },
      { threshold: [0.12, 0.25, 0.4], rootMargin: "0px 0px -8% 0px" }
    );

    sections.forEach((s) => {
      if (s.id !== "hero") io.observe(s);
    });
  }

  /* ---------- Story timeline ---------- */
  function renderStory() {
    const root = $("#story-timeline");
    if (!root) return;
    const items = cfg.story?.milestones || [];
    const cards = items
      .map((m) => {
        const img = m.image
          ? `<div class="timeline__img" data-img-src="${escapeHtml(m.image)}">
               <img class="timeline__media" src="${escapeHtml(m.image)}" alt="" loading="lazy" decoding="async" onerror="const p=this.parentElement;p.classList.add('is-placeholder');this.remove();p.appendChild(document.createTextNode('Photo'));" />
             </div>`
          : "";
        return `
          <article class="timeline__item">
            <span class="timeline__dot" aria-hidden="true"></span>
            <div class="timeline__card">
              <p class="timeline__date">${escapeHtml(t(m.date))}</p>
              <h3 class="timeline__title">${escapeHtml(t(m.title))}</h3>
              <p class="timeline__desc">${escapeHtml(t(m.description))}</p>
              ${img}
            </div>
          </article>`;
      })
      .join("");

    root.innerHTML =
      `<div class="timeline__track" aria-hidden="true"><div class="timeline__progress"></div></div>` +
      cards;

    setupTimelineScroll();
  }

  /**
   * Apple-style timeline: progressive line, IntersectionObserver reveal,
   * parallax images — rAF + transform only for 60fps.
   */
  function setupTimelineScroll() {
    const section = $("#story");
    const root = $("#story-timeline");
    if (!root || !section) return;

    const items = $$(".timeline__item", root);
    const media = $$(".timeline__media", root);
    if (!items.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* Reveal từng mốc tuần tự (không bung hết cùng lúc) */
    if (reduce) {
      items.forEach((el) => el.classList.add("is-in"));
      section.style.setProperty("--tl-progress", "1");
      return;
    }

    const queue = [];
    let queueBusy = false;
    const gapMs = 420;

    function runQueue() {
      if (queueBusy || !queue.length) return;
      queueBusy = true;
      const el = queue.shift();
      el.classList.add("is-in");
      setTimeout(() => {
        queueBusy = false;
        runQueue();
      }, gapMs);
    }

    function enqueueReveal(el) {
      if (el.classList.contains("is-in") || el._tlQueued) return;
      el._tlQueued = true;
      queue.push(el);
      runQueue();
    }

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
          /* sort by document order so milestones appear top → bottom */
          entries
            .filter((e) => e.isIntersecting)
            .sort((a, b) => {
              const ia = items.indexOf(a.target);
              const ib = items.indexOf(b.target);
              return ia - ib;
            })
            .forEach((e) => {
              enqueueReveal(e.target);
              io.unobserve(e.target);
            });
        },
        { threshold: 0.22, rootMargin: "0px 0px -12% 0px" }
      );
      items.forEach((el) => io.observe(el));
    } else {
      items.forEach((el, i) => {
        setTimeout(() => el.classList.add("is-in"), i * gapMs);
      });
    }

    /* Progressive line + parallax — single rAF loop, scroll-driven */
    let ticking = false;

    function clamp(n, a, b) {
      return Math.max(a, Math.min(b, n));
    }

    function updateTimelineFX() {
      ticking = false;
      const first = items[0];
      const last = items[items.length - 1];
      const firstTop = first.getBoundingClientRect().top + window.scrollY;
      const lastMid =
        last.getBoundingClientRect().top +
        window.scrollY +
        last.offsetHeight * 0.35;
      const start = firstTop - window.innerHeight * 0.55;
      const end = lastMid - window.innerHeight * 0.35;
      const range = Math.max(1, end - start);
      const progress = clamp((window.scrollY - start) / range, 0, 1);
      section.style.setProperty("--tl-progress", progress.toFixed(4));

      /* Soft parallax per image (max ~18px) */
      const vh = window.innerHeight || 1;
      media.forEach((img) => {
        const box = img.parentElement;
        if (!box || box.classList.contains("is-placeholder")) return;
        const r = box.getBoundingClientRect();
        if (r.bottom < -40 || r.top > vh + 40) return;
        const mid = r.top + r.height / 2;
        const offset = ((mid - vh / 2) / vh) * -18;
        box.style.setProperty("--tl-parallax", offset.toFixed(2) + "px");
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateTimelineFX);
    }

    /* avoid duplicate listeners when re-rendering (lang switch) */
    if (root._tlBound) {
      window.removeEventListener("scroll", root._tlBound);
      window.removeEventListener("resize", root._tlBound);
    }
    root._tlBound = onScroll;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    updateTimelineFX();
  }

  /* ---------- Gallery ---------- */
  function renderGallery() {
    const root = $("#gallery-grid");
    if (!root) return;
    galleryImages = cfg.gallery?.images || [];

    root.innerHTML = galleryImages
      .map((img, i) => {
        return `
          <button type="button" class="gallery__item reveal" data-index="${i}" style="transition-delay:${(i % 6) * 0.05}s" aria-label="${escapeHtml(img.alt || "Photo")}">
            <img src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt || "")}" loading="lazy"
              onerror="const p=this.parentElement;p.classList.add('is-placeholder');p.textContent='Photo '+(${i}+1);" />
          </button>`;
      })
      .join("");

    root.addEventListener("click", (e) => {
      const item = e.target.closest(".gallery__item");
      if (!item || item.classList.contains("is-placeholder")) return;
      openLightbox(Number(item.dataset.index));
    });

    /* YouTube */
    const videoBox = $("#gallery-video");
    const iframe = $("#youtube-iframe");
    const vid = cfg.gallery?.youtubeVideoId;
    if (videoBox && iframe && vid) {
      videoBox.hidden = false;
      iframe.src = `https://www.youtube.com/embed/${encodeURIComponent(vid)}`;
    }
  }

  function openLightbox(index) {
    const lb = $("#lightbox");
    const img = $("#lightbox-img");
    if (!lb || !img || !galleryImages.length) return;
    lightboxIndex = index;
    const item = galleryImages[lightboxIndex];
    if (!item) return;
    img.src = item.src;
    img.alt = item.alt || "";
    lb.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeLightbox() {
    const lb = $("#lightbox");
    if (!lb) return;
    lb.hidden = true;
    document.body.style.overflow = "";
  }

  function setupLightbox() {
    $("#lightbox-close")?.addEventListener("click", closeLightbox);
    $("#lightbox-prev")?.addEventListener("click", () => {
      lightboxIndex = (lightboxIndex - 1 + galleryImages.length) % galleryImages.length;
      openLightbox(lightboxIndex);
    });
    $("#lightbox-next")?.addEventListener("click", () => {
      lightboxIndex = (lightboxIndex + 1) % galleryImages.length;
      openLightbox(lightboxIndex);
    });
    $("#lightbox")?.addEventListener("click", (e) => {
      if (e.target.id === "lightbox") closeLightbox();
    });
    document.addEventListener("keydown", (e) => {
      if ($("#lightbox")?.hidden) return;
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowLeft") $("#lightbox-prev")?.click();
      if (e.key === "ArrowRight") $("#lightbox-next")?.click();
    });
  }

  /* ---------- Guestbook + card decorator ---------- */
  function useWishCloud() {
    return !!(
      window.WishCloud &&
      window.WishCloud.isReady() &&
      !cfg.guestbook?.localOnly
    );
  }

  function loadWishes() {
    if (useWishCloud() && Array.isArray(cloudWishes)) {
      return cloudWishes.slice();
    }
    if (window.CardEditor?.loadWishes) return window.CardEditor.loadWishes();
    try {
      return JSON.parse(localStorage.getItem("wedding_wishes") || "[]");
    } catch {
      return [];
    }
  }

  function wishImageSrc(w) {
    return w.imageUrl || w.image || "";
  }

  function wishRelationKey(w) {
    if (w.relationId && w.relationId !== "other") return "id:" + w.relationId;
    if (w.relation) return "rel:" + String(w.relation).trim().toLowerCase();
    return "none";
  }

  function wishRelationLabel(w) {
    if (w.relation) return w.relation;
    if (w.relationId) {
      const found = (cfg.guestbook?.relations || []).find((r) => r.id === w.relationId);
      if (found) return t(found.label);
    }
    return lang === "vi" ? "Chưa ghi" : "Unspecified";
  }

  function filteredWishes() {
    const all = loadWishes();
    if (wishFilter === "all") return all.slice().reverse();
    return all
      .filter((w) => wishRelationKey(w) === wishFilter)
      .slice()
      .reverse();
  }

  function buildWishFilters() {
    const sel = $("#wishes-filter-relation");
    const chips = $("#wishes-filter-chips");
    const all = loadWishes();
    const keys = new Map(); /* key -> label */

    (cfg.guestbook?.relations || []).forEach((r) => {
      if (!r.id || r.id === "other") return;
      keys.set("id:" + r.id, t(r.label));
    });
    all.forEach((w) => {
      const k = wishRelationKey(w);
      if (k === "none") {
        keys.set("none", lang === "vi" ? "Chưa ghi" : "Unspecified");
        return;
      }
      if (!keys.has(k)) keys.set(k, wishRelationLabel(w));
    });

    const options = [{ key: "all", label: t(cfg.guestbook?.filterAll) || "All" }];
    keys.forEach((label, key) => options.push({ key, label }));

    if (sel) {
      sel.innerHTML = options
        .map(
          (o) =>
            `<option value="${escapeHtml(o.key)}" ${o.key === wishFilter ? "selected" : ""}>${escapeHtml(o.label)}</option>`
        )
        .join("");
      if (!sel._bound) {
        sel._bound = true;
        sel.addEventListener("change", () => {
          wishFilter = sel.value || "all";
          syncFilterChips();
          renderWishesListOnly();
        });
      }
    }

    if (chips) {
      chips.innerHTML = options
        .map((o) => {
          const active = o.key === wishFilter ? " is-active" : "";
          return `<button type="button" class="wishes-filter__chip${active}" data-filter="${escapeHtml(o.key)}" role="option" aria-selected="${o.key === wishFilter}">${escapeHtml(o.label)}</button>`;
        })
        .join("");
      if (!chips._bound) {
        chips._bound = true;
        chips.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-filter]");
          if (!btn) return;
          wishFilter = btn.getAttribute("data-filter") || "all";
          if (sel) sel.value = wishFilter;
          syncFilterChips();
          renderWishesListOnly();
        });
      }
    }
  }

  function syncFilterChips() {
    const chips = $("#wishes-filter-chips");
    chips?.querySelectorAll("[data-filter]").forEach((btn) => {
      const on = btn.getAttribute("data-filter") === wishFilter;
      btn.classList.toggle("is-active", on);
      btn.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  function renderWishCardHtml(w) {
    const time = new Date(w.at).toLocaleString(lang === "vi" ? "vi-VN" : "en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    const src = wishImageSrc(w);
    const imgOk =
      src &&
      (String(src).startsWith("data:image") ||
        String(src).startsWith("http://") ||
        String(src).startsWith("https://"));
    const wid = escapeHtml(w.id || "");
    if (imgOk) {
      return `
        <article class="wish-card wish-card--image reveal" data-wish-id="${wid}" role="button" tabindex="0">
          <img class="wish-card__img" src="${src}" alt="${escapeHtml(w.name || "Wish")}" loading="lazy" />
          <div class="wish-card__meta">
            <h3 class="wish-card__name">${escapeHtml(w.name || "")}</h3>
            ${w.relation ? `<p class="wish-card__relation">${escapeHtml(w.relation)}</p>` : ""}
            ${w.message ? `<p class="wish-card__msg">${escapeHtml(w.message)}</p>` : ""}
            <p class="wish-card__time">${escapeHtml(time)}</p>
          </div>
        </article>`;
    }
    return `
      <article class="wish-card reveal" data-wish-id="${wid}" role="button" tabindex="0">
        <h3 class="wish-card__name">${escapeHtml(w.name || "")}</h3>
        ${w.relation ? `<p class="wish-card__relation">${escapeHtml(w.relation)}</p>` : ""}
        ${w.message ? `<p class="wish-card__msg">${escapeHtml(w.message)}</p>` : ""}
        <p class="wish-card__time">${escapeHtml(time)}</p>
      </article>`;
  }

  function renderWishesListOnly() {
    const root = $("#wishes-list");
    if (!root) return;
    const list = filteredWishes();
    if (!list.length) {
      const empty =
        wishFilter === "all"
          ? t(cfg.guestbook.emptyText)
          : t(cfg.guestbook.filterEmpty);
      root.innerHTML = `<p class="wishes__empty">${escapeHtml(empty)}</p>`;
      return;
    }
    root.innerHTML = list.map((w) => renderWishCardHtml(w)).join("");
    observeReveal();
    bindWishOpenClicks(root);
    enhanceGlassShine();
  }

  /* ---------- Letter open: shatter → 3D envelope → card slides up ---------- */
  function findWishById(id) {
    if (!id) return null;
    const all = loadWishes();
    return all.find((w) => w.id === id) || null;
  }

  function clearLetterFxLayers() {
    const shards = $("#letter-shards");
    const ribbons = $("#letter-ribbons");
    if (shards) shards.innerHTML = "";
    if (ribbons) ribbons.innerHTML = "";
  }

  /** Heart pieces fly out from a screen point (client coords) */
  function spawnLetterShards(clientX, clientY) {
    const layer = $("#letter-shards");
    const root = $("#wish-reveal");
    if (!layer || !root) return;
    layer.innerHTML = "";
    const r = root.getBoundingClientRect();
    const ox = clientX - r.left;
    const oy = clientY - r.top;
    const n = 12;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.className = "letter-shard";
      s.textContent = "♥";
      s.style.left = ox + "px";
      s.style.top = oy + "px";
      const angle = (Math.PI * 2 * i) / n + Math.random() * 0.45;
      const dist = 48 + Math.random() * 56;
      s.style.setProperty("--dx", Math.cos(angle) * dist + "px");
      s.style.setProperty("--dy", Math.sin(angle) * dist + "px");
      s.style.setProperty("--rot", Math.random() * 360 - 180 + "deg");
      layer.appendChild(s);
      requestAnimationFrame(() => s.classList.add("is-go"));
    }
    window.setTimeout(() => {
      if (layer) layer.innerHTML = "";
    }, 800);
  }

  function spawnLetterRibbons() {
    const layer = $("#letter-ribbons");
    if (!layer) return;
    layer.innerHTML = "";
    const colors = ["#C77D82", "#C9A66B", "#E9CE94", "#5B2A3A", "#E9C7C4"];
    const n = perfMode === "low" ? 12 : 28;
    for (let i = 0; i < n; i++) {
      const r = document.createElement("div");
      r.className = "letter-ribbon";
      r.style.left = Math.random() * 100 + "vw";
      r.style.background = colors[i % colors.length];
      r.style.animationDuration = 2.1 + Math.random() * 1.5 + "s";
      r.style.setProperty("--drift", Math.random() * 140 - 70 + "px");
      r.style.setProperty("--spin", Math.random() * 720 - 360 + "deg");
      layer.appendChild(r);
      requestAnimationFrame(() => r.classList.add("is-go"));
    }
    window.setTimeout(() => {
      if (layer) layer.innerHTML = "";
    }, 4200);
  }

  function setLetterImg(el, src) {
    if (!el) return;
    if (src) {
      el.src = src;
      el.hidden = false;
    } else {
      el.removeAttribute("src");
      el.hidden = true;
    }
  }

  /**
   * Full letter image: size by natural resolution.
   * - Hi-res (≥700px): fit viewport, no soft stretch past ~1×
   * - Old soft cards: barely upscale (≤1.1×) so less blurry
   */
  function setLetterFullImage(src) {
    const el = $("#letter-full-img");
    const full = $("#letter-full");
    if (!el) return;

    const clearSize = () => {
      el.style.width = "";
      el.style.height = "";
      el.style.maxWidth = "";
      el.style.maxHeight = "";
    };

    if (!src) {
      el.removeAttribute("src");
      el.hidden = true;
      clearSize();
      full?.classList.remove("has-image", "is-hires", "is-lores");
      return;
    }

    el.hidden = false;
    full?.classList.add("has-image");

    const applySize = () => {
      const nw = el.naturalWidth || 0;
      const nh = el.naturalHeight || 0;
      if (!nw || !nh) return;

      const maxW = Math.min(window.innerWidth * 0.9, nw >= 900 ? 480 : 400);
      const maxH = Math.min(window.innerHeight * 0.86, 860);
      /* Never upscale soft legacy cards much; hi-res can fill screen */
      const maxUpscale = nw >= 900 ? 1 : nw >= 640 ? 1.05 : 1.08;
      const scale = Math.min(maxW / nw, maxH / nh, maxUpscale);
      const w = Math.max(1, Math.round(nw * scale));

      el.style.width = w + "px";
      el.style.height = "auto";
      el.style.maxWidth = "none";
      el.style.maxHeight = maxH + "px";
      full?.classList.toggle("is-hires", nw >= 640);
      full?.classList.toggle("is-lores", nw > 0 && nw < 640);
    };

    el.onload = applySize;
    if (el.getAttribute("src") === src && el.complete && el.naturalWidth) {
      applySize();
    } else {
      clearSize();
      el.src = src;
    }
  }

  function fillLetterCard(w) {
    const name = w.name || "Khách mời";
    const relation = w.relation || "";
    const message = String(w.message || "").trim() || "💕";
    const src = wishImageSrc(w);

    /* Mini card inside envelope (preview during pull-out) */
    const who = $("#letter-card-who");
    const rel = $("#letter-card-rel");
    const msg = $("#letter-card-msg");
    if (who) who.textContent = name;
    if (rel) {
      rel.textContent = relation;
      rel.hidden = !relation;
    }
    if (msg) msg.textContent = message;
    setLetterImg($("#letter-card-img"), src);

    /* Full readable letter — sized for sharpness */
    const fWho = $("#letter-full-who");
    const fRel = $("#letter-full-rel");
    const fMsg = $("#letter-full-msg");
    if (fWho) fWho.textContent = name ? "— " + name + " —" : "";
    if (fRel) {
      fRel.textContent = relation;
      fRel.hidden = !relation;
    }
    if (fMsg) fMsg.textContent = message;
    setLetterFullImage(src);
  }

  function resetEnvelope() {
    const env = $("#letter-envelope");
    const root = $("#wish-reveal");
    if (env) {
      env.classList.remove("is-open");
      const slot = env.querySelector(".envelope__card-slot");
      if (slot) {
        slot.style.animation = "none";
        void slot.offsetHeight;
        slot.style.animation = "";
      }
    }
    root?.classList.remove("is-ready", "is-reading");
  }

  /** Where #wish-reveal lived before being moved into fullscreen wall */
  let letterRevealHome = null;

  function getWallFsHost() {
    const stage = $("#wishes-wall-stage");
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    if (stage && fsEl === stage) return stage;
    if (stage && stage.classList.contains("is-fs")) return stage;
    return null;
  }

  /**
   * Fullscreen only shows descendants of the fullscreen element.
   * Move letter overlay into the wall stage so open-letter works while wall is FS.
   */
  function mountLetterRevealInWallFs() {
    const root = $("#wish-reveal");
    const host = getWallFsHost();
    if (!root || !host) return;
    if (root.parentElement === host) {
      root.classList.add("letter-reveal--in-fs");
      return;
    }
    letterRevealHome = {
      parent: root.parentElement,
      next: root.nextSibling,
    };
    host.appendChild(root);
    root.classList.add("letter-reveal--in-fs");
  }

  function restoreLetterRevealHome() {
    const root = $("#wish-reveal");
    if (!root) return;
    root.classList.remove("letter-reveal--in-fs");
    if (!letterRevealHome || !letterRevealHome.parent) {
      letterRevealHome = null;
      return;
    }
    const { parent, next } = letterRevealHome;
    try {
      if (next && next.parentNode === parent) parent.insertBefore(root, next);
      else parent.appendChild(root);
    } catch (_) {
      document.body.appendChild(root);
    }
    letterRevealHome = null;
  }

  /**
   * Open letter: shatter → envelope open → card slides out → full letter (envelope gone).
   * @param {object} w wish
   * @param {Element} [originEl] heart/card that was tapped
   */
  function openWishReveal(w, originEl) {
    const root = $("#wish-reveal");
    const env = $("#letter-envelope");
    if (!root || !w) return;

    if (wishRevealTimer) {
      clearTimeout(wishRevealTimer);
      wishRevealTimer = null;
    }

    /* Must live inside fullscreen wall or overlay is invisible */
    mountLetterRevealInWallFs();

    fillLetterCard(w);
    resetEnvelope();
    clearLetterFxLayers();

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    if (originEl && originEl.getBoundingClientRect) {
      const br = originEl.getBoundingClientRect();
      cx = br.left + br.width / 2;
      cy = br.top + br.height / 2;
      originEl.classList.add("is-tapped");
    }

    root.hidden = false;
    document.body.style.overflow = "hidden";
    wishRevealOpen = true;

    requestAnimationFrame(() => {
      root.classList.add("is-open");
      if (!reduce) spawnLetterShards(cx, cy);
    });

    const delayReady = reduce ? 20 : 280;
    const delayOpen = reduce ? 40 : 400;
    /* after flap + card rise (~0.55+0.65s from open) */
    const delayReading = reduce ? 80 : 1450;

    wishRevealTimer = setTimeout(() => {
      if (!wishRevealOpen) return;
      root.classList.add("is-ready");
      wishRevealTimer = setTimeout(() => {
        if (!wishRevealOpen || !env) return;
        env.classList.add("is-open");
        if (!reduce) spawnLetterRibbons();
        wishRevealTimer = setTimeout(() => {
          if (!wishRevealOpen) return;
          /* Card fully out → enlarge letter, hide envelope */
          root.classList.add("is-reading");
        }, delayReading);
      }, delayOpen);
    }, delayReady);
  }

  function closeWishReveal() {
    const root = $("#wish-reveal");
    if (!root) return;
    wishRevealOpen = false;
    if (wishRevealTimer) {
      clearTimeout(wishRevealTimer);
      wishRevealTimer = null;
    }
    resetEnvelope();
    root.classList.remove("is-open", "is-ready", "is-reading");
    if (!getWallFsHost()) document.body.style.overflow = "";
    $$(".wall-heart.is-tapped, .wish-card.is-tapped").forEach((el) =>
      el.classList.remove("is-tapped")
    );
    clearLetterFxLayers();
    setTimeout(() => {
      if (!wishRevealOpen) {
        root.hidden = true;
        restoreLetterRevealHome();
      }
    }, 450);
  }

  function bindWishOpenClicks(root) {
    if (!root || root._wishOpenBound) return;
    root._wishOpenBound = true;
    root.addEventListener("click", (e) => {
      const card = e.target.closest("[data-wish-id]");
      if (!card || !root.contains(card)) return;
      /* wall hearts use bindWallLetterClicks */
      if (card.classList.contains("wall-heart")) return;
      const w = findWishById(card.getAttribute("data-wish-id"));
      if (w) openWishReveal(w, card);
    });
    root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest("[data-wish-id]");
      if (!card || !root.contains(card)) return;
      if (card.classList.contains("wall-heart")) return;
      e.preventDefault();
      const w = findWishById(card.getAttribute("data-wish-id"));
      if (w) openWishReveal(w, card);
    });
  }

  function setupWishReveal() {
    $("#wish-reveal-close")?.addEventListener("click", closeWishReveal);
    $("#wish-reveal")?.addEventListener("click", (e) => {
      if (
        e.target.id === "wish-reveal" ||
        e.target.classList.contains("letter-reveal__backdrop")
      ) {
        closeWishReveal();
      }
    });
    document.addEventListener("keydown", (e) => {
      /* Esc: đóng thư trước, rồi mới thoát fullscreen tường */
      if (e.key === "Escape" && wishRevealOpen) {
        e.preventDefault();
        closeWishReveal();
      }
    });
  }

  function renderWishes() {
    const root = $("#wishes-list");
    if (!root) return;
    if (!cfg.guestbook?.enabled) {
      root.closest("section")?.setAttribute("hidden", "");
      return;
    }
    wishes = loadWishes();

    /* labels */
    const wallTitle = $("#wishes-wall-title");
    const wallSub = $("#wishes-wall-subtitle");
    const filterLbl = $("#wishes-filter-label");
    const galTitle = $("#wishes-gallery-title");
    if (wallTitle) wallTitle.textContent = t(cfg.guestbook.wallTitle);
    if (wallSub) wallSub.textContent = t(cfg.guestbook.wallSubtitle);
    if (filterLbl) filterLbl.textContent = t(cfg.guestbook.filterLabel);
    if (galTitle) galTitle.textContent = t(cfg.guestbook.galleryTitle);

    buildWishFilters();
    renderWishesListOnly();
    renderWishWall();
  }

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function clearWallUrls() {
    wallObjectUrls.forEach((u) => {
      try {
        URL.revokeObjectURL(u);
      } catch (_) {
        /* ignore */
      }
    });
    wallObjectUrls = [];
  }

  /* ---------- Wall letter (Vintage Galaxia — winged hearts) ---------- */
  let wallLetterSig = "";
  let wallLetterFxRaf = 0;
  let wallLetterFxRunning = false;
  let wallFlyRaf = 0;
  let wallFlyRunning = false;
  /** @type {{ el: HTMLElement, x: number, y: number, vx: number, vy: number, rot: number, vr: number, scale: number, phase: number }[]} */
  let wallFlyBodies = [];

  function updateWallLetterLabels() {
    const title = $("#wall-letter-title");
    const hint = $("#wall-letter-hint");
    const wallTitle = $("#wishes-wall-title");
    const wallSub = $("#wishes-wall-subtitle");
    if (title) title.textContent = t(cfg.guestbook.wallCenterTitle) || "Trăm năm hạnh phúc";
    if (hint) hint.textContent = t(cfg.guestbook.wallCenterHint) || "Chạm ♥ để đọc thư";
    if (wallTitle) wallTitle.textContent = t(cfg.guestbook.wallTitle);
    if (wallSub) wallSub.textContent = t(cfg.guestbook.wallSubtitle);
    syncWallFsButton();
  }

  function stopWallLetterFx() {
    wallLetterFxRunning = false;
    if (wallLetterFxRaf) {
      cancelAnimationFrame(wallLetterFxRaf);
      wallLetterFxRaf = 0;
    }
  }

  function stopWallHeartFlight() {
    wallFlyRunning = false;
    if (wallFlyRaf) {
      cancelAnimationFrame(wallFlyRaf);
      wallFlyRaf = 0;
    }
    wallFlyBodies = [];
  }

  function startWallLetterFx(stage) {
    const canvas = $("#wall-letter-fx", stage) || $("#wall-letter-fx");
    if (!canvas || !canvas.getContext) return;
    if (perfMode === "low" || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      stopWallLetterFx();
      const ctx = canvas.getContext("2d");
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = stage.getBoundingClientRect();
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
      canvas.style.width = r.width + "px";
      canvas.style.height = r.height + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, r.width, r.height);
      return;
    }
    if (wallLetterFxRunning) return;
    wallLetterFxRunning = true;

    const ctx = canvas.getContext("2d");
    let w = 0;
    let h = 0;
    let stars = [];
    let hearts = [];

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const r = stage.getBoundingClientRect();
      w = r.width;
      h = r.height;
      canvas.width = Math.max(1, Math.floor(w * dpr));
      canvas.height = Math.max(1, Math.floor(h * dpr));
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const starN = Math.min(90, Math.floor(w * 0.12));
      const heartN = Math.min(28, Math.floor(w * 0.04));
      stars = Array.from({ length: starN }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        s: 0.4 + Math.random() * 1.6,
        sp: 0.15 + Math.random() * 0.55,
        a: 0.25 + Math.random() * 0.7,
        tw: Math.random() * Math.PI * 2,
      }));
      hearts = Array.from({ length: heartN }, () => ({
        x: Math.random() * w,
        y: h + Math.random() * h * 0.5,
        s: 6 + Math.random() * 10,
        sp: 0.25 + Math.random() * 0.55,
        a: 0.2 + Math.random() * 0.45,
        drift: (Math.random() - 0.5) * 0.35,
        rot: Math.random() * Math.PI,
      }));
    }

    function drawHeart(x, y, size, rot, alpha) {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(rot);
      ctx.scale(size / 16, size / 16);
      ctx.beginPath();
      ctx.moveTo(0, 4);
      ctx.bezierCurveTo(0, 0, -8, 0, -8, 5);
      ctx.bezierCurveTo(-8, 10, 0, 14, 0, 18);
      ctx.bezierCurveTo(0, 14, 8, 10, 8, 5);
      ctx.bezierCurveTo(8, 0, 0, 0, 0, 4);
      ctx.fillStyle = `rgba(201, 120, 120, ${alpha})`;
      ctx.fill();
      ctx.restore();
    }

    function tick() {
      if (!wallLetterFxRunning || !stage.isConnected) {
        wallLetterFxRunning = false;
        return;
      }
      if (document.hidden) {
        wallLetterFxRaf = requestAnimationFrame(tick);
        return;
      }
      ctx.clearRect(0, 0, w, h);
      for (const st of stars) {
        st.y += st.sp;
        st.tw += 0.04;
        if (st.y > h + 4) {
          st.y = -4;
          st.x = Math.random() * w;
        }
        const tw = 0.55 + Math.sin(st.tw) * 0.45;
        ctx.beginPath();
        ctx.fillStyle = `rgba(232, 213, 181, ${st.a * tw})`;
        ctx.arc(st.x, st.y, st.s, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const ht of hearts) {
        ht.y -= ht.sp;
        ht.x += ht.drift;
        ht.rot += 0.008;
        if (ht.y < -20) {
          ht.y = h + 10;
          ht.x = Math.random() * w;
        }
        drawHeart(ht.x, ht.y, ht.s, ht.rot, ht.a);
      }
      wallLetterFxRaf = requestAnimationFrame(tick);
    }

    resize();
    if (!stage._wallFxResize) {
      stage._wallFxResize = () => {
        if (wallLetterFxRunning) resize();
      };
      window.addEventListener("resize", stage._wallFxResize, { passive: true });
    }
    wallLetterFxRaf = requestAnimationFrame(tick);
  }

  function wallHeartMarkup(w, i) {
    const wid = escapeHtml(w.id || "");
    const rawName = String(w.name || "Guest");
    const short = escapeHtml(rawName.length > 14 ? rawName.slice(0, 13) + "…" : rawName);
    const label = w.name ? `Thư từ ${escapeHtml(w.name)}` : "Mở lá thư lời chúc";
    /* nhịp vỗ chim thật: ~0.38–0.55s, lệch pha */
    const flap = (0.38 + Math.random() * 0.16).toFixed(2);
    const flapDelay = (-Math.random() * 0.4).toFixed(2);
    return `
      <button type="button" class="wall-heart" data-wish-id="${wid}"
        style="--enter-delay:${(i * 0.07).toFixed(2)}s;--flap:${flap}s;--flap-delay:${flapDelay}s"
        aria-label="${label}">
        <span class="wall-heart__body">
          <span class="wall-heart__wing wall-heart__wing--left" aria-hidden="true"></span>
          <span class="wall-heart__wing wall-heart__wing--right" aria-hidden="true"></span>
          <span class="wall-heart__core">
            <span class="wall-heart__icon" aria-hidden="true">♥</span>
          </span>
          <span class="wall-heart__name">${short}</span>
        </span>
      </button>`;
  }

  function isWallFullscreen() {
    const stage = $("#wishes-wall-stage");
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    return !!(stage && (fsEl === stage || stage.classList.contains("is-fs")));
  }

  function syncWallFsButton() {
    const btn = $("#wall-letter-fs");
    const label = $("#wall-letter-fs-label");
    if (!btn) return;
    const on = isWallFullscreen();
    btn.setAttribute("aria-pressed", on ? "true" : "false");
    btn.classList.toggle("is-active", on);
    const text = on
      ? t(cfg.guestbook.wallFullscreenExit) || "Thu nhỏ"
      : t(cfg.guestbook.wallFullscreen) || "Toàn màn hình";
    if (label) label.textContent = text;
    btn.title = text;
  }

  function exitWallFullscreen() {
    const stage = $("#wishes-wall-stage");
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      const exit = document.exitFullscreen || document.webkitExitFullscreen;
      if (exit) exit.call(document).catch(() => {});
    }
    stage?.classList.remove("is-fs");
    document.body.classList.remove("wall-fs-lock");
    syncWallFsButton();
    /* reflow flight bounds after size change */
    if (stage && wallFlyRunning) {
      window.setTimeout(() => startWallHeartFlight(stage), 80);
    }
  }

  function enterWallFullscreen() {
    const stage = $("#wishes-wall-stage");
    if (!stage) return;
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(stage))
        .then(() => {
          syncWallFsButton();
          window.setTimeout(() => startWallHeartFlight(stage), 120);
        })
        .catch(() => {
          /* iOS / blocked — CSS fallback */
          stage.classList.add("is-fs");
          document.body.classList.add("wall-fs-lock");
          syncWallFsButton();
          window.setTimeout(() => startWallHeartFlight(stage), 80);
        });
    } else {
      stage.classList.add("is-fs");
      document.body.classList.add("wall-fs-lock");
      syncWallFsButton();
      window.setTimeout(() => startWallHeartFlight(stage), 80);
    }
  }

  function setupWallFullscreen() {
    const stage = $("#wishes-wall-stage");
    const btn = $("#wall-letter-fs");
    if (!stage || !btn || btn._wallFsBound) return;
    btn._wallFsBound = true;

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isWallFullscreen()) exitWallFullscreen();
      else enterWallFullscreen();
    });

    const onFsChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        stage.classList.remove("is-fs");
        document.body.classList.remove("wall-fs-lock");
        /* Put letter back on body so fixed overlay still works after FS ends */
        restoreLetterRevealHome();
      }
      syncWallFsButton();
      if (wallFlyRunning) {
        window.setTimeout(() => startWallHeartFlight(stage), 100);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && stage.classList.contains("is-fs") && !document.fullscreenElement) {
        exitWallFullscreen();
      }
    });

    syncWallFsButton();
  }

  function makeFlyBody(el, stageW, stageH, i, total) {
    const pad = 48;
    /* spread seeds so they don't all spawn on one pile */
    const col = total > 1 ? i / Math.max(1, total - 1) : 0.5;
    const y = pad + Math.random() * Math.max(40, stageH - pad * 2);
    const speed = 0.35 + Math.random() * 0.55;
    const ang = Math.random() * Math.PI * 2;
    return {
      el,
      x: pad + col * Math.max(40, stageW - pad * 2) + (Math.random() - 0.5) * 24,
      y,
      vx: Math.cos(ang) * speed,
      vy: Math.sin(ang) * speed,
      rot: (Math.random() - 0.5) * 16,
      vr: (Math.random() - 0.5) * 0.25,
      scale: 0.88 + Math.random() * 0.28,
      phase: Math.random() * Math.PI * 2,
      bob: 0.4 + Math.random() * 0.6,
    };
  }

  function applyFlyTransform(b) {
    b.el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${b.rot.toFixed(2)}deg) scale(${b.scale.toFixed(3)})`;
  }

  function startWallHeartFlight(stage) {
    const host = $("#wall-letter-orbits", stage) || $("#wall-letter-orbits");
    if (!stage || !host) return;

    const reduce =
      perfMode === "low" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const rect = stage.getBoundingClientRect();
    const hearts = Array.from(host.querySelectorAll(".wall-heart:not(.is-leaving)"));

    stopWallHeartFlight();
    wallFlyBodies = hearts.map((el, i) => {
      const b = makeFlyBody(el, rect.width, rect.height, i, hearts.length);
      if (reduce) {
        /* static scatter */
        applyFlyTransform(b);
      }
      return b;
    });

    requestAnimationFrame(() => {
      hearts.forEach((el) => el.classList.add("is-in"));
    });

    if (reduce || !wallFlyBodies.length) return;

    wallFlyRunning = true;
    let last = performance.now();

    function tick(now) {
      if (!wallFlyRunning || !stage.isConnected) {
        wallFlyRunning = false;
        return;
      }
      if (document.hidden) {
        wallFlyRaf = requestAnimationFrame(tick);
        last = now;
        return;
      }

      const dt = Math.min(32, now - last) / 16.67;
      last = now;
      const r = stage.getBoundingClientRect();
      const w = r.width;
      const h = r.height;
      const pad = 36;
      const cx = w * 0.5;
      const cy = h * 0.5;
      /* soft keep-out around center title */
      const keepR = Math.min(w, h) * 0.16;

      wallFlyBodies = wallFlyBodies.filter((b) => b.el.isConnected && !b.el.classList.contains("is-leaving"));

      for (const b of wallFlyBodies) {
        b.phase += 0.03 * dt * b.bob;
        /* gentle wander force */
        b.vx += Math.sin(b.phase * 1.3) * 0.012 * dt;
        b.vy += Math.cos(b.phase * 0.9) * 0.012 * dt;
        /* soft repulsion from title center */
        const dx = b.x - cx;
        const dy = b.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < keepR) {
          const push = ((keepR - dist) / keepR) * 0.08 * dt;
          b.vx += (dx / dist) * push * 8;
          b.vy += (dy / dist) * push * 8;
        }
        /* speed clamp */
        const sp = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1;
        const maxSp = 1.35;
        const minSp = 0.28;
        if (sp > maxSp) {
          b.vx = (b.vx / sp) * maxSp;
          b.vy = (b.vy / sp) * maxSp;
        } else if (sp < minSp) {
          b.vx = (b.vx / sp) * minSp;
          b.vy = (b.vy / sp) * minSp;
        }

        b.x += b.vx * dt * 1.15;
        b.y += b.vy * dt * 1.15;
        b.rot += b.vr * dt;
        b.rot = Math.max(-22, Math.min(22, b.rot + Math.sin(b.phase) * 0.08));

        /* bounce inside stage */
        if (b.x < pad) {
          b.x = pad;
          b.vx = Math.abs(b.vx) * 0.95;
        } else if (b.x > w - pad) {
          b.x = w - pad;
          b.vx = -Math.abs(b.vx) * 0.95;
        }
        if (b.y < pad) {
          b.y = pad;
          b.vy = Math.abs(b.vy) * 0.95;
        } else if (b.y > h - pad) {
          b.y = h - pad;
          b.vy = -Math.abs(b.vy) * 0.95;
        }

        /* face flight direction slightly */
        const face = (Math.atan2(b.vy, b.vx) * 180) / Math.PI;
        const tilt = face * 0.08 + b.rot * 0.4;
        b.el.style.transform = `translate3d(${b.x.toFixed(1)}px, ${b.y.toFixed(1)}px, 0) translate(-50%, -50%) rotate(${tilt.toFixed(2)}deg) scale(${b.scale.toFixed(3)})`;
      }

      wallFlyRaf = requestAnimationFrame(tick);
    }

    wallFlyRaf = requestAnimationFrame(tick);

    if (!stage._wallFlyResize) {
      stage._wallFlyResize = () => {
        if (!wallFlyRunning) return;
        /* clamp after resize */
        const rr = stage.getBoundingClientRect();
        wallFlyBodies.forEach((b) => {
          b.x = Math.min(rr.width - 36, Math.max(36, b.x));
          b.y = Math.min(rr.height - 36, Math.max(36, b.y));
        });
      };
      window.addEventListener("resize", stage._wallFlyResize, { passive: true });
    }
  }

  function renderWallHearts(picks) {
    const host = $("#wall-letter-orbits");
    if (!host) return;
    /* decorative soft rings (no hearts locked to them) */
    const rings = [48, 70, 88]
      .map(
        (size, gi) => `
      <div class="wall-orbit wall-orbit--deco" data-ring="${gi}" aria-hidden="true"
        style="--orbit-size:${size}%;--orbit-dur:${40 + gi * 18}s;--orbit-phase:${(-gi * 7).toFixed(1)}s;--orbit-dir:${gi % 2 ? "reverse" : "normal"}">
        <div class="wall-orbit__path"></div>
        ${Array.from({ length: 4 + gi }, (_, si) => {
          const a = (360 / (4 + gi)) * si;
          return `<span class="wall-orbit__star" style="--a:${a}deg"></span>`;
        }).join("")}
      </div>`
      )
      .join("");

    const hearts = picks.map((w, i) => wallHeartMarkup(w, i)).join("");
    host.innerHTML = rings + `<div class="wall-letter__fly" id="wall-letter-fly">${hearts}</div>`;
  }

  function bindWallLetterClicks(stage) {
    if (!stage || stage._wallLetterBound) return;
    stage._wallLetterBound = true;
    stage.addEventListener("click", (e) => {
      const btn = e.target.closest(".wall-heart[data-wish-id]");
      if (!btn || !stage.contains(btn)) return;
      e.preventDefault();
      const w = findWishById(btn.getAttribute("data-wish-id"));
      if (w) openWishReveal(w, btn);
    });
  }

  /** Replace one flying heart with another wish */
  function liveWallSwap() {
    const stage = $("#wishes-wall-stage");
    const fly = $("#wall-letter-fly") || $("#wall-letter-orbits");
    if (!stage || !fly || document.hidden) return;

    const all = loadWishes();
    if (!all.length) {
      renderWishWall(true);
      return;
    }

    const hearts = Array.from(fly.querySelectorAll(".wall-heart:not(.is-leaving)"));
    if (!hearts.length) {
      renderWishWall(true);
      return;
    }

    const onIds = new Set(hearts.map((el) => el.getAttribute("data-wish-id")));
    let pool = all.filter((w) => w.id && !onIds.has(w.id));
    if (!pool.length) {
      if (all.length <= hearts.length) return;
      pool = all;
    }

    const leave = hearts[Math.floor(Math.random() * hearts.length)];
    const preferred =
      pool.find((w) => w.id !== leave.getAttribute("data-wish-id")) ||
      pool[Math.floor(Math.random() * pool.length)];

    const oldBody = wallFlyBodies.find((b) => b.el === leave);
    leave.classList.add("is-leaving");
    const leaveMs =
      perfMode === "low" || window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 60
        : 500;

    window.setTimeout(() => {
      if (!fly.isConnected) return;
      const host = $("#wall-letter-fly") || fly;
      const wrap = document.createElement("div");
      wrap.innerHTML = wallHeartMarkup(preferred, 0).trim();
      const next = wrap.firstElementChild;
      if (!next) {
        leave.remove();
        return;
      }
      leave.replaceWith(next);
      const rect = stage.getBoundingClientRect();
      const body = makeFlyBody(next, rect.width, rect.height, 0, 1);
      if (oldBody) {
        body.x = oldBody.x;
        body.y = oldBody.y;
      }
      wallFlyBodies = wallFlyBodies.filter((b) => b.el !== leave && b.el.isConnected);
      wallFlyBodies.push(body);
      applyFlyTransform(body);
      requestAnimationFrame(() => next.classList.add("is-in"));
      wallLetterSig = Array.from(host.querySelectorAll(".wall-heart"))
        .map((el) => el.getAttribute("data-wish-id"))
        .join("|");
    }, leaveMs);
  }

  function startWallTimer() {
    const ms = Math.max(5000, cfg.guestbook.wallRotateMs || 7500);
    if (wallTimer) clearInterval(wallTimer);
    wallTimer = setInterval(() => {
      if (document.hidden) return;
      if (!$("#wall-letter-orbits")) {
        clearInterval(wallTimer);
        wallTimer = null;
        return;
      }
      liveWallSwap();
    }, ms);
  }

  /**
   * Vintage Galaxia wall letter — winged hearts fly around; click opens letter.
   * @param {boolean} [forceFull]
   */
  function renderWishWall(forceFull) {
    const stage = $("#wishes-wall-stage");
    const wall = $("#wishes-wall");
    const orbits = $("#wall-letter-orbits");
    const emptyEl = $("#wall-letter-empty");
    const center = stage?.querySelector(".wall-letter__center");
    if (!stage) return;

    updateWallLetterLabels();
    setupWallFullscreen();
    const all = loadWishes();

    if (!all.length) {
      stopWallLetterFx();
      stopWallHeartFlight();
      if (wallTimer) {
        clearInterval(wallTimer);
        wallTimer = null;
      }
      wallLetterSig = "";
      if (orbits) orbits.innerHTML = "";
      if (center) center.hidden = true;
      if (emptyEl) {
        emptyEl.hidden = false;
        emptyEl.textContent = t(cfg.guestbook.wallEmpty);
      }
      wall?.removeAttribute("hidden");
      return;
    }

    if (center) center.hidden = false;
    if (emptyEl) emptyEl.hidden = true;

    const count = Math.min(cfg.guestbook.wallCount || 12, all.length);
    const picks = shuffle(all).slice(0, count);
    const sig = picks.map((w) => w.id).join("|");

    const existing = orbits ? orbits.querySelectorAll(".wall-heart").length : 0;
    if (!forceFull && existing === count && existing > 0 && wallLetterSig) {
      startWallLetterFx(stage);
      if (!wallFlyRunning) startWallHeartFlight(stage);
      startWallTimer();
      bindWallLetterClicks(stage);
      wall?.removeAttribute("hidden");
      return;
    }

    wallLetterSig = sig;
    if (orbits) renderWallHearts(picks);
    else {
      stage.innerHTML = `
        <canvas class="wall-letter__fx" id="wall-letter-fx" aria-hidden="true"></canvas>
        <div class="wall-letter__vignette" aria-hidden="true"></div>
        <div class="wall-letter__center">
          <p class="wall-letter__title" id="wall-letter-title"></p>
          <p class="wall-letter__hint" id="wall-letter-hint"></p>
        </div>
        <div class="wall-letter__orbits" id="wall-letter-orbits"></div>
        <p class="wishes-wall__empty" id="wall-letter-empty" hidden></p>`;
      updateWallLetterLabels();
      renderWallHearts(picks);
    }

    bindWallLetterClicks(stage);
    startWallLetterFx(stage);
    startWallHeartFlight(stage);
    startWallTimer();
    wall?.removeAttribute("hidden");
  }

  function setupGuestbook() {
    if (!cfg.guestbook?.enabled) {
      $("#guestbook")?.setAttribute("hidden", "");
      return;
    }
    if (!window.CardEditor) {
      console.warn("CardEditor missing — check js/card-editor.js");
      return;
    }

    /* Firebase: mọi khách thấy cùng sổ thiệp (realtime) */
    if (window.WishCloud) {
      window.WishCloud.init();
      if (useWishCloud()) {
        if (wishCloudUnsub) wishCloudUnsub();
        wishCloudUnsub = window.WishCloud.subscribe((list) => {
          cloudWishes = list;
          wishes = list;
          renderWishes();
        });
      }
    }

    window.CardEditor.init({
      lang,
      onToast: showToast,
      onSubmit: (wish, meta) => {
        if (meta?.cloud || useWishCloud()) {
          /* Cloud snapshot sẽ refresh list; fallback merge ngay */
          if (Array.isArray(cloudWishes)) {
            const exists = cloudWishes.some((w) => w.id === wish.id);
            if (!exists) {
              cloudWishes = [wish, ...cloudWishes];
            }
          } else {
            cloudWishes = [wish];
          }
          renderWishes();
        } else if (window.CardEditor.saveWish) {
          wishes = window.CardEditor.saveWish(wish);
          renderWishes();
        } else {
          wishes.push(wish);
          localStorage.setItem("wedding_wishes", JSON.stringify(wishes));
          renderWishes();
        }
        $("#wishes-list")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      },
    });
  }

  /* ---------- Music ---------- */
  function setupMusic() {
    const audio = $("#bg-music");
    const btn = $("#music-toggle");
    if (!audio || !btn || !cfg.music?.enabled) return;

    audio.src = cfg.music.src || "";
    audio.loop = !!cfg.music.loop;
    audio.volume = Math.min(1, Math.max(0, cfg.music.volume ?? 0.4));
    btn.hidden = false;

    function setPlaying(on) {
      btn.classList.toggle("is-playing", on);
      btn.setAttribute("aria-label", t(on ? cfg.labels?.pauseMusic : cfg.labels?.playMusic));
    }

    btn.addEventListener("click", async () => {
      if (audio.paused) {
        try {
          await audio.play();
          setPlaying(true);
        } catch {
          showToast(lang === "vi" ? "Không phát được nhạc" : "Can't play music");
        }
      } else {
        audio.pause();
        setPlaying(false);
      }
    });

    /* Autoplay after first user gesture (browser policy) */
    if (cfg.music.autoplay) {
      const tryPlay = async () => {
        try {
          await audio.play();
          setPlaying(true);
        } catch {
          /* wait for click */
        }
        document.removeEventListener("click", tryPlay);
        document.removeEventListener("touchstart", tryPlay);
      };
      document.addEventListener("click", tryPlay, { once: true });
      document.addEventListener("touchstart", tryPlay, { once: true });
      tryPlay();
    }
  }

  /* ---------- Nav / header ---------- */
  function setupNav() {
    const header = $("#header");
    const toggle = $("#nav-toggle");
    const nav = $("#nav");

    function onScroll() {
      header?.classList.toggle("is-scrolled", window.scrollY > 40);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    toggle?.addEventListener("click", () => {
      const open = nav?.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });

    nav?.querySelectorAll("a").forEach((a) => {
      a.addEventListener("click", () => {
        nav.classList.remove("is-open");
        toggle?.setAttribute("aria-expanded", "false");
      });
    });

    /* Active section spy */
    const sections = $$("main section[id]");
    const spy = () => {
      const y = window.scrollY + 100;
      let current = "";
      sections.forEach((s) => {
        if (s.offsetTop <= y) current = s.id;
      });
      nav?.querySelectorAll("a").forEach((a) => {
        a.classList.toggle("is-active", a.getAttribute("href") === "#" + current);
      });
    };
    window.addEventListener("scroll", spy, { passive: true });
    spy();
  }


  /* ---------- Multi-layer particles (petal + sparkle + bokeh) ---------- */
  function setupPetals() {
    const canvas = $("#petals-canvas");
    if (!canvas || !cfg.effects?.petals) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    let w, h, layers, raf;
    let mouseX = 0.5;
    let mouseY = 0.5;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    function makePetal() {
      return {
        kind: "petal",
        x: Math.random() * w,
        y: Math.random() * h - h,
        r: 5 + Math.random() * 8,
        vy: 0.45 + Math.random() * 1.1,
        vx: -0.35 + Math.random() * 0.7,
        rot: Math.random() * Math.PI * 2,
        vr: -0.015 + Math.random() * 0.03,
        alpha: 0.28 + Math.random() * 0.4,
        color: Math.random() > 0.5 ? "210,150,150" : "230,190,170",
        depth: 0.4 + Math.random() * 0.6,
      };
    }

    function makeSparkle() {
      return {
        kind: "sparkle",
        x: Math.random() * w,
        y: Math.random() * h,
        r: 1 + Math.random() * 2.2,
        vy: -0.15 - Math.random() * 0.35,
        vx: -0.2 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2,
        alpha: 0.2 + Math.random() * 0.55,
        depth: 0.8 + Math.random() * 0.4,
      };
    }

    function makeBokeh() {
      return {
        kind: "bokeh",
        x: Math.random() * w,
        y: Math.random() * h,
        r: 12 + Math.random() * 28,
        vy: -0.05 - Math.random() * 0.12,
        vx: -0.08 + Math.random() * 0.16,
        alpha: 0.04 + Math.random() * 0.08,
        depth: 0.15 + Math.random() * 0.25,
      };
    }

    function init() {
      resize();
      let n = cfg.effects.petalCount || 22;
      if (perfMode === "low") n = Math.min(n, 8);
      else if (perfMode === "balanced") n = Math.min(n, 14);

      const bokehN =
        perfMode === "low" ? 0 : Math.max(4, Math.floor(n * (perfMode === "balanced" ? 0.2 : 0.35)));
      const sparkN =
        perfMode === "low" ? Math.floor(n * 0.4) : Math.max(8, Math.floor(n * 0.7));

      layers = [
        ...Array.from({ length: bokehN }, makeBokeh),
        ...Array.from({ length: n }, makePetal),
        ...Array.from({ length: sparkN }, makeSparkle),
      ];
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      const px = (mouseX - 0.5) * 18;
      const py = (mouseY - 0.5) * 12;

      layers.forEach((p) => {
        const parallax = p.depth || 0.5;
        p.y += p.vy * (0.7 + parallax * 0.5);
        p.x += p.vx + Math.sin((p.y || 0) * 0.008 + (p.phase || 0)) * 0.25;

        if (p.kind === "sparkle") {
          p.phase = (p.phase || 0) + 0.04;
          p.alpha = 0.15 + Math.abs(Math.sin(p.phase)) * 0.55;
        }

        if (p.y > h + 40 || p.x < -40 || p.x > w + 40) {
          p.y = p.kind === "sparkle" || p.kind === "bokeh" ? Math.random() * h : -20;
          p.x = Math.random() * w;
        }

        const dx = p.x + px * parallax;
        const dy = p.y + py * parallax * 0.6;

        ctx.save();
        if (p.kind === "bokeh") {
          const g = ctx.createRadialGradient(dx, dy, 0, dx, dy, p.r);
          g.addColorStop(0, `rgba(255,220,200,${p.alpha})`);
          g.addColorStop(1, "rgba(255,200,180,0)");
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(dx, dy, p.r, 0, Math.PI * 2);
          ctx.fill();
        } else if (p.kind === "sparkle") {
          ctx.globalAlpha = p.alpha;
          ctx.fillStyle = "rgba(255,245,230,0.95)";
          ctx.beginPath();
          ctx.arc(dx, dy, p.r, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = "rgba(255,230,200,0.5)";
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(dx - p.r * 2.2, dy);
          ctx.lineTo(dx + p.r * 2.2, dy);
          ctx.moveTo(dx, dy - p.r * 2.2);
          ctx.lineTo(dx, dy + p.r * 2.2);
          ctx.stroke();
        } else {
          p.rot = (p.rot || 0) + (p.vr || 0);
          ctx.translate(dx, dy);
          ctx.rotate(p.rot);
          ctx.beginPath();
          ctx.ellipse(0, 0, p.r, p.r * 0.55, 0, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
          ctx.fill();
        }
        ctx.restore();
      });
      raf = requestAnimationFrame(draw);
    }

    init();
    draw();
    window.addEventListener("resize", resize);
    window.addEventListener(
      "pointermove",
      (e) => {
        mouseX = e.clientX / (window.innerWidth || 1);
        mouseY = e.clientY / (window.innerHeight || 1);
      },
      { passive: true }
    );
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else draw();
    });
  }

  /* ---------- Soft mouse parallax (hero layers) ---------- */
  function setupParallax() {
    const hero = $("#hero");
    if (!hero) return;
    if (perfMode === "low") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (window.matchMedia("(hover: none)").matches) return;

    let mx = 0;
    let my = 0;
    let cx = 0;
    let cy = 0;
    let raf = 0;

    function tick() {
      cx += (mx - cx) * 0.06;
      cy += (my - cy) * 0.06;
      hero.querySelectorAll("[data-depth]").forEach((el) => {
        const d = parseFloat(el.getAttribute("data-depth") || "0.04");
        el.style.transform = `translate3d(${(-cx * d * 40).toFixed(2)}px, ${(-cy * d * 28).toFixed(2)}px, 0)`;
      });
      raf = requestAnimationFrame(tick);
    }

    hero.addEventListener(
      "pointermove",
      (e) => {
        const r = hero.getBoundingClientRect();
        mx = (e.clientX - r.left) / r.width - 0.5;
        my = (e.clientY - r.top) / r.height - 0.5;
      },
      { passive: true }
    );
    hero.addEventListener(
      "pointerleave",
      () => {
        mx = 0;
        my = 0;
      },
      { passive: true }
    );
    tick();
  }

  /* ---------- Scroll reveal ---------- */
  function observeReveal() {
    /* timeline items use setupTimelineScroll — skip them */
    const els = $$(".reveal").filter((el) => !el.classList.contains("timeline__item"));
    const headers = $$(".section__header");

    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
      headers.forEach((el) => el.classList.add("is-in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-visible");
            io.unobserve(e.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    els.forEach((el) => io.observe(el));

    const ho = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add("is-in");
            ho.unobserve(e.target);
          }
        });
      },
      { threshold: 0.2 }
    );
    headers.forEach((el) => ho.observe(el));
  }

  /* ---------- Intro: cuộn thư mở + typewriter ---------- */
  function setupIntro() {
    const intro = $("#intro");
    const scroll = $("#scroll-letter");
    const cfgIntro = cfg.intro || {};

    if (!intro || cfgIntro.enabled === false) {
      intro?.remove();
      document.body.classList.remove("intro-lock", "is-booting");
      requestAnimationFrame(() => document.body.classList.add("is-camera-in"));
      return;
    }

    if (!cfgIntro.everyVisit) {
      try {
        if (sessionStorage.getItem("wedding_intro_seen") === "1") {
          intro.remove();
          document.body.classList.remove("intro-lock", "is-booting");
          requestAnimationFrame(() => document.body.classList.add("is-camera-in"));
          return;
        }
      } catch (_) {
        /* ignore */
      }
    }

    document.body.classList.add("intro-lock");

    const eyebrow = $("#intro-eyebrow");
    const msgEl = $("#intro-message");
    const namesEl = $("#intro-names");
    const dateEl = $("#intro-date");
    const enterBtn = $("#intro-enter");
    const skipBtn = $("#intro-skip");

    const names = coupleNames();
    const monogramText = monogram();
    let message = t(cfgIntro.message) || "Welcome";
    message = message.replace(/\{names\}/g, names);

    if (eyebrow) eyebrow.textContent = t(cfgIntro.eyebrow) || "";
    if (namesEl) {
      namesEl.textContent = monogramText;
      namesEl.classList.add("couple-names-line");
    }
    if (dateEl) dateEl.textContent = t(cfg.wedding?.dateDisplay) || "";
    if (enterBtn) {
      enterBtn.textContent = t(cfgIntro.enterLabel) || "Open";
      enterBtn.hidden = false;
    }
    if (skipBtn) skipBtn.textContent = t(cfgIntro.skipLabel) || "Skip";

    /**
     * Typewriter chars: group into nowrap words so inline-block .char
     * never wraps mid-word. Couple names stay one unbreakable group.
     */
    function appendTypeChar(parent, ch) {
      const span = document.createElement("span");
      span.className = "char" + (ch === " " ? " is-space" : "");
      span.textContent = ch === " " ? "\u00a0" : ch;
      parent.appendChild(span);
    }

    function appendTypeWord(parent, word, extraClass) {
      if (!word) return;
      const wrap = document.createElement("span");
      wrap.className = "char-word" + (extraClass ? " " + extraClass : "");
      Array.from(word).forEach((ch) => appendTypeChar(wrap, ch));
      parent.appendChild(wrap);
    }

    function appendTypeText(parent, text) {
      if (!text) return;
      const tokens = text.split(/(\s+)/);
      tokens.forEach((tok) => {
        if (!tok) return;
        if (/^\s+$/.test(tok)) {
          /* break opportunity between words only */
          appendTypeChar(parent, " ");
          return;
        }
        appendTypeWord(parent, tok);
      });
    }

    if (msgEl) {
      msgEl.innerHTML = "";
      if (names && message.includes(names)) {
        const parts = message.split(names);
        parts.forEach((part, idx) => {
          appendTypeText(msgEl, part);
          if (idx < parts.length - 1) {
            /* full couple names = single nowrap line */
            appendTypeWord(msgEl, names, "char-word--names couple-names-line");
          }
        });
      } else {
        appendTypeText(msgEl, message);
      }
    }

    let closed = false;
    let typeTimer = null;

    function finishIntro() {
      if (closed) return;
      closed = true;
      if (typeTimer) clearTimeout(typeTimer);
      intro.classList.add("is-done");
      document.body.classList.remove("intro-lock", "is-booting");
      /* camera zoom into hero after envelope closes */
      requestAnimationFrame(() => {
        document.body.classList.add("is-camera-in");
      });
      try {
        sessionStorage.setItem("wedding_intro_seen", "1");
      } catch (_) {
        /* ignore */
      }
      setTimeout(() => intro.remove(), 1200);
    }

    function typeChars() {
      const chars = msgEl ? $$(".char", msgEl) : [];
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const speed = reduce ? 0 : Math.max(40, cfgIntro.typeSpeed || 100);
      const afterDelay = reduce ? 0 : Math.max(0, cfgIntro.afterTypeDelay ?? 700);
      let i = 0;

      function afterType() {
        if (closed) return;
        namesEl?.classList.add("is-show");
        setTimeout(() => {
          if (closed) return;
          dateEl?.classList.add("is-show");
        }, reduce ? 0 : 400);
        setTimeout(() => {
          enterBtn?.classList.add("is-show");
          const auto = Number(cfgIntro.autoEnterMs) || 0;
          if (auto > 0) typeTimer = setTimeout(finishIntro, auto);
        }, afterDelay);
      }

      function step() {
        if (closed) return;
        if (i < chars.length) {
          chars[i].classList.add("is-on");
          i += 1;
          if (speed === 0) {
            while (i < chars.length) {
              chars[i].classList.add("is-on");
              i += 1;
            }
            afterType();
            return;
          }
          typeTimer = setTimeout(step, speed);
          return;
        }
        afterType();
      }

      step();
    }

    function openScroll() {
      scroll?.classList.add("is-open");
      /* chờ cuộn mở xong rồi gõ chữ */
      const openMs = window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 80
        : Math.max(1200, cfgIntro.openDuration || 2800);
      typeTimer = setTimeout(typeChars, openMs);
    }

    enterBtn?.addEventListener("click", finishIntro);
    skipBtn?.addEventListener("click", finishIntro);

    /* click vào nền cũng có thể bỏ qua sau khi đã hiện nút */
    intro.addEventListener("click", (e) => {
      if (e.target === intro || e.target.classList.contains("intro__bg")) {
        if (enterBtn?.classList.contains("is-show")) finishIntro();
      }
    });

    const delay = Math.max(0, cfgIntro.openDelay ?? 900);
    setTimeout(openScroll, delay);
  }

  /* ---------- Galaxy + heart particles (pháo hoa) ---------- */
  let galaxyRaf = 0;
  let galaxyRunning = false;

  function heartCurve(t) {
    /* classic parametric heart */
    const x = 16 * Math.pow(Math.sin(t), 3);
    const y = -(
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    );
    return { x, y };
  }

  function setupGalaxyShow() {
    const root = $("#galaxy-show");
    const canvas = $("#galaxy-canvas");
    const btn = $("#wall-fireworks-btn");
    const closeBtn = $("#galaxy-show-close");
    const titleEl = $("#galaxy-show-title");
    const namesEl = $("#galaxy-show-names");
    const labelEl = $("#wall-fireworks-label");
    if (!root || !canvas || !btn) return;

    if (labelEl) labelEl.textContent = t(cfg.guestbook?.wallFireworks) || "Pháo hoa";
    if (titleEl) {
      titleEl.textContent =
        t(cfg.guestbook?.wallFireworksTitle) ||
        t(cfg.guestbook?.wallCenterTitle) ||
        "Trăm năm hạnh phúc";
    }
    if (namesEl) {
      namesEl.textContent = coupleNames();
      namesEl.classList.add("couple-names-line");
    }

    const ctx = canvas.getContext("2d");
    let w = 0;
    let h = 0;
    let particles = [];
    let stars = [];
    let sparks = [];
    let start = 0;
    let phase = "gather"; /* gather | hold | burst */

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function buildStars() {
      const n = perfMode === "low" ? 80 : 160;
      stars = Array.from({ length: n }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        r: 0.4 + Math.random() * 1.6,
        a: 0.25 + Math.random() * 0.7,
        tw: Math.random() * Math.PI * 2,
        sp: 0.01 + Math.random() * 0.03,
      }));
    }

    function buildHeartParticles() {
      const n = perfMode === "low" ? 280 : 520;
      const scale = Math.min(w, h) * 0.028;
      const cx = w * 0.5;
      const cy = h * 0.48;
      particles = [];
      for (let i = 0; i < n; i++) {
        const t = (i / n) * Math.PI * 2;
        const hp = heartCurve(t);
        /* denser fill: jitter inside heart shell */
        const jitter = 0.15 + Math.random() * 0.85;
        const tx = cx + hp.x * scale * jitter + (Math.random() - 0.5) * 6;
        const ty = cy + hp.y * scale * jitter + (Math.random() - 0.5) * 6;
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          tx,
          ty,
          size: 1.2 + Math.random() * 2.4,
          hue: 320 + Math.random() * 40,
          delay: Math.random() * 0.25,
        });
      }
    }

    function spawnFirework(x, y) {
      const colors = ["#ff69b4", "#ff9ec8", "#e9ce94", "#c4a574", "#fff5f0", "#ff4d8d"];
      const count = perfMode === "low" ? 24 : 42;
      for (let i = 0; i < count; i++) {
        const ang = (Math.PI * 2 * i) / count + Math.random() * 0.2;
        const sp = 2 + Math.random() * 5.5;
        sparks.push({
          x,
          y,
          vx: Math.cos(ang) * sp,
          vy: Math.sin(ang) * sp,
          life: 1,
          decay: 0.012 + Math.random() * 0.016,
          color: colors[i % colors.length],
          size: 1.5 + Math.random() * 2,
        });
      }
    }

    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }

    function tick(now) {
      if (!galaxyRunning) return;
      if (!start) start = now;
      const elapsed = (now - start) / 1000;

      /* galaxy backdrop */
      const g = ctx.createRadialGradient(w * 0.5, h * 0.35, 0, w * 0.5, h * 0.5, Math.max(w, h) * 0.75);
      g.addColorStop(0, "#3d2458");
      g.addColorStop(0.35, "#1a1028");
      g.addColorStop(0.7, "#0c0814");
      g.addColorStop(1, "#050308");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      /* nebula washes */
      ctx.save();
      ctx.globalAlpha = 0.35;
      const n1 = ctx.createRadialGradient(w * 0.25, h * 0.3, 0, w * 0.25, h * 0.3, w * 0.35);
      n1.addColorStop(0, "rgba(180,80,140,0.45)");
      n1.addColorStop(1, "transparent");
      ctx.fillStyle = n1;
      ctx.fillRect(0, 0, w, h);
      const n2 = ctx.createRadialGradient(w * 0.75, h * 0.55, 0, w * 0.75, h * 0.55, w * 0.4);
      n2.addColorStop(0, "rgba(90,70,180,0.35)");
      n2.addColorStop(1, "transparent");
      ctx.fillStyle = n2;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();

      /* stars */
      stars.forEach((s) => {
        s.tw += s.sp;
        const a = s.a * (0.55 + Math.sin(s.tw) * 0.45);
        ctx.beginPath();
        ctx.fillStyle = `rgba(255,245,250,${a})`;
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      });

      /* heart gather ~2.2s then hold, occasional fireworks */
      let progress = Math.min(1, Math.max(0, (elapsed - 0.15) / 2.2));
      progress = easeOutCubic(progress);
      if (elapsed > 2.5 && phase === "gather") phase = "hold";
      if (elapsed > 2.8 && phase === "hold") {
        phase = "burst";
        spawnFirework(w * 0.5, h * 0.38);
        spawnFirework(w * 0.28, h * 0.55);
        spawnFirework(w * 0.72, h * 0.52);
      }
      if (phase === "burst" && Math.random() < 0.018) {
        spawnFirework(Math.random() * w * 0.7 + w * 0.15, Math.random() * h * 0.45 + h * 0.15);
      }

      particles.forEach((p) => {
        const local = Math.min(1, Math.max(0, (progress - p.delay) / (1 - p.delay * 0.5)));
        const e = easeOutCubic(local);
        const x = p.x + (p.tx - p.x) * e;
        const y = p.y + (p.ty - p.y) * e;
        /* soft glow */
        ctx.beginPath();
        ctx.fillStyle = `hsla(${p.hue}, 85%, 68%, 0.35)`;
        ctx.arc(x, y, p.size * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.fillStyle = `hsl(${p.hue}, 90%, 72%)`;
        ctx.arc(x, y, p.size, 0, Math.PI * 2);
        ctx.fill();
      });

      /* fireworks sparks */
      sparks = sparks.filter((s) => s.life > 0.02);
      sparks.forEach((s) => {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.06;
        s.vx *= 0.99;
        s.life -= s.decay;
        ctx.beginPath();
        ctx.fillStyle = s.color;
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.arc(s.x, s.y, s.size * s.life, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      });

      /* show caption after heart forms */
      if (elapsed > 1.8) root.classList.add("is-caption");

      galaxyRaf = requestAnimationFrame(tick);
    }

    function openShow() {
      if (galaxyRunning) return;
      /* wall fullscreen would hide body-level overlay */
      if (typeof isWallFullscreen === "function" && isWallFullscreen()) {
        exitWallFullscreen();
      }
      if (titleEl) {
        titleEl.textContent =
          t(cfg.guestbook?.wallFireworksTitle) ||
          t(cfg.guestbook?.wallCenterTitle) ||
          "Trăm năm hạnh phúc";
      }
      if (namesEl) {
        namesEl.textContent = coupleNames();
        namesEl.classList.add("couple-names-line");
      }
      if (labelEl) labelEl.textContent = t(cfg.guestbook?.wallFireworks) || "Pháo hoa";
      resize();
      buildStars();
      buildHeartParticles();
      sparks = [];
      start = 0;
      phase = "gather";
      root.hidden = false;
      root.classList.remove("is-caption");
      document.body.style.overflow = "hidden";
      galaxyRunning = true;
      requestAnimationFrame(() => root.classList.add("is-open"));
      galaxyRaf = requestAnimationFrame(tick);
    }

    function closeShow() {
      galaxyRunning = false;
      if (galaxyRaf) cancelAnimationFrame(galaxyRaf);
      galaxyRaf = 0;
      root.classList.remove("is-open", "is-caption");
      document.body.style.overflow = "";
      setTimeout(() => {
        if (!galaxyRunning) root.hidden = true;
      }, 400);
    }

    btn.addEventListener("click", (e) => {
      e.preventDefault();
      openShow();
    });
    closeBtn?.addEventListener("click", closeShow);
    root.addEventListener("click", (e) => {
      if (e.target === root) closeShow();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && galaxyRunning) {
        e.preventDefault();
        closeShow();
      }
    });
    window.addEventListener(
      "resize",
      () => {
        if (!galaxyRunning) return;
        resize();
        buildStars();
        buildHeartParticles();
      },
      { passive: true }
    );
  }

  /* ---------- Boot ---------- */
  function init() {
    applyPerfMode();
    applyI18n();
    setupHero();
    setupCountdown();
    renderStory();
    renderGallery();
    setupLightbox();
    setupGuestbook();
    setupWishReveal();
    setupGalaxyShow();
    /* local list ngay; cloud sẽ refresh qua subscribe */
    if (!useWishCloud()) {
      wishes = loadWishes();
      renderWishes();
    } else if (cloudWishes === null) {
      /* chờ snapshot; hiện empty tạm */
      cloudWishes = [];
      renderWishes();
    }
    setupMusic();
    setupNav();
    setupPetals();
    setupParallax();
    setupCursorFx();
    setupClickRipple();
    setupSectionMotion();
    observeReveal();
    enhanceGlassShine();
    /* re-apply shine/tilt after dynamic content */
    setTimeout(enhanceGlassShine, 800);
    setTimeout(setupCardTilt, 900);
    setupIntro();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
