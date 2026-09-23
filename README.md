# Dudusan — Этап 2

## Что работает сейчас

- Вход через Google
- Профиль (имя, юзернейм, описание)
- **Смена аватара** (нажми на свой аватар в профиле)
- Темы + режим стекла
- Поиск по юзернейму
- Личные чаты в реальном времени
- Список чатов с аватарками и именами
- Онлайн-статус («в сети» / «был недавно»)
- Просмотр профиля собеседника (клик по шапке чата)
- Админ-панель (первый вошедший = владелец):
  - перевод дуди
  - выдача DuduPlus

## Настройка Firebase (обязательно)

### 1. Authentication
Sign-in method → **Google** → Включить

### 2. Firestore
Создать базу → Production mode

**Rules:**
```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId} {
      allow read: if request.auth != null;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update: if request.auth != null && (
        request.auth.uid == userId ||
        get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isOwner == true
      );
    }
    match /chats/{chatId} {
      allow read, write: if request.auth != null &&
        request.auth.uid in resource.data.members;
      allow create: if request.auth != null;
      match /messages/{msgId} {
        allow read, create: if request.auth != null &&
          request.auth.uid in get(/databases/$(database)/documents/chats/$(chatId)).data.members;
      }
    }
  }
}
```

### 3. Storage
Начать → **Rules:**
```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /avatars/{userId} {
      allow read: if true;
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024
                   && request.resource.contentType.matches('image/.*');
    }
  }
}
```

### 4. Ключи
Вставь `firebaseConfig` в `js/firebase-config.js`

### 5. Индекс (если появится ошибка)
При первом открытии списка чатов Firebase может попросить создать составной индекс.
В консоли браузера (F12) будет ссылка «Create index» — просто нажми её.

## Запуск

```bash
npx serve .
# или
python -m http.server 5500
```

Открой http://localhost:5500

## Как пользоваться

1. Войди через Google (первый = админ + 10 000 дуди)
2. Профиль → нажми на аватар → выбери фото
3. В поиске введи юзернейм друга → начни чат
4. В чате кликни по шапке → откроется его профиль
5. Админ-вкладка видна только тебе

## Дальше (Этап 3+)

- Каналы
- Подарки + рулетка
- Cloud Functions для безопасных дуди
- Картинки в сообщениях
