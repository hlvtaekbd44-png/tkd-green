
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "./firebase";

export default function useUserRole() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;

    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (!active) return;

      setUser(currentUser);
      setProfile(null);
      setError("");

      if (!currentUser) {
        setLoading(false);
        return;
      }

      setLoading(true);

      try {
        const userRef = doc(db, "users", currentUser.uid);
        const userSnap = await getDoc(userRef);

        if (!active) return;

        if (!userSnap.exists()) {
          setError("Tài khoản chưa được cấp quyền.");
          return;
        }

        const data = userSnap.data();

        if (data.active !== true) {
          setError("Tài khoản đã bị khóa hoặc chưa được kích hoạt.");
          return;
        }

        if (!["admin", "hlv"].includes(data.role)) {
          setError("Vai trò tài khoản không hợp lệ.");
          return;
        }

        setProfile({
          ...data,
          role: data.role,
          diemTap: Array.isArray(data.diemTap)
            ? data.diemTap
            : [],
        });
      } catch (err) {
        console.error("Lỗi đọc quyền người dùng:", err);
        if (active) {
          setError("Không đọc được quyền. Hãy kiểm tra kết nối Firestore.");
        }
      } finally {
        if (active) setLoading(false);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  return { user, profile, loading, error };
}
