import React, { useMemo } from 'react';
import { Avatar, Box, Button, Chip, InputAdornment, MenuItem, Paper, TextField, Typography } from '@mui/material';
import {
  AddRounded, ArrowForwardRounded, AssessmentRounded, CalendarMonthRounded,
  CheckCircleRounded, EmojiEventsRounded, FactCheckRounded, GroupsRounded,
  PaymentsRounded, SearchRounded, SchoolRounded, WorkspacePremiumRounded,
  NotificationsActiveRounded, TrendingUpRounded, EventRounded, TuneRounded,
} from '@mui/icons-material';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import BeltBadge from './BeltBadge';

const fmt = n => Number(n || 0).toLocaleString('vi-VN');
const PALETTE = ['#078a50', '#f2ac38', '#d25d52', '#428bd1', '#8060bc', '#8aaa91'];
const SHORTCUTS = [
  { page: 'Hội viên', label: 'Hồ sơ hội viên', Icon: GroupsRounded },
  { page: 'Học phí', label: 'Thu học phí', Icon: PaymentsRounded },
  { page: 'Thi cấp', label: 'Đăng ký thi cấp', Icon: EmojiEventsRounded },
  { page: 'Thi đẳng', label: 'Đăng ký thi đẳng', Icon: WorkspacePremiumRounded },
  { page: 'Điểm danh', label: 'Điểm danh', Icon: FactCheckRounded },
  { page: 'Báo cáo', label: 'Xem báo cáo', Icon: AssessmentRounded },
];

function MetricCard({ title, amount, subtitle, Icon, tone = 'green' }) {
  return <Paper className={`tkd26-metric tkd26-metric--${tone}`} elevation={0}>
    <span className="tkd26-metric-icon"><Icon fontSize="small"/></span>
    <div className="tkd26-metric-title">{title}</div>
    <div className="tkd26-metric-value">{amount}</div>
    <div className="tkd26-metric-sub">{subtitle}</div>
  </Paper>;
}
function Panel({ title, note, Icon, extra, className = '', children }) {
  return <Paper className={`tkd26-panel ${className}`} elevation={0}>
    <div className="tkd26-panel-head">
      <div className="tkd26-panel-heading"><Icon fontSize="small"/><div><h2>{title}</h2>{note && <p>{note}</p>}</div></div>
      {extra}
    </div>
    {children}
  </Paper>;
}

// This screen only uses data and callbacks supplied by App.jsx after role/location filtering.
// No independent Firestore fetches, synthetic schedules or fabricated notifications.
export default function TKDGreenDashboardA({
  displayName, isAdmin, canCreateMember, onAddMember, metrics,
  members = [], filteredMembers = [], memberLoading = false, memberError = '',
  selectedLocation, locations = [], onLocationChange, locationChartData = [],
  search = '', onSearchChange, allowedPages = [], navigate,
}) {
  const scoped = useMemo(() => members.filter(m => selectedLocation === 'Tất cả điểm tập' || m.location === selectedLocation), [members, selectedLocation]);
  const totals = useMemo(() => {
    const active = scoped.filter(m => m.status === 'Đang học').length;
    const paused = scoped.filter(m => m.status === 'Tạm nghỉ').length;
    const quit = scoped.filter(m => m.status === 'Nghỉ học').length;
    const statuses = new Map();
    scoped.forEach(m => { const k = String(m.status || 'Chưa cập nhật').trim() || 'Chưa cập nhật'; statuses.set(k, (statuses.get(k) || 0) + 1); });
    return { active, paused, quit, statuses: [...statuses].map(([name, value]) => ({ name, value })) };
  }, [scoped]);
  const shortcuts = SHORTCUTS.filter(x => allowedPages.includes(x.page));
  const locationValue = locations.includes(selectedLocation) ? selectedLocation : (locations[0] || 'Tất cả điểm tập');
  const examPages = ['Thi cấp', 'Thi đẳng'].filter(x => allowedPages.includes(x));
  const hasEvents = allowedPages.includes('Sự kiện');

  return <Box className="tkd26-dashboard" aria-label="Trung tâm điều hành CLB TAEKWONDO GREEN">
    <section className="tkd26-page-top">
      <div className="tkd26-page-top-title">
        <span className="tkd26-eyebrow">TRUNG TÂM ĐIỀU HÀNH / {isAdmin ? 'QUẢN TRỊ' : 'HUẤN LUYỆN VIÊN'}</span>
        <h1>Chào mừng trở lại{displayName ? `, ${displayName}` : ''}!</h1>
        <p>Thông tin hoạt động câu lạc bộ theo phạm vi được phân quyền.</p>
      </div>
      <div className="tkd26-page-top-actions">
        {canCreateMember && <Button variant="contained" onClick={onAddMember} startIcon={<AddRounded/>}>Thêm hội viên</Button>}
        {allowedPages.includes('Báo cáo') && <Button variant="outlined" onClick={() => navigate('Báo cáo')} startIcon={<AssessmentRounded/>}>Báo cáo</Button>}
      </div>
    </section>

    <div className="tkd26-dashboard-bar">
      <div className="tkd26-dashboard-bar-label"><TrendingUpRounded fontSize="small"/> Tình hình hoạt động <Chip size="small" label={metrics?.periodLabel || 'Hiện tại'}/></div>
      <TextField select size="small" label="Điểm tập" value={locationValue} onChange={e => onLocationChange?.(e.target.value)} sx={{ minWidth: 216, maxWidth: '100%' }}>
        {locations.map(x => <MenuItem key={x} value={x}>{x}</MenuItem>)}
      </TextField>
    </div>

    <section className="tkd26-metrics" aria-label="Các chỉ số hoạt động">
      <MetricCard title="Tổng hội viên" amount={fmt(scoped.length)} subtitle="Hồ sơ theo điểm tập" Icon={GroupsRounded}/>
      <MetricCard title="Đang học" amount={fmt(totals.active)} subtitle={`${fmt(totals.paused)} tạm nghỉ`} Icon={SchoolRounded} tone="emerald"/>
      <MetricCard title="Học phí đã thu" amount={metrics?.collected || '—'} subtitle={metrics?.tuitionNote || 'Theo giao dịch thực tế'} Icon={PaymentsRounded} tone="blue"/>
      <MetricCard title="Đăng ký thi cấp" amount={metrics?.pending ?? '—'} subtitle={metrics?.examNote || 'Theo dữ liệu thi cấp'} Icon={EmojiEventsRounded} tone="amber"/>
    </section>

    <div className="tkd26-overview-grid">
      <Panel title="Hội viên theo điểm tập" note="Phân bố hồ sơ tại các điểm tập được phép xem" Icon={GroupsRounded} className="tkd26-locations">
        <div className="tkd26-chart">
          {locationChartData.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={locationChartData} margin={{ top: 10, left: -18, right: 8, bottom: 0 }}>
            <CartesianGrid stroke="#e4efe8" vertical={false} strokeDasharray="3 5"/>
            <XAxis dataKey="location" height={47} tickLine={false} axisLine={false} interval={0} tick={{ fill:'#5c7768', fontSize: 10 }}/>
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill:'#7f9489', fontSize: 10 }}/>
            <Tooltip formatter={n => [fmt(n), 'Hội viên']}/>
            <Bar dataKey="members" name="Hội viên" fill="#0c9958" radius={[5,5,0,0]} maxBarSize={42}/>
          </BarChart></ResponsiveContainer> : <p className="tkd26-empty">{memberLoading ? 'Đang tải dữ liệu...' : 'Chưa có dữ liệu hội viên.'}</p>}
        </div>
      </Panel>
      <Panel title="Cơ cấu hội viên" note="Theo trạng thái hồ sơ" Icon={TrendingUpRounded} className="tkd26-composition">
        {totals.statuses.length ? <div className="tkd26-donut-wrap">
          <div className="tkd26-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={totals.statuses} dataKey="value" innerRadius="64%" outerRadius="89%" cx="50%" cy="50%" stroke="none" paddingAngle={2}>
            {totals.statuses.map((s,i) => <Cell key={s.name} fill={PALETTE[i % PALETTE.length]}/>)}</Pie><Tooltip formatter={n => fmt(n)}/></PieChart></ResponsiveContainer>
            <span className="tkd26-donut-label"><strong>{fmt(scoped.length)}</strong><small>HỘI VIÊN</small></span>
          </div>
          <div className="tkd26-legend">{totals.statuses.map((s,i) => <div key={s.name}><i style={{background: PALETTE[i % PALETTE.length]}}/><span>{s.name}</span><strong>{fmt(s.value)}</strong></div>)}</div>
        </div> : <p className="tkd26-empty">Chưa có trạng thái hội viên.</p>}
      </Panel>
      <Panel title="Tình hình cần theo dõi" note="Số liệu trực tiếp từ hồ sơ hội viên" Icon={NotificationsActiveRounded} className="tkd26-alerts">
        <div className="tkd26-alert-row"><div className="tkd26-alert-mark green"><CheckCircleRounded/></div><span>Đang học</span><strong>{fmt(totals.active)}</strong></div>
        <div className="tkd26-alert-row"><div className="tkd26-alert-mark amber"><CalendarMonthRounded/></div><span>Tạm nghỉ</span><strong>{fmt(totals.paused)}</strong></div>
        <div className="tkd26-alert-row"><div className="tkd26-alert-mark red"><GroupsRounded/></div><span>Nghỉ học</span><strong>{fmt(totals.quit)}</strong></div>
        <div className="tkd26-alert-foot">Chỉ số tính từ danh sách được phân quyền, không phải thông báo giả lập.</div>
      </Panel>
    </div>

    <div className="tkd26-operation-grid">
      <Panel title="Lịch thi và hoạt động" note="Truy cập dữ liệu kỳ thi, sự kiện theo quyền" Icon={CalendarMonthRounded} className="tkd26-activity">
        <div className="tkd26-activity-list">
          {examPages.map(page => <button key={page} type="button" onClick={() => navigate(page)}><span className="tkd26-activity-icon"><EmojiEventsRounded/></span><span><strong>{page}</strong><small>Xem kỳ thi, danh sách đăng ký và kết quả</small></span><ArrowForwardRounded fontSize="small"/></button>)}
          {hasEvents && <button type="button" onClick={() => navigate('Sự kiện')}><span className="tkd26-activity-icon"><EventRounded/></span><span><strong>Sự kiện CLB</strong><small>Xem hoạt động và thông tin sự kiện</small></span><ArrowForwardRounded fontSize="small"/></button>}
          {!examPages.length && !hasEvents && <p className="tkd26-empty">Chưa có phân hệ hoạt động được cấp quyền.</p>}
        </div>
      </Panel>
      <Panel title="Truy cập nhanh" note="Chỉ hiển thị chức năng được cấp quyền" Icon={TuneRounded} className="tkd26-actions">
        <div className="tkd26-shortcut-grid">
          {shortcuts.map(({page,label,Icon}) => <button key={page} type="button" onClick={() => navigate(page)}><Icon fontSize="small"/><span>{label}</span></button>)}
          {!shortcuts.length && <p className="tkd26-empty">Không có thao tác được cấp quyền.</p>}
        </div>
      </Panel>
    </div>

    <Panel title="Danh sách hội viên" note="Tra cứu nhanh theo tên, mã và điểm tập" Icon={GroupsRounded} className="tkd26-members"
      extra={allowedPages.includes('Hội viên') ? <Button size="small" onClick={() => navigate('Hội viên')} endIcon={<ArrowForwardRounded/>}>Xem tất cả</Button> : null}>
      <TextField size="small" className="tkd26-member-search" placeholder="Tìm hội viên..." value={search} onChange={e => onSearchChange?.(e.target.value)} slotProps={{ input:{ startAdornment:<InputAdornment position="start"><SearchRounded fontSize="small"/></InputAdornment> } }}/>
      {memberError && <div role="alert" className="tkd26-error">{memberError}</div>}
      <div className="tkd26-member-head"><span>HỘI VIÊN</span><span>ĐIỂM TẬP</span><span>CẤP ĐAI</span><span>TRẠNG THÁI</span></div>
      {filteredMembers.slice(0,5).map(m => <div className="tkd26-member-row" key={m.id}>
        <div className="tkd26-member-id"><Avatar>{String(m.name || 'H').trim().slice(-1)}</Avatar><div><strong>{m.name || 'Chưa cập nhật'}</strong><small>{m.maHoiVienNoiBo || '—'}</small></div></div>
        <span>{m.location || '—'}</span><span><BeltBadge level={m.belt} showName compact/></span>
        <span><Chip size="small" label={m.status || '—'} color={m.status === 'Đang học' ? 'success' : m.status === 'Tạm nghỉ' ? 'warning' : 'default'}/></span>
      </div>)}
      {!filteredMembers.length && <p className="tkd26-empty">{memberLoading ? 'Đang tải danh sách...' : 'Không có hội viên phù hợp.'}</p>}
    </Panel>
  </Box>;
}
