
import { useEffect, useState } from "react";
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from "firebase/auth";
import { auth } from "./firebase";

export default function GoogleLogin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoading(false);
    });

    return unsubscribe;
  }, []);

  async function handleLogin() {
    setError("");

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Google login error:", err);
      setError(
        err.code === "auth/popup-blocked"
          ? "Trình duyệt đã chặn cửa sổ đăng nhập. Hãy cho phép cửa sổ bật lên."
          : err.message || "Đăng nhập thất bại."
      );
    }
  }

  async function handleLogout() {
    setError("");

    try {
      await signOut(auth);
    } catch (err) {
      console.error(err);
      setError("Đăng xuất thất bại. Vui lòng thử lại.");
    }
  }

  if (loading) {
    return <span>Đang kiểm tra đăng nhập...</span>;
  }

  if (user) {
    return (
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {user.photoURL && (
          <img
            src={user.photoURL}
            alt="Ảnh đại diện"
            referrerPolicy="no-referrer"
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
            }}
          />
        )}

        <div>
          <div>{user.displayName || "Người dùng Google"}</div>
          <small>{user.email}</small>
        </div>

        <button onClick={handleLogout}>Đăng xuất</button>
        {error && <p role="alert">{error}</p>}
      </div>
    );
  }

  return (
    <div>
      <button onClick={handleLogin}>
        Đăng nhập bằng Google
      </button>

      {error && (
        <p role="alert" style={{ color: "red" }}>
          {error}
        </p>
      )}
    </div>
  );
}
