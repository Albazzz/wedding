/**
 * Shared guestbook via Firebase (Firestore + Storage)
 * → mọi khách mở trang đều thấy cùng danh sách thiệp
 *
 * Bật: điền firebase config trong js/config.js và set firebase.enabled = true
 */
(function () {
  "use strict";

  let app = null;
  let db = null;
  let storage = null;
  let unsub = null;
  let ready = false;

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
        app = firebase.initializeApp({
          apiKey: c.apiKey,
          authDomain: c.authDomain,
          projectId: c.projectId,
          storageBucket: c.storageBucket,
          messagingSenderId: c.messagingSenderId,
          appId: c.appId,
        });
      } else {
        app = firebase.app();
      }
      db = firebase.firestore();
      storage = firebase.storage();
      ready = true;
      console.info("[WishCloud] Firebase ready — sổ lời chúc dùng chung");
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

  function extFromMime(mime, fallback) {
    if (!mime) return fallback;
    if (mime.includes("png")) return "png";
    if (mime.includes("jpeg") || mime.includes("jpg")) return "jpg";
    if (mime.includes("webm")) return "webm";
    if (mime.includes("mp4")) return "mp4";
    if (mime.includes("ogg")) return "ogg";
    if (mime.includes("mpeg") || mime.includes("mp3")) return "mp3";
    return fallback;
  }

  async function uploadBlob(path, blob, contentType) {
    const ref = storage.ref().child(path);
    const snap = await ref.put(blob, {
      contentType: contentType || blob.type || "application/octet-stream",
    });
    return snap.ref.getDownloadURL();
  }

  /**
   * @param {object} meta - name, message, relation, …
   * @param {{ imageBlob?: Blob, audioBlob?: Blob|null, videoBlob?: Blob|null }} files
   */
  async function saveWish(meta, files) {
    if (!isReady()) throw new Error("firebase-not-ready");
    const id = meta.id || "wish_" + Date.now();
    const base = `wishes/${id}`;
    let imageUrl = meta.imageUrl || "";
    let audioUrl = meta.audioUrl || "";
    let videoUrl = meta.videoUrl || "";

    if (files?.imageBlob) {
      const ext = extFromMime(files.imageBlob.type, "jpg");
      imageUrl = await uploadBlob(
        `${base}/card.${ext}`,
        files.imageBlob,
        files.imageBlob.type || "image/jpeg"
      );
    }
    if (files?.audioBlob) {
      const ext = extFromMime(files.audioBlob.type, "webm");
      audioUrl = await uploadBlob(
        `${base}/voice.${ext}`,
        files.audioBlob,
        files.audioBlob.type || "audio/webm"
      );
    }
    if (files?.videoBlob) {
      const ext = extFromMime(files.videoBlob.type, "webm");
      videoUrl = await uploadBlob(
        `${base}/clip.${ext}`,
        files.videoBlob,
        files.videoBlob.type || "video/webm"
      );
    }

    const doc = {
      id,
      name: String(meta.name || "").slice(0, 80),
      relation: String(meta.relation || "").slice(0, 80),
      relationId: String(meta.relationId || "").slice(0, 40),
      message: String(meta.message || "").slice(0, 500),
      imageUrl,
      audioUrl,
      videoUrl,
      hasAudio: !!audioUrl,
      hasVideo: !!videoUrl,
      at: meta.at || Date.now(),
      templateId: meta.templateId || "",
      frameId: meta.frameId || "",
    };

    await db.collection(collectionName()).doc(id).set(doc);
    return doc;
  }

  function mapDoc(d) {
    const x = d.data ? d.data() : d;
    return {
      id: x.id || d.id,
      name: x.name || "",
      relation: x.relation || "",
      relationId: x.relationId || "",
      message: x.message || "",
      /* app.js dùng image hoặc imageUrl */
      image: x.imageUrl || x.image || "",
      imageUrl: x.imageUrl || "",
      audio: x.audioUrl || x.audio || "",
      audioUrl: x.audioUrl || "",
      videoUrl: x.videoUrl || "",
      hasAudio: !!(x.hasAudio || x.audioUrl),
      hasVideo: !!(x.hasVideo || x.videoUrl),
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

  /**
   * Realtime: mọi tab/khách thấy thiệp mới ngay
   * @param {(list: object[]) => void} cb
   */
  function subscribe(cb) {
    if (!isReady()) return () => {};
    if (unsub) unsub();
    unsub = db
      .collection(collectionName())
      .orderBy("at", "desc")
      .limit(cfg().maxWishes || 150)
      .onSnapshot(
        (snap) => {
          cb(snap.docs.map(mapDoc));
        },
        (err) => {
          console.error("[WishCloud] snapshot error", err);
        }
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
