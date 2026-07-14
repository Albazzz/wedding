# Wedding Invitation Site

Trang thiệp cưới tĩnh (HTML/CSS/JS), deploy **GitHub Pages**.  
**Chỉ cần sửa một file** để thay toàn bộ nội dung.

## Sửa nội dung

Mở file:

```
js/config.js
```

Mọi thứ lấy từ đây: tên, ngày, địa điểm, timeline, ảnh, nhạc, lời chúc, đa ngôn ngữ…

| Mục | Trong config |
|-----|----------------|
| Tên cô dâu / chú rể | `couple` |
| Ngày giờ cưới + countdown | `wedding` |
| Ảnh nền trang bìa | `hero.backgroundImage` |
| Câu chuyện tình yêu | `story.milestones` |
| Album + YouTube | `gallery` |
| Lời chúc + thiệp decor | `guestbook` |
| **Sổ dùng chung (mọi khách thấy)** | `firebase` + `FIREBASE.md` |
| Nhạc nền | `music` |
| Intro cuộn thư | `intro` |
| Tiếng Việt / English | các field `{ vi: "...", en: "..." }` |

## Ảnh & nhạc

```
assets/images/   ← hero.jpg, gallery-*.jpg …
assets/audio/    ← background.mp3
```

Đường dẫn trong `config.js` phải khớp tên file.  
Nếu ảnh chưa có, trang vẫn chạy (hiện placeholder / gradient).

## Chạy local

Mở `index.html` bằng trình duyệt, hoặc:

```bash
# Python
python -m http.server 5500

# VS Code: Live Server
```

Rồi vào `http://localhost:5500`

## Deploy GitHub Pages

1. Push repo lên GitHub  
2. **Settings → Pages → Source: Deploy from branch `main` / root**  
3. (Tuỳ chọn) custom domain  

## Cấu trúc

```
index.html
css/style.css
js/config.js      ← BẠN CHỈ SỬA FILE NÀY
js/app.js
assets/images/
assets/audio/
```

## Lời chúc + thiệp tự trang trí

Section **Lời chúc** (`#guestbook`) gồm:

1. **Nền & phong cách** — pastel + glass / neumorph / blob / glow / ribbon / floating  
2. **Sticker theo nhóm** — tình yêu, hoa lá, ánh sáng, tiệc, thiên nhiên, nhạc, dễ thương, giấy & thư  
3. **Khung & viền** — vintage, vàng, ren, hoa, polaroid, giấy xé  
4. **Hiệu ứng chuyển động** — tim bay, bong bóng, cánh hoa, tuyết, lá, sparkle, confetti, pháo hoa, hào quang…  
5. Viết lời chúc + font / màu / cỡ chữ  
6. **Tải thiệp** (PNG) hoặc **Gửi** vào sổ  

Tuỳ chỉnh trong `js/config.js` → `guestbook`:

| Key | Nội dung |
|-----|----------|
| `templates` | Nền / style |
| `stickerCategories` | Nhóm sticker + emoji |
| `frames` | Khung viền |
| `motionEffects` | Hiệu ứng động |

### Ai cũng xem được thiệp đã gửi?

1. Tạo project Firebase (Firestore + Storage) — chi tiết **`FIREBASE.md`**  
2. Trong `js/config.js` bật và dán key:

```js
firebase: { enabled: true, apiKey: "...", projectId: "...", /* ... */ },
guestbook: { localOnly: false },
```

Khi bật Firebase, thiệp lưu cloud → **mọi máy mở link đều thấy**.  
Chưa bật → mỗi máy chỉ thấy thiệp local của mình.
