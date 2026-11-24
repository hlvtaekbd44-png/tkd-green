import { useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Chip, MenuItem, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Typography
} from '@mui/material';
import DownloadRounded from '@mui/icons-material/DownloadRounded';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import * as XLSX from 'xlsx';
import { db } from './firebase';

const ALL = 'Tất cả điểm tập';
const money = n => Number(n || 0).toLocaleString('vi-VN') + ' ₫';
const uniq = arr => [...new Set(arr.filter(Boolean))];

// Toàn bộ yêu cầu đọc Firestore nằm trong phạm vi những điểm tập đã được
// App.jsx cấp quyền. KHÔNG mở truy vấn toàn CLB cho HLV.
function useScopedCollection(collectionName, enabled, role, allowed, selectedLocation) {
  const [data, setData] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const key = allowed.join('\u0001');

  useEffect(() => {
    setData([]);
    setError('');
    setLoading(false);
    if (!enabled) return undefined;
    const points = key ? key.split('\u0001') : [];
    if (role !== 'admin' && points.length === 0) {
      setError('Tài khoản HLV chưa có điểm tập được phân quyền.');
      return undefined;
    }
    const queries = role === 'admin'
      ? [selectedLocation === ALL
        ? collection(db, collectionName)
        : query(collection(db, collectionName), where('diemTap', '==', selectedLocation))]
      : selectedLocation !== ALL
        ? [query(collection(db, collectionName), where('diemTap', '==', selectedLocation))]
        : Array.from({ length: Math.ceil(points.length / 30) }, (_, i) => {
            const part = points.slice(i * 30, (i + 1) * 30);
            return query(collection(db, collectionName), part.length === 1
              ? where('diemTap', '==', part[0])
              : where('diemTap', 'in', part));
          });
    if (!queries.length) return undefined;
    setLoading(true);
    const map = new Map();
    const completed = new Set();
    const unsubscribe = queries.map((q, index) => onSnapshot(q, snap => {
      map.set(index, snap.docs.map(d => ({ id: d.id, ...d.data() })));
      completed.add(index);
      const merged = new Map();
      for (const rows of map.values()) for (const row of rows) merged.set(row.id, row);
      setData([...merged.values()]);
      if (completed.size === queries.length) setLoading(false);
    }, err => {
      setError(`Không đọc được ${collectionName}: ${err.message || err.code}. Kiểm tra Firestore Rules.`);
      setLoading(false);
    }));
    return () => unsubscribe.forEach(fn => fn());
  }, [collectionName, enabled, role, key, selectedLocation]);
  return { data, error, loading };
}

function Kpi({ label, value, note }) {
  return <Paper variant="outlined" sx={{ p: 2, borderRadius: 3, flex: '1 1 180px' }}>
    <Typography variant="body2" color="text.secondary">{label}</Typography>
    <Typography variant="h5" sx={{ fontWeight: 850, my: .75 }}>{value}</Typography>
    {note && <Typography variant="caption" color="text.secondary">{note}</Typography>}
  </Paper>;
}

export default function ReportsManagementLive({
  students = [], profile, location = ALL, onLocationChange, locations = [ALL]
}) {
  const isAdmin = profile?.role === 'admin';
  const permitted = isAdmin || (profile?.role === 'hlv' && profile?.permissions?.reports?.view === true);
  const allowed = useMemo(() => uniq(locations.filter(x => x !== ALL)), [locations]);
  const canTuition = permitted && (isAdmin || profile?.permissions?.tuition?.view === true);
  const canCap = permitted && (isAdmin || profile?.permissions?.exams?.view === true);
  const canDan = permitted && (isAdmin || profile?.permissions?.dan?.view === true);
  const tuition = useScopedCollection('tuitionPayments', canTuition, profile?.role, allowed, location);
  const exams = useScopedCollection('examRegistrations', canCap || canDan, profile?.role, allowed, location);

  // students là snapshot Firestore theo quyền do App.jsx cung cấp, không tự đọc
  // collection members toàn CLB trong module Báo cáo.
  const members = useMemo(() => students.filter(m => location === ALL || m.location === location), [students, location]);
  const payments = tuition.data.filter(p => location === ALL || p.diemTap === location);
  const registrations = exams.data.filter(e => (location === ALL || e.diemTap === location) &&
    (isAdmin || ((e.examType === 'dan' || /^L\d+-\d{4}$/i.test(e.periodName || '')) ? canDan : canCap)));
  const totalReceived = payments.reduce((sum, p) => sum + (Number(p.soTien) || 0), 0);
  const passed = registrations.filter(r => ['Đạt', 'DAT', 'PASS'].includes(String(r.ketQua || r.result || '').trim())).length;
  const pending = registrations.filter(r => !String(r.ketQua || r.result || '').trim()).length;
  const byLocation = useMemo(() => {
    const names = location === ALL ? uniq([...allowed, ...members.map(m => m.location)]) : [location];
    return names.map(name => ({
      location: name,
      total: members.filter(m => m.location === name).length,
      active: members.filter(m => m.location === name && m.status === 'Đang học').length,
      paused: members.filter(m => m.location === name && m.status === 'Tạm nghỉ').length,
      quit: members.filter(m => m.location === name && m.status === 'Nghỉ học').length,
      tuition: payments.filter(p => p.diemTap === name).reduce((s, p) => s + (Number(p.soTien) || 0), 0),
      registrations: registrations.filter(r => r.diemTap === name).length
    }));
  }, [allowed, members, payments, registrations, location]);

  if (!permitted) return <Alert severity="warning">Tài khoản chưa có quyền Báo cáo. Admin cần cấp reports.view.</Alert>;

  const exportExcel = () => {
    const book = XLSX.utils.book_new();
    const summary = byLocation.map((x, i) => ({
      STT: i + 1, 'Điểm tập': x.location, 'Tổng hội viên': x.total,
      'Đang học': x.active, 'Tạm nghỉ': x.paused, 'Nghỉ học': x.quit,
      ...(canTuition && !tuition.error ? { 'Học phí đã thu': x.tuition } : {}),
      ...((canCap || canDan) && !exams.error ? { 'Đăng ký thi': x.registrations } : {})
    }));
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(summary), 'TongHop');
    XLSX.utils.book_append_sheet(book, XLSX.utils.json_to_sheet(members.map(m => ({
      'Mã nội bộ': m.maHoiVienNoiBo || '', 'Mã VTF': m.maHV || '',
      'Họ và tên': m.name || '', 'Điểm tập': m.location || '',
      'Cấp đai': m.belt || '', 'Trạng thái': m.status || '', 'Loại học phí': m.loaiHocPhi || ''
    }))), 'HoiVien');
    if (canTuition && !tuition.error) XLSX.utils.book_append_sheet(book,
      XLSX.utils.json_to_sheet(payments.map(p => ({ 'Ngày thu': p.ngayThu || '', 'Mã VTF': p.maHV || '',
        'Họ tên': p.hoTen || '', 'Điểm tập': p.diemTap || '', 'Số tiền': Number(p.soTien) || 0 }))), 'HocPhi');
    if ((canCap || canDan) && !exams.error) XLSX.utils.book_append_sheet(book,
      XLSX.utils.json_to_sheet(registrations.map(r => ({ 'Mã VTF': r.maHV || '', 'Điểm tập': r.diemTap || '',
        'Đẳng dự thi': r.dangDuThi || '', 'Kết quả': r.ketQua || '', 'Loại thi': r.examType || '' }))), 'KetQuaThi');
    const safe = (location === ALL ? 'TatCa' : location).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]/g, '_');
    XLSX.writeFile(book, `TKD_GREEN_BAO_CAO_${safe}.xlsx`);
  };

  return <Stack spacing={2.25} sx={{ py: 2 }}>
    <Stack direction={{ xs: 'column', md: 'row' }} justifyContent="space-between" alignItems={{ md: 'center' }} gap={2}>
      <Box><Typography variant="h5" fontWeight={850}>Báo cáo hoạt động CLB</Typography>
        <Typography color="text.secondary" variant="body2">Dữ liệu trực tiếp từ hội viên, thu học phí và đăng ký thi được phân quyền</Typography></Box>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField select size="small" label="Điểm tập" value={locations.includes(location) ? location : ALL}
          onChange={e => onLocationChange?.(e.target.value)} sx={{ minWidth: 190 }}>
          {locations.map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
        </TextField>
        <Button startIcon={<DownloadRounded />} variant="contained" onClick={exportExcel}>Xuất báo cáo Excel</Button>
      </Stack>
    </Stack>
    {canTuition && tuition.error && <Alert severity="warning">{tuition.error} Số liệu học phí không được hiển thị.</Alert>}
    {(canCap || canDan) && exams.error && <Alert severity="warning">{exams.error} Số liệu thi không được hiển thị.</Alert>}
    {tuition.loading || exams.loading ? <Alert severity="info">Đang đồng bộ báo cáo từ Firebase...</Alert> : null}
    <Stack direction="row" gap={1.5} useFlexGap flexWrap="wrap">
      <Kpi label="Tổng hội viên" value={members.length.toLocaleString('vi-VN')} />
      <Kpi label="Đang học" value={members.filter(m => m.status === 'Đang học').length.toLocaleString('vi-VN')} />
      {canTuition && !tuition.error && <Kpi label="Học phí đã thu" value={money(totalReceived)} note="Theo toàn bộ phiếu thu đang tải, không giới hạn kỳ" />}
      {(canCap || canDan) && !exams.error && <Kpi label="Đăng ký thi" value={registrations.length.toLocaleString('vi-VN')} note={`${passed} đạt · ${pending} chưa có kết quả`} />}
    </Stack>
    {!canTuition && <Alert severity="info">Tài khoản không có quyền xem học phí, báo cáo không tải dữ liệu tài chính.</Alert>}
    {!canCap && !canDan && <Alert severity="info">Tài khoản không có quyền Thi cấp/Thi đẳng, báo cáo không tải dữ liệu thi.</Alert>}
    <Paper variant="outlined" sx={{ borderRadius: 3, overflow: 'hidden' }}>
      <TableContainer><Table size="small"><TableHead><TableRow>
        {['Điểm tập','Tổng hội viên','Đang học','Tạm nghỉ','Nghỉ học',...(canTuition && !tuition.error ? ['Đã thu'] : []),...((canCap || canDan) && !exams.error ? ['Đăng ký thi'] : [])].map(h => <TableCell key={h}>{h}</TableCell>)}
      </TableRow></TableHead><TableBody>{byLocation.map(r => <TableRow key={r.location} hover>
        <TableCell><Typography fontWeight={750}>{r.location}</Typography></TableCell>
        <TableCell>{r.total}</TableCell><TableCell>{r.active}</TableCell><TableCell>{r.paused}</TableCell><TableCell>{r.quit}</TableCell>
        {canTuition && !tuition.error && <TableCell>{money(r.tuition)}</TableCell>}
        {(canCap || canDan) && !exams.error && <TableCell>{r.registrations}</TableCell>}
      </TableRow>)}</TableBody></Table></TableContainer>
    </Paper>
    <Typography color="text.secondary" variant="caption">Báo cáo tổng hợp dữ liệu hiện có, không tự tính công nợ theo kỳ hoặc phí phải thu. Quyền truy cập phải được bảo vệ thêm bởi Firestore Security Rules.</Typography>
  </Stack>;
}
