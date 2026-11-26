import { useEffect, useState } from 'react';
import { collection, getDocs } from 'firebase/firestore';
import { Alert, Box, CircularProgress, Divider, Stack, Typography, Chip } from '@mui/material';
import { db } from './firebase';

const labels = {
  hoTen: 'Họ và tên', ngaySinh: 'Ngày sinh', gioiTinh: 'Giới tính',
  trinhDoVanHoa: 'Trình độ văn hóa', soDienThoaiPhuHuynh: 'SĐT phụ huynh',
  loaiHocPhi: 'Loại học phí', ngayBatDau: 'Ngày bắt đầu tập',
  capDaiDang: 'Cấp đai/đẳng', trangThai: 'Trạng thái hội viên',
  maHV: 'Mã hội viên VTF',
};
function show(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object' && typeof value.toDate === 'function') return value.toDate().toLocaleString('vi-VN');
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
}
export default function MemberEditHistory({ memberId }) {
  const [items, setItems] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!memberId) return;
    let alive = true;
    setBusy(true);
    setError('');
    getDocs(collection(db, 'members', memberId, 'editHistory')).then(snap => {
      if (!alive) return;
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      rows.sort((a,b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
      setItems(rows);
    }).catch(e => { if (alive) setError(e.message || 'Không tải được lịch sử.'); })
      .finally(() => { if (alive) setBusy(false); });
    return () => { alive = false; };
  }, [memberId]);
  return <Stack spacing={2}>
    <Alert severity="info">Nhật ký từ thời điểm kích hoạt chức năng. Mỗi lần sửa lưu người thực hiện, thời gian và giá trị trước/sau. Không thể sửa hoặc xóa nhật ký.</Alert>
    {busy && <CircularProgress size={22} />}
    {error && <Alert severity="warning">{error}</Alert>}
    {!busy && !error && items.length === 0 && <Typography color="text.secondary">Chưa có lần chỉnh sửa nào được ghi nhận.</Typography>}
    {items.map(item => <Box key={item.id} sx={{p:2, border:'1px solid', borderColor:'divider', borderRadius:2, overflowWrap:'anywhere'}}>
      <Stack direction="row" spacing={1} flexWrap="wrap" alignItems="center" sx={{mb:1}}>
        <Chip size="small" label={item.actorRole === 'admin' ? 'Admin' : 'HLV'}/>
        <Typography variant="body2" fontWeight={700}>{item.actorEmail || item.actorUid}</Typography>
        <Typography variant="caption" color="text.secondary">{item.createdAt?.toDate?.()?.toLocaleString('vi-VN') || 'Đang đồng bộ'}</Typography>
      </Stack>
      {(item.changeKeys || []).map(field => <Box key={field} sx={{py:.6}}>
        <Typography variant="body2" fontWeight={700}>{labels[field] || field}</Typography>
        <Typography variant="body2" color="text.secondary">{show(item.before?.[field])} → {show(item.after?.[field])}</Typography>
      </Box>)}
      <Divider sx={{mt:1}}/>
    </Box>)}
  </Stack>;
}
