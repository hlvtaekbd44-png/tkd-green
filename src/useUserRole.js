
import { useEffect, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "./firebase";

export default function useUserRole() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    let unsubscribeProfile = null;

    const unsubscribeAuth = onAuthStateChanged(
      auth,
      (currentUser) => {
        if (unsubscribeProfile) {
          unsubscribeProfile();
          unsubscribeProfile = null;
        }

        if (!active) return;

        setUser(currentUser);
        setProfile(null);
        setError("");

        if (!currentUser) {
          setLoading(false);
          return;
        }

        setLoading(true);

        const userRef = doc(
          db,
          "users",
          currentUser.uid
        );

        unsubscribeProfile = onSnapshot(
          userRef,
          (snapshot) => {
            if (!active) return;

            if (!snapshot.exists()) {
              setProfile(null);
              setError(
                "Tài khoản chưa được cấp quyền."
              );
              setLoading(false);
              return;
            }

            const data = snapshot.data();

            if (data.active !== true) {
              setProfile(null);
              setError(
                "Tài khoản đã bị khóa hoặc chưa kích hoạt."
              );
              setLoading(false);
              return;
            }

            if (
              !["admin", "hlv", "member"].includes(
                data.role
              )
            ) {
              setProfile(null);
              setError(
                "Vai trò tài khoản không hợp lệ."
              );
              setLoading(false);
              return;
            }

            if (
              data.role === "member" &&
              !data.memberId
            ) {
              setProfile(null);
              setError(
                "Tài khoản hội viên chưa liên kết hồ sơ."
              );
              setLoading(false);
              return;
            }

            setProfile({
              ...data,
              uid: currentUser.uid,
              role: data.role,

              // Giữ tương thích với App.jsx cũ.
              diemTap: Array.isArray(data.diemTap)
                ? data.diemTap
                : [],

              permissions:
                data.permissions || {},

              locationPermissions:
                data.locationPermissions || {},
            });

            setError("");
            setLoading(false);
          },
          (err) => {
            console.error(
              "Lỗi đọc quyền người dùng:",
              err
            );

            if (!active) return;

            setProfile(null);
            setError(
              "Không đọc được quyền tài khoản."
            );
            setLoading(false);
          }
        );
      }
    );

    return () => {
      active = false;

      if (unsubscribeProfile) {
        unsubscribeProfile();
      }

      unsubscribeAuth();
    };
  }, []);

  return {
    user,
    profile,
    loading,
    error,
  };
}
