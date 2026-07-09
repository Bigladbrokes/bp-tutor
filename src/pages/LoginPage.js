import React, { useState } from "react";
import { signInWithGoogle } from "../services/auth";

export default function LoginPage() {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError("Sign-in failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>B &amp; P Tutor</h1>
        <p style={styles.subtitle}>Physics Exit Ticket System</p>

        <button
          style={{ ...styles.button, opacity: loading ? 0.7 : 1 }}
          onClick={handleGoogleLogin}
          disabled={loading}
        >
          <GoogleIcon />
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>

        {error && <p style={styles.error}>{error}</p>}

        <p style={styles.note}>Use your school Google account to sign in.</p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg style={styles.icon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
  },
  card: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "48px 40px",
    width: "100%",
    maxWidth: "380px",
    textAlign: "center",
    boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
  },
  title: {
    margin: "0 0 8px",
    fontSize: "32px",
    fontWeight: "700",
    color: "#0f3460",
    letterSpacing: "-0.5px",
  },
  subtitle: {
    margin: "0 0 36px",
    fontSize: "14px",
    color: "#666",
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  button: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "12px",
    width: "100%",
    padding: "12px 20px",
    border: "1px solid #ddd",
    borderRadius: "8px",
    background: "#fff",
    fontSize: "15px",
    fontWeight: "500",
    color: "#333",
    cursor: "pointer",
    transition: "box-shadow 0.2s",
  },
  icon: {
    width: "20px",
    height: "20px",
    flexShrink: 0,
  },
  error: {
    marginTop: "16px",
    color: "#d32f2f",
    fontSize: "14px",
  },
  note: {
    marginTop: "24px",
    fontSize: "12px",
    color: "#999",
  },
};
