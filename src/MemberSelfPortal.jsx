import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { PersonRounded, SchoolRounded, PlaceRounded, CreditCardRounded, EmojiEventsRounded, CalendarTodayRounded, VerifiedUserRounded } from '@mui/icons-material';
import BeltBadge from './BeltBadge';
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
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState('');

  // Chỉ đọc đăng ký thi gắn với chính hồ sơ đã xác thực.
  useEffect(() => {
    const memberId = profile?.memberDocId || profile?.memberId;
    if (!memberId) { setExams([]); setExamsLoading(false); return undefined; }
    setExamsLoading(true);
    setExams([]);
    setExamsError('');
    const q = query(collection(db, 'examRegistrations'), where('memberDocId', '==', memberId));
    return onSnapshot(q, snapshot => {
      setExams(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setExamsLoading(false);
    }, err => {
      console.error('Không đọc được lịch sử thi cấp:', err);
      setExamsError(err?.code === 'permission-denied'
        ? 'Chưa có quyền đọc lịch sử thi cấp. Cần cập nhật Firestore Rules cho truy vấn của chính võ sinh.'
        : 'Không tải được lịch sử thi cấp.');
      setExamsLoading(false);
    });
  }, [profile?.memberDocId, profile?.memberId]);

  const visibleExams = useMemo(() => exams.filter(item =>
    !['Không dự thi', 'Đã hủy', 'Đã huỷ', 'Hủy', 'Huỷ'].includes(String(item.status || item.trangThai || '').trim())
  ).sort((a, b) => {
    const dateA = a.createdAt?.seconds || a.createdAt?.toMillis?.() / 1000 || 0;
    const dateB = b.createdAt?.seconds || b.createdAt?.toMillis?.() / 1000 || 0;
    return dateB - dateA || String(b.periodId || '').localeCompare(String(a.periodId || ''));
  }), [exams]);

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

  const infoItems = member ? [
    ['Mã VTF', member.maHV], ['Mã hội viên nội bộ', member.maHoiVienNoiBo],
    ['Ngày sinh', member.ngaySinh], ['Giới tính', member.gioiTinh],
    ['Điểm tập', member.diemTap], ['Loại học phí', member.loaiHocPhi],
    ['Đã thanh toán đến', member.ngayHetHan],
  ] : [];

  const content = <Box sx={{ maxWidth: 1200, mx: 'auto', width: '100%', display: 'grid', gap: 2.5 }}>
    {loading && <Paper sx={{ p: 5, textAlign: 'center', borderRadius: 3 }}><CircularProgress /></Paper>}
    {error && <Alert severity="error">{error}</Alert>}
    {member && (view === 'Xin phép nghỉ' ? (
      <Paper elevation={0} sx={{ p: { xs: 2, md: 3.5 }, borderRadius: 3, border: '1px solid #DFEBE3' }}>
        <Typography variant="h5" fontWeight={900} sx={{ mb: 2 }}>Xin phép nghỉ học</Typography>
        {leaveEnabled ? <LeaveForm member={member} profile={profile} />
          : <Alert severity="warning">Điểm tập chưa mở chức năng Xin phép nghỉ.</Alert>}
      </Paper>
    ) : <>
      <Paper elevation={0} sx={{ position: 'relative', overflow: 'hidden', borderRadius: 4, color: '#fff', border: 0,
        background: 'linear-gradient(115deg, #065C3B 0%, #088153 68%, #119668 100%)', p: { xs: 2.5, md: 4 } }}>
        <Box sx={{ position: 'absolute', right: -55, top: -95, width: 300, height: 300, borderRadius: '50%', border: '45px solid rgba(255,255,255,.07)', pointerEvents: 'none' }} />
        <Typography sx={{ fontSize: 11, fontWeight: 900, letterSpacing: 2, opacity: .8 }}>TKD GREEN • HỒ SƠ VÕ SINH</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={2.5} sx={{ mt: 2 }}>
          <Avatar sx={{ width: 66, height: 66, bgcolor: 'rgba(255,255,255,.18)', color: '#fff', fontWeight: 900, fontSize: 27, border: '2px solid rgba(255,255,255,.65)' }}>
            {String(member.hoTen || 'V').trim().slice(-1).toUpperCase()}
          </Avatar>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="h4" fontWeight={900} sx={{ fontSize: { xs: 25, md: 32 }, overflowWrap: 'anywhere' }}>{show(member.hoTen)}</Typography>
            <Typography sx={{ opacity: .9, mt: .5 }}>{show(member.diemTap)} • {show(member.maHoiVienNoiBo)}</Typography>
          </Box>
          <Chip label={show(member.trangThai)} sx={{ bgcolor: '#E7F8EE', color: '#08613F', fontWeight: 800 }} />
        </Stack>
        <Typography variant="body2" sx={{ mt: 2.5, opacity: .85 }}>Chào mừng đến với cổng thông tin võ sinh. Theo dõi hồ sơ và tiến độ tập luyện của bạn tại đây.</Typography>
      </Paper>

      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(3, minmax(0, 1fr))' }, gap: 2 }}>
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #DDEAE1' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="flex-start"><Typography color="text.secondary" fontWeight={700} variant="body2">Cấp đai hiện tại</Typography><SchoolRounded sx={{ color: '#087D4B' }} /></Stack>
          <Box sx={{ mt: 2 }}><BeltBadge level={member.capDaiDang} showName /></Box>
        </Paper>
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #DDEAE1' }}>
          <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary" fontWeight={700} variant="body2">Điểm tập</Typography><PlaceRounded sx={{ color: '#087D4B' }} /></Stack>
          <Typography sx={{ mt: 2, fontSize: 21, fontWeight: 900 }}>{show(member.diemTap)}</Typography>
        </Paper>
        <Paper elevation={0} sx={{ p: 2.5, borderRadius: 3, border: '1px solid #DDEAE1' }}>
          <Stack direction="row" justifyContent="space-between"><Typography color="text.secondary" fontWeight={700} variant="body2">Học phí đến ngày</Typography><CreditCardRounded sx={{ color: '#087D4B' }} /></Stack>
          <Typography sx={{ mt: 2, fontSize: 21, fontWeight: 900 }}>{show(member.ngayHetHan)}</Typography>
          <Typography variant="caption" color="text.secondary">Loại: {show(member.loaiHocPhi)}</Typography>
        </Paper>
      </Box>

      <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 3, border: '1px solid #DDEAE1' }}>
        <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 2.5 }}><PersonRounded sx={{ color: '#087D4B' }}/><Typography variant="h6" fontWeight={900}>Thông tin cá nhân</Typography></Stack>
        <Divider sx={{ mb: 2.5 }} />
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(3, minmax(0, 1fr))' }, gap: 2.5 }}>
          {infoItems.map(([label, value]) => <Box key={label} sx={{ p: 1.5, borderRadius: 2, bgcolor: '#F7FAF8' }}><Info label={label} value={value} /></Box>)}
        </Box>
      </Paper>

      <Paper elevation={0} sx={{ p: { xs: 2.5, md: 3 }, borderRadius: 3, border: '1px solid #DDEAE1' }}>
        <Stack direction="row" spacing={1} alignItems="center"><EmojiEventsRounded sx={{ color: '#087D4B' }}/><Typography variant="h6" fontWeight={900}>Lịch sử thi cấp</Typography></Stack>
        <Typography sx={{ mt: .5, mb: 2 }} variant="body2" color="text.secondary">Đăng ký thi cấp của chính võ sinh; các đăng ký đã hủy được ẩn.</Typography>
        {examsLoading && <CircularProgress size={24} />}
        {examsError && <Alert severity="warning">{examsError}</Alert>}
        {!examsLoading && !examsError && visibleExams.length === 0 && <Typography color="text.secondary">Chưa có đăng ký thi cấp còn hiệu lực.</Typography>}
        {!examsError && visibleExams.map(item => <Box key={item.id} sx={{ px: 2, py: 1.5, border: '1px solid #E1EAE4', borderRadius: 2, mb: 1 }}>
          <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" gap={1} alignItems={{ sm: 'center' }}>
            <Box><Typography fontWeight={800}>{show(item.dangDuThi || item.dangDuThiCap)}</Typography><Typography variant="body2" color="text.secondary">Đợt: {show(item.periodName || item.periodId)} • Kết quả: {show(item.ketQua || item.ketqua)}</Typography></Box>
            <Chip size="small" label={show(item.status || item.trangThai)} sx={{ fontWeight: 800 }} />
          </Stack>
        </Box>)}
      </Paper>
      {!leaveEnabled && <Alert severity="info" sx={{ borderRadius: 2 }}>Xin phép nghỉ sẽ xuất hiện khi điểm tập được bật chức năng và hồ sơ đã liên kết locationId hợp lệ.</Alert>}
    </>)}
  </Box>;
  if (embedded) return content;
  return <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: { xs: 2, md: 4 } }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ maxWidth: 1000, mx: 'auto', mb: 2 }}>
      <Typography variant="h5" fontWeight={800}>TKD GREEN · Hội viên</Typography>
      <GoogleLogin />
    </Stack>
    {content}
  </Box>;
}
