/**
 * Wish card decorator — templates, categorized stickers, frames, motion effects
 * Config: window.WEDDING_CONFIG.guestbook
 */
(function () {
  "use strict";

  const W = 360;
  const H = 520;
  const MAX_STICKERS = 40;
  const STORAGE_KEY = "wedding_wishes";
  const MAX_WISHES = 30;

  let lang = "vi";
  let opts = {};
  let canvas, ctx;
  let animId = 0;
  let particles = [];
  let freezeMotion = false;

  let state = {
    templateId: "rose",
    frameId: "none",
    stickers: [],
    effects: {},
    categoryId: "love",
    name: "",
    relationId: "",
    relationCustom: "",
    message: "",
    fontId: "script",
    textColor: "#3d2c24",
    textSize: 28,
    selected: -1,
    /** base64 data URL for voice wish (small) */
    audioDataUrl: "",
    audioMime: "",
    /** video Blob held in memory until submit → IndexedDB */
    videoBlob: null,
    videoMime: "",
    videoObjectUrl: "",
  };

  let drag = null;
  let lastTap = { t: 0, i: -1 };

  /* Audio recorder runtime */
  let mediaRecorder = null;
  let mediaStream = null;
  let audioChunks = [];
  let recordTimer = null;
  let recordStartedAt = 0;
  let isRecording = false;

  /* Video recorder runtime */
  let videoRecorder = null;
  let videoStream = null;
  let videoChunks = [];
  let videoTimer = null;
  let videoStartedAt = 0;
  let isVideoRecording = false;

  function cfg() {
    return window.WEDDING_CONFIG?.guestbook || {};
  }

  function t(obj, fallback) {
    if (obj == null) return fallback ?? "";
    if (typeof obj === "string") return obj;
    return obj[lang] ?? obj.vi ?? obj.en ?? fallback ?? "";
  }

  function $(id) {
    return document.getElementById(id);
  }

  function escapeAttr(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;");
  }

  function coupleLine() {
    const c = window.WEDDING_CONFIG?.couple;
    if (!c) return "";
    const j = ` ${c.joiner || "&"} `;
    return c.displayOrder === "groom-bride"
      ? c.groom + j + c.bride
      : c.bride + j + c.groom;
  }

  function monogram() {
    return window.WEDDING_CONFIG?.hero?.monogram || coupleLine();
  }

  function currentTemplate() {
    const list = cfg().templates || [];
    return (
      list.find((x) => x.id === state.templateId) ||
      list[0] || { id: "rose", style: "gradient", colors: ["#fff5f5", "#f5d0d0", "#e8b4b8"] }
    );
  }

  function currentFont() {
    const list = cfg().fonts || [];
    return list.find((f) => f.id === state.fontId) || list[0] || { family: "Georgia, serif" };
  }

  function activeEffectIds() {
    return Object.keys(state.effects).filter((k) => state.effects[k]);
  }

  /* ========== Drawing helpers ========== */
  function roundRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
  }

  function drawFlourish(x, y, sx, sy, color) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(sx, sy);
    ctx.strokeStyle = color || "rgba(166,124,109,0.55)";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(18, 4, 28, 22);
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(4, 18, 22, 28);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, Math.PI * 2);
    ctx.fillStyle = color || "rgba(166,124,109,0.45)";
    ctx.fill();
    ctx.restore();
  }

  /* ========== Background by style ========== */
  function drawBackground(tpl) {
    const colors = tpl.colors || ["#fff5f5", "#f5d0d0", "#e8b4b8"];
    const style = tpl.style || "gradient";

    if (style === "glass") {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, colors[0]);
      g.addColorStop(0.5, colors[1] || colors[0]);
      g.addColorStop(1, colors[2] || colors[0]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      /* frosted panels */
      ctx.fillStyle = "rgba(255,255,255,0.35)";
      roundRect(24, 24, W - 48, H - 48, 20);
      ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,0.65)";
      ctx.lineWidth = 1.5;
      roundRect(24, 24, W - 48, H - 48, 20);
      ctx.stroke();
      return;
    }

    if (style === "neumorph") {
      ctx.fillStyle = colors[0];
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.shadowColor = "rgba(255,255,255,0.85)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetX = -8;
      ctx.shadowOffsetY = -8;
      ctx.fillStyle = colors[1] || colors[0];
      roundRect(36, 36, W - 72, H - 72, 28);
      ctx.fill();
      ctx.shadowColor = "rgba(120,100,90,0.28)";
      ctx.shadowOffsetX = 10;
      ctx.shadowOffsetY = 10;
      roundRect(36, 36, W - 72, H - 72, 28);
      ctx.fill();
      ctx.restore();
      return;
    }

    if (style === "blob") {
      ctx.fillStyle = "#faf8ff";
      ctx.fillRect(0, 0, W, H);
      drawBlob(W * 0.25, H * 0.3, 110, colors[0]);
      drawBlob(W * 0.75, H * 0.35, 100, colors[1] || colors[0]);
      drawBlob(W * 0.5, H * 0.75, 120, colors[2] || colors[0]);
      drawBlob(W * 0.15, H * 0.7, 70, colors[1] || colors[0]);
      return;
    }

    if (style === "glow") {
      const g = ctx.createRadialGradient(W / 2, H * 0.4, 20, W / 2, H / 2, H * 0.7);
      g.addColorStop(0, colors[2] || "#6b3a55");
      g.addColorStop(0.45, colors[1] || "#3d2a45");
      g.addColorStop(1, colors[0] || "#1a1220");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      /* glowing orbs */
      [[0.3, 0.25, 40], [0.7, 0.55, 55], [0.5, 0.8, 35]].forEach(([px, py, r]) => {
        const og = ctx.createRadialGradient(W * px, H * py, 0, W * px, H * py, r);
        og.addColorStop(0, "rgba(255,200,220,0.35)");
        og.addColorStop(1, "rgba(255,200,220,0)");
        ctx.fillStyle = og;
        ctx.fillRect(0, 0, W, H);
      });
      return;
    }

    if (style === "ribbon") {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, colors[0]);
      g.addColorStop(1, colors[1] || colors[0]);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
      /* corner ribbon */
      ctx.fillStyle = colors[2] || "#e8a0a0";
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(110, 0);
      ctx.lineTo(0, 110);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.save();
      ctx.translate(28, 28);
      ctx.rotate(-Math.PI / 4);
      ctx.font = '12px "Outfit", sans-serif';
      ctx.textAlign = "center";
      ctx.fillText("WISH", 0, 0);
      ctx.restore();
      return;
    }

    if (style === "float") {
      ctx.fillStyle = colors[2] || "#e0d8f5";
      ctx.fillRect(0, 0, W, H);
      ctx.save();
      ctx.shadowColor = "rgba(60,40,80,0.22)";
      ctx.shadowBlur = 28;
      ctx.shadowOffsetY = 14;
      ctx.fillStyle = colors[0];
      roundRect(28, 36, W - 56, H - 72, 18);
      ctx.fill();
      ctx.restore();
      ctx.strokeStyle = "rgba(255,255,255,0.7)";
      ctx.lineWidth = 1;
      roundRect(28, 36, W - 56, H - 72, 18);
      ctx.stroke();
      return;
    }

    /* default gradient */
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, colors[0]);
    g.addColorStop(0.55, colors[1] || colors[0]);
    g.addColorStop(1, colors[2] || colors[1] || colors[0]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, "rgba(255,255,255,0)");
    vg.addColorStop(1, "rgba(80,50,40,0.06)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);

    drawFlourish(48, 48, 1, 1, colors[2] || colors[1]);
    drawFlourish(W - 48, 48, -1, 1, colors[2] || colors[1]);
    drawFlourish(48, H - 48, 1, -1, colors[2] || colors[1]);
    drawFlourish(W - 48, H - 48, -1, -1, colors[2] || colors[1]);
  }

  function drawBlob(cx, cy, r, color) {
    ctx.save();
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.55;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const rr = r * (0.75 + 0.25 * Math.sin(i * 2.1));
      const x = cx + Math.cos(a) * rr;
      const y = cy + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  /* ========== Frames ========== */
  function drawFrame() {
    const id = state.frameId || "none";
    if (id === "none") {
      ctx.save();
      ctx.strokeStyle = "rgba(139,94,79,0.22)";
      ctx.lineWidth = 1.5;
      roundRect(18, 18, W - 36, H - 36, 12);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (id === "vintage") {
      ctx.save();
      ctx.strokeStyle = "rgba(90,60,40,0.55)";
      ctx.lineWidth = 3;
      roundRect(16, 16, W - 32, H - 32, 4);
      ctx.stroke();
      ctx.lineWidth = 1;
      roundRect(24, 24, W - 48, H - 48, 2);
      ctx.stroke();
      /* corner squares */
      [[20, 20], [W - 36, 20], [20, H - 36], [W - 36, H - 36]].forEach(([x, y]) => {
        ctx.fillStyle = "rgba(90,60,40,0.4)";
        ctx.fillRect(x, y, 16, 16);
      });
      ctx.restore();
      return;
    }

    if (id === "gold") {
      ctx.save();
      const gg = ctx.createLinearGradient(0, 0, W, H);
      gg.addColorStop(0, "#e8d5a3");
      gg.addColorStop(0.5, "#c4a574");
      gg.addColorStop(1, "#a68b4b");
      ctx.strokeStyle = gg;
      ctx.lineWidth = 8;
      roundRect(14, 14, W - 28, H - 28, 10);
      ctx.stroke();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = "rgba(255,248,220,0.7)";
      roundRect(22, 22, W - 44, H - 44, 6);
      ctx.stroke();
      ctx.restore();
      return;
    }

    if (id === "lace") {
      ctx.save();
      ctx.strokeStyle = "rgba(180,140,150,0.55)";
      ctx.lineWidth = 1.2;
      const m = 20;
      roundRect(m, m, W - m * 2, H - m * 2, 20);
      ctx.stroke();
      /* scallops */
      const step = 14;
      ctx.fillStyle = "rgba(220,180,190,0.35)";
      for (let x = m + 10; x < W - m - 5; x += step) {
        ctx.beginPath();
        ctx.arc(x, m, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(x, H - m, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      for (let y = m + 10; y < H - m - 5; y += step) {
        ctx.beginPath();
        ctx.arc(m, y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(W - m, y, 5, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      return;
    }

    if (id === "floral") {
      ctx.save();
      const flowers = ["🌸", "🌺", "🌷", "🌼"];
      ctx.font = '18px "Segoe UI Emoji", "Apple Color Emoji", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const edge = [];
      for (let i = 0; i < 10; i++) {
        edge.push([28 + i * 34, 28]);
        edge.push([28 + i * 34, H - 28]);
      }
      for (let i = 1; i < 12; i++) {
        edge.push([28, 40 + i * 36]);
        edge.push([W - 28, 40 + i * 36]);
      }
      edge.forEach(([x, y], i) => {
        ctx.globalAlpha = 0.85;
        ctx.fillText(flowers[i % flowers.length], x, y);
      });
      ctx.restore();
      return;
    }

    if (id === "polaroid") {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.92)";
      /* bottom thick border like polaroid */
      ctx.fillRect(14, H - 70, W - 28, 56);
      ctx.strokeStyle = "rgba(60,50,45,0.35)";
      ctx.lineWidth = 10;
      ctx.strokeRect(18, 18, W - 36, H - 90);
      ctx.lineWidth = 2;
      ctx.strokeRect(14, 14, W - 28, H - 28);
      ctx.fillStyle = "rgba(100,80,70,0.45)";
      ctx.font = '14px "Great Vibes", cursive';
      ctx.textAlign = "center";
      ctx.fillText(monogram(), W / 2, H - 38);
      ctx.restore();
      return;
    }

    if (id === "torn") {
      ctx.save();
      ctx.strokeStyle = "rgba(90,70,60,0.35)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      const jag = (side) => {
        if (side === "top") {
          ctx.moveTo(12, 28);
          for (let x = 12; x < W - 12; x += 16) {
            ctx.lineTo(x + 8, 18 + (x % 32 === 0 ? 10 : 0));
            ctx.lineTo(x + 16, 28);
          }
        }
      };
      /* rough border via multiple jagged paths */
      ctx.beginPath();
      ctx.moveTo(16, 30);
      for (let x = 16; x <= W - 16; x += 14) {
        ctx.lineTo(x, 22 + ((x / 14) % 2) * 12);
      }
      ctx.lineTo(W - 16, H - 30);
      for (let x = W - 16; x >= 16; x -= 14) {
        ctx.lineTo(x, H - 22 - ((x / 14) % 2) * 12);
      }
      ctx.closePath();
      ctx.stroke();
      ctx.restore();
    }
  }

  /* ========== Text ========== */
  function wrapText(text, maxWidth, font) {
    ctx.font = font;
    const words = String(text || "").split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const lines = [];
    let line = "";
    words.forEach((word) => {
      const test = line ? line + " " + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = word;
      } else line = test;
    });
    if (line) lines.push(line);
    const out = [];
    lines.forEach((ln) => {
      if (ctx.measureText(ln).width <= maxWidth) {
        out.push(ln);
        return;
      }
      let chunk = "";
      for (const ch of ln) {
        const t2 = chunk + ch;
        if (ctx.measureText(t2).width > maxWidth && chunk) {
          out.push(chunk);
          chunk = ch;
        } else chunk = t2;
      }
      if (chunk) out.push(chunk);
    });
    return out.slice(0, 8);
  }

  function drawText() {
    const font = currentFont();
    const size = state.textSize || 28;
    const color = state.textColor || "#3d2c24";
    const tpl = currentTemplate();
    const lightBg = (tpl.style === "glow");
    const msgFont = `${size}px ${font.family}`;
    const nameFont = `500 ${Math.max(14, Math.round(size * 0.55))}px "Cormorant Garamond", Georgia, serif`;
    const maxW = W - 80;
    const ink = lightBg && color === "#3d2c24" ? "#f5e6e0" : color;

    ctx.save();
    ctx.fillStyle = lightBg ? "rgba(255,220,230,0.55)" : "rgba(139,94,79,0.55)";
    ctx.font = '28px "Great Vibes", cursive';
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(monogram(), W / 2, state.frameId === "polaroid" ? 56 : 70);
    ctx.strokeStyle = lightBg ? "rgba(255,200,210,0.4)" : "rgba(196,165,116,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 40, state.frameId === "polaroid" ? 78 : 92);
    ctx.lineTo(W / 2 + 40, state.frameId === "polaroid" ? 78 : 92);
    ctx.stroke();
    ctx.restore();

    const lines = wrapText(state.message || "", maxW, msgFont);
    const lineH = size * 1.25;
    const blockH = lines.length * lineH;
    const startY = H / 2 - blockH / 2 + (state.frameId === "polaroid" ? -10 : 10);

    ctx.save();
    ctx.fillStyle = ink;
    ctx.font = msgFont;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    lines.forEach((ln, i) => ctx.fillText(ln, W / 2, startY + i * lineH));
    ctx.restore();

    if (state.name) {
      ctx.save();
      ctx.fillStyle = ink;
      ctx.globalAlpha = 0.9;
      ctx.font = nameFont;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const hasRel = !!relationLabel();
      const ny = state.frameId === "polaroid" ? (hasRel ? H - 112 : H - 100) : hasRel ? H - 90 : H - 78;
      ctx.fillText("— " + state.name + " —", W / 2, ny);
      if (hasRel) {
        ctx.globalAlpha = 0.75;
        ctx.font = `400 ${Math.max(11, Math.round(size * 0.38))}px "Outfit", system-ui, sans-serif`;
        ctx.fillText(relationLabel(), W / 2, ny + Math.max(16, size * 0.55));
      }
      ctx.restore();
    }

    if (state.frameId !== "polaroid") {
      ctx.save();
      ctx.fillStyle = lightBg ? "rgba(255,230,235,0.4)" : "rgba(107,83,72,0.4)";
      ctx.font = '11px "Outfit", system-ui, sans-serif';
      ctx.textAlign = "center";
      ctx.fillText(coupleLine(), W / 2, H - 48);
      ctx.restore();
    }
  }

  function relationLabel() {
    const list = cfg().relations || [];
    if (state.relationId === "other") {
      return (state.relationCustom || "").trim();
    }
    const found = list.find((r) => r.id === state.relationId);
    if (!found || !found.id) return "";
    return t(found.label);
  }

  function stickerHalfSize(s) {
    if (s.type === "image" && s.img) {
      const w = s.size || 100;
      const h = w * ((s.img.naturalHeight || s.img.height || 1) / (s.img.naturalWidth || s.img.width || 1));
      return { hw: w / 2, hh: h / 2 };
    }
    const r = (s.size || 36) * 0.65;
    return { hw: r, hh: r };
  }

  function drawStickers() {
    state.stickers.forEach((s, i) => {
      ctx.save();
      ctx.translate(s.x, s.y);
      ctx.rotate(((s.rot || 0) * Math.PI) / 180);

      if (s.type === "image" && s.img && s.img.complete) {
        const w = s.size || 100;
        const h =
          w *
          ((s.img.naturalHeight || s.img.height || 1) /
            (s.img.naturalWidth || s.img.width || 1));
        /* soft polaroid-ish edge */
        ctx.fillStyle = "rgba(255,255,255,0.95)";
        ctx.shadowColor = "rgba(0,0,0,0.18)";
        ctx.shadowBlur = 8;
        ctx.fillRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 14);
        ctx.shadowBlur = 0;
        ctx.drawImage(s.img, -w / 2, -h / 2, w, h);
        if (i === state.selected && !freezeMotion) {
          ctx.strokeStyle = "rgba(139,94,79,0.75)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([5, 4]);
          ctx.strokeRect(-w / 2 - 4, -h / 2 - 4, w + 8, h + 14);
        }
      } else {
        ctx.font = `${s.size || 36}px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(s.emoji || "✨", 0, 0);
        if (i === state.selected && !freezeMotion) {
          ctx.strokeStyle = "rgba(139,94,79,0.65)";
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 3]);
          ctx.beginPath();
          ctx.arc(0, 0, (s.size || 36) * 0.7, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    });
  }

  /* ========== Motion particles ========== */
  function effectMeta(id) {
    return (cfg().motionEffects || []).find((e) => e.id === id);
  }

  function rebuildParticles() {
    particles = [];
    activeEffectIds().forEach((id) => {
      const meta = effectMeta(id);
      const emoji = meta?.emoji || "✨";
      let count = 16;
      if (id === "halo") count = 1;
      else if (id === "fireworks") count = 8;
      else if (id === "sparkle" || id === "dust") count = 22;
      else if (id === "bubbles") count = 22;

      for (let i = 0; i < count; i++) {
        particles.push(makeParticle(id, emoji, i));
      }
    });
  }

  function makeParticle(type, emoji, i) {
    const bubble = type === "bubbles";
    return {
      type,
      emoji,
      x: Math.random() * W,
      y: bubble ? H + Math.random() * H * 0.4 : Math.random() * H,
      vx: -0.4 + Math.random() * 0.8,
      vy: type === "hearts" || bubble ? -0.55 - Math.random() * 1.1 : 0.5 + Math.random() * 1.2,
      r: bubble ? 8 + Math.random() * 22 : 10 + Math.random() * 14,
      rot: Math.random() * 360,
      vr: -1 + Math.random() * 2,
      alpha: bubble ? 0.55 + Math.random() * 0.4 : 0.45 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      wobble: 0.4 + Math.random() * 1.2,
      life: Math.random(),
    };
  }

  function stepParticles() {
    if (freezeMotion) return;
    particles.forEach((p) => {
      p.phase += p.type === "bubbles" ? 0.05 : 0.04;
      if (p.type === "halo") {
        p.r = 60 + Math.sin(p.phase) * 12;
        p.x = W / 2;
        p.y = H * 0.42;
        return;
      }
      if (p.type === "bubbles") {
        p.y += p.vy;
        p.x += Math.sin(p.phase * p.wobble) * 0.9 + (p.vx || 0) * 0.15;
        /* gentle size pulse */
        p.drawR = p.r * (0.92 + 0.08 * Math.sin(p.phase * 1.3));
        if (p.y < -30) {
          p.y = H + 10 + Math.random() * 40;
          p.x = Math.random() * W;
          p.r = 8 + Math.random() * 22;
          p.vy = -0.55 - Math.random() * 1.1;
          p.alpha = 0.55 + Math.random() * 0.4;
        }
        return;
      }
      if (p.type === "hearts") {
        p.y += p.vy;
        p.x += Math.sin(p.phase) * 0.6;
        if (p.y < -20) {
          p.y = H + 10;
          p.x = Math.random() * W;
        }
      } else if (p.type === "fireworks") {
        p.life += 0.012;
        if (p.life > 1) {
          p.life = 0;
          p.x = 40 + Math.random() * (W - 80);
          p.y = 60 + Math.random() * (H * 0.45);
        }
        p.r = 8 + p.life * 28;
        p.alpha = 1 - p.life;
      } else if (p.type === "sparkle" || p.type === "dust") {
        p.x += p.vx;
        p.y += p.vy * 0.3;
        p.alpha = 0.3 + Math.abs(Math.sin(p.phase)) * 0.6;
        if (p.x < 0 || p.x > W || p.y < 0 || p.y > H) {
          p.x = Math.random() * W;
          p.y = Math.random() * H;
        }
      } else if (p.type === "confetti") {
        p.y += p.vy;
        p.x += Math.sin(p.phase * 2) * 1.2;
        p.rot += p.vr * 4;
        if (p.y > H + 20) {
          p.y = -10;
          p.x = Math.random() * W;
        }
      } else {
        /* petals, snow, leaves */
        p.y += p.vy;
        p.x += p.vx + Math.sin(p.phase) * 0.5;
        p.rot += p.vr;
        if (p.y > H + 20) {
          p.y = -15;
          p.x = Math.random() * W;
        }
      }
    });
  }

  function drawParticles() {
    particles.forEach((p) => {
      ctx.save();
      if (p.type === "halo") {
        const hg = ctx.createRadialGradient(p.x, p.y, 10, p.x, p.y, p.r);
        hg.addColorStop(0, "rgba(255,230,180,0.35)");
        hg.addColorStop(0.5, "rgba(255,200,150,0.12)");
        hg.addColorStop(1, "rgba(255,200,150,0)");
        ctx.fillStyle = hg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      if (p.type === "fireworks") {
        ctx.globalAlpha = Math.max(0, p.alpha);
        ctx.strokeStyle = `hsla(${(p.phase * 40) % 360},70%,65%,${p.alpha})`;
        ctx.lineWidth = 1.5;
        for (let k = 0; k < 8; k++) {
          const a = (k / 8) * Math.PI * 2 + p.phase;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + Math.cos(a) * p.r, p.y + Math.sin(a) * p.r);
          ctx.stroke();
        }
        ctx.restore();
        return;
      }
      if (p.type === "bubbles") {
        const r = p.drawR || p.r;
        /* soap-bubble: soft fill + rim + highlight — visible on cream paper */
        const g = ctx.createRadialGradient(
          p.x - r * 0.28,
          p.y - r * 0.32,
          r * 0.05,
          p.x,
          p.y,
          r
        );
        g.addColorStop(0, "rgba(255,255,255,0.55)");
        g.addColorStop(0.35, "rgba(200,230,255,0.22)");
        g.addColorStop(0.75, "rgba(160,200,255,0.12)");
        g.addColorStop(1, "rgba(120,170,230,0.06)");
        ctx.globalAlpha = Math.min(1, p.alpha);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(110,160,220,0.75)";
        ctx.lineWidth = Math.max(1.2, r * 0.08);
        ctx.stroke();
        /* iridescent rim hint */
        ctx.strokeStyle = "rgba(255,180,220,0.35)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 0.92, -0.6, 0.9);
        ctx.stroke();
        /* shine speck */
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(p.x - r * 0.32, p.y - r * 0.35, Math.max(1.5, r * 0.14), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        return;
      }
      if (p.type === "confetti") {
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = `hsl(${(p.x * 2 + p.y) % 360},70%,60%)`;
        ctx.fillRect(-3, -5, 6, 10);
        ctx.restore();
        return;
      }
      ctx.translate(p.x, p.y);
      ctx.rotate(((p.rot || 0) * Math.PI) / 180);
      ctx.globalAlpha = p.alpha;
      ctx.font = `${p.r}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(p.emoji, 0, 0);
      ctx.restore();
    });
  }

  /* ========== Full render ========== */
  function render() {
    if (!ctx) return;
    drawBackground(currentTemplate());
    drawFrame();
    drawText();
    drawStickers();
    drawParticles();
  }

  function loop() {
    stepParticles();
    render();
    if (activeEffectIds().length && !freezeMotion) {
      animId = requestAnimationFrame(loop);
    } else {
      animId = 0;
    }
  }

  function ensureAnim() {
    if (activeEffectIds().length && !animId && !freezeMotion) {
      animId = requestAnimationFrame(loop);
    }
    if (!activeEffectIds().length) {
      if (animId) cancelAnimationFrame(animId);
      animId = 0;
      particles = [];
      render();
    }
  }

  /* ========== Hit test ========== */
  function canvasPoint(e) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const src = e.touches ? e.touches[0] : e;
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    };
  }

  function hitSticker(x, y) {
    for (let i = state.stickers.length - 1; i >= 0; i--) {
      const s = state.stickers[i];
      const { hw, hh } = stickerHalfSize(s);
      const dx = x - s.x;
      const dy = y - s.y;
      if (s.type === "image") {
        if (Math.abs(dx) <= hw + 6 && Math.abs(dy) <= hh + 8) return i;
      } else if (dx * dx + dy * dy <= hw * hw) {
        return i;
      }
    }
    return -1;
  }

  /* ========== UI builders ========== */
  function buildTemplates() {
    const root = $("template-picker");
    if (!root) return;
    const list = cfg().templates || [];
    root.innerHTML = list
      .map((tpl) => {
        const c = tpl.colors || [];
        const bg = `linear-gradient(145deg, ${c[0]}, ${c[2] || c[1] || c[0]})`;
        const active = tpl.id === state.templateId ? " is-active" : "";
        return `<button type="button" class="template-swatch${active}" data-id="${escapeAttr(tpl.id)}" title="${escapeAttr(t(tpl.name))}" style="background:${bg}" aria-label="${escapeAttr(t(tpl.name))}"></button>`;
      })
      .join("");
    root.onclick = (e) => {
      const btn = e.target.closest("[data-id]");
      if (!btn) return;
      state.templateId = btn.getAttribute("data-id");
      buildTemplates();
      render();
    };
  }

  function buildCategories() {
    const root = $("sticker-cats");
    if (!root) return;
    const cats = cfg().stickerCategories || [];
    if (!cats.length) {
      root.innerHTML = "";
      return;
    }
    if (!cats.find((c) => c.id === state.categoryId)) {
      state.categoryId = cats[0].id;
    }
    root.innerHTML = cats
      .map((c) => {
        const active = c.id === state.categoryId ? " is-active" : "";
        return `<button type="button" class="sticker-cat${active}" data-cat="${escapeAttr(c.id)}" title="${escapeAttr(t(c.name))}">
          <span class="sticker-cat__icon">${c.icon || ""}</span>
          <span class="sticker-cat__name">${escapeAttr(t(c.name))}</span>
        </button>`;
      })
      .join("");
    root.onclick = (e) => {
      const btn = e.target.closest("[data-cat]");
      if (!btn) return;
      state.categoryId = btn.getAttribute("data-cat");
      buildCategories();
      buildStickers();
    };
  }

  function buildStickers() {
    const root = $("sticker-picker");
    if (!root) return;
    const cats = cfg().stickerCategories || [];
    let items = [];
    if (cats.length) {
      const cat = cats.find((c) => c.id === state.categoryId) || cats[0];
      items = (cat.items || []).map((it) =>
        typeof it === "string" ? { emoji: it, label: it } : it
      );
    } else {
      items = (cfg().stickers || []).map((e) => ({ emoji: e, label: e }));
    }
    root.innerHTML = items
      .map(
        (it) =>
          `<button type="button" class="sticker-btn" data-emoji="${escapeAttr(it.emoji)}" title="${escapeAttr(t(it.label, it.emoji))}" aria-label="${escapeAttr(t(it.label, it.emoji))}">${it.emoji}</button>`
      )
      .join("");
    root.onclick = (e) => {
      const btn = e.target.closest("[data-emoji]");
      if (!btn) return;
      addSticker(btn.getAttribute("data-emoji"));
    };
  }

  function buildFrames() {
    const root = $("frame-picker");
    if (!root) return;
    const list = cfg().frames || [{ id: "none", name: { vi: "Không", en: "None" } }];
    root.innerHTML = list
      .map((f) => {
        const active = f.id === state.frameId ? " is-active" : "";
        return `<button type="button" class="frame-chip${active}" data-frame="${escapeAttr(f.id)}">${escapeAttr(t(f.name))}</button>`;
      })
      .join("");
    root.onclick = (e) => {
      const btn = e.target.closest("[data-frame]");
      if (!btn) return;
      state.frameId = btn.getAttribute("data-frame");
      buildFrames();
      render();
    };
  }

  function buildEffects() {
    const root = $("effect-picker");
    if (!root) return;
    const list = cfg().motionEffects || [];
    root.innerHTML = list
      .map((ef) => {
        const on = !!state.effects[ef.id];
        return `<button type="button" class="effect-chip${on ? " is-active" : ""}" data-effect="${escapeAttr(ef.id)}" aria-pressed="${on}">
          <span>${ef.emoji || ""}</span>
          <span>${escapeAttr(t(ef.name))}</span>
        </button>`;
      })
      .join("");
    root.onclick = (e) => {
      const btn = e.target.closest("[data-effect]");
      if (!btn) return;
      const id = btn.getAttribute("data-effect");
      state.effects[id] = !state.effects[id];
      rebuildParticles();
      buildEffects();
      ensureAnim();
      if (!activeEffectIds().length) render();
    };
  }

  function buildFonts() {
    const sel = $("card-font");
    if (!sel) return;
    const list = cfg().fonts || [];
    sel.innerHTML = list
      .map(
        (f) =>
          `<option value="${escapeAttr(f.id)}" ${f.id === state.fontId ? "selected" : ""}>${escapeAttr(f.label)}</option>`
      )
      .join("");
  }

  function buildColors() {
    const root = $("color-picker");
    if (!root) return;
    const colors = cfg().textColors || ["#3d2c24"];
    root.innerHTML = colors
      .map((c) => {
        const active = c.toLowerCase() === state.textColor.toLowerCase() ? " is-active" : "";
        const border = c.toLowerCase() === "#ffffff" ? "border:1px solid #ccc;" : "";
        return `<button type="button" class="color-swatch${active}" data-color="${escapeAttr(c)}" style="background:${c};${border}" aria-label="${escapeAttr(c)}"></button>`;
      })
      .join("");
    root.onclick = (e) => {
      const btn = e.target.closest("[data-color]");
      if (!btn) return;
      state.textColor = btn.getAttribute("data-color");
      buildColors();
      render();
    };
  }

  function addSticker(emoji) {
    if (state.stickers.length >= MAX_STICKERS) {
      opts.onToast?.(lang === "vi" ? "Đủ sticker rồi 🌸" : "Sticker limit reached");
      return;
    }
    const n = state.stickers.length;
    state.stickers.push({
      type: "emoji",
      emoji,
      x: W / 2 + ((n % 5) - 2) * 18,
      y: 140 + Math.floor(n / 5) * 36,
      size: 34 + Math.random() * 10,
      rot: -12 + Math.random() * 24,
    });
    state.selected = state.stickers.length - 1;
    render();
  }

  function photoStickerCount() {
    return state.stickers.filter((s) => s.type === "image").length;
  }

  function compressImageFile(file) {
    const maxSide = cfg().photoMaxSide || 280;
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        const scale = Math.min(1, maxSide / Math.max(w, h));
        w = Math.max(1, Math.round(w * scale));
        h = Math.max(1, Math.round(h * scale));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const cx = c.getContext("2d");
        cx.drawImage(img, 0, 0, w, h);
        URL.revokeObjectURL(url);
        const dataUrl = c.toDataURL("image/jpeg", 0.72);
        const out = new Image();
        out.onload = () => resolve({ img: out, dataUrl, w, h });
        out.onerror = reject;
        out.src = dataUrl;
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error("load"));
      };
      img.src = url;
    });
  }

  async function addPhotoFromFile(file) {
    const L = cfg().labels || {};
    const maxP = cfg().maxPhotoStickers || 6;
    if (!file || !file.type.startsWith("image/")) {
      opts.onToast?.(t(L.photoError));
      return;
    }
    if (photoStickerCount() >= maxP) {
      opts.onToast?.(t(L.photoLimit));
      return;
    }
    if (state.stickers.length >= MAX_STICKERS) {
      opts.onToast?.(lang === "vi" ? "Đủ sticker rồi 🌸" : "Sticker limit reached");
      return;
    }
    try {
      const { img, dataUrl, w } = await compressImageFile(file);
      const n = photoStickerCount();
      state.stickers.push({
        type: "image",
        img,
        dataUrl,
        x: W / 2 + ((n % 3) - 1) * 24,
        y: 200 + n * 16,
        size: Math.min(120, Math.max(72, w * 0.45)),
        rot: -8 + Math.random() * 16,
      });
      state.selected = state.stickers.length - 1;
      render();
      opts.onToast?.(t(L.photoAdded));
    } catch {
      opts.onToast?.(t(L.photoError));
    }
  }

  function setupPhotoInputs() {
    const cam = $("card-photo-camera");
    const file = $("card-photo-file");
    const onChange = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (f) addPhotoFromFile(f);
    };
    cam?.addEventListener("change", onChange);
    file?.addEventListener("change", onChange);
  }

  /* ----- Audio record ----- */
  function updateAudioUI() {
    const L = cfg().labels || {};
    const recBtn = $("card-audio-record");
    const playBtn = $("card-audio-play");
    const delBtn = $("card-audio-delete");
    const timer = $("card-audio-timer");
    if (recBtn) {
      recBtn.textContent = isRecording ? t(L.recording) : t(L.record);
      recBtn.classList.toggle("is-recording", isRecording);
    }
    const has = !!state.audioDataUrl;
    if (playBtn) playBtn.hidden = !has || isRecording;
    if (delBtn) delBtn.hidden = !has || isRecording;
    if (timer && !isRecording) {
      timer.textContent = has ? "✓" : "";
    }
  }

  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsDataURL(blob);
    });
  }

  async function startRecording() {
    const L = cfg().labels || {};
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      opts.onToast?.(t(L.audioUnsupported));
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/mp4",
        "audio/ogg",
      ];
      let mime = "";
      for (const m of mimeCandidates) {
        if (MediaRecorder.isTypeSupported(m)) {
          mime = m;
          break;
        }
      }
      mediaRecorder = mime
        ? new MediaRecorder(mediaStream, { mimeType: mime })
        : new MediaRecorder(mediaStream);
      state.audioMime = mediaRecorder.mimeType || mime || "audio/webm";

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunks.push(e.data);
      };
      mediaRecorder.onstop = async () => {
        mediaStream?.getTracks().forEach((tr) => tr.stop());
        mediaStream = null;
        clearInterval(recordTimer);
        recordTimer = null;
        isRecording = false;
        const blob = new Blob(audioChunks, { type: state.audioMime || "audio/webm" });
        if (blob.size < 200) {
          updateAudioUI();
          return;
        }
        try {
          state.audioDataUrl = await blobToDataURL(blob);
          const preview = $("card-audio-preview");
          if (preview) {
            preview.src = state.audioDataUrl;
            preview.hidden = true;
          }
          opts.onToast?.(t(L.audioReady));
        } catch {
          state.audioDataUrl = "";
        }
        updateAudioUI();
      };

      mediaRecorder.start(200);
      isRecording = true;
      recordStartedAt = Date.now();
      const maxSec = cfg().audioMaxSeconds || 20;
      const timerEl = $("card-audio-timer");
      recordTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - recordStartedAt) / 1000);
        if (timerEl) timerEl.textContent = `${sec}s / ${maxSec}s`;
        if (sec >= maxSec) stopRecording();
      }, 200);
      updateAudioUI();
    } catch {
      opts.onToast?.(t(L.audioDenied));
      isRecording = false;
      updateAudioUI();
    }
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
      mediaRecorder.stop();
    } else {
      isRecording = false;
      mediaStream?.getTracks().forEach((tr) => tr.stop());
      mediaStream = null;
      clearInterval(recordTimer);
      updateAudioUI();
    }
  }

  function setupAudio() {
    const recBtn = $("card-audio-record");
    const playBtn = $("card-audio-play");
    const delBtn = $("card-audio-delete");
    const preview = $("card-audio-preview");
    const L = () => cfg().labels || {};

    recBtn?.addEventListener("click", () => {
      if (isRecording) stopRecording();
      else startRecording();
    });

    playBtn?.addEventListener("click", async () => {
      if (!preview || !state.audioDataUrl) return;
      if (!preview.paused) {
        preview.pause();
        playBtn.textContent = t(L().playAudio);
        return;
      }
      preview.src = state.audioDataUrl;
      try {
        await preview.play();
        playBtn.textContent = t(L().stopAudio);
        preview.onended = () => {
          playBtn.textContent = t(L().playAudio);
        };
      } catch {
        /* ignore */
      }
    });

    delBtn?.addEventListener("click", () => {
      state.audioDataUrl = "";
      state.audioMime = "";
      if (preview) {
        preview.pause();
        preview.removeAttribute("src");
      }
      updateAudioUI();
    });

    updateAudioUI();
  }

  /* ----- Video (max 5 min) → IndexedDB on submit ----- */
  function revokeVideoUrl() {
    if (state.videoObjectUrl) {
      try {
        URL.revokeObjectURL(state.videoObjectUrl);
      } catch (_) {
        /* ignore */
      }
      state.videoObjectUrl = "";
    }
  }

  function setVideoBlob(blob, mime) {
    revokeVideoUrl();
    state.videoBlob = blob;
    state.videoMime = mime || blob.type || "video/webm";
    state.videoObjectUrl = URL.createObjectURL(blob);
    const preview = $("card-video-preview");
    if (preview) {
      preview.src = state.videoObjectUrl;
      preview.hidden = false;
    }
    updateVideoUI();
  }

  function clearVideo() {
    if (isVideoRecording) stopVideoRecording();
    revokeVideoUrl();
    state.videoBlob = null;
    state.videoMime = "";
    const preview = $("card-video-preview");
    if (preview) {
      preview.pause();
      preview.removeAttribute("src");
      preview.hidden = true;
    }
    const timer = $("card-video-timer");
    if (timer) timer.textContent = "";
    updateVideoUI();
  }

  function updateVideoUI() {
    const L = cfg().labels || {};
    const recBtn = $("card-video-record");
    const delBtn = $("card-video-delete");
    if (recBtn) {
      recBtn.textContent = isVideoRecording ? t(L.videoRecording) : t(L.videoRecord);
      recBtn.classList.toggle("is-recording", isVideoRecording);
    }
    if (delBtn) delBtn.hidden = !state.videoBlob || isVideoRecording;
  }

  function probeVideoDuration(fileOrBlob) {
    return new Promise((resolve) => {
      const url = URL.createObjectURL(fileOrBlob);
      const v = document.createElement("video");
      v.preload = "metadata";
      v.onloadedmetadata = () => {
        const d = v.duration;
        URL.revokeObjectURL(url);
        resolve(Number.isFinite(d) ? d : 0);
      };
      v.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      v.src = url;
    });
  }

  async function addVideoFromFile(file) {
    const L = cfg().labels || {};
    if (!file || !file.type.startsWith("video/")) {
      opts.onToast?.(t(L.videoError));
      return;
    }
    const maxBytes = cfg().videoMaxBytes || 80 * 1024 * 1024;
    if (file.size > maxBytes) {
      opts.onToast?.(t(L.videoTooBig));
      return;
    }
    const maxSec = cfg().videoMaxSeconds || 300;
    const duration = await probeVideoDuration(file);
    if (duration > maxSec + 0.5) {
      opts.onToast?.(t(L.videoTooLong));
      return;
    }
    setVideoBlob(file, file.type);
    opts.onToast?.(t(L.videoReady));
  }

  async function startVideoRecording() {
    const L = cfg().labels || {};
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      opts.onToast?.(t(L.audioUnsupported));
      return;
    }
    if (isRecording) stopRecording();
    try {
      videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 720 }, height: { ideal: 1280 } },
        audio: true,
      });
      videoChunks = [];
      const mimes = [
        "video/webm;codecs=vp9,opus",
        "video/webm;codecs=vp8,opus",
        "video/webm",
        "video/mp4",
      ];
      let mime = "";
      for (const m of mimes) {
        if (MediaRecorder.isTypeSupported(m)) {
          mime = m;
          break;
        }
      }
      videoRecorder = mime
        ? new MediaRecorder(videoStream, { mimeType: mime, videoBitsPerSecond: 1_200_000 })
        : new MediaRecorder(videoStream);
      state.videoMime = videoRecorder.mimeType || mime || "video/webm";

      const preview = $("card-video-preview");
      if (preview) {
        preview.srcObject = videoStream;
        preview.muted = true;
        preview.controls = false;
        preview.hidden = false;
        try {
          await preview.play();
        } catch (_) {
          /* ignore */
        }
      }

      videoRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) videoChunks.push(e.data);
      };
      videoRecorder.onstop = () => {
        videoStream?.getTracks().forEach((tr) => tr.stop());
        videoStream = null;
        clearInterval(videoTimer);
        videoTimer = null;
        isVideoRecording = false;
        if (preview) {
          preview.srcObject = null;
          preview.muted = false;
          preview.controls = true;
        }
        const blob = new Blob(videoChunks, { type: state.videoMime || "video/webm" });
        if (blob.size < 1000) {
          updateVideoUI();
          return;
        }
        setVideoBlob(blob, state.videoMime);
        opts.onToast?.(t(L.videoReady));
      };

      videoRecorder.start(400);
      isVideoRecording = true;
      videoStartedAt = Date.now();
      const maxSec = cfg().videoMaxSeconds || 300;
      const timerEl = $("card-video-timer");
      videoTimer = setInterval(() => {
        const sec = Math.floor((Date.now() - videoStartedAt) / 1000);
        const mm = String(Math.floor(sec / 60)).padStart(2, "0");
        const ss = String(sec % 60).padStart(2, "0");
        const mMax = String(Math.floor(maxSec / 60)).padStart(2, "0");
        const sMax = String(maxSec % 60).padStart(2, "0");
        if (timerEl) timerEl.textContent = `${mm}:${ss} / ${mMax}:${sMax}`;
        if (sec >= maxSec) stopVideoRecording();
      }, 250);
      updateVideoUI();
    } catch {
      opts.onToast?.(t(L.videoDenied));
      isVideoRecording = false;
      videoStream?.getTracks().forEach((tr) => tr.stop());
      videoStream = null;
      updateVideoUI();
    }
  }

  function stopVideoRecording() {
    if (videoRecorder && videoRecorder.state !== "inactive") {
      videoRecorder.stop();
    } else {
      isVideoRecording = false;
      videoStream?.getTracks().forEach((tr) => tr.stop());
      videoStream = null;
      clearInterval(videoTimer);
      updateVideoUI();
    }
  }

  function setupVideo() {
    const cam = $("card-video-camera");
    const file = $("card-video-file");
    const recBtn = $("card-video-record");
    const delBtn = $("card-video-delete");

    const onFile = (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (f) addVideoFromFile(f);
    };
    cam?.addEventListener("change", onFile);
    file?.addEventListener("change", onFile);

    recBtn?.addEventListener("click", () => {
      if (isVideoRecording) stopVideoRecording();
      else startVideoRecording();
    });
    delBtn?.addEventListener("click", clearVideo);
    updateVideoUI();
  }

  function dataUrlToBlob(dataUrl) {
    if (!dataUrl || !dataUrl.startsWith("data:")) return null;
    const parts = dataUrl.split(",");
    const mime = (parts[0].match(/:(.*?);/) || [])[1] || "application/octet-stream";
    const bin = atob(parts[1] || "");
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  function clearStickers() {
    state.stickers = [];
    state.selected = -1;
    render();
  }

  function clearEffects() {
    state.effects = {};
    particles = [];
    if (animId) cancelAnimationFrame(animId);
    animId = 0;
    buildEffects();
    render();
  }

  /* ========== Export ========== */
  function exportDataURL(type, quality) {
    const prev = state.selected;
    state.selected = -1;
    freezeMotion = true;
    render();
    const url = canvas.toDataURL(type || "image/jpeg", quality ?? 0.88);
    freezeMotion = false;
    state.selected = prev;
    ensureAnim();
    if (!animId) render();
    return url;
  }

  function download() {
    const url = exportDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `thiep-chuc-mung-${Date.now()}.png`;
    a.click();
    opts.onToast?.(t(cfg().labels?.downloaded));
  }

  async function submit() {
    const name = state.name.trim();
    const message = state.message.trim();
    const L = cfg().labels || {};
    if (!name) {
      opts.onToast?.(t(L.needName));
      $("card-name")?.focus();
      return;
    }
    if (!message && !state.audioDataUrl && !state.videoBlob) {
      opts.onToast?.(t(L.needMessage));
      $("card-message")?.focus();
      return;
    }
    if (isRecording) stopRecording();
    if (isVideoRecording) stopVideoRecording();

    const image = exportDataURL("image/jpeg", 0.8);
    const id = "wish_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
    const audioBlob = state.audioDataUrl ? dataUrlToBlob(state.audioDataUrl) : null;
    const imageBlob = dataUrlToBlob(image);
    const relation = relationLabel();
    const useCloud = !!(
      window.WishCloud &&
      window.WishCloud.isReady() &&
      !window.WEDDING_CONFIG?.guestbook?.localOnly
    );

    let wish = {
      id,
      name,
      relation,
      relationId: state.relationId || "",
      message,
      image,
      imageUrl: "",
      audio: state.videoBlob ? "" : state.audioDataUrl || "",
      audioUrl: "",
      videoUrl: "",
      audioMime: state.audioMime || "",
      hasAudio: !!(state.audioDataUrl || audioBlob),
      hasVideo: !!state.videoBlob,
      at: Date.now(),
      templateId: state.templateId,
      frameId: state.frameId,
    };

    if (useCloud) {
      try {
        opts.onToast?.(
          lang === "vi" ? "Đang gửi thiệp lên mây…" : "Uploading wish…"
        );
        const saved = await window.WishCloud.saveWish(wish, {
          imageBlob,
          audioBlob,
          videoBlob: state.videoBlob || null,
        });
        wish = {
          ...wish,
          ...saved,
          image: saved.imageUrl || wish.image,
          audio: saved.audioUrl || wish.audio,
        };
      } catch (err) {
        console.error("WishCloud save failed", err);
        opts.onToast?.(
          lang === "vi"
            ? "Gửi cloud lỗi — kiểm tra Firebase (FIREBASE.md)"
            : "Cloud save failed — check Firebase setup"
        );
        return;
      }
    } else {
      /* Offline / demo: IndexedDB + localStorage */
      if (window.WishMediaDB && (state.videoBlob || audioBlob)) {
        try {
          await window.WishMediaDB.putMedia(id, {
            video: state.videoBlob || null,
            videoMime: state.videoMime || "",
            audio: audioBlob,
            audioMime: state.audioMime || (audioBlob && audioBlob.type) || "",
          });
        } catch (err) {
          console.warn("WishMediaDB put failed", err);
          if (state.videoBlob) {
            opts.onToast?.(
              lang === "vi"
                ? "Không lưu được video (bộ nhớ đầy?)"
                : "Couldn't save video (storage full?)"
            );
            return;
          }
        }
      }
    }

    opts.onSubmit?.(wish, { cloud: useCloud });
    opts.onToast?.(t(L.sent));

    state.message = "";
    state.relationId = "";
    state.relationCustom = "";
    state.stickers = [];
    state.selected = -1;
    state.audioDataUrl = "";
    state.audioMime = "";
    clearVideo();
    const msgEl = $("card-message");
    if (msgEl) msgEl.value = "";
    const relSel = $("card-relation");
    if (relSel) relSel.value = "";
    const relCustom = $("card-relation-custom");
    if (relCustom) relCustom.value = "";
    const customWrap = $("card-relation-custom-wrap");
    if (customWrap) customWrap.hidden = true;
    const preview = $("card-audio-preview");
    if (preview) {
      preview.pause();
      preview.removeAttribute("src");
    }
    updateAudioUI();
    render();
  }

  function buildRelations() {
    const sel = $("card-relation");
    if (!sel) return;
    const list = cfg().relations || [];
    sel.innerHTML = list
      .map(
        (r) =>
          `<option value="${escapeAttr(r.id)}" ${r.id === state.relationId ? "selected" : ""}>${escapeAttr(t(r.label))}</option>`
      )
      .join("");
    syncRelationCustom();
  }

  function syncRelationCustom() {
    const wrap = $("card-relation-custom-wrap");
    const show = state.relationId === "other";
    if (wrap) wrap.hidden = !show;
  }

  /* ========== Labels ========== */
  function applyLabels() {
    const L = cfg().labels || {};
    setText("card-lbl-templates", t(L.templates));
    setText("card-lbl-photos", t(L.photos));
    setText("card-photos-hint", t(L.photosHint));
    setText("card-lbl-camera", t(L.camera));
    setText("card-lbl-gallery", t(L.pickPhoto));
    setText("card-lbl-audio", t(L.audio));
    setText("card-audio-hint", t(L.audioHint));
    setText("card-lbl-video", t(L.video));
    setText("card-video-hint", t(L.videoHint));
    setText("card-lbl-video-cam", t(L.videoCam));
    setText("card-lbl-video-pick", t(L.videoPick));
    setText("card-lbl-stickers", t(L.stickers));
    setText("card-lbl-frames", t(L.frames));
    setText("card-lbl-effects", t(L.effects));
    setText("card-stickers-hint", t(L.stickersHint));
    setText("card-lbl-name", t(L.yourName));
    setText("card-lbl-relation", t(L.relation));
    setText("card-lbl-relation-custom", t(L.relationCustom));
    setText("card-lbl-message", t(L.yourMessage));
    setText("card-lbl-font", t(L.font));
    setText("card-lbl-size", t(L.textSize));
    setText("card-lbl-color", t(L.textColor));
    setText("card-clear-stickers", t(L.clearStickers));
    setText("card-clear-effects", t(L.clearEffects));
    setText("card-download", t(L.download));
    setText("card-submit", t(L.submit));
    setText("wishes-gallery-title", t(cfg().galleryTitle));
    buildRelations();
    updateAudioUI();
    updateVideoUI();

    const name = $("card-name");
    const msg = $("card-message");
    const relCustom = $("card-relation-custom");
    if (name) name.placeholder = t(L.namePlaceholder);
    if (msg) msg.placeholder = t(L.messagePlaceholder);
    if (relCustom) relCustom.placeholder = t(L.relationPlaceholder);
  }

  function setText(id, text) {
    const el = $(id);
    if (el && text != null) el.textContent = text;
  }

  /* ========== Pointer ========== */
  function onPointerDown(e) {
    const p = canvasPoint(e);
    const i = hitSticker(p.x, p.y);
    state.selected = i;
    if (i >= 0) {
      const now = Date.now();
      if (lastTap.i === i && now - lastTap.t < 320) {
        state.stickers.splice(i, 1);
        state.selected = -1;
        lastTap = { t: 0, i: -1 };
        render();
        return;
      }
      lastTap = { t: now, i };
      const s = state.stickers[i];
      drag = { i, ox: p.x - s.x, oy: p.y - s.y };
      const item = state.stickers.splice(i, 1)[0];
      state.stickers.push(item);
      drag.i = state.stickers.length - 1;
      state.selected = drag.i;
      if (e.cancelable) e.preventDefault();
    }
    render();
  }

  function onPointerMove(e) {
    if (!drag) return;
    const p = canvasPoint(e);
    const s = state.stickers[drag.i];
    if (!s) return;
    s.x = Math.min(W - 20, Math.max(20, p.x - drag.ox));
    s.y = Math.min(H - 20, Math.max(20, p.y - drag.oy));
    if (e.cancelable) e.preventDefault();
    if (!animId) render();
  }

  function onPointerUp() {
    drag = null;
  }

  /* ========== Storage ========== */
  function loadWishes() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    } catch {
      return [];
    }
  }

  function saveWish(wish) {
    const list = loadWishes();
    list.push(wish);
    while (list.length > MAX_WISHES) list.shift();
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    } catch {
      while (list.length > 5) {
        list.shift();
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
          break;
        } catch (_) {
          /* continue */
        }
      }
    }
    return list;
  }

  /* ========== Public ========== */
  function init(options) {
    opts = options || {};
    lang = opts.lang || window.WEDDING_CONFIG?.i18n?.defaultLang || "vi";
    canvas = $("card-canvas");
    if (!canvas) return;
    ctx = canvas.getContext("2d");

    const g = cfg();
    state.templateId = g.templates?.[0]?.id || "rose";
    state.frameId = g.defaultFrame || "none";
    state.categoryId = g.defaultCategory || g.stickerCategories?.[0]?.id || "love";
    state.fontId = g.defaultFontId || "script";
    state.textColor = g.defaultTextColor || "#3d2c24";
    state.textSize = g.defaultTextSize || 28;
    state.effects = {};
    state.audioDataUrl = "";
    state.audioMime = "";
    state.videoBlob = null;
    state.videoMime = "";
    state.videoObjectUrl = "";

    buildTemplates();
    buildCategories();
    buildStickers();
    buildFrames();
    buildEffects();
    buildFonts();
    buildColors();
    setupPhotoInputs();
    setupAudio();
    setupVideo();
    applyLabels();

    const sizeEl = $("card-size");
    if (sizeEl) sizeEl.value = String(state.textSize);

    $("card-name")?.addEventListener("input", (e) => {
      state.name = e.target.value;
      if (!animId) render();
    });
    $("card-relation")?.addEventListener("change", (e) => {
      state.relationId = e.target.value || "";
      syncRelationCustom();
      if (!animId) render();
    });
    $("card-relation-custom")?.addEventListener("input", (e) => {
      state.relationCustom = e.target.value;
      if (!animId) render();
    });
    $("card-message")?.addEventListener("input", (e) => {
      state.message = e.target.value;
      if (!animId) render();
    });
    $("card-font")?.addEventListener("change", (e) => {
      state.fontId = e.target.value;
      if (!animId) render();
    });
    $("card-size")?.addEventListener("input", (e) => {
      state.textSize = Number(e.target.value) || 28;
      if (!animId) render();
    });
    $("card-clear-stickers")?.addEventListener("click", clearStickers);
    $("card-clear-effects")?.addEventListener("click", clearEffects);
    $("card-download")?.addEventListener("click", download);
    $("card-submit")?.addEventListener("click", submit);

    canvas.addEventListener("mousedown", onPointerDown);
    window.addEventListener("mousemove", onPointerMove);
    window.addEventListener("mouseup", onPointerUp);
    canvas.addEventListener("touchstart", onPointerDown, { passive: false });
    canvas.addEventListener("touchmove", onPointerMove, { passive: false });
    canvas.addEventListener("touchend", onPointerUp);
    canvas.addEventListener("touchcancel", onPointerUp);

    const draw = () => render();
    if (document.fonts?.ready) document.fonts.ready.then(draw).catch(draw);
    draw();
    setTimeout(draw, 400);
  }

  function setLang(next) {
    lang = next;
    applyLabels();
    buildCategories();
    buildStickers();
    buildTemplates();
    buildFrames();
    buildEffects();
    if (!animId) render();
  }

  window.CardEditor = {
    init,
    setLang,
    loadWishes,
    saveWish,
    exportDataURL,
    render,
    STORAGE_KEY,
    getMedia: (id) =>
      window.WishMediaDB ? window.WishMediaDB.getMedia(id) : Promise.resolve(null),
  };
})();
