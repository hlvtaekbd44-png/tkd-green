import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, collectionGroup, doc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { db, auth } from './firebase';
import GoogleLogin from './GoogleLogin';
const show = v => v === null || v === undefined || v === '' ? 'Chưa cập nhật' : String(v);
const dateISO = () => { const d=new Date(); return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`; };
function Info({ label, value }) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={600}>{show(value)}</Typography></Box>; }
const money = value => `${Number(value || 0).toLocaleString('vi-VN')} đ`;
const cancelled = item => ['Không dự thi', 'Đã hủy', 'Đã huỷ', 'Hủy', 'Huỷ'].includes(String(item.status || item.trangThai || '').trim());
const dateSort = (a,b) => (b.createdAt?.seconds || 0)-(a.createdAt?.seconds || 0);
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
  const memberId = profile?.memberDocId || profile?.memberId;
  const [member,setMember] = useState(null);
  const [error,setError] = useState('');
  const [exams,setExams] = useState([]);
  const [payments,setPayments] = useState([]);
  const [attendance,setAttendance] = useState([]);
  const [examsError,setExamsError] = useState('');
  const [paymentsError,setPaymentsError] = useState('');
  const [attendanceError,setAttendanceError] = useState('');
  useEffect(() => {
    setMember(null); setError('');
    if (!memberId) { setError('Chưa liên kết hồ sơ.'); return; }
    return onSnapshot(doc(db,'members',memberId),snap => {
      setMember(snap.exists() ? {id:snap.id,...snap.data()} : null);
      if (!snap.exists()) setError('Không tìm thấy hồ sơ.');
    }, () => setError('Không có quyền xem hồ sơ cá nhân.'));
  },[memberId]);
  // Không tải tập dữ liệu toàn CLB: luôn truy vấn theo ID của tài khoản đã xác thực.
  useEffect(() => {
    if (!memberId || !['Thi cấp','Báo cáo'].includes(view)) return;
    setExams([]); setExamsError('');
    return onSnapshot(query(collection(db,'examRegistrations'),where('memberDocId','==',memberId)),snap => {
      setExams(snap.docs.map(d=>({id:d.id,...d.data()})));
    },() => setExamsError('Chưa đọc được lịch sử thi cấp. Kiểm tra Firestore Rules và memberDocId.'));
  },[memberId,view]);
  useEffect(() => {
    if (!memberId || !['Học phí','Báo cáo'].includes(view)) return;
    setPayments([]); setPaymentsError('');
    return onSnapshot(query(collection(db,'tuitionPayments'),where('memberId','==',memberId)),snap => {
      setPayments(snap.docs.map(d=>({id:d.id,...d.data()})));
    },() => setPaymentsError('Chưa đọc được lịch sử thu học phí. Kiểm tra Firestore Rules và memberId của giao dịch.'));
  },[memberId,view]);
  useEffect(() => {
    if (!memberId || !['Điểm danh','Báo cáo'].includes(view)) return;
    setAttendance([]); setAttendanceError('');
    // Records nằm ở attendanceSessions/{sessionId}/records/{memberId}.
    // Truy vấn collection group chỉ lấy bản ghi có memberId của chính tài khoản.
    return onSnapshot(query(collectionGroup(db,'records'),where('memberId','==',memberId)),snap => {
      setAttendance(snap.docs.map(d=>({id:d.id,sessionId:d.ref.parent.parent?.id || '',...d.data()})));
    },() => setAttendanceError('Chưa đọc được lịch sử điểm danh. Cần bổ sung quyền collection-group records và có thể cần chỉ mục Firestore.'));
  },[memberId,view]);
  const examsShown = useMemo(()=>exams.filter(x=>!cancelled(x)).sort(dateSort),[exams]);
  const paymentsShown = useMemo(()=>[...payments].sort(dateSort),[payments]);
  const attendanceShown = useMemo(()=>[...attendance].sort((a,b)=>String(b.sessionId).localeCompare(String(a.sessionId))),[attendance]);
  const cycles = Array.isArray(member?.lichSuChuKy) ? member.lichSuChuKy : [];
  const cycleDebt = cycles.reduce((s,c)=>s+Math.max(0,Number(c.conNo)||0),0);
  const content = <Paper sx={{maxWidth:1000,mx:'auto',p:{xs:2,md:3},borderRadius:3}}>
    {error && <Alert severity="error">{error}</Alert>}
    {!member && !error && <CircularProgress/>}
    {member && (view==='Hội viên' ? <Stack spacing={2}>
      <Stack direction="row" alignItems="center" gap={2}><Typography variant="h6" fontWeight={800}>{show(member.hoTen)}</Typography><Chip size="small" label={show(member.trangThai)}/></Stack>
      <Typography color="text.secondary">Thông tin cá nhân của tôi</Typography><Divider/>
      <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:2}}>
        <Info label="Mã VTF" value={member.maHV}/><Info label="Mã nội bộ" value={member.maHoiVienNoiBo}/>
        <Info label="Ngày sinh" value={member.ngaySinh}/><Info label="Giới tính" value={member.gioiTinh}/>
        <Info label="Điểm tập" value={member.diemTap}/><Info label="Cấp đai" value={member.capDaiDang}/>
        <Info label="Loại học phí" value={member.loaiHocPhi}/><Info label="Đã thanh toán đến" value={member.ngayHetHan}/>
      </Box>
    </Stack> : view==='Thi cấp' ? <Stack spacing={2}>
      <Typography variant="h6">Lịch sử thi cấp của tôi</Typography>
      {examsError && <Alert severity="warning">{examsError}</Alert>}
      {!examsShown.length && !examsError && <Typography>Chưa có đăng ký còn hiệu lực.</Typography>}
      {examsShown.map(x=><Paper key={x.id} variant="outlined" sx={{p:2}}><Typography fontWeight={700}>{show(x.dangDuThi||x.dangDuThiCap)}</Typography>
        <Typography>Mã đợt thi: {show(x.periodName||x.periodId)}</Typography><Typography>Kết quả: {show(x.ketQua||x.ketqua)}</Typography><Chip size="small" label={show(x.status||x.trangThai)}/></Paper>)}
    </Stack> : view==='Học phí' ? <Stack spacing={2}>
      <Typography variant="h6">Học phí của tôi</Typography>
      <Info label="Hạn đã thanh toán" value={member.ngayHetHan}/>
      <Info label="Công nợ kỳ đã ghi nhận (lichSuChuKy)" value={money(cycleDebt)}/>
      <Typography variant="caption" color="text.secondary">Số nợ trên chỉ gồm các kỳ đã được lưu; không tự cộng các kỳ chưa lập hoặc lệ phí thi.</Typography>
      <Divider/><Typography fontWeight={700}>Lịch sử thu học phí</Typography>
      {paymentsError && <Alert severity="warning">{paymentsError}</Alert>}
      {!paymentsShown.length && !paymentsError && <Typography>Chưa có giao dịch thu học phí.</Typography>}
      {paymentsShown.map(x=><Paper key={x.id} variant="outlined" sx={{p:2}}>
        <Typography fontWeight={700}>{money(x.soTienThucThu ?? x.soTien ?? x.amount ?? 0)}</Typography>
        <Typography variant="body2">{show(x.loaiHocPhi||x.loaiHP)} · {show(x.ngayThu)}</Typography>
      </Paper>)}
    </Stack> : view==='Điểm danh' ? <Stack spacing={2}>
      <Typography variant="h6">Lịch sử điểm danh của tôi</Typography>
      {attendanceError && <Alert severity="warning">{attendanceError}</Alert>}
      {!attendanceShown.length && !attendanceError && <Typography>Chưa có bản ghi điểm danh.</Typography>}
      {attendanceShown.map(x=><Paper key={x.id+'-'+x.sessionId} variant="outlined" sx={{p:2}}>
        <Typography fontWeight={700}>{show(x.trangThai)}</Typography><Typography variant="body2">Buổi: {show(x.sessionId)} · {show(x.ghiChu)}</Typography>
      </Paper>)}
    </Stack> : view==='Báo cáo' ? <Stack spacing={2}>
      <Typography variant="h6">Thống kê cá nhân</Typography>
      <Info label="Số đăng ký thi còn hiệu lực" value={examsShown.length}/><Info label="Số giao dịch học phí" value={paymentsShown.length}/>
      <Info label="Số buổi có mặt đã ghi nhận" value={attendanceShown.filter(x=>x.trangThai==='Có mặt').length}/>
      <Info label="Nợ kỳ học phí đã ghi nhận" value={money(cycleDebt)}/>
      {(examsError||paymentsError||attendanceError) && <Alert severity="warning">Một số số liệu chưa tải được đầy đủ. Hãy kiểm tra quyền và chỉ mục Firestore.</Alert>}
    </Stack> : view==='Xin phép nghỉ' ? (leaveEnabled
      ? <LeaveForm member={member} profile={profile}/>
      : <Alert severity="warning">Xin phép nghỉ chưa được bật hoặc chưa liên kết locationId hợp lệ. Liên hệ Admin.</Alert>)
      : <Alert severity="info">Chức năng chưa được cấu hình.</Alert>)}
  </Paper>;
  return embedded ? content : <Box sx={{p:3}}><Stack direction="row" justifyContent="space-between"><Typography>TKD GREEN · Hội viên</Typography><GoogleLogin/></Stack>{content}</Box>;
}
