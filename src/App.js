import React, { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./config/firebase";
import { ensureUserDoc } from "./services/tokens";
import LoginPage from "./pages/LoginPage";
import TeacherPage from "./pages/TeacherPage";
import StudentPage from "./pages/StudentPage";

// Bootstrap only: decides the role written to a brand-new /students doc on
// first login, and must match isTeacher() in firestore.rules / storage.rules.
// Routing itself follows the doc's role field, not this constant.
const TEACHER_EMAIL = "bigladbrokes1@gmail.com";

function App() {
  const [user, setUser] = useState(undefined); // undefined = still loading
  const [role, setRole] = useState(null);      // null = profile not loaded yet

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser ?? null);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      setRole(null);
      return;
    }
    let cancelled = false;
    ensureUserDoc(user, user.email === TEACHER_EMAIL ? "teacher" : "student")
      .then((profile) => {
        if (!cancelled) setRole(profile.role ?? "student");
      })
      .catch((err) => {
        // Leave role null — the email fallback below keeps routing working,
        // so a Firestore hiccup can't lock the teacher out of the dashboard.
        console.error("Could not load user profile:", err);
      });
    return () => { cancelled = true; };
  }, [user]);

  if (user === undefined) {
    return <LoadingScreen />;
  }

  if (!user) {
    return <LoginPage />;
  }

  // Route immediately using the email check while the profile doc is still
  // loading; the doc's role field takes over as soon as it arrives.
  const effectiveRole = role ?? (user.email === TEACHER_EMAIL ? "teacher" : "student");

  if (effectiveRole === "teacher") {
    return <TeacherPage user={user} />;
  }

  return <StudentPage user={user} />;
}

function LoadingScreen() {
  return (
    <div style={styles.loading}>
      <p>Loading...</p>
    </div>
  );
}

const styles = {
  loading: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#1a1a2e",
    color: "#fff",
    fontSize: "18px",
  },
};

export default App;
