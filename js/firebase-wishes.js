/**
 * Shared guestbook via Firestore only (no Storage — free Spark OK)
 * Lưu: name, relation, message, image (data URL thiệp canvas)
 */
(function () {
  "use strict";

  let db = null;
  let unsub = null;
  let ready = false;

  /** Firestore doc limit 1MB — chừa chỗ field khác */
  const MAX_IMAGE_CHARS = 700000;

  function cfg() {
    return window.WEDDING_CONFIG?.firebase || {};
  }

  function isConfigured() {
    const c = cfg();
    return !!(
      c.enabled &&
      c.apiKey &&
      c.projectId &&
      c.apiKey !== "YOUR_API_KEY" &&
      c.projectId !== "YOUR_PROJECT_ID"
    );
  }

  function isReady() {
    return ready && !!db;
  }

  function init() {
    if (!isConfigured()) {
      ready = false;
      console.info(
        "[WishCloud] Firebase chưa bật — thiệp chỉ lưu local. Xem FIREBASE.md"
      );
      return false;
    }
    if (typeof firebase === "undefined") {
      console.error("[WishCloud] Firebase SDK chưa load");
      return false;
    }
    try {
      const c = cfg();
      if (!firebase.apps.length) {
        firebase.initializeApp({
          apiKey: c.apiKey,
          authDomain: c.authDomain,
          projectId: c.projectId,
          storageBucket: c.storageBucket || undefined,
          messagingSenderId: c.messagingSenderId,
          appId: c.appId,
        });
      }
      db = firebase.firestore();
      ready = true;
      console.info(
        "[WishCloud] Firestore ready — sổ lời chúc dùng chung (không cần Storage)"
      );
      return true;
    } catch (err) {
      console.error("[WishCloud] init failed", err);
      ready = false;
      return false;
    }
  }

  function collectionName() {
    return cfg().collection || "wishes";
  }

  /**
   * @param {object} meta
   * @param {{ imageDataUrl?: string }} [files]
   */
  async function saveWish(meta, files) {
    if (!isReady()) throw new Error("firebase-not-ready");
    const id = meta.id || "wish_" + Date.now();

    let image = "";
    const raw = files?.imageDataUrl || meta.image || meta.imageUrl || "";
    if (raw && String(raw).startsWith("data:image")) {
      if (raw.length > MAX_IMAGE_CHARS) {
        /* nén lại nhẹ hơn nếu quá to */
        image = await recompressDataUrl(raw, 0.55) || raw.slice(0, MAX_IMAGE_CHARS);
        if (image.length > MAX_IMAGE_CHARS) {
          image = ""; /* bỏ ảnh, vẫn lưu chữ */
          console.warn("[WishCloud] card image too large, saved text only");
        }
      } else {
        image = raw;
      }
    }

    const doc = {
      id,
      name: String(meta.name || "").slice(0, 80),
      relation: String(meta.relation || "").slice(0, 80),
      relationId: String(meta.relationId || "").slice(0, 40),
      message: String(meta.message || "").slice(0, 500),
      image,
      at: meta.at || Date.now(),
      templateId: meta.templateId || "",
      frameId: meta.frameId || "",
    };

    await db.collection(collectionName()).doc(id).set(doc);
    return {
      ...doc,
      imageUrl: "",
      audioUrl: "",
      videoUrl: "",
      hasAudio: false,
      hasVideo: false,
    };
  }

  function recompressDataUrl(dataUrl, quality) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement("canvas");
          const maxW = 320;
          const scale = Math.min(1, maxW / img.width);
          c.width = Math.round(img.width * scale);
          c.height = Math.round(img.height * scale);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", quality));
        } catch {
          resolve("");
        }
      };
      img.onerror = () => resolve("");
      img.src = dataUrl;
    });
  }

  function mapDoc(d) {
    const x = d.data ? d.data() : d;
    const image = x.image || x.imageUrl || "";
    return {
      id: x.id || d.id,
      name: x.name || "",
      relation: x.relation || "",
      relationId: x.relationId || "",
      message: x.message || "",
      image,
      imageUrl: x.imageUrl || "",
      audio: "",
      audioUrl: "",
      videoUrl: "",
      hasAudio: false,
      hasVideo: false,
      at: x.at || 0,
      templateId: x.templateId || "",
      frameId: x.frameId || "",
    };
  }

  async function listWishes() {
    if (!isReady()) return [];
    const snap = await db
      .collection(collectionName())
      .orderBy("at", "desc")
      .limit(cfg().maxWishes || 150)
      .get();
    return snap.docs.map(mapDoc);
  }

  function subscribe(cb) {
    if (!isReady()) return () => {};
    if (unsub) unsub();
    unsub = db
      .collection(collectionName())
      .orderBy("at", "desc")
      .limit(cfg().maxWishes || 150)
      .onSnapshot(
        (snap) => cb(snap.docs.map(mapDoc)),
        (err) => console.error("[WishCloud] snapshot error", err)
      );
    return () => {
      if (unsub) unsub();
      unsub = null;
    };
  }

  window.WishCloud = {
    init,
    isConfigured,
    isReady,
    saveWish,
    listWishes,
    subscribe,
  };
})();
