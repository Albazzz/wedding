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
      "gallery.title": cfg.gallery?.title,
      "gallery.subtitle": cfg.gallery?.subtitle,
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
    const photo = $("#hero-photo");
    const overlay = $("#hero-overlay");
    if (bg && cfg.hero?.backgroundImage) {
      const url = cfg.hero.backgroundImage;
      /* hero.jpg cắt 8% mép trên; focusY hạ khung dọc (vd 5% = nudge xuống) */
      const cacheVer = "v=cropTop8";
      const withVer = (u) => u + (u.includes("?") ? "&" : "?") + cacheVer;
      const fyRaw = String(cfg.hero?.focusY ?? "0%").trim();
      const focusY =
        !fyRaw || fyRaw === "0" || fyRaw === "0%" || fyRaw === "top"
          ? "top"
          : fyRaw.endsWith("%")
            ? fyRaw
            : `${fyRaw}%`;
      const pos = focusY === "top" ? "center top" : `center ${focusY}`;

      if (photo) {
        photo.style.objectPosition = pos;
        photo.style.transform = "";
      }
      if (bg) bg.style.backgroundPosition = pos;

      const reveal = () => {
        if (photo) {
          photo.src = withVer(url);
          photo.style.objectPosition = pos;
        } else {
          bg.style.backgroundImage = `url("${withVer(url)}")`;
          bg.style.backgroundSize = "cover";
          bg.style.backgroundPosition = pos;
        }
        bg.classList.add("has-image");
      };

      const probe = new Image();
      probe.onload = reveal;
      probe.onerror = () => {
        /* keep gradient fallback */
      };
      probe.src = withVer(url);
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

  /* ---------- Gallery (scroll reveal kiểu Love Story) ---------- */
  function renderGallery() {
    const root = $("#gallery-grid");
    if (!root) return;
    galleryImages = cfg.gallery?.images || [];

    root.innerHTML = galleryImages
      .map((img, i) => {
        return `
          <button type="button" class="gallery__item glass-shine" data-index="${i}" aria-label="${escapeHtml(img.alt || "Photo")}">
            <span class="gallery__media">
              <img class="gallery__photo" src="${escapeHtml(img.src)}" alt="${escapeHtml(img.alt || "")}" loading="lazy" decoding="async"
                onerror="const p=this.closest('.gallery__item');if(p){p.classList.add('is-placeholder');p.textContent='Photo '+(${i}+1);}" />
            </span>
          </button>`;
      })
      .join("");

    if (!root._galleryClickBound) {
      root._galleryClickBound = true;
      root.addEventListener("click", (e) => {
        const item = e.target.closest(".gallery__item");
        if (!item || item.classList.contains("is-placeholder")) return;
        openLightbox(Number(item.dataset.index));
      });
    }

    setupGalleryScroll();
  }

  /**
   * Gallery FX (từ Love Story): reveal tuần tự + soft parallax khi scroll.
   */
  function setupGalleryScroll() {
    const section = $("#gallery");
    const root = $("#gallery-grid");
    if (!root || !section) return;

    const items = $$(".gallery__item", root);
    const media = $$(".gallery__photo", root);
    if (!items.length) return;

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      items.forEach((el) => el.classList.add("is-in"));
      return;
    }

    const queue = [];
    let queueBusy = false;
    const gapMs = 280;

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
      if (el.classList.contains("is-in") || el._galQueued) return;
      el._galQueued = true;
      queue.push(el);
      runQueue();
    }

    if (root._galIo) {
      try {
        root._galIo.disconnect();
      } catch (_) {
        /* ignore */
      }
    }

    if ("IntersectionObserver" in window) {
      const io = new IntersectionObserver(
        (entries) => {
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
        { threshold: 0.18, rootMargin: "0px 0px -10% 0px" }
      );
      root._galIo = io;
      items.forEach((el) => {
        el._galQueued = false;
        el.classList.remove("is-in");
        io.observe(el);
      });
    } else {
      items.forEach((el, i) => {
        setTimeout(() => el.classList.add("is-in"), i * gapMs);
      });
    }

    let ticking = false;
    function updateGalleryFX() {
      ticking = false;
      const vh = window.innerHeight || 1;
      media.forEach((img) => {
        const box = img.parentElement;
        if (!box) return;
        const item = box.closest(".gallery__item");
        if (item && item.classList.contains("is-placeholder")) return;
        const r = box.getBoundingClientRect();
        if (r.bottom < -40 || r.top > vh + 40) return;
        const mid = r.top + r.height / 2;
        const offset = ((mid - vh / 2) / vh) * -14;
        box.style.setProperty("--gal-parallax", offset.toFixed(2) + "px");
      });
    }

    function onScroll() {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(updateGalleryFX);
    }

    if (root._galBound) {
      window.removeEventListener("scroll", root._galBound);
      window.removeEventListener("resize", root._galBound);
    }
    root._galBound = onScroll;
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    updateGalleryFX();
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
    if (!cfg.guestbook?.enabled) {
      $("#guestbook")?.setAttribute("hidden", "");
      return;
    }
    wishes = loadWishes();

    /* labels */
    const wallTitle = $("#wishes-wall-title");
    const wallSub = $("#wishes-wall-subtitle");
    if (wallTitle) wallTitle.textContent = t(cfg.guestbook.wallTitle);
    if (wallSub) {
      wallSub.textContent = isPhoneNoFsApi()
        ? t(cfg.guestbook.wallSubtitlePhone) || t(cfg.guestbook.wallSubtitle)
        : t(cfg.guestbook.wallSubtitle);
    }

    /* Gallery list removed — only wall letter + cloud/local data */
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
    if (wallSub) {
      wallSub.textContent = isPhoneNoFsApi()
        ? t(cfg.guestbook.wallSubtitlePhone) || t(cfg.guestbook.wallSubtitle)
        : t(cfg.guestbook.wallSubtitle);
    }
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

  /**
   * Always show at least minWall hearts.
   * Real wishes are clickable; if count < min, pad with decorative fillers (no click).
   */
  function pickWallHearts(all) {
    const maxWall = cfg.guestbook.wallCount || 12;
    const minWall = Math.max(1, Number(cfg.guestbook.wallMinHearts) || 5);
    const real = shuffle(all).slice(0, maxWall);
    if (real.length >= minWall) return real;
    const need = minWall - real.length;
    const fillers = Array.from({ length: need }, (_, i) => ({
      id: "fill_wall_" + i,
      name: "",
      relation: "",
      message: "",
      isDemo: true,
    }));
    return real.concat(fillers);
  }

  function wallHeartMarkup(w, i) {
    const wid = escapeHtml(w.id || "");
    const isDemo = !!w.isDemo;
    const rawName = String(w.name || "").trim();
    const short = rawName
      ? escapeHtml(rawName.length > 14 ? rawName.slice(0, 13) + "…" : rawName)
      : "";
    const label = isDemo
      ? ""
      : rawName
        ? `Thư từ ${escapeHtml(rawName)}`
        : "Mở lá thư lời chúc";
    /* nhịp vỗ chim thật: ~0.38–0.55s, lệch pha */
    const flap = (0.38 + Math.random() * 0.16).toFixed(2);
    const flapDelay = (-Math.random() * 0.4).toFixed(2);
    const role = isDemo
      ? ' role="presentation" aria-hidden="true" tabindex="-1"'
      : ` aria-label="${escapeHtml(label)}"`;
    return `
      <button type="button" class="wall-heart${isDemo ? " wall-heart--demo" : ""}" data-wish-id="${wid}"
        data-demo="${isDemo ? "1" : "0"}"
        style="--enter-delay:0s;--flap:${flap}s;--flap-delay:${flapDelay}s"${role}>
        <span class="wall-heart__body">
          <span class="wall-heart__wing wall-heart__wing--left" aria-hidden="true"></span>
          <span class="wall-heart__wing wall-heart__wing--right" aria-hidden="true"></span>
          <span class="wall-heart__core">
            <span class="wall-heart__icon" aria-hidden="true">♥</span>
          </span>
          ${short ? `<span class="wall-heart__name">${short}</span>` : ""}
        </span>
      </button>`;
  }

  function isWallFullscreen() {
    const stage = $("#wishes-wall-stage");
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
    return !!(stage && (fsEl === stage || stage.classList.contains("is-fs")));
  }

  /**
   * Phone / small touch devices: Fullscreen API often fails (iOS Safari…).
   * On these devices we hide the FS button and use landscape as “fullscreen”.
   */
  function isPhoneNoFsApi() {
    const touch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
    if (!touch) return false;
    const shortEdge = Math.min(
      window.screen?.width || window.innerWidth,
      window.screen?.height || window.innerHeight
    );
    /* phones + small phablets; large tablets keep the button */
    return shortEdge <= 600;
  }

  function isLandscapeOrientation() {
    return window.matchMedia("(orientation: landscape)").matches;
  }

  function syncWallFsButton() {
    const btn = $("#wall-letter-fs");
    const label = $("#wall-letter-fs-label");
    if (!btn) return;
    const phone = isPhoneNoFsApi();
    btn.hidden = phone;
    btn.setAttribute("aria-hidden", phone ? "true" : "false");
    btn.classList.toggle("is-phone-hidden", phone);
    if (phone) return;

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
    stage?.classList.remove("is-fs", "is-fs-phone-landscape");
    document.body.classList.remove("wall-fs-lock");
    restoreLetterRevealHome();
    syncWallFsButton();
    /* reflow flight bounds after size change */
    if (stage && wallFlyRunning) {
      window.setTimeout(() => startWallHeartFlight(stage), 80);
    }
  }

  /** CSS-only fullscreen (no Fullscreen API) — used on phones in landscape */
  function enterWallCssFullscreen(fromPhoneLandscape) {
    const stage = $("#wishes-wall-stage");
    if (!stage) return;
    stage.classList.add("is-fs");
    if (fromPhoneLandscape) stage.classList.add("is-fs-phone-landscape");
    document.body.classList.add("wall-fs-lock");
    mountLetterRevealInWallFs();
    syncWallFsButton();
    window.setTimeout(() => startWallHeartFlight(stage), 100);
  }

  function enterWallFullscreen() {
    const stage = $("#wishes-wall-stage");
    if (!stage) return;
    /* Phones: never call Fullscreen API — landscape handles it */
    if (isPhoneNoFsApi()) {
      enterWallCssFullscreen(true);
      return;
    }
    const req = stage.requestFullscreen || stage.webkitRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(stage))
        .then(() => {
          mountLetterRevealInWallFs();
          syncWallFsButton();
          window.setTimeout(() => startWallHeartFlight(stage), 120);
        })
        .catch(() => {
          /* blocked — CSS fallback */
          enterWallCssFullscreen(false);
        });
    } else {
      enterWallCssFullscreen(false);
    }
  }

  /**
   * Phone: portrait → normal wall; landscape → CSS fullscreen.
   * Desktop/tablet: button + Fullscreen API unchanged.
   */
  function syncPhoneLandscapeFullscreen() {
    const stage = $("#wishes-wall-stage");
    if (!stage) return;

    if (!isPhoneNoFsApi()) {
      stage.classList.remove("is-fs-phone-landscape");
      /* leave desktop FS state alone */
      syncWallFsButton();
      return;
    }

    const wantFs = isLandscapeOrientation();
    const isPhoneFs = stage.classList.contains("is-fs-phone-landscape");

    if (wantFs && !isPhoneFs) {
      /* exit any stuck native FS first */
      if (document.fullscreenElement || document.webkitFullscreenElement) {
        const exit = document.exitFullscreen || document.webkitExitFullscreen;
        if (exit) exit.call(document).catch(() => {});
      }
      enterWallCssFullscreen(true);
    } else if (!wantFs && isPhoneFs) {
      stage.classList.remove("is-fs", "is-fs-phone-landscape");
      document.body.classList.remove("wall-fs-lock");
      restoreLetterRevealHome();
      syncWallFsButton();
      if (wallFlyRunning) {
        window.setTimeout(() => startWallHeartFlight(stage), 100);
      }
    } else {
      syncWallFsButton();
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
      /* Phones use rotate-to-landscape instead of this button */
      if (isPhoneNoFsApi()) {
        syncPhoneLandscapeFullscreen();
        return;
      }
      if (isWallFullscreen()) exitWallFullscreen();
      else enterWallFullscreen();
    });

    const onFsChange = () => {
      if (!document.fullscreenElement && !document.webkitFullscreenElement) {
        /* Don't strip phone-landscape CSS FS when native FS ends */
        if (!stage.classList.contains("is-fs-phone-landscape")) {
          stage.classList.remove("is-fs");
          document.body.classList.remove("wall-fs-lock");
          restoreLetterRevealHome();
        }
      } else {
        mountLetterRevealInWallFs();
      }
      syncWallFsButton();
      if (wallFlyRunning) {
        window.setTimeout(() => startWallHeartFlight(stage), 100);
      }
    };
    document.addEventListener("fullscreenchange", onFsChange);
    document.addEventListener("webkitfullscreenchange", onFsChange);

    document.addEventListener("keydown", (e) => {
      if (
        e.key === "Escape" &&
        stage.classList.contains("is-fs") &&
        !document.fullscreenElement &&
        !stage.classList.contains("is-fs-phone-landscape")
      ) {
        exitWallFullscreen();
      }
    });

    if (!stage._phoneOrientBound) {
      stage._phoneOrientBound = true;
      const onOrient = () => {
        window.setTimeout(syncPhoneLandscapeFullscreen, 80);
      };
      window.addEventListener("orientationchange", onOrient);
      window.addEventListener("resize", onOrient, { passive: true });
      try {
        window.matchMedia("(orientation: landscape)").addEventListener("change", onOrient);
      } catch (_) {
        /* older browsers */
      }
    }

    syncWallFsButton();
    syncPhoneLandscapeFullscreen();
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
    const host =
      $("#wall-letter-fly", stage) ||
      $("#wall-letter-orbits", stage) ||
      $("#wall-letter-fly") ||
      $("#wall-letter-orbits");
    if (!stage || !host) return;

    const reduce =
      perfMode === "low" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let rect = stage.getBoundingClientRect();
    /* stage may be 0×0 before layout — retry once */
    if (rect.width < 40 || rect.height < 40) {
      window.setTimeout(() => {
        if (stage.isConnected) startWallHeartFlight(stage);
      }, 120);
      /* still place with fallback size so hearts aren't stuck opacity-0 */
      rect = { width: Math.max(rect.width, 320), height: Math.max(rect.height, 400) };
    }

    const hearts = Array.from(
      (host.id === "wall-letter-fly" ? host : host.querySelector("#wall-letter-fly") || host).querySelectorAll(
        ".wall-heart:not(.is-leaving)"
      )
    );
    if (!hearts.length) return;

    stopWallHeartFlight();
    wallFlyBodies = hearts.map((el, i) => {
      const b = makeFlyBody(el, rect.width, rect.height, i, hearts.length);
      /* always place immediately so hearts are visible even before first RAF tick */
      applyFlyTransform(b);
      el.classList.add("is-in");
      return b;
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
      /* Decorative fillers — not clickable */
      if (
        btn.getAttribute("data-demo") === "1" ||
        btn.classList.contains("wall-heart--demo") ||
        btn.tagName === "SPAN"
      ) {
        return;
      }
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
    if (!all.length) return;

    const hearts = Array.from(
      fly.querySelectorAll(".wall-heart:not(.is-leaving):not(.wall-heart--demo)")
    );
    if (!hearts.length) {
      /* only fillers on stage — rebuild when real wishes exist */
      if (all.length) renderWishWall(true);
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
    const picks = pickWallHearts(all);
    const realCount = picks.filter((w) => !w.isDemo).length;
    const fillCount = picks.length - realCount;
    const count = picks.length;
    const sig =
      picks
        .filter((w) => !w.isDemo)
        .map((w) => w.id)
        .join("|") + `|fill:${fillCount}|n:${count}`;

    if (center) center.hidden = false;
    if (emptyEl) {
      emptyEl.hidden = true;
      emptyEl.textContent = t(cfg.guestbook.wallEmpty);
    }

    const existing = orbits ? orbits.querySelectorAll(".wall-heart").length : 0;
    if (!forceFull && existing === count && existing > 0 && wallLetterSig === sig) {
      startWallLetterFx(stage);
      if (!wallFlyRunning) startWallHeartFlight(stage);
      if (realCount > 0) startWallTimer();
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
        <p class="wishes-wall__empty" id="wall-letter-empty" hidden></p>
        <button type="button" class="wall-letter__fs" id="wall-letter-fs" aria-pressed="false" title="Toàn màn hình">
          <span class="wall-letter__fs-icon" aria-hidden="true">⛶</span>
          <span class="wall-letter__fs-label" id="wall-letter-fs-label">Toàn màn hình</span>
        </button>`;
      updateWallLetterLabels();
      setupWallFullscreen();
      renderWallHearts(picks);
    }

    bindWallLetterClicks(stage);
    startWallLetterFx(stage);
    startWallHeartFlight(stage);
    /* second pass after layout so positions use real stage size */
    window.setTimeout(() => {
      if (stage.isConnected) startWallHeartFlight(stage);
    }, 200);
    if (realCount > 0) startWallTimer();
    else if (wallTimer) {
      clearInterval(wallTimer);
      wallTimer = null;
    }
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
        $("#wishes-wall")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
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

  /* ---------- Galaxy + Three.js heart fireworks ---------- */
  let galaxyRaf = 0;
  let galaxyRunning = false;

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

    /* Three.js engine — lazy init on first open */
    let engine = null;

    function heartShape(t) {
      const x = 16 * Math.pow(Math.sin(t), 3);
      const y =
        13 * Math.cos(t) -
        5 * Math.cos(2 * t) -
        2 * Math.cos(3 * t) -
        Math.cos(4 * t);
      return { x, y };
    }

    function ensureEngine() {
      if (engine) return engine;
      if (typeof THREE === "undefined") {
        console.warn("[galaxy] Three.js missing");
        return null;
      }

      const low = perfMode === "low";
      const particleCount = low ? 1800 : 4000;
      const MAX_BURSTS = low ? 4 : 6;
      const burstParticleCount = low ? 140 : 220;
      const HOLD_DURATION = 2.2;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      camera.position.z = 280;

      const renderer = new THREE.WebGLRenderer({
        canvas,
        antialias: !low,
        alpha: true,
      });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, low ? 1.5 : 2));
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(0x000000, 1);

      const cx = 0;
      const cy = 10;

      const geometry = new THREE.BufferGeometry();
      const positions = new Float32Array(particleCount * 3);
      const colors = new Float32Array(particleCount * 3);
      const sizes = new Float32Array(particleCount);
      const delays = new Float32Array(particleCount);
      const targetPositions = new Float32Array(particleCount * 3);
      const burstDir = new Float32Array(particleCount * 3);
      const burstSpeed = new Float32Array(particleCount);
      const twinkleSeed = new Float32Array(particleCount);
      const twinkleSpeed = new Float32Array(particleCount);
      const heartColorR = new Float32Array(particleCount);
      const heartColorG = new Float32Array(particleCount);
      const heartColorB = new Float32Array(particleCount);

      for (let i = 0; i < particleCount; i++) {
        const t = (i / particleCount) * Math.PI * 2;
        const pos = heartShape(t);
        const tx = pos.x * 9.2 + cx;
        const ty = pos.y * 9.2 + cy;
        const tz = (Math.random() - 0.5) * 35;

        targetPositions[i * 3] = tx;
        targetPositions[i * 3 + 1] = ty;
        targetPositions[i * 3 + 2] = tz;

        positions[i * 3] = cx;
        positions[i * 3 + 1] = cy;
        positions[i * 3 + 2] = 0;

        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(Math.random() * 2 - 1);
        burstDir[i * 3] = Math.sin(phi) * Math.cos(theta);
        burstDir[i * 3 + 1] = Math.sin(phi) * Math.sin(theta);
        burstDir[i * 3 + 2] = Math.cos(phi) * 0.4;
        burstSpeed[i] = 60 + Math.random() * 140;

        const fc = Math.random();
        if (fc < 0.33) {
          colors[i * 3] = 1.0;
          colors[i * 3 + 1] = 0.85 + Math.random() * 0.15;
          colors[i * 3 + 2] = 0.4 + Math.random() * 0.3;
        } else if (fc < 0.66) {
          colors[i * 3] = 1.0;
          colors[i * 3 + 1] = 0.3 + Math.random() * 0.3;
          colors[i * 3 + 2] = 0.5 + Math.random() * 0.3;
        } else {
          colors[i * 3] = 1.0;
          colors[i * 3 + 1] = 1.0;
          colors[i * 3 + 2] = 1.0;
        }

        sizes[i] = Math.random() * 2.4 + 1.6;
        const angle = Math.atan2(ty - cy, tx - cx);
        delays[i] = ((angle + Math.PI) / (Math.PI * 2) + 0.08) % 1;
        twinkleSeed[i] = Math.random() * Math.PI * 2;
        twinkleSpeed[i] = 2 + Math.random() * 4;
        heartColorR[i] = 1.0;
        heartColorG[i] = 0.18 + Math.random() * 0.32;
        heartColorB[i] = 0.68 + Math.random() * 0.22;
      }

      geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
      geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
      geometry.setAttribute("size", new THREE.BufferAttribute(sizes, 1));

      const material = new THREE.PointsMaterial({
        size: 2.9,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });

      const points = new THREE.Points(geometry, material);
      scene.add(points);

      function makeBurstSystem(n) {
        const geo = new THREE.BufferGeometry();
        const pos = new Float32Array(n * 3);
        const col = new Float32Array(n * 3);
        const vel = new Float32Array(n * 3);
        geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
        const mat = new THREE.PointsMaterial({
          size: 2.2,
          vertexColors: true,
          transparent: true,
          opacity: 1,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
        const pts = new THREE.Points(geo, mat);
        pts.visible = false;
        scene.add(pts);
        return {
          geo,
          pos,
          col,
          vel,
          mat,
          pts,
          alive: false,
          age: 0,
          life: 1.6,
          origin: new THREE.Vector3(),
        };
      }

      const bursts = [];
      for (let b = 0; b < MAX_BURSTS; b++) {
        bursts.push(makeBurstSystem(burstParticleCount));
      }

      function fireBurst(system) {
        const ox = (Math.random() - 0.5) * 260;
        const oy = (Math.random() - 0.5) * 160 + 20;
        const oz = (Math.random() - 0.5) * 60 - 40;
        system.origin.set(ox, oy, oz);

        const hue = Math.random();
        let r;
        let g;
        let bl;
        if (hue < 0.25) {
          r = 1.0;
          g = 0.3;
          bl = 0.4;
        } else if (hue < 0.5) {
          r = 1.0;
          g = 0.85;
          bl = 0.4;
        } else if (hue < 0.75) {
          r = 0.6;
          g = 0.6;
          bl = 1.0;
        } else {
          r = 1.0;
          g = 1.0;
          bl = 1.0;
        }

        for (let i = 0; i < burstParticleCount; i++) {
          system.pos[i * 3] = ox;
          system.pos[i * 3 + 1] = oy;
          system.pos[i * 3 + 2] = oz;
          const theta = Math.random() * Math.PI * 2;
          const phi = Math.acos(Math.random() * 2 - 1);
          const speed = 30 + Math.random() * 60;
          system.vel[i * 3] = Math.sin(phi) * Math.cos(theta) * speed;
          system.vel[i * 3 + 1] = Math.sin(phi) * Math.sin(theta) * speed;
          system.vel[i * 3 + 2] = Math.cos(phi) * speed * 0.5;
          system.col[i * 3] = r + (Math.random() - 0.5) * 0.15;
          system.col[i * 3 + 1] = g + (Math.random() - 0.5) * 0.15;
          system.col[i * 3 + 2] = bl + (Math.random() - 0.5) * 0.15;
        }
        system.geo.attributes.position.needsUpdate = true;
        system.geo.attributes.color.needsUpdate = true;
        system.mat.opacity = 1;
        system.age = 0;
        system.alive = true;
        system.pts.visible = true;
      }

      engine = {
        scene,
        camera,
        renderer,
        points,
        geometry,
        material,
        particleCount,
        burstParticleCount,
        targetPositions,
        burstDir,
        burstSpeed,
        delays,
        colors,
        heartColorR,
        heartColorG,
        heartColorB,
        twinkleSeed,
        twinkleSpeed,
        bursts,
        fireBurst,
        cx,
        cy,
        time: 0,
        holdTimer: 0,
        HOLD_DURATION,
        state: "assembling",
        clockTime: 0,
        nextBurstTime: 1.5,
        prevT: 0,
        captionShown: false,
      };
      return engine;
    }

    function resizeEngine() {
      if (!engine) return;
      const { camera, renderer } = engine;
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function tick(now) {
      if (!galaxyRunning || !engine) return;
      const e = engine;
      if (!e.prevT) e.prevT = now;
      const dt = Math.min((now - e.prevT) / 1000, 0.05);
      e.prevT = now;
      e.clockTime += dt;

      if (e.state === "assembling") {
        e.time += 0.42 * dt;
        if (e.time >= 1) {
          e.time = 1;
          e.state = "holding";
          e.holdTimer = 0;
        }
      } else if (e.state === "holding") {
        e.holdTimer += dt;
        if (e.holdTimer >= e.HOLD_DURATION) e.state = "exploding";
      } else if (e.state === "exploding") {
        e.time -= 0.9 * dt;
        if (e.time <= 0) {
          e.time = 0;
          e.state = "assembling";
        }
      }

      if (!e.captionShown && e.time > 0.85) {
        e.captionShown = true;
        root.classList.add("is-caption");
      }

      const posArray = e.geometry.attributes.position.array;
      const colArray = e.geometry.attributes.color.array;
      const { cx, cy, particleCount } = e;

      for (let i = 0; i < particleCount; i++) {
        const delay = e.delays[i] * 0.5;
        let localProgress = (e.time - delay) / (1 - delay);
        localProgress = Math.max(0, Math.min(1, localProgress));
        const ease =
          localProgress < 0.5
            ? 2 * localProgress * localProgress
            : 1 - Math.pow(-2 * localProgress + 2, 2) / 2;

        const tx = e.targetPositions[i * 3];
        const ty = e.targetPositions[i * 3 + 1];
        const tz = e.targetPositions[i * 3 + 2];
        const burstEase = Math.sin(ease * Math.PI);
        const bx = e.burstDir[i * 3] * e.burstSpeed[i] * burstEase * 0.35;
        const by = e.burstDir[i * 3 + 1] * e.burstSpeed[i] * burstEase * 0.35;
        const bz = e.burstDir[i * 3 + 2] * e.burstSpeed[i] * burstEase * 0.35;

        posArray[i * 3] = cx + (tx - cx) * ease + bx;
        posArray[i * 3 + 1] = cy + (ty - cy) * ease + by;
        posArray[i * 3 + 2] = tz * ease * 0.5 + bz;

        const blend = ease;
        const twinkle =
          0.75 +
          0.25 * Math.sin(e.clockTime * e.twinkleSpeed[i] + e.twinkleSeed[i]);
        colArray[i * 3] =
          e.colors[i * 3] * (1 - blend) + e.heartColorR[i] * blend;
        colArray[i * 3 + 1] =
          (e.colors[i * 3 + 1] * (1 - blend) + e.heartColorG[i] * blend) * twinkle;
        colArray[i * 3 + 2] =
          (e.colors[i * 3 + 2] * (1 - blend) + e.heartColorB[i] * blend) * twinkle;
      }

      e.geometry.attributes.position.needsUpdate = true;
      e.geometry.attributes.color.needsUpdate = true;
      e.points.rotation.y = Math.sin(e.clockTime * 0.5) * 0.08;
      e.points.rotation.x = Math.sin(e.clockTime * 0.32) * 0.04;
      e.material.size = 2.9 + Math.sin(e.clockTime * 3) * 0.3;

      if (e.clockTime >= e.nextBurstTime) {
        const free = e.bursts.find((b) => !b.alive);
        if (free) e.fireBurst(free);
        e.nextBurstTime = e.clockTime + 0.6 + Math.random() * 1.2;
      }

      for (const b of e.bursts) {
        if (!b.alive) continue;
        b.age += dt;
        const lp = b.age / b.life;
        if (lp >= 1) {
          b.alive = false;
          b.pts.visible = false;
          continue;
        }
        const gravity = -25;
        const p = b.pos;
        const v = b.vel;
        for (let i = 0; i < e.burstParticleCount; i++) {
          p[i * 3] += v[i * 3] * dt;
          p[i * 3 + 1] += v[i * 3 + 1] * dt + 0.5 * gravity * dt * dt;
          p[i * 3 + 2] += v[i * 3 + 2] * dt;
          v[i * 3 + 1] += gravity * dt;
          v[i * 3] *= 0.985;
          v[i * 3 + 1] *= 0.985;
          v[i * 3 + 2] *= 0.985;
        }
        b.geo.attributes.position.needsUpdate = true;
        b.mat.opacity = 1 - lp;
        b.mat.size = 2.2 * (1 - lp * 0.4);
      }

      e.renderer.render(e.scene, e.camera);
      galaxyRaf = requestAnimationFrame(tick);
    }

    function openShow() {
      if (galaxyRunning) return;
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

      const eng = ensureEngine();
      if (!eng) {
        showToast(
          lang === "vi"
            ? "Không tải được hiệu ứng 3D"
            : "Could not load 3D effect"
        );
        return;
      }

      eng.time = 0;
      eng.holdTimer = 0;
      eng.state = "assembling";
      eng.clockTime = 0;
      eng.nextBurstTime = 1.5;
      eng.prevT = 0;
      eng.captionShown = false;
      eng.bursts.forEach((b) => {
        b.alive = false;
        b.pts.visible = false;
      });

      resizeEngine();
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
      if (e.target === root || e.target === canvas) {
        /* click canvas = re-explode like demo, not close */
        if (e.target === canvas && engine && galaxyRunning) {
          if (engine.state !== "exploding") engine.state = "exploding";
          const free = engine.bursts.find((b) => !b.alive);
          if (free) engine.fireBurst(free);
          return;
        }
        if (e.target === root) closeShow();
      }
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
        if (galaxyRunning) resizeEngine();
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
