const firebaseConfig = {
  apiKey: "AIzaSyDJ_tBpJEsy-wH1CNJBkyDIsrYVUw-hgxU",
  authDomain: "dudusan-9c3f7.firebaseapp.com",
  projectId: "dudusan-9c3f7",
  storageBucket: "dudusan-9c3f7.firebasestorage.app",
  messagingSenderId: "651217497343",
  appId: "1:651217497343:web:88a66265f20e27a1bf30ca",
  measurementId: "G-3HVPKV21Y3"
};

const OWNER_UID = null;

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage();
