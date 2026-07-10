import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// วาง Firebase config ที่ได้จาก Firebase Console > Project Settings > Your apps ตรงนี้
const firebaseConfig = {
  apiKey: "AIzaSyBdTtNFMZvSCs_fjmuwwjdev2chjGLLvjA",
  // Same-origin as the deployed app (Firebase Hosting serves /__/auth/* here
  // too). Keeps sign-in state first-party so iOS Safari / incognito work.
  authDomain: "bp-tutor-3db94.web.app",
  projectId: "bp-tutor-3db94",
  storageBucket: "bp-tutor-3db94.firebasestorage.app",
  messagingSenderId: "870075604106",
  appId: "1:870075604106:web:21fec3e314e513ea206173",
  measurementId: "G-747GH4VZV7",
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const db = getFirestore(app);
export const storage = getStorage(app);
