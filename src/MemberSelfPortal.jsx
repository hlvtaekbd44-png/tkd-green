import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { db, auth } from './firebase';
import GoogleLogin from './GoogleLogin';

const show = (v) => v === null || v === undefined || v === '' ? 'Chưa cập nhật' : String(v);
const dateISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
function Info({ label, value }) {
  return <Box><Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography fontWeight={600}>{show(value)}</Typography></Box>;
}

function LeaveForm({ member, profile }) {
  const [from, setFrom] = useState(dateISO());
  const [to, setTo] = useState(dateISO());
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [requests, setRequests] = useState([]);
  const [historyError, setHistoryError] = useState('');

  useEffect(() => {
    if (!profile?.memberDocId) return undefined;
    return onSnapshot(query(collection(db, 'leaveRequests'), where('memberDocId', '==', profile.memberDocId)),
      snapshot => { setRequests(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))); setHistoryError(''); },
      () => setHistoryError('Không tải được lịch sử xin nghỉ. Kiểm tra quyền Firestore.'));
  }, [profile?.memberDocId]);

  const ordered = useMemo(() => [...requests].sort((a, b) => {
    const aTime = a.createdAt?.seconds || 0, bTime = b.createdAt?.seconds || 0;
    return bTime - aTime || (b.tuNgay || '').localeCompare(a.tuNgay || '');
  }), [requests]);

  const submit = async (event) => {
    event.preventDefault();
    setError(''); setMessage('');
    if (!member || !member.locationId || !profile?.memberDocId) {
      setError('Hồ sơ chưa liên kết mã điểm tập (locationId). Liên hệ Admin.'); return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
      setError('Khoảng ngày xin nghỉ không hợp lệ.'); return;
    }
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 500) { setError('Lý do phải có từ 1 đến 500 ký tự.'); return; }
    if (!auth.currentUser || auth.currentUser.uid !== profile.uid) { setError('Phiên đăng nhập không hợp lệ.'); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, 'leaveRequests'), {
        memberDocId: profile.memberDocId,
        diemTap: member.diemTap,
        locationId: member.locationId,
        tuNgay: from,
        denNgay: to,
        lyDo: trimmed,
        trangThai: 'Chờ duyệt',
        createdBy: auth.currentUser.uid,
        createdAt: serverTimestamp(),
      });
      setReason('');
      setMessage('Đã gửi đơn xin nghỉ; đang chờ HLV/Admin duyệt.');
    } catch (err) {
      console.error('Lỗi gửi đơn xin nghỉ:', err);
      setError(err?.code === 'permission-denied'
        ? 'Firestore chưa cho phép gửi đơn. Kiểm tra Rules, locationId và chức năng Xin phép nghỉ của điểm tập.'
        : `Không gửi được đơn: ${err?.message || 'Lỗi không xác định'}`);
    } finally { setBusy(false); }
  };

  return <Stack spacing={2}>
    <Alert severity="info">Đơn xin nghỉ chỉ được gửi cho điểm tập hiện tại. HLV/Admin sẽ xem xét và duyệt.</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    {message && <Alert severity="success">{message}</Alert>}
    <Box component="form" onSubmit={submit}><Stack spacing={2}>
      <TextField label="Từ ngày" type="date" value={from} onChange={e => setFrom(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }} required disabled={busy} />
      <TextField label="Đến ngày" type="date" value={to} onChange={e => setTo(e.target.value)}
        slotProps={{ inputLabel: { shrink: true } }} required disabled={busy} />
      <TextField label="Lý do xin nghỉ" value={reason} onChange={e => setReason(e.target.value)}
        inputProps={{ maxLength: 500 }} multiline minRows={3} required disabled={busy} />
      <Button type="submit" variant="contained" disabled={busy || !reason.trim()}>
        {busy ? 'Đang gửi...' : 'Gửi đơn xin phép nghỉ'}
      </Button>
    </Stack></Box>
    <Divider />
    <Typography fontWeight={800}>Lịch sử đơn xin nghỉ</Typography>
    {historyError && <Alert severity="warning">{historyError}</Alert>}
    {!ordered.length && <Typography color="text.secondary">Chưa có đơn xin nghỉ.</Typography>}
    {ordered.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Typography fontWeight={700}>{item.tuNgay} → {item.denNgay}</Typography>
        <Chip size="small" label={item.trangThai || 'Chờ duyệt'} />
      </Stack>
      <Typography sx={{ mt: 1 }}>{item.lyDo}</Typography>
    </Paper>)}
  </Stack>;
}

export default function MemberSelfPortal({ profile, embedded = false, view = 'Hội viên', leaveEnabled = false }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    const memberId = profile?.memberDocId || profile?.memberId;
    if (!memberId) { setLoading(false); setError('Tài khoản chưa liên kết hồ sơ.'); return undefined; }
    setLoading(true); setMember(null); setError('');
    return onSnapshot(doc(db, 'members', memberId), snap => {
      if (!snap.exists()) { setError('Không tìm thấy hồ sơ đã liên kết.'); setMember(null); }
      else { setMember({ id: snap.id, ...snap.data() }); setError(''); }
      setLoading(false);
    }, e => { console.error(e); setError('Không có quyền đọc hồ sơ cá nhân. Kiểm tra Firestore Rules.'); setLoading(false); });
  }, [profile?.memberDocId, profile?.memberId]);

  const content = <Paper sx={{ maxWidth: 1000, mx: 'auto', p: { xs: 2, md: 3 }, borderRadius: 3 }}>
    {loading && <CircularProgress />}
    {error && <Alert severity="error">{error}</Alert>}
    {member && (view === 'Xin phép nghỉ' ? (
      leaveEnabled ? <LeaveForm member={member} profile={profile} />
        : <Alert severity="warning">Điểm tập chưa mở chức năng Xin phép nghỉ.</Alert>
    ) : <Stack spacing={3}>
      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap">
        <Typography variant="h6" fontWeight={800}>{show(member.hoTen)}</Typography>
        <Chip label={show(member.trangThai)} size="small" />
      </Stack>
      <Typography color="text.secondary">Tài khoản chỉ có quyền xem hồ sơ của mình.</Typography>
      <Divider />
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 2 }}>
        <Info label="Mã VTF" value={member.maHV} />
        <Info label="Mã nội bộ" value={member.maHoiVienNoiBo} />
        <Info label="Ngày sinh" value={member.ngaySinh} />
        <Info label="Giới tính" value={member.gioiTinh} />
        <Info label="Điểm tập" value={member.diemTap} />
        <Info label="Cấp đai" value={member.capDaiDang} />
        <Info label="Loại học phí" value={member.loaiHocPhi} />
        <Info label="Đã thanh toán đến" value={member.ngayHetHan} />
      </Box>
      {!leaveEnabled && <Alert severity="info">Xin phép nghỉ chỉ xuất hiện khi Admin bật tại điểm tập và hồ sơ có liên kết locationId hợp lệ.</Alert>}
    </Stack>)}
  </Paper>;

  if (embedded) return content;
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: { xs: 2, md: 4 } }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ maxWidth: 1000, mx: 'auto', mb: 2 }}>
      <Typography variant="h5" fontWeight={800}>TKD GREEN · Hội viên</Typography>
      <GoogleLogin />
    </Stack>
    {content}
  </Box>;
}
