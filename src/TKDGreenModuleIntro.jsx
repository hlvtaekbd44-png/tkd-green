import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  PaymentsRounded, EmojiEventsRounded, FactCheckRounded, AssessmentRounded,
  SettingsRounded, EventRounded, SchoolRounded, WorkspacePremiumRounded,
  GroupsRounded, CalendarMonthRounded, PublicRounded,
} from '@mui/icons-material';

const DETAILS = {
  'Hội viên': ['Quản lý hội viên', 'Hồ sơ, cấp đai và danh sách theo điểm tập', GroupsRounded],
  'Học phí': ['Quản lý học phí', 'Theo dõi các khoản thu, công nợ và lịch sử giao dịch', PaymentsRounded],
  'Thi cấp': ['Quản lý thi cấp', 'Đợt thi, đăng ký, kết quả và xuất danh sách', EmojiEventsRounded],
  'Thi đẳng': ['Quản lý thi đẳng', 'Kỳ thi thăng đẳng, đăng ký và nhập kết quả', WorkspacePremiumRounded],
  'Điểm danh': ['Quản lý điểm danh', 'Buổi tập, chuyên cần và tiến độ điểm danh', FactCheckRounded],
  'Duyệt đơn nghỉ': ['Duyệt đơn xin nghỉ', 'Theo dõi và xử lý yêu cầu nghỉ học', CalendarMonthRounded],
  'Báo cáo': ['Báo cáo & thống kê', 'Dữ liệu thực tế theo điểm tập được phân quyền', AssessmentRounded],
  'Sự kiện': ['Sự kiện câu lạc bộ', 'Quản lý và theo dõi các hoạt động', EventRounded],
  'Đào tạo': ['Đào tạo & chương trình', 'Tài liệu, quy trình và chương trình tập luyện', SchoolRounded],
  'Thành tích': ['Thành tích hội viên', 'Hồ sơ thành tích và kết quả giải đấu', EmojiEventsRounded],
  'Cài đặt': ['Cài đặt hệ thống', 'Điểm tập, tài khoản và quyền truy cập', SettingsRounded],
  'Giới thiệu': ['Giới thiệu CLB', 'Điểm tập và lịch học', PublicRounded],
};
export default function TKDGreenModuleIntro({ page, role, location }) {
  const [title, description, Icon] = DETAILS[page] || [page,'',PublicRounded];
  return <header className="tkg-module-hero" aria-label={'Phân hệ '+title}>
    <div className="tkg-module-hero-icon"><Icon fontSize="medium"/></div>
    <Box className="tkg-module-hero-copy">
      <Typography className="tkg-module-eyebrow">CLB TAEKWONDO GREEN / {role === 'admin' ? 'QUẢN TRỊ' : 'HUẤN LUYỆN VIÊN'}</Typography>
      <Typography component="h1" className="tkg-module-hero-title">{title}</Typography>
      <Typography className="tkg-module-hero-subtitle">{description}</Typography>
    </Box>
    <div className="tkg-module-hero-meta"><span>{location || 'Tất cả điểm tập'}</span></div>
  </header>;
}
