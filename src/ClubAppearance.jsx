import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';
import './ClubAppearance.css';

export const DEFAULT_APPEARANCE = Object.freeze({
  name: 'Xanh CLB truyền thống', primary: '#087D4B', secondary: '#BC923D',
  background: '#F4F8F5', surface: '#FFFFFF', text: '#18362A',
  sidebar: '#083D2F', header: '#FFFFFF', accent: '#E6B957', border: '#D6E5DB',
  menuActive: '#176348', logoUrl: '',
});
// 18 bo mau: Moi bo co the chinh sua tung mau va luu tu do.
const PRESET_BASE = [
  ['Xanh CLB truyền thống','#087D4B','#BC923D','#F4F8F5','#FFFFFF','#18362A','#083D2F','#FFFFFF','#E6B957','#D6E5DB','#176348'],
  ['Xanh ngọc hiện đại','#006B63','#DB9E37','#EEF8F7','#FFFFFF','#123D3B','#084E48','#FFFFFF','#E4BA70','#D0E5E1','#167C70'],
  ['Navy chuyên nghiệp','#143C62','#D7A548','#F1F5FB','#FFFFFF','#20334B','#112D4C','#FFFFFF','#DEB65C','#D9E1ED','#275B8B'],
  ['Xanh rêu trang trọng','#214C3D','#BD9446','#EDF1ED','#FFFFFF','#24382F','#193F33','#FFFFFF','#E0BC70','#D0DCD4','#376B53'],
  ['Trắng tối giản','#276A52','#657B73','#FAFBF9','#FFFFFF','#26352E','#245642','#FFFFFF','#B99955','#E1E9E3','#3C8064'],
  ['Xanh lá năng động','#16803B','#F4B340','#F2FAF4','#FFFFFF','#1B3925','#125C31','#FFFFFF','#FFCB62','#D2EBD8','#239748'],
  ['Xanh bạc hà','#008A72','#F1A76D','#EDFAF7','#FFFFFF','#174239','#086754','#FFFFFF','#F1C888','#CFEAE3','#149985'],
  ['Xanh lam thể thao','#0967A4','#F1A53A','#F0F7FC','#FFFFFF','#173C59','#0B3D69','#FFFFFF','#F6C36A','#D5E7F4','#1675B3'],
  ['Xanh lục & Vàng kim','#09694F','#D3A539','#F6FAF7','#FFFFFF','#18382E','#064734','#FFFFFF','#F2C560','#DCE9DF','#1B8261'],
  ['Xám than & Vàng','#344048','#D6A744','#F2F3F5','#FFFFFF','#28343B','#212B32','#FFFFFF','#E4BC69','#D9DEE2','#4A5962'],
  ['Đen & Đồng','#2C3537','#B67A42','#F5F4F1','#FFFFFF','#252D30','#1E2729','#FFFFFF','#D5A477','#E2DDD6','#445054'],
  ['Tím chuyên nghiệp','#624A8E','#D5A857','#F7F4FB','#FFFFFF','#322845','#3B2D5C','#FFFFFF','#E8C479','#E5DAF0','#765D9C'],
  ['Đỏ đô trang trọng','#8B3446','#C3A15C','#FAF5F6','#FFFFFF','#4D2933','#572532','#FFFFFF','#E2BE7E','#EBD8DC','#A44B5C'],
  ['Cam năng lượng','#B95426','#227C72','#FFF7F1','#FFFFFF','#4F3527','#783E22','#FFFFFF','#F2B16E','#F1DFCF','#D36A33'],
  ['Cát & Xanh lá','#3C6B52','#B78D4A','#FBF8F0','#FFFFFF','#3F3A2A','#315440','#FFFFFF','#D6B87D','#E9E0CF','#578665'],
  ['Xanh đại dương','#006D88','#E2AE4B','#ECF8FA','#FFFFFF','#193E4B','#064F64','#FFFFFF','#F0C577','#D2E8EE','#18849B'],
  ['Hồng phấn hiện đại','#9A516E','#C89548','#FCF6F9','#FFFFFF','#4B2F3C','#713A53','#FFFFFF','#E3BA79','#F0DEE6','#B46583'],
  ['Đêm xanh cao cấp','#0E594A','#CFAB5B','#E9F0EC','#FFFFFF','#19382F','#102E29','#FFFFFF','#E9C976','#CBDCD4','#237A61'],
];
export const APPEARANCE_PRESETS = PRESET_BASE.map(([name,primary,secondary,background,surface,text,sidebar,header,accent,border,menuActive]) =>
  ({ name,primary,secondary,background,surface,text,sidebar,header,accent,border,menuActive }));
const HEX = /^#[0-9a-fA-F]{6}$/;
const AppearanceContext = createContext({ ...DEFAULT_APPEARANCE, loading: true });
export const cleanColor = (value, fallback) => typeof value === 'string' && HEX.test(value) ? value : fallback;
export function sanitizeAppearance(value = {}) {
  const result = {};
  for (const key of ['primary', 'secondary', 'background', 'surface', 'text', 'sidebar', 'header', 'accent', 'border', 'menuActive']) result[key] = cleanColor(value[key], DEFAULT_APPEARANCE[key]);
  result.logoUrl = typeof value.logoUrl === 'string' && (/^https:\/\/res\.cloudinary\.com\/[\w-]+\/image\/upload\//.test(value.logoUrl) || value.logoUrl === '') ? value.logoUrl : '';
  result.name = typeof value.name === 'string' ? value.name.slice(0, 80) : DEFAULT_APPEARANCE.name;
  return result;
}
function readableText(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (r * .299 + g * .587 + b * .114) / 255 > 0.62 ? '#152e23' : '#ffffff';
}
export function ClubAppearanceProvider({ children }) {
  const [saved, setSaved] = useState(DEFAULT_APPEARANCE);
  const [loading, setLoading] = useState(true);
  useEffect(() => onSnapshot(doc(db, 'publicContentSettings', 'appearance'), snapshot => {
    setSaved(sanitizeAppearance(snapshot.exists() ? snapshot.data() : DEFAULT_APPEARANCE));
    setLoading(false);
  }, error => { console.warn('Không tải được giao diện CLB:', error.code || error.message); setLoading(false); }), []);
  useEffect(() => {
    const root = document.documentElement;
    const attrs = {
      '--tkda-primary': saved.primary, '--tkda-secondary': saved.secondary,
      '--tkda-background': saved.background, '--tkda-surface': saved.surface,
      '--tkda-text': saved.text, '--tkda-on-primary': readableText(saved.primary),
      '--tkda-sidebar': saved.sidebar, '--tkda-on-sidebar': readableText(saved.sidebar),
      '--tkda-header': saved.header, '--tkda-accent': saved.accent,
      '--tkda-border': saved.border, '--tkda-menu-active': saved.menuActive,
    };
    for (const [k, v] of Object.entries(attrs)) root.style.setProperty(k, v);
    return () => { for (const k of Object.keys(attrs)) root.style.removeProperty(k); };
  }, [saved]);
  const value = useMemo(() => ({ ...saved, loading }), [saved, loading]);
  return <AppearanceContext.Provider value={value}>{children}</AppearanceContext.Provider>;
}
export const useClubAppearance = () => useContext(AppearanceContext);
export function ClubLogo({ alt = 'Logo CLB TAEKWONDO GREEN', ...props }) {
  const { logoUrl } = useClubAppearance();
  return <img src={logoUrl || '/branding/green-emblem.png'} alt={alt} {...props} onError={e => {
    if (!e.currentTarget.src.endsWith('/branding/green-emblem.png')) e.currentTarget.src = '/branding/green-emblem.png';
  }} />;
}
