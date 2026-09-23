// ============================================
//  FIREBASE CONFIG — вставь свои ключи сюда
// ============================================
//
// Как получить:
// 1. Зайди на https://console.firebase.google.com
// 2. Создай проект (например "dudusan")
// 3. Добавь веб-приложение
// 4. Скопируй firebaseConfig и вставь ниже
// 5. В Authentication → Sign-in method включи Google
// 6. В Firestore создай базу (production mode, потом правила)
//
// ============================================

// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyDJ_tBpJEsy-wH1CNJBkyDIsrYVUw-hgxU",
  authDomain: "dudusan-9c3f7.firebaseapp.com",
  projectId: "dudusan-9c3f7",
  storageBucket: "dudusan-9c3f7.firebasestorage.app",
  messagingSenderId: "651217497343",
  appId: "1:651217497343:web:88a66265f20e27a1bf30ca",
  measurementId: "G-3HVPKV21Y3"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Твой Google UID станет супер-админом автоматически
// (первый, кто войдёт, или укажи вручную после первого входа)
const OWNER_UID = null; // например: "abc123xyz..." — оставь null, чтобы первый вошедший стал админом

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
