import { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import {
  Alert, Avatar, Box, Button, Chip, CircularProgress, Divider, LinearProgress,
  Paper, Stack, Typography,
} from '@mui/material';
import {
  AccountCircleRounded, AccountBalanceWalletRounded, CalendarMonthRounded,
  CheckCircleRounded, ChevronRightRounded, EmojiEventsRounded, FactCheckRounded,
  NotificationsActiveRounded, PaymentsRounded, PersonRounded,
} from '@mui/icons-material';
import { db } from './firebase';
import BeltBadge from './BeltBadge';
import { useExamPeriodNames, examPeriodLabel } from './examPeriodNames';
import { MemberPhotoAvatar } from './MemberPhoto';
import './MemberDashboard.css';

const money = value => Number(value || 0).toLocaleString('vi-VN') + ' đ';
const val = value => value === null || value === undefined || value === '' ? 'Chưa cập nhật' : String(value);
const excluded = new Set(['Không dự thi', 'Đã hủy', 'Đã huỷ', 'Hủy', 'Huỷ']);
const attendancePrefix = {
  'Lê Văn Tám': 'LVTA', 'Nghĩa Trung': 'NGTR', 'Đồng Tâm': 'DOTM',
  'Thôn 6': 'T6', 'Phước Sơn': 'PHSo', 'Minh Hưng': 'MIHU',
};
const todayISO = date => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const niceDate = date => /^\d{4}-\d{2}-\d{2}/.test(String(date || ''))
  ? String(date).slice(0, 10).split('-').reverse().join('/') : val(date);
const timestamp = x => x?.createdAt?.seconds || 0;

function useOwnCollection(memberId, name, memberField, active = true) {
  const [state, setState] = useState({ items: [], loading: true, error: '' });
  useEffect(() => {
    if (!active) { setState({ items: [], loading: false, error: '' }); return undefined; }
    if (!memberId) { setState({ items: [], loading: false, error: 'Tài khoản chưa liên kết hội viên.' }); return undefined; }
    setState({ items: [], loading: true, error: '' });
    return onSnapshot(query(collection(db, name), where(memberField, '==', memberId)), snap => {
      setState({ items: snap.docs.map(d => ({ id: d.id, ...d.data() })), loading: false, error: '' });
    }, err => setState({ items: [], loading: false, error: err?.code === 'permission-denied'
      ? `Không có quyền đọc ${name} của hội viên. Vui lòng kiểm tra Firestore Rules.`
      : `Không tải được ${name}.` }));
  }, [memberId, name, memberField, active]);
  return state;
}

function useRecentAttendance(member, active = true) {
  const [state, setState] = useState({ items: [], loading: true, error: '' });
  useEffect(() => {
    if (!active) { setState({ items: [], loading: false, error: '' }); return undefined; }
    const prefix = attendancePrefix[member?.diemTap];
    if (!member?.id || !prefix) {
      setState({ items: [], loading: false, error: 'Chưa xác định được mã điểm tập để xem điểm danh.' });
      return undefined;
    }
    let cancelled = false;
    setState({ items: [], loading: true, error: '' });
    const now = new Date();
    const days = Array.from({ length: 31 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12);
      return todayISO(d);
    });
    Promise.all(days.map(async date => {
      try {
        const snap = await getDoc(doc(db, 'attendanceSessions', `${prefix}_${date}`, 'records', member.id));
        return snap.exists() ? { ...snap.data(), id: date } : null;
      } catch (err) {
        // Do not disguise an access-control error as a day with no attendance.
        if (err?.code === 'permission-denied') throw err;
        throw err;
      }
    })).then(all => {
      if (!cancelled) setState({ items: all.filter(Boolean), loading: false, error: '' });
    }).catch(err => {
      if (!cancelled) setState({ items: [], loading: false, error: err?.code === 'permission-denied'
        ? 'Tài khoản chưa được phép xem lịch sử điểm danh.' : 'Không tải được lịch sử điểm danh.' });
    });
    return () => { cancelled = true; };
  }, [member?.id, member?.diemTap, active]);
  return state;
}

function Panel({ title, icon, action, onAction, children, className = '' }) {
  return <Paper className={`tkdm-panel ${className}`} elevation={0}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 2 }}>
      <Stack direction="row" alignItems="center" spacing={1.2}>
        <Box className="tkdm-panel-icon">{icon}</Box>
        <Typography variant="h6" className="tkdm-panel-heading">{title}</Typography>
      </Stack>
      {action && <Button size="small" variant="text" onClick={onAction} endIcon={<ChevronRightRounded />} sx={{ whiteSpace: 'nowrap' }}>{action}</Button>}
    </Stack>
    {children}
  </Paper>;
}

function OverviewCard({ icon, label, value, note, onClick, kind = '' }) {
  return <Paper className={`tkdm-overview-card ${kind}`} onClick={onClick} role="button" tabIndex={0}
    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }} elevation={0}>
    <Box className="tkdm-overview-icon">{icon}</Box>
    <Box sx={{ minWidth: 0, flex: 1 }}>
      <Typography className="tkdm-overview-label">{label}</Typography>
      <Typography className="tkdm-overview-value">{value}</Typography>
      {note && <Typography className="tkdm-overview-note">{note}</Typography>}
    </Box>
    <ChevronRightRounded className="tkdm-chevron" />
  </Paper>;
}

function Empty({ children }) { return <Typography sx={{ py: 1 }} color="text.secondary" variant="body2">{children}</Typography>; }

export default function MemberDashboard({ member, profile, navigate, enabled = {} }) {
  const memberId = member?.id || profile?.memberDocId || profile?.memberId;
  const payments = useOwnCollection(memberId, 'tuitionPayments', 'memberId', !!enabled['Học phí']);
  const exams = useOwnCollection(memberId, 'examRegistrations', 'memberDocId', !!(enabled['Thi cấp'] || enabled['Thi đẳng']));
  const examPeriodState = useExamPeriodNames(exams.items, !!(enabled['Thi cấp'] || enabled['Thi đẳng']));
  const leaves = useOwnCollection(memberId, 'leaveRequests', 'memberDocId', !!enabled['Xin phép nghỉ']);
  const attendance = useRecentAttendance(member, !!enabled['Điểm danh']);
  const tuitionDebtRaw = member?.conNo ?? member?.noHocPhi ?? member?.no;
  const hasDebt = tuitionDebtRaw !== null && tuitionDebtRaw !== undefined && tuitionDebtRaw !== ''
    && Number.isFinite(Number(tuitionDebtRaw)) && Number(tuitionDebtRaw) >= 0;
  const tuitionDebt = hasDebt ? Number(tuitionDebtRaw) : null;
  const sortedPayments = useMemo(() => [...payments.items].sort((a, b) =>
    String(b.ngayThu || '').localeCompare(String(a.ngayThu || ''))).slice(0, 4), [payments.items]);
  const activeExams = useMemo(() => exams.items.filter(x => (enabled['Thi cấp'] && (x.examType !== 'dan')) || (enabled['Thi đẳng'] && x.examType === 'dan')).filter(x => !excluded.has(String(x.status || x.trangThai || '').trim())
    && !x.deleted && !x.archived).sort((a, b) => timestamp(b) - timestamp(a)).slice(0, 4), [exams.items, enabled['Thi cấp'], enabled['Thi đẳng']]);
  const sortedLeaves = useMemo(() => [...leaves.items].sort((a, b) => timestamp(b) - timestamp(a)), [leaves.items]);
  const present = attendance.items.filter(x => x.trangThai === 'Có mặt').length;
  const withLeave = attendance.items.filter(x => x.trangThai === 'Vắng có phép').length;
  const absent = attendance.items.filter(x => x.trangThai === 'Vắng không phép').length;
  const decidedSessions = present + withLeave + absent;
  const attendancePercent = decidedSessions ? Math.round(present / decidedSessions * 100) : null;
  const approvedLeave = sortedLeaves.filter(x => x.trangThai === 'Đã duyệt').length;
  const pendingLeave = sortedLeaves.filter(x => x.trangThai === 'Chờ duyệt').length;
  const feeDue = exams.items.filter(x => !excluded.has(String(x.status || x.trangThai || '').trim()))
    .reduce((sum, x) => {
      const fee = x.lePhiThi;
      const n = Number(fee?.conNo ?? (fee?.phaiThu !== undefined && fee?.daThu !== undefined
        ? Number(fee.phaiThu) - Number(fee.daThu) : 0));
      return sum + (Number.isFinite(n) && n > 0 ? n : 0);
    }, 0);
  const go = page => { if (enabled[page]) navigate(page); };
  const accent = { bgcolor: '#e7f8ec', color: '#087344' };

  if (!member) return <Alert severity="warning">Không tìm thấy hồ sơ hội viên đã liên kết.</Alert>;
  return <Box className="tkdm-root">
    <Box className="tkdm-hero">
      <Box>
        <Typography className="tkdm-eyebrow">TKD GREEN · MEMBER PORTAL</Typography>
        <Typography component="h1" className="tkdm-hero-title">Cổng thông tin Hội viên / Phụ huynh</Typography>
        <Typography className="tkdm-hero-desc">Chào mừng đến với hệ thống quản lý Câu lạc bộ Taekwondo Green.</Typography>
        <Typography className="tkdm-hero-welcome">Xin chào, <b>{val(member.hoTen)}</b> · {val(member.diemTap)}</Typography>
      </Box>
      <Box className="tkdm-hero-emblem"><img src="/branding/green-emblem.png" alt="Logo TKD Green" /></Box>
    </Box>

    <Box className="tkdm-summary-grid">
      {enabled['Học phí'] && <OverviewCard icon={<AccountBalanceWalletRounded />} label="Công nợ học phí trong hồ sơ"
        value={hasDebt ? money(tuitionDebt) : 'Chưa đối soát'} note={feeDue ? `Lệ phí thi còn nợ: ${money(feeDue)}` : 'Xem thông tin học phí'} onClick={() => go('Học phí')} />}
      {enabled['Điểm danh'] && <OverviewCard icon={<FactCheckRounded />} label="Điểm danh 31 ngày gần nhất"
        value={attendance.loading ? 'Đang tải...' : attendance.error ? 'Chưa có dữ liệu' : `${present} / ${decidedSessions} buổi`}
        note={attendance.error || (attendancePercent === null ? 'Chưa có buổi được ghi nhận' : `Tỷ lệ có mặt ${attendancePercent}%`)} onClick={() => go('Điểm danh')} />}
      {(enabled['Thi cấp'] || enabled['Thi đẳng']) && <OverviewCard icon={<EmojiEventsRounded />} label="Đăng ký thi đang hiển thị"
        value={exams.loading ? 'Đang tải...' : exams.error ? 'Chưa có dữ liệu' : `${exams.items.filter(x => !excluded.has(String(x.status || x.trangThai || ''))).length} đăng ký`}
        note={exams.error || (enabled['Thi cấp'] && enabled['Thi đẳng'] ? 'Gồm Thi cấp và Thi đẳng' : enabled['Thi cấp'] ? 'Chỉ Thi cấp' : 'Chỉ Thi đẳng')} onClick={() => go(enabled['Thi cấp'] ? 'Thi cấp' : 'Thi đẳng')} />}
      {enabled['Xin phép nghỉ'] && <OverviewCard icon={<CalendarMonthRounded />} label="Đơn xin phép nghỉ"
        value={leaves.loading ? 'Đang tải...' : leaves.error ? 'Chưa có dữ liệu' : `${pendingLeave} chờ duyệt`}
        note={leaves.error || `${approvedLeave} đơn đã duyệt`} onClick={() => go('Xin phép nghỉ')} />}
    </Box>

    <Box className="tkdm-middle-grid">
      {enabled['Hội viên'] && <Panel title="Thông tin hội viên" icon={<PersonRounded />} action="Xem chi tiết" onAction={() => go('Hội viên')}>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2.5} alignItems={{ xs: 'center', sm: 'flex-start' }}>
          <MemberPhotoAvatar member={member} size={108} className="tkdm-member-avatar" />
          <Box className="tkdm-profile-list">
            {[["Họ và tên", member.hoTen], ["Mã VTF", member.maHV], ["Mã nội bộ", member.maHoiVienNoiBo],
              ["Điểm tập", member.diemTap], ["Cấp đai", member.capDaiDang], ["Trạng thái", member.trangThai]].map(([label, value]) =>
              <Box className="tkdm-profile-row" key={label}>
                <Typography color="text.secondary">{label}</Typography>
                <Box>{label === 'Cấp đai' ? <Stack direction="row" alignItems="center" gap={1}><BeltBadge level={value} compact /></Stack> : <b>{val(value)}</b>}</Box>
              </Box>)}
          </Box>
        </Stack>
      </Panel>}

      {enabled['Học phí'] && <Panel title="Học phí & lịch sử thanh toán" icon={<PaymentsRounded />} action="Xem tất cả" onAction={() => go('Học phí')}>
        <Box className="tkdm-table-wrap"><table className="tkdm-table"><thead><tr><th>Ngày thu</th><th>Khoản thu</th><th className="tkdm-num">Số tiền</th></tr></thead>
          <tbody>{sortedPayments.map(item => <tr key={item.id}>
            <td>{niceDate(item.ngayThu)}</td><td>{val(item.loaiHocPhi || item.loaiGiaoDich || 'Học phí')}</td>
            <td className="tkdm-num tkdm-money">{money(item.soTien)}</td></tr>)}</tbody></table></Box>
        {payments.loading && <CircularProgress size={20} />}
        {payments.error && <Alert severity="warning" sx={{ mt: 1 }}>{payments.error}</Alert>}
        {!payments.loading && !payments.error && !sortedPayments.length && <Empty>Chưa có lịch sử thu học phí.</Empty>}
        <Box className="tkdm-minifooter">Đã đóng đến: <b>{val(member.ngayHetHan)}</b></Box>
      </Panel>}
    </Box>

    <Box className="tkdm-bottom-grid">
      {enabled['Điểm danh'] && <Panel title="Điểm danh" icon={<FactCheckRounded />} action="Xem chi tiết" onAction={() => go('Điểm danh')}>
        <Stack direction="row" spacing={2} alignItems="center" sx={{ mb: 2 }}>
          <Box className="tkdm-donut" sx={{ '--tkdm-percent': `${attendancePercent || 0}%` }}>
            <Box><b>{attendancePercent === null ? '—' : `${attendancePercent}%`}</b><small>{present} / {decidedSessions} buổi</small></Box>
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography fontWeight={800} sx={{ mb: 1 }}>Điểm danh gần đây</Typography>
            {attendance.items.slice(0, 4).map(item => <Stack key={item.id} direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ mb: 0.6 }}>
              <Typography variant="body2">{niceDate(item.id)}</Typography>
              <Chip size="small" label={val(item.trangThai)} color={item.trangThai === 'Có mặt' ? 'success' : item.trangThai === 'Vắng có phép' ? 'warning' : item.trangThai === 'Vắng không phép' ? 'error' : 'default'} />
            </Stack>)}
            {attendance.loading && <CircularProgress size={20} />}
            {attendance.error && <Typography variant="caption" color="error">{attendance.error}</Typography>}
            {!attendance.loading && !attendance.error && !attendance.items.length && <Empty>Chưa có bản ghi điểm danh.</Empty>}
          </Box>
        </Stack>
        <Typography variant="caption" color="text.secondary">Chỉ tính buổi đã lưu trạng thái, không xem ngày chưa có dữ liệu là vắng.</Typography>
      </Panel>}

      {(enabled['Thi cấp'] || enabled['Thi đẳng']) && <Panel title="Thi cấp / Thi đẳng" icon={<EmojiEventsRounded />} action="Xem chi tiết" onAction={() => go(enabled['Thi cấp'] ? 'Thi cấp' : 'Thi đẳng')}>
        {exams.loading && <CircularProgress size={20} />}
        {exams.error && <Alert severity="warning">{exams.error}</Alert>}
        {!exams.loading && !exams.error && !activeExams.length && <Empty>Chưa có lịch sử đăng ký thi còn hiệu lực.</Empty>}
        {activeExams.map(item => {
          const dan = item.examType === 'dan' || /^L\d+-\d{4}$/i.test(String(item.periodId || item.periodName || ''));
          const fee = item.lePhiThi;
          return <Box className="tkdm-exam-row" key={item.id}>
            <Box sx={{ minWidth: 0, flex: 1 }}><Typography fontWeight={800} variant="body2">{dan ? 'Thi đẳng' : 'Thi cấp'} · {val(item.dangDuThi || item.dangDuThiCap)}</Typography>
              <Typography color="text.secondary" variant="caption">Đợt {examPeriodLabel(item, examPeriodState)} · {val(item.status || item.trangThai)}</Typography></Box>
            <Box sx={{ textAlign: 'right' }}><Chip size="small" label={val(item.ketQua || item.ketqua || 'Chưa có kết quả')} />
              {fee && <Typography variant="caption" sx={{ display: 'block', mt: 0.5 }}>Còn phí: {money(fee.conNo ?? (Number(fee.phaiThu || 0) - Number(fee.daThu || 0)))}</Typography>}</Box>
          </Box>;
        })}
      </Panel>}

      {enabled['Xin phép nghỉ'] && <Panel title="Xin phép nghỉ" icon={<CalendarMonthRounded />} action="Xem lịch sử" onAction={() => go('Xin phép nghỉ')}>
        {leaves.loading && <CircularProgress size={20} />}
        {leaves.error && <Alert severity="warning">{leaves.error}</Alert>}
        {!leaves.loading && !leaves.error && !sortedLeaves.length && <Empty>Chưa có đơn xin phép nghỉ.</Empty>}
        {sortedLeaves.slice(0, 2).map(item => <Box className="tkdm-leave-row" key={item.id}>
          <CalendarMonthRounded color="success" />
          <Box sx={{ flex: 1 }}><Typography variant="body2" fontWeight={800}>{niceDate(item.tuNgay)} – {niceDate(item.denNgay)}</Typography>
            <Typography variant="caption" color="text.secondary">{val(item.lyDo)}</Typography></Box>
          <Chip size="small" label={val(item.trangThai)} color={item.trangThai === 'Đã duyệt' ? 'success' : item.trangThai === 'Từ chối' ? 'error' : 'warning'} />
        </Box>)}
        <Button fullWidth variant="contained" startIcon={<NotificationsActiveRounded />} onClick={() => go('Xin phép nghỉ')} sx={{ mt: 2 }}>Tạo đơn xin nghỉ mới</Button>
      </Panel>}
    </Box>
  </Box>;
}
