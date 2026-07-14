# Hướng dẫn deploy trang thiệp cưới

Site là **HTML/CSS/JS tĩnh** → deploy **GitHub Pages** (miễn phí).  
Sổ lời chúc **ai cũng xem được** → bật **Firebase** (free Spark).

---

## Phần A — Deploy trang web (GitHub Pages)

### A1. Chuẩn bị nội dung

1. Sửa `js/config.js`:
   - `couple` (tên cô dâu / chú rể)
   - `wedding.datetime`, `dateDisplay`
   - `hero`, `story`, `gallery`, chữ VI/EN
2. Thêm ảnh thật vào `assets/images/` (đúng tên trong config, hoặc sửa đường dẫn)
3. (Tuỳ chọn) Nhạc: `assets/audio/background.mp3` + `music.enabled: true`
4. Test local:

```powershell
cd d:\Study\WEDQ
python -m http.server 5500
```

Mở: http://localhost:5500

---

### A2. Tạo repo GitHub

1. Đăng nhập [github.com](https://github.com)
2. **New repository**
3. Tên ví dụ: `wedding` (Public)
4. **Create repository** (không cần tick README nếu push code sẵn)

---

### A3. Đẩy code lên GitHub (PowerShell)

```powershell
cd d:\Study\WEDQ

git init
git add .
git commit -m "Deploy wedding invitation site"
git branch -M main

# Đổi TEN_BAN và wedding thành user/repo của bạn
git remote add origin https://github.com/TEN_BAN/wedding.git
git push -u origin main
```

Nếu GitHub báo đăng nhập: dùng **Personal Access Token** thay mật khẩu, hoặc GitHub Desktop / VS Code Sign in.

---

### A4. Bật GitHub Pages

1. Repo trên GitHub → **Settings**
2. Menu trái → **Pages**
3. **Build and deployment**
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/ (root)**
4. **Save**

Chờ 1–3 phút. Link trang:

```text
https://TEN_BAN.github.io/wedding/
```

(Nếu repo tên `TEN_BAN.github.io` thì URL là `https://TEN_BAN.github.io/`)

---

### A5. Cập nhật sau khi sửa

```powershell
cd d:\Study\WEDQ
git add .
git commit -m "Update wedding content"
git push
```

Pages tự deploy lại trong vài phút.

---

## Phần B — Sổ lời chúc dùng chung (Firebase, miễn phí)

**Không bật Firebase** → mỗi máy chỉ thấy thiệp của chính mình.  
**Bật Firebase** → ai mở link cũng thấy thiệp đã gửi.

### B1. Tạo project Firebase

1. Vào [console.firebase.google.com](https://console.firebase.google.com)
2. **Add project** → đặt tên → tiếp tục
3. Tắt Google Analytics nếu không cần → Create

### B2. Bật Firestore

1. Menu **Build** → **Firestore Database**
2. **Create database**
3. Chọn **Start in production mode** → location gần (vd. `asia-southeast1`)
4. **Rules** → dán:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /wishes/{wishId} {
      allow read: if true;
      allow create: if request.resource.data.name is string
        && request.resource.data.name.size() > 0
        && request.resource.data.name.size() < 80
        && request.resource.data.message is string
        && request.resource.data.message.size() < 600;
      allow update, delete: if false;
    }
  }
}
```

5. **Publish**

### B3. Bật Storage

1. Menu **Build** → **Storage**
2. **Get started** → rules tạm → **Done**
3. **Rules** → dán:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /wishes/{wishId}/{fileName} {
      allow read: if true;
      allow write: if request.resource.size < 80 * 1024 * 1024
        && (
          request.resource.contentType.matches('image/.*')
          || request.resource.contentType.matches('audio/.*')
          || request.resource.contentType.matches('video/.*')
        );
    }
  }
}
```

4. **Publish**

### B4. Lấy Web config

1. ⚙️ **Project settings**
2. Kéo xuống **Your apps** → icon **Web** `</>`
3. Đặt nickname (vd. wedding-web) → **Register app**
4. Copy object `firebaseConfig` (apiKey, projectId, …)

### B5. Dán vào `js/config.js`

Tìm block `firebase:` và sửa:

```js
firebase: {
  enabled: true,   // ← bật
  apiKey: "AIza...",
  authDomain: "ten-project.firebaseapp.com",
  projectId: "ten-project",
  storageBucket: "ten-project.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef",
  collection: "wishes",
  maxWishes: 150,
},
```

Và trong `guestbook`:

```js
localOnly: false,  // ← dùng cloud, không chỉ local
```

### B6. Push lại & kiểm tra

```powershell
git add js/config.js
git commit -m "Enable Firebase shared guestbook"
git push
```

1. Mở link Pages trên Chrome → gửi 1 thiệp thử  
2. Mở **cửa sổ ẩn danh** (hoặc điện thoại khác) → cùng link  
3. Vào **Lời chúc** → phải thấy thiệp vừa gửi  

Nếu lỗi: F12 → Console xem log; kiểm tra Rules đã Publish; `enabled: true` + key đúng.

Lần đầu Firestore `orderBy('at')` có thể hiện link **tạo index** → bấm link đó → chờ index xong.

---

## Checklist nhanh

| Bước | Xong? |
|------|--------|
| Sửa `config.js` (tên, ngày, ảnh) | ☐ |
| `git push` lên GitHub | ☐ |
| Settings → Pages → main / root | ☐ |
| Mở được `https://….github.io/…` | ☐ |
| (Tuỳ chọn) Firebase + rules | ☐ |
| `firebase.enabled: true` + `localOnly: false` | ☐ |
| Ẩn danh vẫn thấy thiệp đã gửi | ☐ |

---

## Lưu ý

- **GitHub Pages + Firebase Spark = miễn phí** cho quy mô ~100 khách  
- Video dài nhiều người có thể đầy Storage free → nên hạn chế thời lượng  
- **Không commit** secret admin; Web API key Firebase dùng trên client là bình thường (bảo vệ bằng Rules)  
- Sau đám cưới có thể đổi Rules Storage/Firestore thành `allow write: if false` để khóa gửi mới  

Chi tiết Firebase thêm: [FIREBASE.md](./FIREBASE.md)
