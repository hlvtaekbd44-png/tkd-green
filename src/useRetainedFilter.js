import { useEffect, useRef, useState } from 'react';

// Lưu trạng thái lọc trong tab hiện tại; không gửi dữ liệu lên Firebase.
function readValue(key, fallback) {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (raw === null) return fallback;
    const value = JSON.parse(raw);
    return typeof value === typeof fallback ? value : fallback;
  } catch { return fallback; }
}

export default function useRetainedFilter(key, initialValue) {
  const [value, setValue] = useState(() => readValue(key, initialValue));
  const activeKey = useRef(key);

  useEffect(() => {
    // Chuyển tài khoản: tải bộ lọc riêng thay vì dùng lại bộ lọc tài khoản trước.
    if (activeKey.current !== key) {
      activeKey.current = key;
      setValue(readValue(key, initialValue));
      return;
    }
    try { window.sessionStorage.setItem(key, JSON.stringify(value)); }
    catch { /* Tab riêng tư hoặc bộ nhớ bị hạn chế: tiếp tục chạy bình thường. */ }
  }, [key, value, initialValue]);

  return [value, setValue];
}
