# Sổ lời chúc dùng chung (Firebase)

Để **mọi khách** mở trang đều thấy thiệp đã gửi, bật Firebase.

## 1. Tạo project Firebase

1. Vào [Firebase Console](https://console.firebase.google.com/) → **Add project**
2. Bật **Firestore Database** (production mode → sửa rules bên dưới)
3. Bật **Storage**
4. **Project settings** → Your apps → Web (`</>`) → copy config

## 2. Dán config vào `js/config.js`

```js
firebase: {
  enabled: true,
  apiKey: "AIza...",
  authDomain: "xxx.firebaseapp.com",
  projectId: "xxx",
  storageBucket: "xxx.appspot.com",
  messagingSenderId: "123...",
  appId: "1:123:web:abc",
  collection: "wishes",
  maxWishes: 150,
},
```

Và guestbook:

```js
guestbook: {
  localOnly: false,  // false = ưu tiên Firebase
  ...
}
```

## 3. Rules (Firestore)

Firestore → Rules:

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

## 4. Rules (Storage)

Storage → Rules:

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

> Lưu ý: rules mở read/write cho guest là **tạm ổn cho thiệp cưới**, không dùng cho app production lâu dài. Có thể tắt write sau đám cưới.

## 5. Index

Lần đầu `orderBy('at')` có thể hiện link tạo index — bấm link Firebase tạo composite/single field index.

## 6. Deploy lại site

Push lên GitHub Pages như bình thường. Không cần server riêng.

## Khi chưa bật Firebase

- Thiệp chỉ lưu trên **máy từng khách** (localStorage / IndexedDB)
- Console log: `Firebase chưa bật`

## Free tier (Spark) ~100 khách

| Nội dung | Gợi ý |
|----------|--------|
| Ảnh thiệp + chữ + quan hệ | Ổn |
| Audio ngắn | Ổn |
| Video nhiều × 5 phút | Dễ đầy Storage → nên giảm thời lượng |

## Kiểm tra

1. Mở site trên Chrome → gửi 1 thiệp  
2. Mở **cửa sổ ẩn danh** / máy khác → thấy thiệp đó trong gallery + tường  
