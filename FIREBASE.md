# Sổ lời chúc dùng chung — **chỉ Firestore** (free Spark)

**Không cần Cloud Storage / gói Blaze.**

Lưu mỗi thiệp: `name`, `relation`, `message`, `image` (ảnh canvas dạng data URL nhỏ), `at`.

## 1. Firebase Console

1. Project **wedding-fa939** (hoặc project của bạn)
2. **Firestore Database** → Create (nếu chưa)
3. **Không cần** bật Storage

## 2. Config (`js/config.js`)

```js
firebase: {
  enabled: true,
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  // storageBucket không bắt buộc
  messagingSenderId: "...",
  appId: "...",
  collection: "wishes",
  maxWishes: 150,
},
guestbook: {
  localOnly: false,
},
```

## 3. Firestore Rules

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

## 4. Kiểm tra

- Console: `[WishCloud] Firestore ready — sổ lời chúc dùng chung (không cần Storage)`
- Gửi thiệp → ẩn danh vẫn thấy
- Nếu lỗi index `orderBy at` → bấm link tạo index trên Firebase

## 5. Lưu ý dung lượng

- Ảnh thiệp canvas JPEG nén nhẹ, nằm trong document Firestore (giới hạn ~1MB/doc)
- ~100 thiệp chữ + ảnh nhỏ → gói Spark thường đủ
