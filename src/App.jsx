import GoogleLogin from "./GoogleLogin";
import LoginScreen from "./LoginScreen";
import PublicHome from "./PublicHome";
import PublicLocationIntroduction from "./PublicLocationIntroduction";
import useDashboardLiveMetrics from "./useDashboardLiveMetrics";
import MemberSelfPortal from "./MemberSelfPortal";
import MemberDashboard from "./MemberDashboard";
import ReportsManagementLive from "./ReportsManagementLive";
import MemberContentFrame from "./MemberContentFrame";
import './MemberPortalFullPro.css';
import {
  collection,
  doc,
  onSnapshot,
  query,
  where,
} from 'firebase/firestore';
import { db } from './firebase';
import { useEffect, useMemo, useState } from "react";
import useUserRole from "./useUserRole";
import { useClubLocations, namesForProfile } from "./useClubLocations";
import {
  Alert, AppBar, Avatar, Badge, Box, Button, Chip, CssBaseline, Divider,
  Drawer, IconButton, InputAdornment, List, ListItemButton, ListItemIcon,
  ListItemText, Paper, Stack, TextField, Toolbar, Typography, useMediaQuery,
  ThemeProvider, createTheme,
} from '@mui/material'
import {
  Menu as MenuIcon, DashboardRounded, GroupsRounded, PaymentsRounded,
  EmojiEventsRounded, FactCheckRounded, AssessmentRounded, SettingsRounded,
  SearchRounded, NotificationsNoneRounded, AddRounded, TrendingUpRounded,
  CalendarMonthRounded, ArrowForwardRounded, ShieldRounded, PublicRounded, SchoolRounded,
} from '@mui/icons-material'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import AddMember from "./AddMember";
import MemberList from "./MemberList";
import EditMember from "./EditMember";
import TuitionManagement from "./TuitionManagement";
import ExamManagement from "./ExamManagement";
import BeltBadge from "./BeltBadge";
import AttendanceManagement from "./AttendanceManagement";
import LeaveRequestsManagement from "./LeaveRequestsManagement";
import SettingsManagement from "./SettingsManagement";
import ClubContentManagement from "./ClubContentManagement";
import AchievementManagement from "./AchievementManagement";
import MemberAchievements from "./MemberAchievements";
import './App.css'
import './TKDPro.css'
import './TKDFontReadability.css'
import HeaderAccount from "./HeaderAccount";
import { ClubLogo, useClubAppearance } from "./ClubAppearance";
// TKDG_APPROVED_UI_V1: visually approved club UI – no business logic changes.
import './TKDGreenApproved.css';
import './TKDGreenVisualV2.css';
import TKDGreenMobileNav from './TKDGreenMobileNav';
import TKDGreenDashboardA from './TKDGreenDashboardA';
import './TKDGreenAllModules.css';

import "./TKDPublicReadability.css";
import "./TKDGreenDesignA.css";
import "./TKDGreenUnified2026.css";
import "./TKDGreenDesignFinal.css"; // Design A consolidated visual layout — loaded last
import "./TKDGreenInterface2026.css"; // UI rebuild: compact workspace & module hierarchy

const drawerWidth = 256

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#087d4b', dark: '#075f3b', light: '#d9f5e5', contrastText: '#ffffff' },
    secondary: { main: '#b78a35' },
    background: { default: '#f4f8f5', paper: '#ffffff' },
    text: { primary: '#18362a', secondary: '#617b6d' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Be Vietnam Pro", "Segoe UI", Arial, sans-serif',
    fontSize: 15,
    button: { textTransform: 'none', fontWeight: 700, fontSize: '0.94rem' },
    body1: { fontSize: '1rem', lineHeight: 1.65 },
    body2: { fontSize: '0.94rem', lineHeight: 1.55 },
    subtitle1: { fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.5 },
    subtitle2: { fontSize: '0.98rem', fontWeight: 700 },
    caption: { fontSize: '0.83rem', lineHeight: 1.45 },
    h6: { fontSize: '1.22rem', fontWeight: 800 },
    h5: { fontSize: '1.48rem', fontWeight: 800, letterSpacing: '-0.5px' },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid #e0ebe4' } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 10, boxShadow: 'none', minHeight: 36 }, containedPrimary: { '&:hover': { boxShadow: '0 7px 20px #0c9f6050' } } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10, backgroundColor: '#ffffff' } } },
    MuiDialog: { styleOverrides: { paper: { backgroundColor: '#ffffff', backgroundImage: 'none', border: '1px solid #dbe9df', borderRadius: 18 } } },
    MuiTableCell: { styleOverrides: { root: { borderBottom: '1px solid #e6eee8', fontSize: '0.94rem', lineHeight: 1.55 }, head: { fontWeight: 800, color: '#254c35', fontSize: '0.92rem' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 700, fontSize: '0.79rem' } } },
  },
})

const navItems = [
  { label: 'Giới thiệu', module: 'public', icon: <PublicRounded /> },
  { label: 'Tổng quan', module: 'dashboard', icon: <DashboardRounded /> },
  { label: 'Hội viên', module: 'members', icon: <GroupsRounded /> },
  { label: 'Học phí', module: 'tuition', icon: <PaymentsRounded /> },
  { label: 'Thi cấp', module: 'exams', icon: <EmojiEventsRounded /> },
  { label: 'Thi đẳng', module: 'dan', icon: <EmojiEventsRounded /> },
  { label: 'Điểm danh', module: 'attendance', icon: <FactCheckRounded /> },
  { label: 'Duyệt đơn nghỉ', module: 'leaveRequests', icon: <CalendarMonthRounded /> },
  { label: 'Báo cáo', module: 'reports', icon: <AssessmentRounded /> },
  { label: 'Sự kiện', module: 'content', icon: <CalendarMonthRounded /> },
  { label: 'Đào tạo', module: 'content', icon: <SchoolRounded /> },
  { label: 'Thành tích', module: 'achievements', icon: <EmojiEventsRounded /> },
]


// Chuẩn hóa điểm tập được gán; không suy diễn quyền từ các cờ chức năng.
function assignedLocations(profile) {
  const value = profile?.diemTap;
  if (Array.isArray(value)) return [...new Set(value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))];
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

// Số liệu biểu đồ được tổng hợp từ danh sách hội viên đã được phân quyền.
function getLocationChartData(members) {
  const counts = new Map();
  members.forEach(member => {
    const name = member.location || 'Chưa xác định';
    counts.set(name, (counts.get(name) || 0) + 1);
  });
  return [...counts.entries()]
    .map(([location, members]) => ({ location, members }))
    .sort((a, b) => b.members - a.members);
}

function StatCard({ title, value, note, icon, accent = false }) {
  return (
    <Paper className={`stat-card ${accent ? 'stat-card-accent' : ''}`} elevation={0}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={2}>
        <Box>
          <Typography className="stat-title">{title}</Typography>
          <Typography className="stat-value">{value}</Typography>
          <Stack direction="row" alignItems="center" spacing={0.6} sx={{ mt: 1 }}>
            <TrendingUpRounded sx={{ fontSize: 16, color: accent ? '#d6f4df' : '#198754' }} />
            <Typography className="stat-note">{note}</Typography>
          </Stack>
        </Box>
        <Box className={`stat-icon ${accent ? 'stat-icon-accent' : ''}`}>{icon}</Box>
      </Stack>
    </Paper>
  )
}

  
// Khu vực riêng: chỉ có Hội viên của tôi và Xin phép nghỉ khi điểm tập đã bật.
// Component tách riêng để các hook của khu vực võ sinh không ảnh hưởng hook của App.
function MemberPortalLayout({ profile, user }) {
  const appearance = useClubAppearance();
  const liveTheme = useMemo(() => createTheme(theme, { palette: { primary: { main: appearance.primary }, secondary: { main: appearance.secondary }, background: { default: appearance.background, paper: appearance.surface }, text: { primary: appearance.text } } }), [appearance.primary, appearance.secondary, appearance.background, appearance.surface, appearance.text]);
  
  const [page, setPage] = useState('Tổng quan');
  const [mobileOpen, setMobileOpen] = useState(false);
  const [member, setMember] = useState(null);
  const [locationDoc, setLocationDoc] = useState(null);
  const [memberError, setMemberError] = useState('');
  const [locationError, setLocationError] = useState('');
  const [locationLoading, setLocationLoading] = useState(true);
  const mobile = useMediaQuery(theme.breakpoints.down('md'));
  const memberId = profile?.memberDocId || profile?.memberId;

  useEffect(() => {
    setMember(null);
    if (!memberId) { setMemberError('Tài khoản chưa liên kết hồ sơ.'); return undefined; }
    return onSnapshot(doc(db, 'members', memberId), snap => {
      setMember(snap.exists() ? { id: snap.id, ...snap.data() } : null);
      setMemberError(snap.exists() ? '' : 'Không tìm thấy hồ sơ hội viên.');
    }, () => setMemberError('Không có quyền đọc hồ sơ cá nhân.'));
  }, [memberId]);

  useEffect(() => {
    setLocationDoc(null); setLocationError(''); setLocationLoading(true);
    if (!member?.diemTap) { setLocationLoading(false); return undefined; }
    // Ưu tiên locationId. Hồ sơ cũ chưa có locationId được tìm bằng tên điểm tập,
    // không yêu cầu sửa thủ công 1000 hồ sơ mới hiển thị menu.
    if (member.locationId) {
      return onSnapshot(doc(db, 'locations', member.locationId), snap => {
        const loc = snap.exists() ? { id: snap.id, ...snap.data() } : null;
        setLocationDoc(loc?.name === member.diemTap ? loc : null);
        setLocationError(!loc || loc.name !== member.diemTap ? 'Mã điểm tập và tên điểm tập chưa khớp cấu hình.' : '');
        setLocationLoading(false);
      }, () => { setLocationError('Không tải được cấu hình điểm tập.'); setLocationLoading(false); });
    }
    return onSnapshot(query(collection(db, 'locations'), where('name', '==', member.diemTap)), snap => {
      const matches = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setLocationDoc(matches.length === 1 ? matches[0] : null);
      setLocationError(matches.length === 1 ? '' : 'Không xác định duy nhất điểm tập trong locations. Hãy kiểm tra cấu hình.');
      setLocationLoading(false);
    }, () => { setLocationError('Không đọc được cấu hình điểm tập.'); setLocationLoading(false); });
  }, [member?.locationId, member?.diemTap]);

  // Không mặc định bật nếu thiếu cấu hình; quyền được xác định từ Firestore.
  const feature = key => locationDoc?.active === true && locationDoc?.features?.[key] === true;
  const items = [
    { label: 'Tổng quan', icon: <DashboardRounded /> },
    { label: 'Giới thiệu', icon: <PublicRounded /> },
    ...(feature('members') ? [{ label: 'Hội viên', icon: <GroupsRounded /> }] : []),
    ...(feature('tuition') ? [{ label: 'Học phí', icon: <PaymentsRounded /> }] : []),
    ...(feature('exams') ? [{ label: 'Thi cấp', icon: <EmojiEventsRounded /> }] : []),
    ...((locationDoc?.features && Object.prototype.hasOwnProperty.call(locationDoc.features, 'dan')
      ? feature('dan') : feature('exams')) ? [{ label: 'Thi đẳng', icon: <EmojiEventsRounded /> }] : []),
    ...(feature('attendance') ? [{ label: 'Điểm danh', icon: <FactCheckRounded /> }] : []),
    ...(feature('reports') ? [{ label: 'Báo cáo', icon: <AssessmentRounded /> }] : []),
    ...(feature('events') ? [{ label: 'Sự kiện', icon: <CalendarMonthRounded /> }] : []),
    ...(feature('training') ? [{ label: 'Đào tạo', icon: <SchoolRounded /> }] : []),
    ...(feature('achievements') ? [{ label: 'Thành tích', icon: <EmojiEventsRounded /> }] : []),
    ...(feature('leaveRequests') ? [{ label: 'Xin phép nghỉ', icon: <CalendarMonthRounded /> }] : []),
  ];
  const visiblePage = items.some(x => x.label === page) ? page : (items[0]?.label || '');
  const side = <Box className="sidebar-inner">
    <Box className="brand"><Box className="brand-mark"><ClubLogo alt="Logo Green Taekwondo" /></Box>
      <Box><Typography className="brand-title">CLB TAEKWONDO GREEN</Typography><Typography className="brand-subtitle">HỆ THỐNG QUẢN LÝ CLB</Typography></Box>
    </Box>
    <Box className="sidebar-section-label">VÕ SINH / PHỤ HUYNH</Box>
    <List className="nav-list">{items.map(item => <ListItemButton key={item.label} className="nav-item"
      selected={visiblePage === item.label} onClick={() => { setPage(item.label); setMobileOpen(false); }}>
      <ListItemIcon>{item.icon}</ListItemIcon><ListItemText primary={item.label}/>
    </ListItemButton>)}</List>
    <Box className="sidebar-bottom"><Box className="coach-card"><Avatar className="coach-avatar">{(member?.hoTen || 'V')[0]}</Avatar>
      <Box sx={{ minWidth: 0, flex: 1 }}><Typography className="coach-name" noWrap>{member?.hoTen || profile?.username || 'Hội viên'}</Typography>
      <Typography className="coach-role">Võ sinh / Phụ huynh</Typography></Box><Chip size="small" className="admin-chip" label="HỘI VIÊN"/></Box>
      <Typography className="sidebar-version">TKD GREEN CLUB · MEMBER</Typography>
    </Box>
  </Box>;
  return <ThemeProvider theme={liveTheme}><CssBaseline/><Box className="app-shell tkdg-approved tka-app green-design-final">
    <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
      {mobile ? <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { width: drawerWidth } }}>{side}</Drawer>
        : <Drawer variant="permanent" open sx={{ '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}>{side}</Drawer>}
    </Box>
    <Box className="main-area"><AppBar position="sticky" elevation={0} className="topbar"><Toolbar className="topbar-toolbar">
      {mobile && <IconButton onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}><MenuIcon/></IconButton>}
      <Box sx={{ flexGrow: 1 }}><Typography className="topbar-eyebrow">CLB TAEKWONDO GREEN / HỘI VIÊN</Typography>
      <Typography className="topbar-title">{visiblePage || 'Chưa được mở chức năng'}</Typography></Box><HeaderAccount />
    </Toolbar></AppBar><Box component="main" className="page-content tkg-member-portal">
            {memberError && <Alert severity="error" sx={{ mb: 2 }}>{memberError}</Alert>}
      {locationError && <Alert severity="warning" sx={{ mb: 2 }}>{locationError}</Alert>}
      <Box className="tkdp-area">
      {visiblePage === 'Tổng quan'
        ? <MemberDashboard member={member} profile={profile} navigate={setPage} enabled={Object.fromEntries(items.map(x => [x.label, true]))} />
        : visiblePage === 'Giới thiệu'
        ? <MemberContentFrame title="Giới thiệu"><PublicLocationIntroduction embedded /></MemberContentFrame>
        : visiblePage === 'Báo cáo'
        ? <MemberDashboard member={member} profile={profile} navigate={setPage} enabled={Object.fromEntries(items.map(x => [x.label, true]))} />
        : visiblePage === 'Thành tích'
        ? <MemberContentFrame title="Thành tích"><MemberAchievements memberDocId={memberId} /></MemberContentFrame>
        : visiblePage === 'Sự kiện' || visiblePage === 'Đào tạo'
        ? <MemberContentFrame title={visiblePage}><ClubContentManagement kind={visiblePage === 'Sự kiện' ? 'events' : 'training'} profile={profile} /></MemberContentFrame>
        : locationLoading ? <Typography>Đang tải cấu hình điểm tập...</Typography>
        : visiblePage ? <MemberSelfPortal profile={profile} embedded view={visiblePage} leaveEnabled={feature('leaveRequests')} examAccess={feature('exams') || (locationDoc?.features && Object.prototype.hasOwnProperty.call(locationDoc.features, 'dan') ? feature('dan') : feature('exams'))} locationId={locationDoc?.id || ''} />
        : <Alert severity="info">Điểm tập chưa bật chức năng nào cho võ sinh. Vui lòng liên hệ Admin.</Alert>}
      </Box>
      <TKDGreenMobileNav currentPage={visiblePage} pages={items.map(item => item.label)}
        onNavigate={(page) => { if (items.some(item => item.label === page)) setPage(page); }}
        onMenu={() => setMobileOpen(true)} />
      <Box className="footer"><Typography>© 2026 TKD GREEN CLUB</Typography><Typography>CỔNG THÔNG TIN VÕ SINH / PHỤ HUYNH</Typography></Box>
    </Box></Box>
  </Box></ThemeProvider>;
}

function App() {
  const appearance = useClubAppearance();
  const liveTheme = useMemo(() => createTheme(theme, { palette: { primary: { main: appearance.primary }, secondary: { main: appearance.secondary }, background: { default: appearance.background, paper: appearance.surface }, text: { primary: appearance.text } } }), [appearance.primary, appearance.secondary, appearance.background, appearance.surface, appearance.text]);
  
  // TKD_GREEN_DYNAMIC_LOCATION_FILTER_V9
  const { locations: clubLocations, loadingLocations, locationError } = useClubLocations();
  const { user, profile, loading, error } = useUserRole();

  const [selected, setSelected] = useState('Giới thiệu');
  const [tuitionFocusMemberId, setTuitionFocusMemberId] = useState("");
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location, setLocation] = useState('Tất cả điểm tập');
  const dashboardMetrics = useDashboardLiveMetrics(profile, location);
  const [search, setSearch] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
const [students, setStudents] = useState([]);
const [membersLoading, setMembersLoading] = useState(true);
const [membersError, setMembersError] = useState('');

// Kiểm tra quyền từ Firestore; không dùng vai trò HLV làm quyền mặc định.
const hasPermission = (module, action = 'view') =>
  profile?.role === 'admin' ||
  (profile?.role === 'hlv' && profile?.permissions?.[module]?.view === true &&
    (action === 'view' || profile?.permissions?.[module]?.[action] === true));
const canReviewLeave = profile?.role === 'admin' || (profile?.role === 'hlv' && (hasPermission('attendance','manage') || hasPermission('members','edit')));
const visibleNavItems = navItems.filter(item => ['public', 'content'].includes(item.module) || (item.module === 'leaveRequests' ? canReviewLeave : hasPermission(item.module)));
const allowedPages = [...visibleNavItems.map(item => item.label), ...(profile?.role === 'admin' ? ['Cài đặt'] : [])];
// Dùng trang có quyền ngay trong lần render đầu tiên khi quyền thay đổi.
const activePage = allowedPages.includes(selected) ? selected : (allowedPages[0] || '');
const navigate = (page) => {
  if (!allowedPages.includes(page)) return;
  setEditingMember(null);
  setShowAddMember(false);
  setSelected(page);
  setMobileOpen(false);
};
const canCreateMember = hasPermission('members', 'create');
const canEditMember = hasPermission('members', 'edit');

const isMobile = useMediaQuery(theme.breakpoints.down('md'));

const assignedPoints = useMemo(() => {
  // HLV có thể được gán theo tên, mã hoặc ID điểm tập. Truy vấn members vẫn dùng tên diemTap.
  const raw = assignedLocations(profile);
  return [...new Set(raw.map(value => {
    const found = clubLocations.find(x => [x.name, x.id, x.code].includes(value));
    return found?.name || value;
  }))];
}, [profile, clubLocations]);
const assignedKey = assignedPoints.join('\u0001');
// TKD_GREEN_ADMIN_LOCATION_FILTER_FIX
// Admin phải nhìn thấy mọi điểm tập đang quản lý, kể cả điểm tập chưa có hội viên.
// Nếu danh sách locations thiếu/sai quyền đọc, bổ sung tên điểm tập từ hồ sơ hội viên
// đã được Admin đọc, tránh bộ lọc chỉ còn "Tất cả điểm tập".
// Không dùng dữ liệu hội viên của Admin làm nguồn cho HLV: HLV vẫn theo phân quyền.
const availableLocations = useMemo(() => {
  const configured = (Array.isArray(clubLocations) ? clubLocations : [])
    .filter(x => x && x.deleted !== true && typeof x.name === 'string');
  const fromMembers = students.map(s => s.location).filter(Boolean);
  if (profile?.role === 'admin') {
    return ['Tất cả điểm tập', ...[...new Set([...configured.map(x => x.name), ...fromMembers])]
      .sort((a, b) => a.localeCompare(b, 'vi'))];
  }
  // HLV chỉ nhìn điểm tập được phân công trong profile; không dùng tất cả hồ sơ làm quyền.
  const assignedNames = assignedPoints.filter(name =>
    configured.some(x => x.name === name) || fromMembers.includes(name));
  return ['Tất cả điểm tập', ...[...new Set(assignedNames)]
    .sort((a, b) => a.localeCompare(b, 'vi'))];
}, [clubLocations, profile?.role, students, assignedPoints]);

// Không giữ bộ lọc điểm tập cũ khi chuyển sang tài khoản HLV khác.
useEffect(() => {
  if (!loadingLocations && !locationError && location !== 'Tất cả điểm tập' && !availableLocations.includes(location)) {
    setLocation('Tất cả điểm tập');
  }
}, [location, availableLocations, loadingLocations, locationError]);

useEffect(() => {
  if (!profile) {
    setStudents([]);
    setMembersLoading(false);
    return;
  }

  setMembersLoading(true);
  setMembersError('');
  setStudents([]);

  if (profile.role !== 'admin' && profile.role !== 'hlv') {
    setMembersError('Tài khoản chưa có vai trò hợp lệ để xem hội viên.');
    setMembersLoading(false);
    return;
  }

  if (profile.role === 'hlv' && !['members', 'tuition', 'exams', 'dan', 'achievements', 'attendance', 'reports', 'dashboard'].some(key => profile.permissions?.[key]?.view === true)) {
    setMembersLoading(false);
    return;
  }

  if (profile.role === 'hlv' && assignedPoints.length === 0) {
    setMembersError('HLV chưa được gán điểm tập trong hồ sơ (diemTap). Hãy kiểm tra cấu hình phân quyền.');
    setMembersLoading(false);
    return;
  }

  const membersRef = collection(db, 'members');
  // Firestore giới hạn số giá trị trong truy vấn "in"; chia nhóm tối đa 30.
  const memberQueries = profile.role === 'admin'
    ? [membersRef]
    : Array.from({ length: Math.ceil(assignedPoints.length / 30) }, (_, i) =>
        query(membersRef, where('diemTap', 'in', assignedPoints.slice(i * 30, (i + 1) * 30)))
      );

  const snapshots = new Map();
  const unsubscribers = memberQueries.map((membersQuery, index) =>
    onSnapshot(membersQuery, (snapshot) => {
      snapshots.set(index, snapshot.docs);
      const uniqueDocs = new Map();
      for (const docs of snapshots.values()) {
        docs.forEach((item) => uniqueDocs.set(item.id, item));
      }
      const data = [...uniqueDocs.values()].map((item) => {
        const member = item.data();
        return {
          id: item.id,
          maHV: member.maHV || '',
          maHoiVienNoiBo: member.maHoiVienNoiBo || '',
          name: member.hoTen || '',
          ngaySinh: member.ngaySinh || '',
          gioiTinh: member.gioiTinh || 'Nam',
          soDienThoaiPhuHuynh: member.soDienThoaiPhuHuynh || '',
          loaiHocPhi: member.loaiHocPhi || 'Tháng',
          ngayBatDau: member.ngayBatDau || '',
          ngayHetHan: member.ngayHetHan || '',
          lichSuChuKy: Array.isArray(member.lichSuChuKy) ? member.lichSuChuKy : [],
          location: member.diemTap || '',
          belt: member.capDaiDang || 'Chưa cập nhật',
          mauDai: member.mauDai || '',
          status: member.trangThai || 'Chưa cập nhật',
          fee: member.tinhTrangHocPhi || 'Chưa cập nhật',
        };
      });
      setStudents(data);
      if (snapshots.size === memberQueries.length) setMembersLoading(false);
      setMembersError('');
    }, (err) => {
      console.error('Lỗi đọc danh sách hội viên:', err);
      setStudents([]);
      setMembersError(err.code === 'permission-denied'
        ? 'Firestore từ chối quyền đọc hội viên (permission-denied). Cần kiểm tra Rules và điểm tập được gán.'
        : `Không tải được hội viên: ${err.message || err.code || 'Lỗi không xác định'}`);
      setMembersLoading(false);
    })
  );
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}, [profile?.role, assignedKey, profile?.uid]);


  const locationChartData = useMemo(() => getLocationChartData(
    students.filter(s => location === 'Tất cả điểm tập' || s.location === location)
  ), [students, location]);

  const filteredStudents = useMemo(() => students.filter((student) => {
    const matchesLocation =
      location === 'Tất cả điểm tập' || student.location === location;
    const query = search.trim().toLocaleLowerCase('vi');
    const matchesSearch =
      !query ||
      `${student.name} ${student.maHV} ${student.maHoiVienNoiBo} ${student.location}`
        .toLocaleLowerCase('vi')
        .includes(query);

    return matchesLocation && matchesSearch;
  }), [students, location, search]);

  if (loading) {
    return (
      <div style={{ padding: 32 }}>
        Đang kiểm tra quyền truy cập...
      </div>
    );
  }

  if (!user) {
    return <Box className="tkdg-approved tkdg-public"><PublicHome /></Box>;
  }

  if (!profile) {
    return (
      <div style={{ padding: 32 }}>
        <h2>Không có quyền truy cập</h2>
        <p>{error || 'Tài khoản chưa được cấp quyền.'}</p>
        <Box className="topbar-wordmark"><img src="/branding/green-wordmark.png" alt="Green Taekwondo logo" /></Box><GoogleLogin />
      </div>
    );
  }

  // Giữ phần return giao diện Dashboard hiện tại ở phía dưới.

  // Tài khoản võ sinh: sử dụng khung TKD Green nhưng KHÔNG mở các module quản trị.
  if (profile.role === 'member') {
    return <MemberPortalLayout profile={profile} user={user} />;
  }

  const drawerContent = (
    <Box className="sidebar-inner">
      <Box className="brand">
        <Box className="brand-mark"><ClubLogo alt="Logo Green Taekwondo" /></Box>
        <Box>
          <Typography className="brand-title">CLB TAEKWONDO GREEN</Typography>
          <Typography className="brand-subtitle">HỆ THỐNG QUẢN LÝ CLB</Typography>
        </Box>
      </Box>
      <Box className="sidebar-section-label">MENU CHÍNH</Box>
      <List className="nav-list">
        {visibleNavItems.map((item) => (
          <ListItemButton
            key={item.label}
            selected={activePage === item.label}
            onClick={() => navigate(item.label)}
            className="nav-item"
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
            {item.label === 'Hội viên' && <Typography className="nav-count">{students.length.toLocaleString("vi-VN")}</Typography>}
          </ListItemButton>
        ))}
      </List>
      
{profile.role === "admin" && (
  <>
    <Box className="sidebar-section-label settings-label">
      HỆ THỐNG
    </Box>

    <List className="nav-list">
      <ListItemButton
        className="nav-item"
        selected={activePage === "Cài đặt"}
        onClick={() => navigate("Cài đặt")}
      >
        <ListItemIcon>
          <SettingsRounded />
        </ListItemIcon>

        <ListItemText primary="Cài đặt" />
      </ListItemButton>
    </List>
  </>
)}

      <Box className="sidebar-bottom">
        
<Box className="coach-card">
  <Avatar className="coach-avatar">
    {(profile.email || user.email || "U").charAt(0).toUpperCase()}
  </Avatar>

  <Box sx={{ minWidth: 0, flex: 1 }}>
    <Typography className="coach-name" noWrap>
      {user.displayName || user.email}
    </Typography>

    <Typography className="coach-role">
      {profile.role === "admin" ? "Quản trị hệ thống" : "Huấn luyện viên"}
    </Typography>

    {profile.role === "hlv" && (
      <Typography variant="caption" display="block">
        {assignedPoints.join(", ") || "Chưa được phân công"}
      </Typography>
    )}
  </Box>

  <Chip
    label={profile.role === "admin" ? "ADMIN" : "HLV"}
    size="small"
    className="admin-chip"
  />
</Box>

        <Typography className="sidebar-version">CLB TAEKWONDO GREEN · QUẢN LÝ</Typography>
      </Box>
    </Box>
  )

  return (
    <ThemeProvider theme={liveTheme}>
      <CssBaseline />
      <Box className="app-shell tkdg-approved tka-app green-design-final">
        {/* Desktop: menu cố định 256px. Mobile: menu mở/đóng bằng nút trên thanh đầu. */}
        <Box component="nav" sx={{ width: { xs: 0, md: drawerWidth }, flexShrink: { md: 0 } }}>
          {isMobile ? (
            <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
              ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { width: drawerWidth } }}>
              {drawerContent}
            </Drawer>
          ) : (
            <Drawer variant="permanent" open sx={{ '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}>
              {drawerContent}
            </Drawer>
          )}
        </Box>

        <Box className="main-area" sx={{ flex: 1, minWidth: 0, width: 0, transition: 'width 220ms ease' }}>
          <AppBar position="sticky" elevation={0} className="topbar">
            <Toolbar className="topbar-toolbar">
              {isMobile && (
                <IconButton
                  onClick={() => setMobileOpen(true)}
                  aria-label="Mở menu điều hướng"
                  title="Mở menu"
                  sx={{ mr: 1, width: 44, height: 44, color: '#173b2b',
                    bgcolor: '#e6f3eb', border: '1px solid #9dc9ad',
                    '&:hover': { bgcolor: '#d3e9db' } }}
                >
                  <MenuIcon sx={{ fontSize: 28 }} />
                </IconButton>
              )}
              <Box sx={{ flexGrow: 1 }}>
                <Typography className="topbar-eyebrow">CLB TAEKWONDO GREEN / QUẢN LÝ</Typography>
                <Typography className="topbar-title">{activePage || "Chưa được cấp quyền"}</Typography>
              </Box>
              
<IconButton className="notification-button" aria-label="Thông báo" title="Thông báo">
  <Badge variant="dot" color="error">
    <NotificationsNoneRounded />
  </Badge>
</IconButton>

<HeaderAccount />

            </Toolbar>
          </AppBar>

          <Box component="main" className={`page-content tkg-all-modules tkg-module-${({ 'Hội viên':'members','Học phí':'tuition','Thi cấp':'cap','Thi đẳng':'dan','Điểm danh':'attendance','Báo cáo':'reports','Cài đặt':'settings','Duyệt đơn nghỉ':'leave','Thành tích':'achievements','Sự kiện':'events','Đào tạo':'training','Tổng quan':'dashboard','Giới thiệu':'public' })[activePage] || 'other'}`}>
            {activePage === 'Giới thiệu' ? (
              <PublicLocationIntroduction embedded />
            ) : activePage === 'Báo cáo' ? (
              <ReportsManagementLive students={students} profile={profile}
                location={location} onLocationChange={setLocation} locations={availableLocations} />
            ) : activePage === 'Thành tích' ? (
              <AchievementManagement profile={profile} students={students} />
            ) : activePage === 'Sự kiện' || activePage === 'Đào tạo' ? (
              <ClubContentManagement kind={activePage === 'Sự kiện' ? 'events' : 'training'} profile={profile} />
            ) : !activePage ? (
              <Paper sx={{ p: 3 }}><Typography>Chưa được cấp quyền sử dụng chức năng nào. Vui lòng liên hệ Admin.</Typography></Paper>
            ) : activePage === 'Tổng quan' ? (
              <TKDGreenDashboardA
                displayName={user.displayName || profile?.tenHienThi}
                isAdmin={profile?.role === 'admin'}
                canCreateMember={canCreateMember}
                onAddMember={() => { navigate('Hội viên'); setShowAddMember(true); }}
                metrics={dashboardMetrics}
                members={students}
                filteredMembers={filteredStudents}
                memberLoading={membersLoading}
                memberError={membersError}
                selectedLocation={location}
                locations={availableLocations}
                onLocationChange={setLocation}
                locationChartData={locationChartData}
                search={search}
                onSearchChange={setSearch}
                allowedPages={allowedPages}
                navigate={navigate}
              />
) : activePage === 'Hội viên' && editingMember && canEditMember ? (
  <EditMember
    member={editingMember}
    profile={profile}
    onSaved={() => {
      setEditingMember(null);
      setShowAddMember(false);
      setSelected('Hội viên');
    }}
    onCancel={() => {
      setEditingMember(null);
    }}
  />
) : activePage === 'Hội viên' && showAddMember && canCreateMember ? (
  <AddMember
    profile={profile}
    onSaved={() => {
      setShowAddMember(false);
      setSelected('Hội viên');
    }}
  />
) : activePage === 'Hội viên' ? (
  <MemberList
    profile={profile}
    students={students}
    loading={membersLoading}
    error={membersError}
    location={location}
    onLocationChange={setLocation}
    locations={availableLocations}
    onAdd={canCreateMember ? () => {
      setEditingMember(null);
      setShowAddMember(true);
    } : undefined}
    onEdit={canEditMember ? (member) => {
      setShowAddMember(false);
      setEditingMember(member);
    } : undefined}
    onCollectTuition={profile?.role === 'admin' && allowedPages.includes('Học phí') ? (member) => {
      setTuitionFocusMemberId(member.id);
      setSelected('Học phí');
      setLocation('Tất cả điểm tập');
    } : undefined}
  />

) : activePage === 'Học phí' ? (
  <TuitionManagement
    students={students}
    profile={profile}
    loading={membersLoading}
    error={membersError}
    location={location}
    onLocationChange={setLocation}
    locations={availableLocations}
    focusMemberId={tuitionFocusMemberId}
    onFocusHandled={() => setTuitionFocusMemberId('')}
  />

  ) : activePage === "Thi cấp" ? (
  <ExamManagement
    key="cap"
    examType="cap"
    students={students}
    profile={profile}
    loading={membersLoading}
    error={membersError}
    location={location}
  />
) : activePage === "Thi đẳng" ? (
  <ExamManagement
    key="dan"
    examType="dan"
    students={students}
    profile={profile}
    loading={membersLoading}
    error={membersError}
    location={location}
  />
) : activePage === "Duyệt đơn nghỉ" ? (
  <LeaveRequestsManagement profile={profile} students={students} />
) : activePage === "Điểm danh" ? (
  <AttendanceManagement
    students={students}
    profile={profile}
    loading={membersLoading}
  />
) : activePage === "Cài đặt" && profile.role === "admin" ? (
  <SettingsManagement profile={profile} />
) : (
  
  <Paper className="module-placeholder" elevation={0}>
    <Box className="module-placeholder-icon">
      <ShieldRounded />
    </Box>
    <Typography variant="h5">{activePage}</Typography>
    <Typography className="module-placeholder-text">
      Khu vực {activePage.toLocaleLowerCase('vi')} đã có mục điều hướng.
      Bước tiếp theo sẽ xây dựng chức năng và kết nối dữ liệu Firebase
      cho phân hệ này.
    </Typography>
    <Button
      variant="contained"
      onClick={() => navigate(allowedPages[0])}
    >
      Quay về tổng quan
    </Button>
  </Paper>
)}


            <TKDGreenMobileNav currentPage={activePage} pages={allowedPages}
              onNavigate={navigate} onMenu={() => setMobileOpen(true)} />
            <Box className="footer">
              <Typography>© 2026 CLB TAEKWONDO GREEN · HLV NGUYỄN HỮU TÀI</Typography>
              <Typography>HỆ THỐNG QUẢN LÝ CLB TAEKWONDO GREEN · AD-PuKwon </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
