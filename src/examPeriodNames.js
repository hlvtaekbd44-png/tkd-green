import { useEffect, useMemo, useState } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// examRegistrations.periodId là Firestore document ID; mã hiển thị nằm tại examPeriods/{periodId}.name.
// Chỉ tải các đợt thực sự có trong đăng ký của hội viên, không tải toàn bộ danh sách đợt thi.
const isHumanCode = text => /^(?:Q[1-4]|L[1-9]\d*)-\d{4}$/i.test(String(text || '').trim());

export function useExamPeriodNames(registrations = [], active = true) {
  const ids = useMemo(() => [...new Set(registrations.map(item => item.periodId).filter(v => typeof v === 'string' && v.trim()))].sort(), [registrations]);
  const signature = ids.join('\u001f');
  const [state, setState] = useState({ names: {}, missing: [], failed: [], loading: false });

  useEffect(() => {
    if (!active || !ids.length) {
      setState({ names: {}, missing: [], failed: [], loading: false });
      return undefined;
    }
    let cancelled = false;
    setState({ names: {}, missing: [], failed: [], loading: true });
    // Promise.allSettled: lỗi ở một đợt không làm mất tên những đợt khác.
    Promise.allSettled(ids.map(async id => {
      const snap = await getDoc(doc(db, 'examPeriods', id));
      return { id, name: snap.exists() ? String(snap.data().name || snap.data().periodName || '').trim() : '' };
    })).then(results => {
      if (cancelled) return;
      const names = {}, missing = [], failed = [];
      results.forEach((result, index) => {
        const id = ids[index];
        if (result.status === 'fulfilled') {
          if (result.value.name) names[id] = result.value.name;
          else missing.push(id);
        } else failed.push(id);
      });
      setState({ names, missing, failed, loading: false });
    });
    return () => { cancelled = true; };
    // `signature` phản ánh các ID đợt thay đổi; tránh truy vấn lại khi chỉ đổi kết quả/phiếu thu.
  }, [signature, active]);

  return state;
}

export function examPeriodLabel(registration, state) {
  const id = String(registration?.periodId || '').trim();
  const existing = String(registration?.periodName || '').trim();
  if (id && state.names[id]) return state.names[id];
  if (existing && (existing !== id || isHumanCode(existing))) return existing;
  // Dữ liệu cũ đôi khi lưu mã đợt trực tiếp vào periodId.
  if (isHumanCode(id)) return id;
  if (state.loading) return 'Đang tải tên đợt thi…';
  if (state.failed.includes(id)) return 'Không đọc được tên đợt thi';
  return 'Đợt thi chưa có tên / đã xóa';
}
