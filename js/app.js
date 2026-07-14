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
      if (key === "monogram") el.textContent = monogram();
      if (key === "coupleNames") el.textContent = coupleNames();
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
          host.closest(".hero, .intro, .wish-reveal, .header:not(.is-scrolled)") ||
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

  /* ---------- Wish open: burst + slow typewriter ---------- */
  function findWishById(id) {
    if (!id) return null;
    const all = loadWishes();
    return all.find((w) => w.id === id) || null;
  }

  function spawnWishSparkles() {
    const layer = $("#wish-reveal-sparkles");
    if (!layer) return;
    layer.innerHTML = "";
    const n = 28;
    for (let i = 0; i < n; i++) {
      const s = document.createElement("span");
      s.className = "wish-reveal__spark";
      const x = 10 + Math.random() * 80;
      const y = 15 + Math.random() * 70;
      const sx = (-80 + Math.random() * 160).toFixed(0) + "px";
      const sy = (-120 + Math.random() * 80).toFixed(0) + "px";
      s.style.left = x + "%";
      s.style.top = y + "%";
      s.style.setProperty("--sx", sx);
      s.style.setProperty("--sy", sy);
      s.style.animationDelay = (Math.random() * 0.45).toFixed(2) + "s";
      layer.appendChild(s);
    }
  }

  function openWishReveal(w) {
    const root = $("#wish-reveal");
    if (!root || !w) return;
    if (wishRevealTimer) {
      clearTimeout(wishRevealTimer);
      wishRevealTimer = null;
    }

    const img = $("#wish-reveal-img");
    const msgEl = $("#wish-reveal-message");
    const nameEl = $("#wish-reveal-name");
    const relEl = $("#wish-reveal-relation");
    const src = wishImageSrc(w);

    if (img) {
      if (src) {
        img.src = src;
        img.hidden = false;
      } else {
        img.removeAttribute("src");
        img.hidden = true;
      }
    }

    if (msgEl) msgEl.innerHTML = "";
    if (nameEl) {
      nameEl.textContent = w.name ? "— " + w.name + " —" : "";
      nameEl.classList.remove("is-show");
    }
    if (relEl) {
      relEl.textContent = w.relation || "";
      relEl.classList.remove("is-show");
    }

    root.hidden = false;
    document.body.style.overflow = "hidden";
    wishRevealOpen = true;
    spawnWishSparkles();

    requestAnimationFrame(() => {
      root.classList.add("is-open", "is-burst");
    });

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const message = String(w.message || "").trim();

    function showFooter() {
      nameEl?.classList.add("is-show");
      setTimeout(() => relEl?.classList.add("is-show"), reduce ? 0 : 350);
    }

    function typeMessage() {
      if (!msgEl || !message) {
        showFooter();
        return;
      }
      msgEl.innerHTML = "";
      Array.from(message).forEach((ch) => {
        const span = document.createElement("span");
        span.className = "wchar" + (ch === " " ? " is-space" : "");
        span.textContent = ch === " " ? "\u00a0" : ch;
        msgEl.appendChild(span);
      });
      const chars = $$(".wchar", msgEl);
      if (reduce) {
        chars.forEach((c) => c.classList.add("is-on"));
        showFooter();
        return;
      }
      let i = 0;
      const speed = 95; /* chậm, từng chữ */
      function step() {
        if (!wishRevealOpen) return;
        if (i < chars.length) {
          chars[i].classList.add("is-on");
          i += 1;
          wishRevealTimer = setTimeout(step, speed);
          return;
        }
        wishRevealTimer = setTimeout(showFooter, 400);
      }
      /* chờ flash + card bay vào */
      wishRevealTimer = setTimeout(step, 1100);
    }

    typeMessage();
  }

  function closeWishReveal() {
    const root = $("#wish-reveal");
    if (!root) return;
    wishRevealOpen = false;
    if (wishRevealTimer) {
      clearTimeout(wishRevealTimer);
      wishRevealTimer = null;
    }
    root.classList.remove("is-open", "is-burst");
    document.body.style.overflow = "";
    setTimeout(() => {
      if (!wishRevealOpen) root.hidden = true;
    }, 450);
  }

  function bindWishOpenClicks(root) {
    if (!root || root._wishOpenBound) return;
    root._wishOpenBound = true;
    root.addEventListener("click", (e) => {
      const card = e.target.closest("[data-wish-id]");
      if (!card || !root.contains(card)) return;
      const id = card.getAttribute("data-wish-id");
      const w = findWishById(id);
      if (w) openWishReveal(w);
    });
    root.addEventListener("keydown", (e) => {
      if (e.key !== "Enter" && e.key !== " ") return;
      const card = e.target.closest("[data-wish-id]");
      if (!card || !root.contains(card)) return;
      e.preventDefault();
      const w = findWishById(card.getAttribute("data-wish-id"));
      if (w) openWishReveal(w);
    });
  }

  function setupWishReveal() {
    $("#wish-reveal-close")?.addEventListener("click", closeWishReveal);
    $("#wish-reveal")?.addEventListener("click", (e) => {
      if (e.target.id === "wish-reveal" || e.target.classList.contains("wish-reveal__burst")) {
        closeWishReveal();
      }
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && wishRevealOpen) closeWishReveal();
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

  /* ---------- Wall letter (Vintage Galaxia orbit) ---------- */
  let wallLetterSig = "";
  let wallLetterFxRaf = 0;
  let wallLetterFxRunning = false;

  function updateWallLetterLabels() {
    const title = $("#wall-letter-title");
    const hint = $("#wall-letter-hint");
    const wallTitle = $("#wishes-wall-title");
    const wallSub = $("#wishes-wall-subtitle");
    if (title) title.textContent = t(cfg.guestbook.wallCenterTitle) || "Trăm năm hạnh phúc";
    if (hint) hint.textContent = t(cfg.guestbook.wallCenterHint) || "Chạm ♥ để đọc thư";
    if (wallTitle) wallTitle.textContent = t(cfg.guestbook.wallTitle);
    if (wallSub) wallSub.textContent = t(cfg.guestbook.wallSubtitle);
  }

  function stopWallLetterFx() {
    wallLetterFxRunning = false;
    if (wallLetterFxRaf) {
      cancelAnimationFrame(wallLetterFxRaf);
      wallLetterFxRaf = 0;
    }
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

  /** Distribute wishes onto 2–3 orbital rings */
  function buildOrbitGroups(picks) {
    const n = picks.length;
    if (n <= 4) return [picks];
    if (n <= 8) {
      const mid = Math.ceil(n / 2);
      return [picks.slice(0, mid), picks.slice(mid)];
    }
    const a = Math.ceil(n / 3);
    const b = Math.ceil((n - a) / 2);
    return [picks.slice(0, a), picks.slice(a, a + b), picks.slice(a + b)];
  }

  function wallHeartMarkup(w, angleDeg, orbitDur) {
    const wid = escapeHtml(w.id || "");
    const rawName = String(w.name || "Guest");
    const short = escapeHtml(rawName.length > 14 ? rawName.slice(0, 13) + "…" : rawName);
    const label = w.name ? `Thư từ ${escapeHtml(w.name)}` : "Mở lá thư lời chúc";
    return `
      <button type="button" class="wall-heart" data-wish-id="${wid}"
        style="--a:${angleDeg.toFixed(1)}deg;--orbit-dur:${orbitDur}s"
        aria-label="${label}">
        <span class="wall-heart__pin">
          <span class="wall-heart__face">
            <span class="wall-heart__icon" aria-hidden="true">♥</span>
            <span class="wall-heart__name">${short}</span>
          </span>
        </span>
      </button>`;
  }

  function renderWallOrbits(picks) {
    const host = $("#wall-letter-orbits");
    if (!host) return;
    const groups = buildOrbitGroups(picks);
    const sizes = groups.length === 1 ? [72] : groups.length === 2 ? [52, 78] : [42, 62, 84];
    const durs = groups.length === 1 ? [52] : groups.length === 2 ? [44, 68] : [38, 56, 78];
    const dirs = ["normal", "reverse", "normal"];

    host.innerHTML = groups
      .map((group, gi) => {
        const size = sizes[gi] || 70;
        const dur = durs[gi] || 50;
        const dir = dirs[gi % dirs.length];
        const phase = -(Math.random() * dur).toFixed(1);
        const stars = Array.from({ length: 5 + gi * 2 }, (_, si) => {
          const a = (360 / (5 + gi * 2)) * si + gi * 12;
          return `<span class="wall-orbit__star" style="--a:${a}deg" aria-hidden="true"></span>`;
        }).join("");
        const hearts = group
          .map((w, i) => {
            const a = (360 / group.length) * i + gi * 18;
            return wallHeartMarkup(w, a, dur);
          })
          .join("");
        return `
          <div class="wall-orbit" data-ring="${gi}" data-dir="${dir}"
            style="--orbit-size:${size}%;--orbit-dur:${dur}s;--orbit-phase:${phase}s;--orbit-dir:${dir}">
            <div class="wall-orbit__path" aria-hidden="true"></div>
            ${stars}
            ${hearts}
          </div>`;
      })
      .join("");

    requestAnimationFrame(() => {
      host.querySelectorAll(".wall-heart").forEach((el, i) => {
        el.style.setProperty("--enter-delay", `${(i * 0.06).toFixed(2)}s`);
        el.classList.add("is-in");
      });
    });
  }

  function bindWallLetterClicks(stage) {
    if (!stage || stage._wallLetterBound) return;
    stage._wallLetterBound = true;
    stage.addEventListener("click", (e) => {
      const btn = e.target.closest(".wall-heart[data-wish-id]");
      if (!btn || !stage.contains(btn)) return;
      e.preventDefault();
      btn.classList.add("is-pulse");
      window.setTimeout(() => btn.classList.remove("is-pulse"), 500);
      const w = findWishById(btn.getAttribute("data-wish-id"));
      if (w) openWishReveal(w);
    });
  }

  /** Replace one orbit heart with another wish (living sky) */
  function liveWallSwap() {
    const stage = $("#wishes-wall-stage");
    const host = $("#wall-letter-orbits");
    if (!stage || !host || document.hidden) return;

    const all = loadWishes();
    if (!all.length) {
      renderWishWall(true);
      return;
    }

    const hearts = Array.from(host.querySelectorAll(".wall-heart:not(.is-leaving)"));
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

    const orbit = leave.closest(".wall-orbit");
    const angle = leave.style.getPropertyValue("--a") || "0deg";
    const dur =
      parseFloat(orbit?.style.getPropertyValue("--orbit-dur")) ||
      parseFloat(leave.style.getPropertyValue("--orbit-dur")) ||
      50;

    leave.classList.add("is-leaving");
    const leaveMs =
      perfMode === "low" || window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? 60
        : 550;

    window.setTimeout(() => {
      if (!host.isConnected) return;
      const wrap = document.createElement("div");
      wrap.innerHTML = wallHeartMarkup(
        preferred,
        parseFloat(angle) || 0,
        dur
      ).trim();
      const next = wrap.firstElementChild;
      if (!next || !orbit) {
        leave.remove();
        return;
      }
      leave.replaceWith(next);
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
   * Vintage Galaxia wall letter — hearts on orbit open wish letters.
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
    const all = loadWishes();

    if (!all.length) {
      stopWallLetterFx();
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

    /* Keep orbit if same set size and already drawn (cloud re-renders) */
    const existing = orbits ? orbits.querySelectorAll(".wall-heart").length : 0;
    if (!forceFull && existing === count && existing > 0 && wallLetterSig) {
      startWallLetterFx(stage);
      startWallTimer();
      bindWallLetterClicks(stage);
      wall?.removeAttribute("hidden");
      return;
    }

    wallLetterSig = sig;
    if (orbits) renderWallOrbits(picks);
    else {
      /* fallback shell if markup missing */
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
      renderWallOrbits(picks);
    }

    bindWallLetterClicks(stage);
    startWallLetterFx(stage);
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
    if (namesEl) namesEl.textContent = monogramText;
    if (dateEl) dateEl.textContent = t(cfg.wedding?.dateDisplay) || "";
    if (enterBtn) {
      enterBtn.textContent = t(cfgIntro.enterLabel) || "Open";
      enterBtn.hidden = false;
    }
    if (skipBtn) skipBtn.textContent = t(cfgIntro.skipLabel) || "Skip";

    /* Build typewriter chars */
    if (msgEl) {
      msgEl.innerHTML = "";
      Array.from(message).forEach((ch) => {
        const span = document.createElement("span");
        span.className = "char" + (ch === " " ? " is-space" : "");
        span.textContent = ch === " " ? "\u00a0" : ch;
        msgEl.appendChild(span);
      });
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
