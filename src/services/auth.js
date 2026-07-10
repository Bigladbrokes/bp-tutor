import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut } from "firebase/auth";
import { auth, googleProvider } from "../config/firebase";

// Popup first — it works reliably on iOS Safari and storage-partitioned
// browsers (incognito), where the redirect flow can lose its state.
// Fall back to redirect only when the browser blocked the popup.
export const signInWithGoogle = async () => {
  try {
    return await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (err?.code === "auth/popup-blocked" || err?.code === "auth/cancelled-popup-request") {
      return signInWithRedirect(auth, googleProvider);
    }
    throw err;
  }
};

// Surfaces errors after a redirect-fallback round trip (resolves null when
// there is no pending redirect).
export const consumeRedirectResult = () => getRedirectResult(auth);

export const logOut = () => signOut(auth);
