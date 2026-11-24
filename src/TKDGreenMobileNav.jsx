import React from 'react';
import {
  DashboardRounded, GroupsRounded, PaymentsRounded,
  FactCheckRounded, MenuRounded,
} from '@mui/icons-material';

/** UI-only navigation: actual page access remains controlled by App.jsx. */
export default function TKDGreenMobileNav({ currentPage = '', pages = [], onNavigate, onMenu }) {
  const icons = {
    'Tổng quan': DashboardRounded,
    'Hội viên': GroupsRounded,
    'Học phí': PaymentsRounded,
    'Điểm danh': FactCheckRounded,
  };
  const preferred = ['Tổng quan', 'Hội viên', 'Học phí', 'Điểm danh'];
  const visible = preferred.filter(page => pages.includes(page));
  return (
    <nav className="tkdg-mobile-nav" aria-label="Điều hướng nhanh trên điện thoại">
      {visible.map(page => {
        const Icon = icons[page];
        return <button key={page} type="button" data-active={String(currentPage === page)}
          aria-current={currentPage === page ? 'page' : undefined}
          onClick={() => onNavigate?.(page)}>
          <Icon aria-hidden="true" />
          <span>{page === 'Tổng quan' ? 'Trang chủ' : page}</span>
        </button>;
      })}
      {Array.from({length: 4 - visible.length}, (_,i) =>
        <div key={`empty-${i}`} aria-hidden="true" />)}
      <button type="button" data-active="false" onClick={() => onMenu?.()} aria-label="Mở toàn bộ chức năng">
        <MenuRounded aria-hidden="true"/><span>Menu</span>
      </button>
    </nav>
  );
}
