import { signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "../config/firebase";

export const signInWithGoogle = () => signInWithPopup(auth, googleProvider);

export const logOut = () => signOut(auth);
