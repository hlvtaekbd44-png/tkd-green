import GoogleLogin from "./GoogleLogin";
import useDashboardLiveMetrics from "./useDashboardLiveMetrics";
import MemberSelfPortal from "./MemberSelfPortal";
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
  CalendarMonthRounded, ArrowForwardRounded, ShieldRounded,
} from '@mui/icons-material'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import AddMember from "./AddMember";
import MemberList from "./MemberList";
import EditMember from "./EditMember";
import TuitionManagement from "./TuitionManagement";
import ExamManagement from "./ExamManagement";
import AttendanceManagement from "./AttendanceManagement";
import SettingsManagement from "./SettingsManagement";
import './App.css'
import HeaderAccount from "./HeaderAccount";

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
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 700 },
    h5: { fontWeight: 800, letterSpacing: '-0.5px' },
  },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none', border: '1px solid #e0ebe4' } } },
    MuiButton: { styleOverrides: { root: { borderRadius: 10, boxShadow: 'none', minHeight: 36 }, containedPrimary: { '&:hover': { boxShadow: '0 7px 20px #0c9f6050' } } } },
    MuiTextField: { defaultProps: { size: 'small' } },
    MuiOutlinedInput: { styleOverrides: { root: { borderRadius: 10, backgroundColor: '#ffffff' } } },
    MuiDialog: { styleOverrides: { paper: { backgroundColor: '#ffffff', backgroundImage: 'none', border: '1px solid #dbe9df', borderRadius: 18 } } },
    MuiTableCell: { styleOverrides: { root: { borderBottom: '1px solid #e6eee8' }, head: { fontWeight: 800, color: '#446b56' } } },
    MuiChip: { styleOverrides: { root: { fontWeight: 700 } } },
  },
})

const navItems = [
  { label: 'Tổng quan', module: 'dashboard', icon: <DashboardRounded /> },
  { label: 'Hội viên', module: 'members', icon: <GroupsRounded /> },
  { label: 'Học phí', module: 'tuition', icon: <PaymentsRounded /> },
  { label: 'Thi cấp', module: 'exams', icon: <EmojiEventsRounded /> },
  { label: 'Điểm danh', module: 'attendance', icon: <FactCheckRounded /> },
  { label: 'Báo cáo', module: 'reports', icon: <AssessmentRounded /> },
]

const locations = ['Tất cả điểm tập', 'Lê Văn Tám', 'Nghĩa Trung', 'Đồng Tâm', 'Thôn 6', 'Phước Sơn', 'Minh Hưng']

// Chuẩn hóa điểm tập được gán; không suy diễn quyền từ các cờ chức năng.
function assignedLocations(profile) {
  const value = profile?.diemTap;
  if (Array.isArray(value)) return [...new Set(value.filter((v) => typeof v === 'string' && v.trim()).map((v) => v.trim()))];
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

const chartData = [
  { month: 'T5', members: 720 }, { month: 'T6', members: 765 },
  { month: 'T7', members: 810 }, { month: 'T8', members: 864 },
  { month: 'T9', members: 927 }, { month: 'T10', members: 1008 },
]

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
  const [page, setPage] = useState('Hội viên');
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
    ...(feature('members') ? [{ label: 'Hội viên', icon: <GroupsRounded /> }] : []),
    ...(feature('tuition') ? [{ label: 'Học phí', icon: <PaymentsRounded /> }] : []),
    ...(feature('exams') ? [{ label: 'Thi cấp', icon: <EmojiEventsRounded /> }] : []),
    ...(feature('attendance') ? [{ label: 'Điểm danh', icon: <FactCheckRounded /> }] : []),
    ...(feature('reports') ? [{ label: 'Báo cáo', icon: <AssessmentRounded /> }] : []),
    ...(feature('leaveRequests') ? [{ label: 'Xin phép nghỉ', icon: <CalendarMonthRounded /> }] : []),
  ];
  const visiblePage = items.some(x => x.label === page) ? page : (items[0]?.label || '');
  const side = <Box className="sidebar-inner">
    <Box className="brand"><Box className="brand-mark"><img src="/branding/green-emblem.png" alt="Logo Green Taekwondo" /></Box>
      <Box><Typography className="brand-title">TKD GREEN</Typography><Typography className="brand-subtitle">CLUB MANAGEMENT</Typography></Box>
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
  return <ThemeProvider theme={theme}><CssBaseline/><Box className="app-shell">
    <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
      {mobile ? <Drawer variant="temporary" open={mobileOpen} onClose={() => setMobileOpen(false)}
        ModalProps={{ keepMounted: true }} sx={{ '& .MuiDrawer-paper': { width: drawerWidth } }}>{side}</Drawer>
        : <Drawer variant="permanent" open sx={{ '& .MuiDrawer-paper': { width: drawerWidth, boxSizing: 'border-box' } }}>{side}</Drawer>}
    </Box>
    <Box className="main-area"><AppBar position="sticky" elevation={0} className="topbar"><Toolbar className="topbar-toolbar">
      {mobile && <IconButton onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}><MenuIcon/></IconButton>}
      <Box sx={{ flexGrow: 1 }}><Typography className="topbar-eyebrow">TKD GREEN CLUB / VÕ SINH</Typography>
      <Typography className="topbar-title">{visiblePage || 'Chưa được mở chức năng'}</Typography></Box><HeaderAccount />
    </Toolbar></AppBar><Box component="main" className="page-content">
      {memberError && <Alert severity="error" sx={{ mb: 2 }}>{memberError}</Alert>}
      {locationError && <Alert severity="warning" sx={{ mb: 2 }}>{locationError}</Alert>}
      {locationLoading ? <Typography>Đang tải cấu hình điểm tập...</Typography> : visiblePage
        ? <MemberSelfPortal profile={profile} embedded view={visiblePage} leaveEnabled={feature('leaveRequests') && member?.locationId === locationDoc?.id} />
        : <Alert severity="info">Điểm tập chưa bật chức năng nào cho võ sinh. Vui lòng liên hệ Admin.</Alert>}
      <Box className="footer"><Typography>© 2026 TKD GREEN CLUB</Typography><Typography>CỔNG THÔNG TIN VÕ SINH / PHỤ HUYNH</Typography></Box>
    </Box></Box>
  </Box></ThemeProvider>;
}

function App() {
  const { user, profile, loading, error } = useUserRole();

  const [selected, setSelected] = useState('Tổng quan');
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
const visibleNavItems = navItems.filter(item => hasPermission(item.module));
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

const assignedPoints = useMemo(() => assignedLocations(profile), [profile]);
const assignedKey = assignedPoints.join('\u0001');
const availableLocations = useMemo(() => (
  profile?.role === 'admin'
    ? locations
    : ['Tất cả điểm tập', ...assignedPoints]
), [profile?.role, assignedKey]);

// Không giữ bộ lọc điểm tập cũ khi chuyển sang tài khoản HLV khác.
useEffect(() => {
  if (location !== 'Tất cả điểm tập' && !availableLocations.includes(location)) {
    setLocation('Tất cả điểm tập');
  }
}, [location, availableLocations]);

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

  if (profile.role === 'hlv' && !['members', 'tuition', 'exams', 'attendance', 'reports', 'dashboard'].some(key => profile.permissions?.[key]?.view === true)) {
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
    return (
      <div style={{ padding: 32 }}>
        <h2>CLB Taekwondo Green</h2>
        <p>Vui lòng đăng nhập bằng tài khoản được CLB cấp.</p>
        <Box className="topbar-wordmark"><img src="/branding/green-wordmark.png" alt="Green Taekwondo logo" /></Box><GoogleLogin />
      </div>
    );
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
        <Box className="brand-mark"><img src="/branding/green-emblem.png" alt="Logo Green Taekwondo" /></Box>
        <Box>
          <Typography className="brand-title">TKD GREEN</Typography>
          <Typography className="brand-subtitle">CLUB MANAGEMENT</Typography>
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

        <Typography className="sidebar-version">TKD GREEN CLUB · FULL STYLE</Typography>
      </Box>
    </Box>
  )

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <Box className="app-shell">
        <Box component="nav" sx={{ width: { md: drawerWidth }, flexShrink: { md: 0 } }}>
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

        <Box className="main-area">
          <AppBar position="sticky" elevation={0} className="topbar">
            <Toolbar className="topbar-toolbar">
              {isMobile && <IconButton onClick={() => setMobileOpen(true)} sx={{ mr: 1 }}><MenuIcon /></IconButton>}
              <Box sx={{ flexGrow: 1 }}>
                <Typography className="topbar-eyebrow">TKD GREEN CLUB / QUẢN LÝ</Typography>
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

          <Box component="main" className="page-content">
            {activePage === "Tổng quan" && (
              <>
              <Box className="welcome-row">
                <Box>
                  <Typography className="welcome-kicker">HỆ THỐNG QUẢN LÝ CLB TAEKWONDO</Typography>
                  <Typography variant="h5" className="welcome-title">Xin chào, HLV Nguyễn Hữu Tài 👋</Typography>
                  <Typography className="welcome-description">Theo dõi hoạt động và tình hình câu lạc bộ tại một nơi.</Typography>
                </Box>
                {canCreateMember && <Button variant="contained" startIcon={<AddRounded />} className="add-student-button" onClick={() => {
    navigate('Hội viên');
    setShowAddMember(true);
  }}>
                  Thêm hội viên
                </Button>}
              </Box>
  
              <Paper className="filter-bar" elevation={0}>
                <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                  <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
                    <CalendarMonthRounded className="filter-icon" />
                    <Typography className="filter-label">Kỳ báo cáo</Typography>
                    <Chip label={dashboardMetrics.periodLabel} className="period-chip" />
                  </Stack>
                  <TextField select slotProps={{ select: { native: true }, htmlInput: { "aria-label": "Lọc theo điểm tập" } }} value={location} onChange={(e) => setLocation(e.target.value)}
                    size="small" className="location-select">
                    {availableLocations.map((item) => <option key={item} value={item}>{item}</option>)}
                  </TextField>
                </Stack>
              </Paper>
              </>
            )}

            {!activePage ? (
              <Paper sx={{ p: 3 }}><Typography>Chưa được cấp quyền sử dụng chức năng nào. Vui lòng liên hệ Admin.</Typography></Paper>
            ) : activePage === 'Tổng quan' ? (
              <>
                <Box className="stats-grid">
                  <StatCard title="Tổng hội viên" value={students.length.toLocaleString("vi-VN")} note="Theo dữ liệu được phân quyền" icon={<GroupsRounded />} />
                  <StatCard title="Đang học" value={students.filter((s) => s.status === "Đang học").length.toLocaleString("vi-VN")} note="Theo dữ liệu được phân quyền" icon={<FactCheckRounded />} />
                  <StatCard title="Học phí đã thu" value={dashboardMetrics.collected} note={dashboardMetrics.tuitionNote} icon={<PaymentsRounded />} accent />
                  <StatCard title="Chờ thi cấp" value={dashboardMetrics.pending} note={dashboardMetrics.examNote} icon={<EmojiEventsRounded />} />
                </Box>

                <Box className="dashboard-grid">
                  <Paper className="panel chart-panel" elevation={0}>
                    <Stack direction="row" justifyContent="space-between" alignItems="flex-start" spacing={2}>
                      <Box>
                        <Typography className="panel-title">Tăng trưởng hội viên</Typography>
                        <Typography className="panel-subtitle">Số lượng hội viên trong 6 tháng gần nhất</Typography>
                      </Box>
                      <Chip label="2026" className="chart-year-chip" />
                    </Stack>
                    <Box className="chart-wrap">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} margin={{ top: 18, right: 8, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#e9efeb" />
                          <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#78867d', fontSize: 12 }} />
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: '#78867d', fontSize: 12 }} />
                          <Tooltip cursor={{ fill: '#edf5ef' }} />
                          <Bar dataKey="members" name="Hội viên" fill="#176b45" radius={[6, 6, 0, 0]} maxBarSize={42} />
                        </BarChart>
                      </ResponsiveContainer>
                    </Box>
                  </Paper>

                  <Paper className="panel quick-panel" elevation={0}>
                    <Typography className="panel-title">Truy cập nhanh</Typography>
                    <Typography className="panel-subtitle">Các nghiệp vụ thường dùng</Typography>
                    {[
                      { label: 'Quản lý hội viên', desc: 'Danh sách và hồ sơ võ sinh', icon: <GroupsRounded />, target: 'Hội viên' },
                      { label: 'Thu học phí', desc: 'Ghi nhận khoản thu và công nợ', icon: <PaymentsRounded />, target: 'Học phí' },
                      { label: 'Đăng ký thi cấp', desc: 'Danh sách và kết quả thi', icon: <EmojiEventsRounded />, target: 'Thi cấp' },
                    ].filter(item => allowedPages.includes(item.target)).map((item) => (
                      <Button key={item.label} className="quick-link" onClick={() => navigate(item.target)} fullWidth>
                        <Box className="quick-link-icon">{item.icon}</Box>
                        <Box className="quick-link-copy">
                          <Typography className="quick-link-title">{item.label}</Typography>
                          <Typography className="quick-link-desc">{item.desc}</Typography>
                        </Box>
                        <ArrowForwardRounded className="quick-arrow" />
                      </Button>
                    ))}
                  </Paper>
                </Box>

                <Paper className="panel students-panel" elevation={0}>
                  <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'center' }} spacing={2} className="students-header">
                    <Box>
                      <Typography className="panel-title">Hội viên gần đây</Typography>
                      <Typography className="panel-subtitle">
  {membersLoading
    ? 'Đang tải dữ liệu hội viên...'
    : membersError
      ? membersError
      : `Có ${students.length.toLocaleString('vi-VN')} hội viên`}
</Typography>
                    </Box>
                    <TextField size="small" placeholder="Tìm tên, mã hội viên VTF..." value={search} onChange={(e) => setSearch(e.target.value)}
                      className="student-search" slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> } }} />
                  </Stack>
                  <Box className="student-table-wrap">
                    <Box className="student-table-head">
                      <Typography>MÃ HỘI VIÊN / HỌ TÊN</Typography><Typography>ĐIỂM TẬP</Typography>
                      <Typography>CẤP ĐAI</Typography><Typography>TRẠNG THÁI</Typography><Typography>HỌC PHÍ</Typography>
                    </Box>
                    {filteredStudents.length ? filteredStudents.map((student) => (
                      <Box className="student-table-row" key={student.id}>
                        <Box className="student-name-cell">
                          <Avatar className="student-avatar">{student.name.split(' ').slice(-1)[0].charAt(0)}</Avatar>
                          <Box><Typography className="student-name">{student.name}</Typography><Stack spacing={0.3}>
                          <Typography className="student-id">
                            {student.maHoiVienNoiBo || "Chưa cấp ID nội bộ"}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            VTF: {student.maHV || "Chưa cấp"}
                          </Typography>
                        </Stack>
                        </Box>
                        </Box>
                        <Typography className="table-cell">{student.location}</Typography>
                        <Typography className="table-cell">{student.belt}</Typography>
                        <Box><Chip label={student.status} size="small" className={student.status === 'Đang học' ? 'status-active' : 'status-paused'} /></Box>
                        <Box><Chip label={student.fee} size="small" className={student.fee === 'Đã đóng' ? 'fee-paid' : student.fee === 'Còn nợ' ? 'fee-debt' : 'fee-due'} /></Box>
                      </Box>
                    )) : <Typography className="empty-state">Không tìm thấy hội viên phù hợp.</Typography>}
                  </Box>
                  <Button className="view-all-button" endIcon={<ArrowForwardRounded />} onClick={() => navigate('Hội viên')}>Xem danh sách hội viên</Button>
                </Paper>
              </>
                          

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
  />

  ) : activePage === "Thi cấp" ? (
  <ExamManagement
    students={students}
    profile={profile}
    loading={membersLoading}
    error={membersError}
    location={location}
  />
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


            <Box className="footer">
              <Typography>© 2026 TKD GREEN CLUB · HLV NGUYỄN HỮU TÀI</Typography>
              <Typography>HỆ THỐNG QUẢN LÝ CLB TAEKWONDO GREEN · AD-PuKwon </Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
