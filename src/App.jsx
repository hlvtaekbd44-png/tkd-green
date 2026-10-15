import { useMemo, useState } from 'react'
import {
  AppBar, Avatar, Badge, Box, Button, Chip, CssBaseline, Divider,
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
import './App.css'

const drawerWidth = 258

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: { main: '#176b45', dark: '#104b31', light: '#e5f4eb' },
    secondary: { main: '#c6a75e' },
    background: { default: '#f4f7f5', paper: '#ffffff' },
    text: { primary: '#172b21', secondary: '#68766e' },
  },
  shape: { borderRadius: 14 },
  typography: {
    fontFamily: '"Inter", "Segoe UI", Arial, sans-serif',
    button: { textTransform: 'none', fontWeight: 700 },
    h5: { fontWeight: 800, letterSpacing: '-0.5px' },
  },
})

const navItems = [
  { label: 'Tổng quan', icon: <DashboardRounded /> },
  { label: 'Hội viên', icon: <GroupsRounded /> },
  { label: 'Học phí', icon: <PaymentsRounded /> },
  { label: 'Thi cấp', icon: <EmojiEventsRounded /> },
  { label: 'Điểm danh', icon: <FactCheckRounded /> },
  { label: 'Báo cáo', icon: <AssessmentRounded /> },
]

const locations = ['Tất cả điểm tập', 'Lê Văn Tám', 'Nghĩa Trung', 'Đồng Tâm', 'T6', 'Phước Sơn', 'Minh Hưng']

const students = [
  { id: 'HV_00128', name: 'Nguyễn Minh Anh', location: 'Lê Văn Tám', belt: 'Đai xanh', status: 'Đang học', fee: 'Đã đóng' },
  { id: 'HV_00127', name: 'Trần Gia Bảo', location: 'Đồng Tâm', belt: 'Đai vàng', status: 'Đang học', fee: 'Sắp đến hạn' },
  { id: 'HV_00126', name: 'Lê Hoàng Phúc', location: 'Nghĩa Trung', belt: 'Đai đỏ', status: 'Đang học', fee: 'Còn nợ' },
  { id: 'HV_00125', name: 'Phạm Ngọc Hà', location: 'Minh Hưng', belt: 'Đai trắng', status: 'Tạm nghỉ', fee: 'Đã đóng' },
]

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

function App() {
  const [selected, setSelected] = useState('Tổng quan')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [location, setLocation] = useState('Tất cả điểm tập')
  const [search, setSearch] = useState('')
  const isMobile = useMediaQuery(theme.breakpoints.down('md'))

  const filteredStudents = useMemo(() => students.filter((student) => {
    const matchesLocation = location === 'Tất cả điểm tập' || student.location === location
    const query = search.trim().toLocaleLowerCase('vi')
    const matchesSearch = !query || `${student.name} ${student.id} ${student.location}`.toLocaleLowerCase('vi').includes(query)
    return matchesLocation && matchesSearch
  }), [location, search])

  const drawerContent = (
    <Box className="sidebar-inner">
      <Box className="brand">
        <Box className="brand-mark"><ShieldRounded /></Box>
        <Box>
          <Typography className="brand-title">TKD GREEN</Typography>
          <Typography className="brand-subtitle">CLUB MANAGEMENT</Typography>
        </Box>
      </Box>
      <Box className="sidebar-section-label">MENU CHÍNH</Box>
      <List className="nav-list">
        {navItems.map((item) => (
          <ListItemButton
            key={item.label}
            selected={selected === item.label}
            onClick={() => { setSelected(item.label); setMobileOpen(false) }}
            className="nav-item"
          >
            <ListItemIcon>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
            {item.label === 'Hội viên' && <Typography className="nav-count">1.008</Typography>}
          </ListItemButton>
        ))}
      </List>
      <Box className="sidebar-section-label settings-label">HỆ THỐNG</Box>
      <List className="nav-list">
        <ListItemButton className="nav-item" onClick={() => { setSelected('Cài đặt'); setMobileOpen(false) }}>
          <ListItemIcon><SettingsRounded /></ListItemIcon>
          <ListItemText primary="Cài đặt" />
        </ListItemButton>
      </List>
      <Box className="sidebar-bottom">
        <Box className="coach-card">
          <Avatar className="coach-avatar">HT</Avatar>
          <Box sx={{ minWidth: 0 }}>
            <Typography className="coach-name">HLV Nguyễn Hữu Tài</Typography>
            <Typography className="coach-role">Quản trị hệ thống</Typography>
          </Box>
          <Chip label="ADMIN" size="small" className="admin-chip" />
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
                <Typography className="topbar-title">{selected}</Typography>
              </Box>
              <IconButton className="notification-button" aria-label="Thông báo">
                <Badge variant="dot" color="error"><NotificationsNoneRounded /></Badge>
              </IconButton>
              <Avatar className="topbar-avatar">HT</Avatar>
            </Toolbar>
          </AppBar>

          <Box component="main" className="page-content">
            <Box className="welcome-row">
              <Box>
                <Typography className="welcome-kicker">HỆ THỐNG QUẢN LÝ CLB TAEKWONDO</Typography>
                <Typography variant="h5" className="welcome-title">Xin chào, HLV Nguyễn Hữu Tài 👋</Typography>
                <Typography className="welcome-description">Theo dõi hoạt động và tình hình câu lạc bộ tại một nơi.</Typography>
              </Box>
              <Button variant="contained" startIcon={<AddRounded />} className="add-student-button" onClick={() => setSelected('Hội viên')}>
                Thêm hội viên
              </Button>
            </Box>

            <Paper className="filter-bar" elevation={0}>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ sm: 'center' }}>
                <Stack direction="row" spacing={1} alignItems="center" sx={{ flexGrow: 1 }}>
                  <CalendarMonthRounded className="filter-icon" />
                  <Typography className="filter-label">Kỳ báo cáo</Typography>
                  <Chip label="Tháng 10, 2026" className="period-chip" />
                </Stack>
                <TextField select SelectProps={{ native: true }} value={location} onChange={(e) => setLocation(e.target.value)}
                  size="small" className="location-select" inputProps={{ 'aria-label': 'Lọc theo điểm tập' }}>
                  {locations.map((item) => <option key={item} value={item}>{item}</option>)}
                </TextField>
              </Stack>
            </Paper>

            {selected === 'Tổng quan' ? (
              <>
                <Box className="stats-grid">
                  <StatCard title="Tổng hội viên" value="1.008" note="+8,7% so với tháng trước" icon={<GroupsRounded />} />
                  <StatCard title="Đang học" value="946" note="93,8% tổng hội viên" icon={<FactCheckRounded />} />
                  <StatCard title="Học phí đã thu" value="186,5 tr" note="Tháng 10/2026" icon={<PaymentsRounded />} accent />
                  <StatCard title="Chờ thi cấp" value="42" note="Trong danh sách đăng ký" icon={<EmojiEventsRounded />} />
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
                    ].map((item) => (
                      <Button key={item.label} className="quick-link" onClick={() => setSelected(item.target)} fullWidth>
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
                      <Typography className="panel-subtitle">Dữ liệu minh họa giao diện — chưa kết nối Firebase</Typography>
                    </Box>
                    <TextField size="small" placeholder="Tìm tên, mã hội viên..." value={search} onChange={(e) => setSearch(e.target.value)}
                      className="student-search" InputProps={{ startAdornment: <InputAdornment position="start"><SearchRounded fontSize="small" /></InputAdornment> }} />
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
                          <Box><Typography className="student-name">{student.name}</Typography><Typography className="student-id">{student.id}</Typography></Box>
                        </Box>
                        <Typography className="table-cell">{student.location}</Typography>
                        <Typography className="table-cell">{student.belt}</Typography>
                        <Box><Chip label={student.status} size="small" className={student.status === 'Đang học' ? 'status-active' : 'status-paused'} /></Box>
                        <Box><Chip label={student.fee} size="small" className={student.fee === 'Đã đóng' ? 'fee-paid' : student.fee === 'Còn nợ' ? 'fee-debt' : 'fee-due'} /></Box>
                      </Box>
                    )) : <Typography className="empty-state">Không tìm thấy hội viên phù hợp.</Typography>}
                  </Box>
                  <Button className="view-all-button" endIcon={<ArrowForwardRounded />} onClick={() => setSelected('Hội viên')}>Xem danh sách hội viên</Button>
                </Paper>
              </>
            ) : (
              <Paper className="module-placeholder" elevation={0}>
                <Box className="module-placeholder-icon"><ShieldRounded /></Box>
                <Typography variant="h5">{selected}</Typography>
                <Typography className="module-placeholder-text">
                  Khu vực {selected.toLocaleLowerCase('vi')} đã có mục điều hướng. Bước tiếp theo sẽ xây dựng chức năng và kết nối dữ liệu Firebase cho phân hệ này.
                </Typography>
                <Button variant="contained" onClick={() => setSelected('Tổng quan')}>Quay về tổng quan</Button>
              </Paper>
            )}

            <Box className="footer">
              <Typography>© 2026 TKD GREEN CLUB · HLV NGUYỄN HỮU TÀI</Typography>
              <Typography>HỆ THỐNG QUẢN LÝ CLB TAEKWONDO · FULL STYLE (FINAL)</Typography>
            </Box>
          </Box>
        </Box>
      </Box>
    </ThemeProvider>
  )
}

export default App
