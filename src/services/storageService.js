import { ref, uploadString, getDownloadURL, deleteObject } from "firebase/storage";
import { storage } from "../config/firebase";

export const deleteQuestionImage = (path) =>
  deleteObject(ref(storage, path)).catch(() => {});

// Upload a drawing canvas as base64 via uploadString (avoids resumable-upload CORS preflight)
export const uploadBase64Image = async (base64) => {
  const path = `drawings/${Date.now()}-${Math.random().toString(36).slice(2)}.png`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, base64, "base64", { contentType: "image/png" });
  const url = await getDownloadURL(storageRef);
  return { url, path };
};

// Upload a reward image picked from a file input (same CORS-free base64 path)
export const uploadRewardImage = async (file) => {
  const base64 = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const path = `rewards/${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const storageRef = ref(storage, path);
  await uploadString(storageRef, base64, "base64", { contentType: file.type || "image/png" });
  const url = await getDownloadURL(storageRef);
  return { url, path };
};
