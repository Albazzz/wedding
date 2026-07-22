/**
 * ============================================================
 *  WEDDING SITE CONFIG — chỉ cần sửa file này
 * ============================================================
 *  Mọi chữ, ngày, link, ảnh, form… đều lấy từ đây.
 *  Sau khi sửa, reload trang là thấy thay đổi.
 * ============================================================
 */
window.WEDDING_CONFIG = {
  /**
   * ---------- Firebase — sổ lời chúc DÙNG CHUNG ----------
   * true + điền key → mọi khách thấy thiệp đã gửi (xem FIREBASE.md)
   * false → mỗi máy chỉ thấy thiệp của chính mình
   */
  firebase: {
    enabled: true,
    apiKey: "AIzaSyAAtg_MjzcRV4JtSCf8lamlThp-Gxht_Ao",
    authDomain: "wedding-fa939.firebaseapp.com",
    projectId: "wedding-fa939",
    storageBucket: "wedding-fa939.firebasestorage.app",
    messagingSenderId: "979542197572",
    appId: "1:979542197572:web:06e1aed739bcf989e88311",
    measurementId: "G-RL3Z3KMGXG",
    collection: "wishes",
    maxWishes: 150,
  },

  /* ---------- Cặp đôi ---------- */
  couple: {
    bride: "Thông Thị Tú Trâm",
    groom: "Nguyễn Văn Quân",
    /** Thứ tự hiển thị: "bride-groom" | "groom-bride" */
    displayOrder: "groom-bride",
    /** Chữ nối giữa 2 tên, vd: "&", "và", "and" */
    joiner: "&",
  },

  /* ---------- Ngày cưới (dùng cho countdown + hiển thị) ---------- */
  wedding: {
    /** ISO local: YYYY-MM-DDTHH:mm:ss */
    datetime: "2026-07-24T11:00:00",
    /** Chuỗi hiển thị đẹp (tuỳ chỉnh tự do) */
    dateDisplay: {
      vi: "Thứ Sáu, 24 Tháng 7, 2026",
      en: "Friday, July 24, 2026",
    },
    timeDisplay: {
      vi: "11:00 sáng",
      en: "11:00 AM",
    },
  },

  /* ---------- Hero / trang bìa ---------- */
  hero: {
    monogram: "Q & T",
    tagline: {
      vi: "Chúc mừng đến với lễ thành hôn",
      en: "Welcome to our wedding celebration",
    },
    /** Ảnh nền hero (đường dẫn local hoặc URL) */
    backgroundImage: "assets/images/hero.jpg",
    /**
     * Crop mép trên ảnh gốc 5158×7733 (đã bake vào hero.jpg): ~8% H
     * focusY: 0% = mép trên; 5% = hạ khung ~nudge(5)
     */
    cropTopPxOriginal: 618,
    cropTopPercent: 8,
    backgroundPosition: "center top",
    /** Hạ khung 5% (tương đương heroTune.nudge(5) từ top) */
    focusY: "5%",
    /** Overlay tối (0–1) để chữ dễ đọc */
    overlayOpacity: 0.12,
  },

  /* ---------- Gallery — layout timeline giống Love Story ---------- */
  gallery: {
    title: { vi: "Khoảnh khắc đẹp", en: "Beautiful Moments" },
    subtitle: {
      vi: "Một vài khung hình chúng mình muốn chia sẻ",
      en: "A few frames we'd love to share",
    },
    /**
     * Mỗi ảnh = 1 mốc timeline (date / title / description + image)
     * Sửa chữ tự do; layout + animation giống Love Story
     */
    images: [
      {
        src: "assets/images/gallery-1.jpg",
        alt: "Nguyễn Văn Quân & Thông Thị Tú Trâm 1",
        title: { vi: "Bên nhau", en: "Together" },
        description: {
          vi: "Một khung hình dịu dàng — chúng mình và ngày trọng đại.",
          en: "A gentle frame — us and our special day.",
        },
      },
      {
        src: "assets/images/gallery-2.jpg",
        alt: "Nguyễn Văn Quân & Thông Thị Tú Trâm 2",
        title: { vi: "Nụ cười", en: "Smiles" },
        description: {
          vi: "Những nụ cười chân thành mà chúng mình muốn giữ mãi.",
          en: "Honest smiles we want to keep forever.",
        },
      },
      {
        src: "assets/images/gallery-3.jpg",
        alt: "Nguyễn Văn Quân & Thông Thị Tú Trâm 3",
        title: { vi: "Ánh mắt", en: "Eyes meet" },
        description: {
          vi: "Ánh mắt trao nhau — lời hẹn thầm lặng của hai trái tim.",
          en: "A shared look — a quiet promise between two hearts.",
        },
      },
      {
        src: "assets/images/gallery-4.jpg",
        alt: "Nguyễn Văn Quân & Thông Thị Tú Trâm 4",
        title: { vi: "Tay trong tay", en: "Hand in hand" },
        description: {
          vi: "Cùng bước vào chương mới của cuộc đời.",
          en: "Stepping together into a new chapter.",
        },
      },
      {
        src: "assets/images/gallery-5.jpg",
        alt: "Nguyễn Văn Quân & Thông Thị Tú Trâm 5",
        title: { vi: "Mãi bên nhau", en: "Forever together" },
        description: {
          vi: "Từ hôm nay, mọi hành trình đều có hai người.",
          en: "From today on, every journey has two of us.",
        },
      },
    ],
    youtubeVideoId: "",
    youtubeTitle: { vi: "", en: "" },
  },

  /* ---------- Guestbook + thiệp tự trang trí ---------- */
  guestbook: {
    enabled: true,
    title: { vi: "Sổ lời chúc", en: "Guestbook" },
    subtitle: {
      vi: "Trang trí thiệp emoji, viết lời chúc — mọi khách xem được (Firestore, không cần Storage)",
      en: "Decorate with stickers, write a wish — everyone can view (Firestore only, no Storage)",
    },
    /**
     * true = chỉ localStorage (mỗi máy tự thấy).
     * false + firebase.enabled = lưu cloud, ai mở cũng thấy.
     */
    localOnly: false, // Firebase đã bật
    emptyText: {
      vi: "Chưa có thiệp nào — hãy trang trí và gửi lời chúc đầu tiên!",
      en: "No cards yet — decorate and send the first wish!",
    },
    galleryTitle: { vi: "Thiệp đã gửi", en: "Sent cards" },
    wallTitle: { vi: "Bầu trời lời chúc", en: "Sky of wishes" },
    wallSubtitle: {
      vi: "Chạm trái tim mang tên khách — mở lá thư lời chúc",
      en: "Tap a heart with a guest's name to open their letter",
    },
    /** Gợi ý trên điện thoại (ẩn nút toàn màn hình; xoay ngang) */
    wallSubtitlePhone: {
      vi: "Chạm ♥ để đọc thư · Xoay ngang màn hình để xem toàn màn hình",
      en: "Tap ♥ to read · Rotate landscape for fullscreen",
    },
    /** Chữ glow giữa orbit */
    wallCenterTitle: { vi: "Trăm năm hạnh phúc", en: "A hundred years of happiness" },
    wallCenterHint: { vi: "Chạm ♥ để đọc thư", en: "Tap ♥ to read the letter" },
    wallFullscreen: { vi: "Toàn màn hình", en: "Fullscreen" },
    wallFullscreenExit: { vi: "Thu nhỏ", en: "Exit" },
    wallFireworks: { vi: "Pháo hoa", en: "Fireworks" },
    wallFireworksTitle: { vi: "Trăm năm hạnh phúc", en: "A hundred years of happiness" },
    wallEmpty: {
      vi: "Chưa có thư — hãy gửi lời chúc đầu tiên!",
      en: "No letters yet — send the first wish!",
    },
    filterLabel: { vi: "Lọc theo mối quan hệ", en: "Filter by relation" },
    filterAll: { vi: "Tất cả", en: "All" },
    filterEmpty: {
      vi: "Không có thiệp thuộc nhóm này",
      en: "No cards in this relation group",
    },
    /** Số trái tim (lá thư) tối đa trên tường */
    wallCount: 12,
    /**
     * Luôn hiện ít nhất wallMinHearts tim bay.
     * Nếu chưa đủ lời chúc thật → chèn tim trang trí (không bấm được).
     */
    wallMinHearts: 5,
    /**
     * Living orbit: mỗi wallRotateMs thay 1 trái tim bằng lời chúc khác.
     * Gợi ý 6000–10000.
     */
    wallRotateMs: 7500,

    /* ----- Editor labels (đổi chữ UI) ----- */
    labels: {
      templates: { vi: "Nền & phong cách", en: "Background & style" },
      stickers: { vi: "Sticker trang trí", en: "Stickers" },
      frames: { vi: "Khung & viền", en: "Frames & borders" },
      effects: { vi: "Hiệu ứng chuyển động", en: "Motion effects" },
      stickersHint: {
        vi: "Chọn nhóm → bấm sticker · kéo di chuyển · đúp để xóa",
        en: "Pick a category → tap sticker · drag to move · double-tap to remove",
      },
      yourName: { vi: "Tên của bạn", en: "Your name" },
      relation: { vi: "Mối quan hệ với cô dâu chú rể", en: "Relation to the couple" },
      relationCustom: { vi: "Ghi rõ mối quan hệ", en: "Specify your relation" },
      relationPlaceholder: {
        vi: "VD: Bạn học cùng chú rể…",
        en: "e.g. College friend of the groom…",
      },
      yourMessage: { vi: "Lời chúc", en: "Your message" },
      namePlaceholder: { vi: "Nguyễn Văn C", en: "Your name" },
      messagePlaceholder: {
        vi: "Chúc hai bạn trăm năm hạnh phúc…",
        en: "Wishing you a lifetime of happiness…",
      },
      font: { vi: "Font chữ", en: "Font" },
      textColor: { vi: "Màu chữ", en: "Text color" },
      textSize: { vi: "Cỡ chữ", en: "Text size" },
      clearStickers: { vi: "Xóa sticker", en: "Clear stickers" },
      clearEffects: { vi: "Tắt hiệu ứng", en: "Clear effects" },
      download: { vi: "Tải thiệp về", en: "Download card" },
      submit: { vi: "Gửi lời chúc", en: "Send wish" },
      needName: { vi: "Bạn ơi, điền tên nhé", en: "Please enter your name" },
      needMessage: {
        vi: "Hãy viết một lời chúc nhé",
        en: "Please write a wish",
      },
      sent: { vi: "Đã gửi thiệp chúc mừng 💕", en: "Wish card sent 💕" },
      downloaded: { vi: "Đã tải thiệp về máy", en: "Card downloaded" },
      frameNone: { vi: "Không khung", en: "No frame" },
    },

    /**
     * Mối quan hệ — id "other" hiện ô nhập tự do
     * Sửa / thêm trong config khi cần
     */
    relations: [
      { id: "", label: { vi: "— Chọn mối quan hệ —", en: "— Select relation —" } },
      { id: "family-bride", label: { vi: "Gia đình nhà gái", en: "Bride's family" } },
      { id: "family-groom", label: { vi: "Gia đình nhà trai", en: "Groom's family" } },
      { id: "relative-bride", label: { vi: "Họ hàng cô dâu", en: "Bride's relative" } },
      { id: "relative-groom", label: { vi: "Họ hàng chú rể", en: "Groom's relative" } },
      { id: "friend-bride", label: { vi: "Bạn cô dâu", en: "Friend of the bride" } },
      { id: "friend-groom", label: { vi: "Bạn chú rể", en: "Friend of the groom" } },
      { id: "friend-both", label: { vi: "Bạn chung của hai bạn", en: "Friend of both" } },
      { id: "colleague-bride", label: { vi: "Đồng nghiệp cô dâu", en: "Bride's colleague" } },
      { id: "colleague-groom", label: { vi: "Đồng nghiệp chú rể", en: "Groom's colleague" } },
      { id: "classmate", label: { vi: "Bạn học", en: "Classmate" } },
      { id: "neighbor", label: { vi: "Hàng xóm", en: "Neighbor" } },
      { id: "guest", label: { vi: "Khách mời", en: "Invited guest" } },
      { id: "other", label: { vi: "Khác (tự ghi)", en: "Other (custom)" } },
    ],

    /* ----- Mẫu nền (classic + hiện đại) ----- */
    templates: [
      { id: "rose", name: { vi: "Hồng pastel", en: "Soft rose" }, style: "gradient", colors: ["#fff5f5", "#f5d0d0", "#e8b4b8"] },
      { id: "cream", name: { vi: "Kem vàng", en: "Warm cream" }, style: "gradient", colors: ["#fffaf3", "#f0e0c8", "#d4b896"] },
      { id: "sage", name: { vi: "Xanh sage", en: "Sage green" }, style: "gradient", colors: ["#f4f7f4", "#d5e0d5", "#a8c0a8"] },
      { id: "lavender", name: { vi: "Tím lavender", en: "Lavender" }, style: "gradient", colors: ["#f8f5fc", "#e0d4f0", "#c4b0e0"] },
      { id: "glass", name: { vi: "Kính mờ", en: "Glass" }, style: "glass", colors: ["#e8eef8", "#f5f0fa", "#dde8f5"] },
      { id: "soft", name: { vi: "Neumorph", en: "Soft UI" }, style: "neumorph", colors: ["#e8e4df", "#f5f2ee", "#d4cfc8"] },
      { id: "blob", name: { vi: "Gradient blob", en: "Gradient blob" }, style: "blob", colors: ["#ffe4ec", "#e0d4ff", "#d4f0ff"] },
      { id: "glow", name: { vi: "Icon phát sáng", en: "Glow" }, style: "glow", colors: ["#1a1220", "#3d2a45", "#6b3a55"] },
      { id: "ribbon", name: { vi: "Ribbon badge", en: "Ribbon badge" }, style: "ribbon", colors: ["#fff8f5", "#fce8e4", "#f0c4bc"] },
      { id: "float", name: { vi: "Floating card", en: "Floating card" }, style: "float", colors: ["#f7f4ff", "#efe8ff", "#e0d8f5"] },
    ],

    /* ----- 11 nhóm trang trí ----- */
    stickerCategories: [
      {
        id: "love",
        icon: "💖",
        name: { vi: "Tình yêu", en: "Love" },
        items: [
          { emoji: "❤️", label: { vi: "Trái tim", en: "Heart" } },
          { emoji: "💕", label: { vi: "Tim bay", en: "Flying hearts" } },
          { emoji: "💗", label: { vi: "Tim phát sáng", en: "Glowing heart" } },
          { emoji: "💖", label: { vi: "Tim lấp lánh", en: "Sparkling heart" } },
          { emoji: "💌", label: { vi: "Phong thư", en: "Love letter" } },
          { emoji: "💍", label: { vi: "Nhẫn", en: "Ring" } },
          { emoji: "🎀", label: { vi: "Nơ", en: "Bow" } },
          { emoji: "🌹", label: { vi: "Hoa hồng", en: "Rose" } },
          { emoji: "🦢", label: { vi: "Thiên nga", en: "Swan" } },
          { emoji: "💘", label: { vi: "Mũi tên tình", en: "Cupid" } },
          { emoji: "🥰", label: { vi: "Yêu thương", en: "In love" } },
          { emoji: "💒", label: { vi: "Nhà thờ", en: "Chapel" } },
        ],
      },
      {
        id: "flowers",
        icon: "🌸",
        name: { vi: "Hoa lá", en: "Florals" },
        items: [
          { emoji: "🌸", label: { vi: "Anh đào", en: "Sakura" } },
          { emoji: "🌹", label: { vi: "Hoa hồng", en: "Rose" } },
          { emoji: "🌻", label: { vi: "Hướng dương", en: "Sunflower" } },
          { emoji: "🌷", label: { vi: "Tulip", en: "Tulip" } },
          { emoji: "🌼", label: { vi: "Hoa cúc", en: "Daisy" } },
          { emoji: "🪷", label: { vi: "Hoa sen", en: "Lotus" } },
          { emoji: "🌺", label: { vi: "Dâm bụt", en: "Hibiscus" } },
          { emoji: "💮", label: { vi: "Cánh hoa", en: "Petal" } },
          { emoji: "🍃", label: { vi: "Lá cây", en: "Leaf" } },
          { emoji: "🌿", label: { vi: "Dây leo", en: "Vine" } },
          { emoji: "🍀", label: { vi: "Cỏ bốn lá", en: "Clover" } },
          { emoji: "💐", label: { vi: "Bó hoa", en: "Bouquet" } },
          { emoji: "🏵️", label: { vi: "Vòng hoa", en: "Wreath" } },
          { emoji: "🌾", label: { vi: "Bông lúa", en: "Wheat" } },
        ],
      },
      {
        id: "light",
        icon: "✨",
        name: { vi: "Ánh sáng", en: "Lights" },
        items: [
          { emoji: "✨", label: { vi: "Sparkle", en: "Sparkle" } },
          { emoji: "🌟", label: { vi: "Ngôi sao", en: "Star glow" } },
          { emoji: "⭐", label: { vi: "Sao", en: "Star" } },
          { emoji: "💫", label: { vi: "Sao băng", en: "Shooting star" } },
          { emoji: "☄️", label: { vi: "Sao chổi", en: "Comet" } },
          { emoji: "🔆", label: { vi: "Đốm sáng", en: "Glow" } },
          { emoji: "💥", label: { vi: "Glitter", en: "Burst" } },
          { emoji: "🎆", label: { vi: "Pháo hoa", en: "Fireworks" } },
          { emoji: "🎇", label: { vi: "Pháo bông", en: "Sparkler" } },
          { emoji: "☀️", label: { vi: "Hào quang", en: "Halo sun" } },
          { emoji: "🪞", label: { vi: "Lens flare", en: "Lens flare" } },
          { emoji: "💎", label: { vi: "Kim cương", en: "Diamond" } },
        ],
      },
      {
        id: "party",
        icon: "🎈",
        name: { vi: "Tiệc", en: "Party" },
        items: [
          { emoji: "🎈", label: { vi: "Bóng bay", en: "Balloon" } },
          { emoji: "🎂", label: { vi: "Bánh", en: "Cake" } },
          { emoji: "🕯️", label: { vi: "Nến", en: "Candle" } },
          { emoji: "🎁", label: { vi: "Quà tặng", en: "Gift" } },
          { emoji: "🎊", label: { vi: "Pháo giấy", en: "Confetti" } },
          { emoji: "🎉", label: { vi: "Party popper", en: "Popper" } },
          { emoji: "🎆", label: { vi: "Pháo hoa", en: "Fireworks" } },
          { emoji: "🎀", label: { vi: "Ruy băng", en: "Ribbon" } },
          { emoji: "🥳", label: { vi: "Mũ tiệc", en: "Party hat" } },
          { emoji: "🥂", label: { vi: "Ly rượu", en: "Cheers" } },
          { emoji: "🍾", label: { vi: "Sâm panh", en: "Champagne" } },
          { emoji: "🪅", label: { vi: "Piñata", en: "Piñata" } },
        ],
      },
      {
        id: "nature",
        icon: "❄️",
        name: { vi: "Thiên nhiên", en: "Nature" },
        items: [
          { emoji: "❄️", label: { vi: "Tuyết", en: "Snow" } },
          { emoji: "🌧️", label: { vi: "Mưa", en: "Rain" } },
          { emoji: "🌈", label: { vi: "Cầu vồng", en: "Rainbow" } },
          { emoji: "☁️", label: { vi: "Mây", en: "Cloud" } },
          { emoji: "☀️", label: { vi: "Mặt trời", en: "Sun" } },
          { emoji: "🌙", label: { vi: "Mặt trăng", en: "Moon" } },
          { emoji: "🐦", label: { vi: "Chim", en: "Bird" } },
          { emoji: "🕊️", label: { vi: "Bồ câu", en: "Dove" } },
          { emoji: "🦋", label: { vi: "Bướm", en: "Butterfly" } },
          { emoji: "🐝", label: { vi: "Ong", en: "Bee" } },
          { emoji: "🐞", label: { vi: "Bọ rùa", en: "Ladybug" } },
          { emoji: "🌊", label: { vi: "Sóng", en: "Wave" } },
        ],
      },
      {
        id: "music",
        icon: "🎵",
        name: { vi: "Âm nhạc", en: "Music" },
        items: [
          { emoji: "🎵", label: { vi: "Nốt nhạc", en: "Note" } },
          { emoji: "🎶", label: { vi: "Giai điệu", en: "Melody" } },
          { emoji: "💿", label: { vi: "Đĩa than", en: "Disc" } },
          { emoji: "🎹", label: { vi: "Piano", en: "Piano" } },
          { emoji: "🎸", label: { vi: "Guitar", en: "Guitar" } },
          { emoji: "🎧", label: { vi: "Tai nghe", en: "Headphones" } },
          { emoji: "📼", label: { vi: "Cassette", en: "Cassette" } },
          { emoji: "🎤", label: { vi: "Micro", en: "Mic" } },
          { emoji: "🎷", label: { vi: "Saxophone", en: "Sax" } },
          { emoji: "🎻", label: { vi: "Violin", en: "Violin" } },
          { emoji: "🎺", label: { vi: "Kèn", en: "Trumpet" } },
          { emoji: "🥁", label: { vi: "Trống", en: "Drum" } },
        ],
      },
      {
        id: "cute",
        icon: "🧸",
        name: { vi: "Dễ thương", en: "Cute" },
        items: [
          { emoji: "🧸", label: { vi: "Gấu bông", en: "Teddy" } },
          { emoji: "🐰", label: { vi: "Thỏ", en: "Bunny" } },
          { emoji: "🐱", label: { vi: "Mèo", en: "Cat" } },
          { emoji: "🐶", label: { vi: "Chó", en: "Dog" } },
          { emoji: "🐼", label: { vi: "Panda", en: "Panda" } },
          { emoji: "🦆", label: { vi: "Vịt", en: "Duck" } },
          { emoji: "🦕", label: { vi: "Khủng long", en: "Dino" } },
          { emoji: "🐻", label: { vi: "Gấu", en: "Bear" } },
          { emoji: "🦊", label: { vi: "Cáo", en: "Fox" } },
          { emoji: "🦄", label: { vi: "Kỳ lân", en: "Unicorn" } },
          { emoji: "🐥", label: { vi: "Gà con", en: "Chick" } },
          { emoji: "🐹", label: { vi: "Hamster", en: "Hamster" } },
        ],
      },
      {
        id: "paper",
        icon: "📜",
        name: { vi: "Giấy & thư", en: "Paper & mail" },
        items: [
          { emoji: "✉️", label: { vi: "Phong bì", en: "Envelope" } },
          { emoji: "💌", label: { vi: "Thư tình", en: "Love mail" } },
          { emoji: "📜", label: { vi: "Cuộn giấy", en: "Scroll" } },
          { emoji: "📄", label: { vi: "Thiệp", en: "Card paper" } },
          { emoji: "🔏", label: { vi: "Con dấu", en: "Seal" } },
          { emoji: "🪶", label: { vi: "Lông vũ", en: "Quill" } },
          { emoji: "🖋️", label: { vi: "Bút máy", en: "Fountain pen" } },
          { emoji: "✏️", label: { vi: "Bút chì", en: "Pencil" } },
          { emoji: "📝", label: { vi: "Ghi chú", en: "Note" } },
          { emoji: "🔖", label: { vi: "Bookmark", en: "Bookmark" } },
          { emoji: "📮", label: { vi: "Hộp thư", en: "Mailbox" } },
          { emoji: "🖊️", label: { vi: "Bút bi", en: "Pen" } },
        ],
      },
    ],

    /* ----- Khung & viền ----- */
    frames: [
      { id: "none", name: { vi: "Không khung", en: "None" } },
      { id: "vintage", name: { vi: "Khung vintage", en: "Vintage" } },
      { id: "gold", name: { vi: "Khung vàng", en: "Gold" } },
      { id: "lace", name: { vi: "Viền ren", en: "Lace" } },
      { id: "floral", name: { vi: "Viền hoa", en: "Floral" } },
      { id: "polaroid", name: { vi: "Polaroid", en: "Polaroid" } },
      { id: "torn", name: { vi: "Giấy xé", en: "Torn paper" } },
    ],

    /* ----- Hiệu ứng chuyển động (bật/tắt nhiều lớp) ----- */
    motionEffects: [
      { id: "hearts", emoji: "💕", name: { vi: "Tim bay", en: "Flying hearts" } },
      { id: "bubbles", emoji: "🫧", name: { vi: "Bong bóng", en: "Bubbles" } },
      { id: "petals", emoji: "🌸", name: { vi: "Cánh hoa rơi", en: "Petals" } },
      { id: "snow", emoji: "❄️", name: { vi: "Tuyết rơi", en: "Snow" } },
      { id: "leaves", emoji: "🍃", name: { vi: "Lá rơi", en: "Leaves" } },
      { id: "sparkle", emoji: "✨", name: { vi: "Sparkle", en: "Sparkle" } },
      { id: "dust", emoji: "🌟", name: { vi: "Bụi sáng", en: "Light dust" } },
      { id: "confetti", emoji: "🎊", name: { vi: "Pháo giấy", en: "Confetti" } },
      { id: "fireworks", emoji: "🎆", name: { vi: "Pháo hoa", en: "Fireworks" } },
      { id: "halo", emoji: "🔆", name: { vi: "Hào quang", en: "Halo" } },
    ],

    /* ----- Font & màu chữ gợi ý ----- */
    fonts: [
      { id: "serif", label: "Serif (cổ điển)", family: '"Cormorant Garamond", Georgia, serif' },
      { id: "script", label: "Script (viết tay)", family: '"Great Vibes", cursive' },
      { id: "sans", label: "Sans (hiện đại)", family: '"Outfit", system-ui, sans-serif' },
    ],
    textColors: ["#3d2c24", "#8b5e4f", "#6b4c6b", "#4a6741", "#9b4d5a", "#ffffff", "#c4a574", "#2a4a6b"],
    defaultTextColor: "#3d2c24",
    /** Serif dễ đọc tiếng Việt hơn Script trên thiệp */
    defaultFontId: "serif",
    defaultTextSize: 28,
    defaultCategory: "love",
    defaultFrame: "none",
  },

  /* ---------- Nhạc nền ---------- */
  music: {
    enabled: true,
    /** File mp3 trong assets, hoặc URL */
    src: "assets/audio/vaycuoi.mp3",
    /** Tự phát (trình duyệt có thể chặn — có nút bật tay) */
    autoplay: true,
    loop: true,
    volume: 0.4,
  },

  /* ---------- Intro cuộn thư (khi vào trang) ---------- */
  intro: {
    enabled: true,
    /** Hiện lại mỗi lần F5 (false = chỉ 1 lần / session) */
    everyVisit: true,
    eyebrow: { vi: "Thiệp mời", en: "Invitation" },
    /** Dòng chữ typewriter — dùng {names} để chèn tên cặp đôi */
    message: {
      vi: "Chào mừng đến đám cưới của {names}",
      en: "Welcome to the wedding of {names}",
    },
    enterLabel: { vi: "Mở thiệp", en: "Open invitation" },
    skipLabel: { vi: "Bỏ qua", en: "Skip" },
    /** ms trước khi cuộn bắt đầu mở */
    openDelay: 900,
    /** thời gian cuộn mở ra 2 bên (ms) — khớp CSS */
    openDuration: 2800,
    /** tốc độ gõ từng chữ (ms) — càng lớn càng chậm */
    typeSpeed: 100,
    /** nghỉ sau khi gõ xong trước khi hiện nút (ms) */
    afterTypeDelay: 700,
    /** tự mở thiệp sau khi gõ xong (0 = chờ bấm nút) */
    autoEnterMs: 0,
  },

  /* ---------- Đa ngôn ngữ ---------- */
  i18n: {
    defaultLang: "vi",
    languages: ["vi", "en"],
  },

  /* ---------- Hiệu ứng ---------- */
  effects: {
    /** Hoa/cánh hoa rơi */
    petals: true,
    petalCount: 28,
  },

  /* ---------- SEO / meta ---------- */
  meta: {
    title: "Nguyễn Văn Quân & Thông Thị Tú Trâm Wedding",
    description: {
      vi: "Trang thiệp cưới online — kính mời bạn đến chung vui ngày trọng đại của chúng mình.",
      en: "Online wedding invitation — we'd love for you to celebrate with us.",
    },
    /** Ảnh chia sẻ Zalo/Facebook (absolute URL khi deploy) */
    ogImage: "assets/images/og-share.jpg",
  },

  /* ---------- Footer ---------- */
  footer: {
    thankYou: {
      vi: "Cảm ơn bạn đã ghé thăm",
      en: "Thank you for visiting",
    },
    signature: {
      vi: "Với tất cả yêu thương",
      en: "With all our love",
    },
  },

  /* ---------- UI labels (nav, nút, countdown…) ---------- */
  labels: {
    nav: {
      home: { vi: "Trang chủ", en: "Home" },
      gallery: { vi: "Khoảnh khắc", en: "Moments" },
      guestbook: { vi: "Lời chúc", en: "Wishes" },
    },
    countdown: {
      days: { vi: "Ngày", en: "Days" },
      hours: { vi: "Giờ", en: "Hours" },
      minutes: { vi: "Phút", en: "Minutes" },
      seconds: { vi: "Giây", en: "Seconds" },
      ended: {
        vi: "Chúng mình đã thành vợ chồng!",
        en: "We're married!",
      },
    },
    playMusic: { vi: "Bật nhạc", en: "Play music" },
    pauseMusic: { vi: "Tắt nhạc", en: "Pause music" },
    scrollDown: { vi: "Vuốt xuống", en: "Scroll down" },
    close: { vi: "Đóng", en: "Close" },
  },
};
