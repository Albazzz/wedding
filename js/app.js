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

    const target = new Date(cfg.wedding?.datetime || Date.now()).getTime();

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

      const map = { days, hours, minutes, seconds };
      Object.keys(map).forEach((unit) => {
        const el = root.querySelector(`[data-unit="${unit}"]`);
        if (el) el.textContent = pad(map[unit]);
      });
    }

    tick();
    setInterval(tick, 1000);
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

  function renderWishWall() {
    const stage = $("#wishes-wall-stage");
    const wall = $("#wishes-wall");
    if (!stage) return;

    const all = loadWishes();
    if (!all.length) {
      stage.innerHTML = `<p class="wishes-wall__empty">${escapeHtml(t(cfg.guestbook.wallEmpty))}</p>`;
      if (wallTimer) {
        clearInterval(wallTimer);
        wallTimer = null;
      }
      return;
    }

    const count = Math.min(cfg.guestbook.wallCount || 6, all.length);
    const picks = shuffle(all).slice(0, count);

    clearWallUrls();
    stage.innerHTML = picks
      .map((w, i) => {
        const rot = -12 + Math.random() * 24;
        const x = 4 + Math.random() * 72;
        const y = 6 + Math.random() * 58;
        const delay = (i * 0.12).toFixed(2);
        const scale = (0.88 + Math.random() * 0.18).toFixed(2);
        const src = wishImageSrc(w);
        const imgOk =
          src &&
          (String(src).startsWith("data:image") ||
            String(src).startsWith("http://") ||
            String(src).startsWith("https://"));
        const msg = w.message
          ? escapeHtml(w.message.length > 90 ? w.message.slice(0, 90) + "…" : w.message)
          : "💕";
        const wid = escapeHtml(w.id || "");
        return `
          <article class="wall-card" data-wish-id="${wid}" role="button" tabindex="0" style="--wx:${x.toFixed(1)}%;--wy:${y.toFixed(1)}%;--wrot:${rot.toFixed(1)}deg;--wscale:${scale};--wdelay:${delay}s">
            ${imgOk ? `<img class="wall-card__img" src="${src}" alt="" loading="lazy" />` : `<div class="wall-card__placeholder" aria-hidden="true">❧</div>`}
            <div class="wall-card__body">
              <p class="wall-card__msg">${msg}</p>
              <p class="wall-card__name">${escapeHtml(w.name || "")}</p>
              ${w.relation ? `<p class="wall-card__rel">${escapeHtml(w.relation)}</p>` : ""}
            </div>
          </article>`;
      })
      .join("");

    /* reflow animation */
    requestAnimationFrame(() => {
      stage.querySelectorAll(".wall-card").forEach((el) => el.classList.add("is-in"));
    });
    bindWishOpenClicks(stage);

    const ms = Math.max(3500, cfg.guestbook.wallRotateMs || 5000);
    if (wallTimer) clearInterval(wallTimer);
    wallTimer = setInterval(() => {
      if (document.hidden) return;
      /* only rotate if still on page */
      if (!$("#wishes-wall-stage")) {
        clearInterval(wallTimer);
        wallTimer = null;
        return;
      }
      renderWishWall();
    }, ms);

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


  /* ---------- Petals ---------- */
  function setupPetals() {
    const canvas = $("#petals-canvas");
    if (!canvas || !cfg.effects?.petals) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const ctx = canvas.getContext("2d");
    let w, h, petals, raf;

    function resize() {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
    }

    function makePetal() {
      return {
        x: Math.random() * w,
        y: Math.random() * h - h,
        r: 4 + Math.random() * 7,
        vy: 0.6 + Math.random() * 1.4,
        vx: -0.4 + Math.random() * 0.8,
        rot: Math.random() * Math.PI * 2,
        vr: -0.02 + Math.random() * 0.04,
        alpha: 0.35 + Math.random() * 0.45,
        color: Math.random() > 0.5 ? "200,140,140" : "220,180,160",
      };
    }

    function init() {
      resize();
      const n = cfg.effects.petalCount || 24;
      petals = Array.from({ length: n }, makePetal);
    }

    function draw() {
      ctx.clearRect(0, 0, w, h);
      petals.forEach((p) => {
        p.y += p.vy;
        p.x += p.vx + Math.sin(p.y * 0.01) * 0.3;
        p.rot += p.vr;
        if (p.y > h + 20) {
          p.y = -20;
          p.x = Math.random() * w;
        }
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.beginPath();
        ctx.ellipse(0, 0, p.r, p.r * 0.6, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${p.color},${p.alpha})`;
        ctx.fill();
        ctx.restore();
      });
      raf = requestAnimationFrame(draw);
    }

    init();
    draw();
    window.addEventListener("resize", resize);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) cancelAnimationFrame(raf);
      else draw();
    });
  }

  /* ---------- Scroll reveal ---------- */
  function observeReveal() {
    /* timeline items use setupTimelineScroll — skip them */
    const els = $$(".reveal").filter((el) => !el.classList.contains("timeline__item"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("is-visible"));
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
  }

  /* ---------- Intro: cuộn thư mở + typewriter ---------- */
  function setupIntro() {
    const intro = $("#intro");
    const scroll = $("#scroll-letter");
    const cfgIntro = cfg.intro || {};

    if (!intro || cfgIntro.enabled === false) {
      intro?.remove();
      document.body.classList.remove("intro-lock");
      return;
    }

    if (!cfgIntro.everyVisit) {
      try {
        if (sessionStorage.getItem("wedding_intro_seen") === "1") {
          intro.remove();
          document.body.classList.remove("intro-lock");
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
      document.body.classList.remove("intro-lock");
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
    observeReveal();
    setupIntro();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
