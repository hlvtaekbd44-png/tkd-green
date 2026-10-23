import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, onSnapshot } from 'firebase/firestore';
import { auth, db } from './firebase';

export default function useUserRole() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let current = true;
    let stopProfile = null;
    const stopAuth = onAuthStateChanged(auth, (authUser) => {
      stopProfile?.();
      stopProfile = null;
      if (!current) return;
      setUser(authUser);
      setProfile(null);
      setError('');
      if (!authUser) { setLoading(false); return; }
      setLoading(true);
      stopProfile = onSnapshot(doc(db, 'users', authUser.uid), (snapshot) => {
        if (!current) return;
        if (!snapshot.exists()) {
          setProfile(null); setError('Tài khoản chưa được cấp quyền.'); setLoading(false); return;
        }
        const data = snapshot.data();
        if (data.active !== true) {
          setProfile(null); setError('Tài khoản đã bị khóa hoặc chưa kích hoạt.'); setLoading(false); return;
        }
        if (!['admin','hlv','member'].includes(data.role)) {
          setProfile(null); setError('Vai trò tài khoản không hợp lệ.'); setLoading(false); return;
        }
        // Không dùng mã VTF hoặc mã nội bộ làm ID truy cập hồ sơ.
        // memberDocId là Firestore document ID được Admin liên kết sau khi xác minh.
        const memberDocId = data.memberDocId || data.memberId;
        if (data.role === 'member' && (typeof memberDocId !== 'string' || !memberDocId.trim())) {
          setProfile(null); setError('Tài khoản võ sinh chưa liên kết hồ sơ.'); setLoading(false); return;
        }
        setProfile({
          ...data,
          uid: authUser.uid,
          memberDocId: data.role === 'member' ? memberDocId.trim() : undefined,
          diemTap: Array.isArray(data.diemTap) ? data.diemTap : [],
          permissions: data.permissions || {},
          locationPermissions: data.locationPermissions || {},
        });
        setError(''); setLoading(false);
      }, (err) => {
        if (!current) return;
        console.error('Lỗi đọc hồ sơ tài khoản', err);
        setProfile(null); setError('Không đọc được quyền tài khoản.'); setLoading(false);
      });
    });
    return () => { current = false; stopProfile?.(); stopAuth(); };
  }, []);
  return { user, profile, loading, error };
}
