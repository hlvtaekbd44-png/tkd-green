import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, doc, getDoc, onSnapshot, query, where, serverTimestamp } from 'firebase/firestore';
import { Alert, Box, Button, Chip, CircularProgress, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { db, auth } from './firebase';
import GoogleLogin from './GoogleLogin';
import BeltBadge from './BeltBadge';
import { useExamPeriodNames, examPeriodLabel } from './examPeriodNames';
import { MemberPhotoAvatar } from './MemberPhoto';
import { AccountCircleRounded, AccountBalanceWalletRounded, CalendarMonthRounded, EmojiEventsRounded, FactCheckRounded, SchoolRounded, CheckCircleRounded, ReceiptLongRounded, PersonRounded, ArrowForwardRounded, HistoryRounded, CreditCardRounded, ShieldRounded, TrendingUpRounded } from '@mui/icons-material';

const money = (v) => Number(v || 0).toLocaleString('vi-VN') + ' đ';
const show = (v) => v === null || v === undefined || v === '' ? 'Chưa cập nhật' : String(v);
const dateISO = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function PortalHero({eyebrow, title, subtitle, icon, aside}) {
 return <Box className="tkdp-hero"><Box><Typography className="tkdp-eyebrow">{eyebrow || 'TKD GREEN · HỘI VIÊN / PHỤ HUYNH'}</Typography>
   <Typography component="h1" className="tkdp-title">{title}</Typography><Typography className="tkdp-subtitle">{subtitle}</Typography></Box>
   <Box className="tkdp-hero-right">{aside || icon || <SchoolRounded sx={{fontSize:52}}/>}</Box></Box>;
}
function Metric({icon,label,value,note,tone='green'}) {return <Paper elevation={0} className={'tkdp-metric tkdp-'+tone}>
 <Box className="tkdp-metric-icon">{icon}</Box><Box sx={{minWidth:0}}><Typography className="tkdp-metric-label">{label}</Typography><Typography className="tkdp-metric-value">{value}</Typography>{note&&<Typography className="tkdp-metric-note">{note}</Typography>}</Box></Paper>}
function Section({title, subtitle, children, aside, className=''}) {return <Paper className={'tkdp-section '+className} elevation={0}>
 <Stack direction={{xs:'column',sm:'row'}} justifyContent="space-between" alignItems={{xs:'flex-start',sm:'center'}} gap={1} className="tkdp-section-header"><Box><Typography className="tkdp-section-title">{title}</Typography>{subtitle&&<Typography className="tkdp-section-subtitle">{subtitle}</Typography>}</Box>{aside}</Stack>{children}</Paper>}
function formatDate(x){return /^\d{4}-\d{2}-\d{2}/.test(String(x||'')) ? String(x).slice(0,10).split('-').reverse().join('/') : show(x)}
const feeDue = x => {const f=x?.lePhiThi;if(!f)return null; const n=Number(f.conNo ?? (Number(f.phaiThu||0)-Number(f.daThu||0)));return Number.isFinite(n)?Math.max(0,n):null};

function Info({ label, value }) {
  return <Box><Typography variant="caption" color="text.secondary">{label}</Typography>
    <Typography fontWeight={600}>{show(value)}</Typography></Box>;
}

function LeaveForm({ member, profile, verifiedLocationId = "" }) {
  // App.jsx resolves the active location from Firestore, including legacy member records.
  const resolvedLocationId = member?.locationId || verifiedLocationId;
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
    if (!member || !resolvedLocationId || !profile?.memberDocId) {
      setError('Hồ sơ chưa liên kết mã điểm tập (locationId). Liên hệ Admin.'); return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || to < from) {
      setError('Khoảng ngày xin nghỉ không hợp lệ.'); return;
    }
    const trimmed = reason.trim();
    if (!trimmed || trimmed.length > 500) { setError('Lý do phải có từ 1 đến 500 ký tự.'); return; }
    if (!auth.currentUser || (profile?.uid && auth.currentUser.uid !== profile.uid)) { setError('Phiên đăng nhập không hợp lệ.'); return; }
    setBusy(true);
    try {
      await addDoc(collection(db, 'leaveRequests'), {
        memberDocId: profile.memberDocId,
        diemTap: member.diemTap,
        locationId: resolvedLocationId,
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
        ? 'Firebase từ chối gửi đơn. Kiểm tra tài khoản có vai trò member, điểm tập đang hoạt động, tên điểm tập khớp và chức năng Xin phép nghỉ đã bật. Nếu hồ sơ có locationId, mã này phải trùng với điểm tập.'
        : `Không gửi được đơn: ${err?.message || 'Lỗi không xác định'}`);
    } finally { setBusy(false); }
  };

  return <Stack spacing={3}>
    <PortalHero title="Xin phép nghỉ" subtitle="Gửi đơn trực tuyến và theo dõi trạng thái xét duyệt của HLV/Admin." icon={<CalendarMonthRounded sx={{fontSize:52}}/>}/>
    <Box className="tkdp-metrics">
      <Metric icon={<HistoryRounded/>} label="Tổng số đơn" value={requests.length} />
      <Metric icon={<CalendarMonthRounded/>} label="Chờ duyệt" value={requests.filter(x=>x.trangThai==='Chờ duyệt').length} tone="amber"/>
      <Metric icon={<CheckCircleRounded/>} label="Đã duyệt" value={requests.filter(x=>x.trangThai==='Đã duyệt').length} />
      <Metric icon={<ShieldRounded/>} label="Từ chối" value={requests.filter(x=>x.trangThai==='Từ chối').length} tone="rose"/>
    </Box>
    <Section title="Tạo đơn xin nghỉ mới" subtitle="Điền thời gian và lý do, sau đó gửi HLV phụ trách xét duyệt.">
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
    </Section>
    <Section title="Lịch sử đơn xin nghỉ" subtitle="Tất cả yêu cầu của hội viên và trạng thái xử lý.">
    {historyError && <Alert severity="warning">{historyError}</Alert>}
    {!ordered.length && <Typography color="text.secondary">Chưa có đơn xin nghỉ.</Typography>}
    {ordered.map(item => <Paper key={item.id} variant="outlined" sx={{ p: 2, borderRadius: 2 }}>
      <Stack direction="row" justifyContent="space-between" gap={1} flexWrap="wrap">
        <Typography fontWeight={700}>{item.tuNgay} → {item.denNgay}</Typography>
        <Chip size="small" label={item.trangThai || 'Chờ duyệt'} />
      </Stack>
      <Typography sx={{ mt: 1 }}>{item.lyDo}</Typography>
    </Paper>)}
    </Section>
  </Stack>;
}


// Chỉ xem học phí của chính hội viên; Firestore Rules vẫn quyết định quyền đọc.
function MemberTuition({ member, memberId }) {
  const [payments, setPayments] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!memberId) { setBusy(false); return undefined; }
    setBusy(true);
    return onSnapshot(query(collection(db, 'tuitionPayments'), where('memberId', '==', memberId)),
      snap => { setPayments(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setBusy(false); setError(''); },
      err => { setBusy(false); setError(err?.code === 'permission-denied'
        ? 'Tài khoản chưa được cấp quyền xem lịch sử thu học phí của chính mình.'
        : 'Không tải được lịch sử thu học phí.'); });
  }, [memberId]);
  const sorted = useMemo(() => [...payments].sort((a,b) => String(b.ngayThu||'').localeCompare(String(a.ngayThu||''))), [payments]);
  const unpaid = Number(member?.conNo ?? member?.no ?? member?.noHocPhi ?? 0);
  const debtRaw=member?.conNo ?? member?.no ?? member?.noHocPhi;
  const debtKnown=debtRaw!==undefined && debtRaw!==null && debtRaw!=='' && Number.isFinite(Number(debtRaw)) && Number(debtRaw)>=0;
  const totalPaid=sorted.reduce((sum,x)=>sum+(Number.isFinite(Number(x.soTien))?Number(x.soTien):0),0);
  return <Stack spacing={3}>
    <PortalHero title="Học phí của tôi" subtitle="Theo dõi học phí, công nợ và các giao dịch đã được câu lạc bộ ghi nhận." icon={<AccountBalanceWalletRounded sx={{fontSize:52}}/>}/>
    <Box className="tkdp-metrics">
      <Metric icon={<CreditCardRounded/>} label="Loại học phí" value={show(member?.loaiHocPhi)} />
      <Metric icon={<CalendarMonthRounded/>} label="Đã thanh toán đến" value={formatDate(member?.ngayHetHan)} />
      <Metric icon={<AccountBalanceWalletRounded/>} label="Công nợ trong hồ sơ" value={debtKnown?money(Number(debtRaw)):'Chưa đối soát'} tone={debtKnown&&Number(debtRaw)>0?'rose':'green'} />
      <Metric icon={<CheckCircleRounded/>} label="Tổng đã thu trong lịch sử" value={busy?'Đang tải...':error?'Chưa thể xem':money(totalPaid)} />
    </Box>
    <Section title="Lịch sử thanh toán" subtitle="Các khoản thu đã được xác nhận trên hệ thống." aside={<Chip label={`${sorted.length} giao dịch`} color="success" variant="outlined"/>}>
      {busy&&<CircularProgress size={25}/>} {error&&<Alert severity="warning">{error}</Alert>}
      {!busy&&!error&&!sorted.length&&<Box className="tkdp-empty"><ReceiptLongRounded sx={{fontSize:42}}/><Typography fontWeight={800}>Chưa có giao dịch được ghi nhận</Typography><Typography color="text.secondary">Khi HLV/Admin cập nhật khoản thu, lịch sử sẽ xuất hiện tại đây.</Typography></Box>}
      {!error&&sorted.length>0&&<Box className="tkdp-table-scroll"><table className="tkdp-table"><thead><tr><th>Ngày thu</th><th>Khoản thu</th><th>Đợt / Ghi chú</th><th className="num">Số tiền</th></tr></thead><tbody>{sorted.map(item=><tr key={item.id}><td>{formatDate(item.ngayThu)}</td><td><b>{show(item.loaiHocPhi || item.loaiGiaoDich || 'Học phí')}</b></td><td>{show(item.periodId || item.kyHocPhi || item.ghiChu)}</td><td className="num"><b>{money(item.soTien)}</b></td></tr>)}</tbody></table></Box>}
    </Section>
    <Alert severity="info">Số liệu chỉ có giá trị tham khảo khi hệ thống đã đối soát. Nếu chưa khớp, vui lòng liên hệ HLV phụ trách; việc xem trang không ghi nhận thanh toán.</Alert>
  </Stack>;
}

const attendancePrefix = {'Lê Văn Tám':'LVTA','Nghĩa Trung':'NGTR','Đồng Tâm':'DOTM','Thôn 6':'T6','Phước Sơn':'PHSo','Minh Hưng':'MIHU'};
function MemberAttendance({member, memberId}) {
  const [rows,setRows]=useState([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  useEffect(()=>{
    const prefix=attendancePrefix[member?.diemTap];
    if (!memberId || !prefix) {setLoading(false);setRows([]);setError('Chưa xác định mã điểm tập để tra cứu điểm danh.');return undefined;}
    let cancelled=false;
    const dates=Array.from({length:31},(_,i)=>{const d=new Date();d.setHours(12,0,0,0);d.setDate(d.getDate()-i);return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;});
    setLoading(true);setError('');setRows([]);
    Promise.all(dates.map(async day=>{
      try {const snap=await getDoc(doc(db,'attendanceSessions',`${prefix}_${day}`,'records',memberId));return snap.exists()?{id:day,...snap.data()}:null;}
      catch(e){if(e?.code==='permission-denied')throw e;return null;}
    })).then(results=>{if(cancelled)return;setRows(results.filter(Boolean));setLoading(false);})
      .catch(e=>{if(cancelled)return;setLoading(false);setError(e?.code==='permission-denied'?'Chưa được phép xem lịch sử điểm danh cá nhân. Kiểm tra Firestore Rules.':'Không tải được điểm danh.');});
    return ()=>{cancelled=true;};
  },[memberId,member?.diemTap]);
  const count=label=>rows.filter(x=>x.trangThai===label).length;
  const present=count('Có mặt'), withLeave=count('Vắng có phép'), absent=count('Vắng không phép');
  const decided=present+withLeave+absent, percent=decided?Math.round(present*100/decided):null;
  return <Stack spacing={3}>
    <PortalHero title="Điểm danh của tôi" subtitle={`Theo dõi chuyên cần và lịch sử 31 ngày gần nhất tại ${show(member?.diemTap)}.`} icon={<FactCheckRounded sx={{fontSize:52}}/>}/>
    <Box className="tkdp-metrics">
      <Metric icon={<CalendarMonthRounded/>} label="Buổi đã ghi nhận" value={decided} />
      <Metric icon={<CheckCircleRounded/>} label="Có mặt" value={present}/>
      <Metric icon={<CalendarMonthRounded/>} label="Vắng có phép" value={withLeave} tone="amber"/>
      <Metric icon={<ShieldRounded/>} label="Vắng không phép" value={absent} tone="rose"/>
    </Box>
    <Box className="tkdp-split"><Section title="Tỷ lệ chuyên cần" subtitle="Tính trên các buổi đã có trạng thái điểm danh."><Box className="tkdp-attendance-center"><Box className="tkdp-attendance-ring" style={{'--tkdp-attendance-percent':`${percent||0}%`}}><Box><b>{percent===null?'—':`${percent}%`}</b><small>{present} / {decided} buổi</small></Box></Box><Typography color="text.secondary">Ngày chưa có dữ liệu không được coi là vắng học.</Typography></Box></Section>
    <Section title="Lịch sử điểm danh" subtitle="Các buổi tập gần nhất đã được lưu.">
      {loading&&<CircularProgress size={25}/>} {error&&<Alert severity="warning">{error}</Alert>}
      {!loading&&!error&&!rows.length&&<Box className="tkdp-empty"><FactCheckRounded sx={{fontSize:42}}/><Typography fontWeight={800}>Chưa có bản ghi điểm danh</Typography><Typography color="text.secondary">Dữ liệu sẽ xuất hiện khi HLV lưu điểm danh.</Typography></Box>}
      {!error&&rows.map(r=><Box key={r.id} className="tkdp-list-line"><Box><Typography fontWeight={800}>{formatDate(r.id)}</Typography>{r.ghiChu&&<Typography variant="body2" color="text.secondary">{r.ghiChu}</Typography>}</Box><Chip size="small" label={show(r.trangThai)} color={r.trangThai==='Có mặt'?'success':r.trangThai==='Vắng có phép'?'warning':r.trangThai==='Vắng không phép'?'error':'default'}/></Box>)}
    </Section></Box>
  </Stack>;
}

export default function MemberSelfPortal({ profile, embedded = false, view = 'Hội viên', leaveEnabled = false, examAccess = true, locationId = '' }) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exams, setExams] = useState([]);
  const [examsLoading, setExamsLoading] = useState(true);
  const [examsError, setExamsError] = useState('');

  // Chỉ đọc đăng ký thi gắn với chính hồ sơ đã xác thực.
  useEffect(() => {
    const memberId = profile?.memberDocId || profile?.memberId;
    if (!memberId || !examAccess || !['Thi cấp','Thi đẳng'].includes(view)) { setExams([]); setExamsLoading(false); return undefined; }
    setExamsLoading(true);
    setExams([]);
    setExamsError('');
    const q = query(collection(db, 'examRegistrations'), where('memberDocId', '==', memberId));
    return onSnapshot(q, snapshot => {
      setExams(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
      setExamsLoading(false);
    }, err => {
      console.error('Không đọc được lịch sử thi:', err);
      setExamsError(err?.code === 'permission-denied'
        ? 'Chưa có quyền đọc lịch sử thi. Kiểm tra Firestore Rules cho tài khoản hội viên.'
        : 'Không tải được lịch sử thi.');
      setExamsLoading(false);
    });
  }, [profile?.memberDocId, profile?.memberId, view, examAccess]);

  const activeExams = useMemo(() => exams.filter(item =>
    !['Không dự thi', 'Đã hủy', 'Đã huỷ', 'Hủy', 'Huỷ'].includes(String(item.status || item.trangThai || '').trim())
    && item.deleted !== true && item.archived !== true
  ).sort((a, b) => {
    const dateA = a.createdAt?.seconds || a.createdAt?.toMillis?.() / 1000 || 0;
    const dateB = b.createdAt?.seconds || b.createdAt?.toMillis?.() / 1000 || 0;
    return dateB - dateA || String(b.periodId || '').localeCompare(String(a.periodId || ''));
  }), [exams]);

  // Dữ liệu cũ không có examType được xem là Thi cấp, tránh trộn vào Thi đẳng.
  const isDan = item => item.examType === 'dan';
  const visibleExams = useMemo(() => activeExams.filter(item =>
    view === 'Thi đẳng' ? isDan(item) : !isDan(item)
  ), [activeExams, view]);
  const isExamView = view === 'Thi cấp' || view === 'Thi đẳng';
  const examPeriodState = useExamPeriodNames(exams, isExamView && examAccess);

  function ExamHistory({ records, title }) {
    const totalFees=records.reduce((sum,x)=>sum+(feeDue(x)||0),0);
    const completed=records.filter(x=>String(x.ketQua||x.ketqua||'').toLowerCase().includes('đạt')).length;
    return <Stack spacing={3}>
      <PortalHero title={title} subtitle={title==='Thi đẳng'?'Theo dõi quá trình thăng đẳng, đăng ký dự thi, kết quả và lệ phí.':'Quản lý lịch sử đăng ký thi cấp, kết quả và các khoản lệ phí.'} icon={<EmojiEventsRounded sx={{fontSize:52}}/>}/>
      <Box className="tkdp-metrics">
        <Metric icon={<EmojiEventsRounded/>} label="Số đăng ký còn hiệu lực" value={records.length} />
        <Metric icon={<CheckCircleRounded/>} label="Kết quả đạt được ghi nhận" value={completed} />
        <Metric icon={<CreditCardRounded/>} label="Lệ phí còn phải đóng" value={money(totalFees)} tone={totalFees>0?'rose':'green'}/>
      </Box>
      <Section title={`Lịch sử ${title.toLowerCase()}`} subtitle="Chỉ hiển thị đăng ký của hội viên đã liên kết; các đăng ký đã hủy được ẩn." aside={<Chip label={`${records.length} đăng ký`} variant="outlined"/>}>
        {examsLoading&&<CircularProgress size={24}/>}
        {examsError&&<Alert severity="warning">{examsError}</Alert>}
        {!examsLoading&&!examsError&&!records.length&&<Box className="tkdp-empty"><EmojiEventsRounded sx={{fontSize:42}}/><Typography fontWeight={800}>Chưa có đăng ký {title.toLowerCase()}</Typography><Typography color="text.secondary">Khi HLV/Admin thêm đăng ký, thông tin sẽ hiển thị tại đây.</Typography></Box>}
        {!examsError&&records.length>0&&<Box className="tkdp-table-scroll"><table className="tkdp-table"><thead><tr><th>Đợt thi</th><th>Nội dung dự thi</th><th>Trạng thái</th><th>Kết quả</th><th className="num">Phí còn nợ</th></tr></thead><tbody>{records.map(item=><tr key={item.id}><td><b>{examPeriodLabel(item, examPeriodState)}</b></td><td>{show(item.dangDuThi||item.dangDuThiCap)}</td><td><Chip size="small" label={show(item.status||item.trangThai)}/></td><td><Chip size="small" label={show(item.ketQua||item.ketqua)} color={String(item.ketQua||item.ketqua||'').toLowerCase().includes('đạt')?'success':'default'}/></td><td className="num"><b>{feeDue(item)===null?'—':money(feeDue(item))}</b></td></tr>)}</tbody></table></Box>}
      </Section>
    </Stack>;
  }

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

  const content = <Box className="tkdp-page">
    {loading && <CircularProgress />}
    {error && <Alert severity="error">{error}</Alert>}
    {member && (view === 'Xin phép nghỉ' ? (
      leaveEnabled ? <LeaveForm member={member} profile={profile} verifiedLocationId={locationId} />
        : <Alert severity="warning">Điểm tập chưa mở chức năng Xin phép nghỉ.</Alert>
    ) : view === 'Học phí' ? <MemberTuition member={member} memberId={member.id} />
      : view === 'Điểm danh' ? <MemberAttendance member={member} memberId={member.id} />
      : isExamView ? <ExamHistory records={visibleExams} title={view} /> : <Stack spacing={3}>
      <PortalHero title="Hồ sơ hội viên" subtitle="Thông tin chính thức của hội viên tại Câu lạc bộ Taekwondo Green." icon={<AccountCircleRounded sx={{fontSize:52}}/>}/>
      <Box className="tkdp-profile-hero"><Box className="tkdp-profile-avatar"><MemberPhotoAvatar member={member} size={112} /></Box><Box sx={{flex:1}}><Typography variant="h4" fontWeight={900}>{show(member.hoTen)}</Typography><Typography color="text.secondary">Mã VTF: <b>{show(member.maHV)}</b> · Mã nội bộ: <b>{show(member.maHoiVienNoiBo)}</b></Typography><Stack direction="row" flexWrap="wrap" gap={1} sx={{mt:2}}><Chip color="success" label={show(member.trangThai)}/><Chip variant="outlined" label={show(member.diemTap)}/><Box className="tkdp-belt"><BeltBadge level={member.capDaiDang} compact/></Box></Stack></Box></Box>
      <Box className="tkdp-split"><Section title="Thông tin cá nhân" subtitle="Dữ liệu được ghi nhận trong hồ sơ hội viên."><Box className="tkdp-detail-grid">
        <Info label="Họ và tên" value={member.hoTen}/><Info label="Mã VTF" value={member.maHV}/><Info label="Mã nội bộ" value={member.maHoiVienNoiBo}/><Info label="Ngày sinh" value={formatDate(member.ngaySinh)}/><Info label="Giới tính" value={member.gioiTinh}/><Info label="Số điện thoại phụ huynh" value={member.soDienThoaiPhuHuynh}/></Box></Section>
      <Section title="Thông tin tập luyện" subtitle="Cấp đai và thời hạn học phí."><Box className="tkdp-detail-grid"><Info label="Điểm tập" value={member.diemTap}/><Info label="Cấp đai hiện tại" value={member.capDaiDang}/><Info label="Loại học phí" value={member.loaiHocPhi}/><Info label="Ngày bắt đầu" value={formatDate(member.ngayBatDau)}/><Info label="Đã thanh toán đến" value={formatDate(member.ngayHetHan)}/><Info label="Trạng thái" value={member.trangThai}/></Box></Section></Box>
      <Alert severity="info">Tài khoản chỉ xem được hồ sơ đã liên kết. Nếu thông tin chưa chính xác, vui lòng liên hệ HLV hoặc Admin để xác minh.</Alert>
    </Stack>)}

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
