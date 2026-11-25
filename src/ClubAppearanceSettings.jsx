import { useEffect, useState } from 'react';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { Alert, Box, Button, CircularProgress, Divider, Paper, Stack, TextField, Typography } from '@mui/material';
import { auth, db } from './firebase';
import { APPEARANCE_PRESETS, DEFAULT_APPEARANCE, sanitizeAppearance, useClubAppearance } from './ClubAppearance';
import { uploadHonorImage } from './HonorCloudinary';

const COLORS = [
  ['primary', 'Tông chính'], ['secondary', 'Tông phụ'], ['background', 'Nền trang'],
  ['surface', 'Nền thẻ / bảng'], ['text', 'Màu chữ chính'],
  ['sidebar', 'Nền sidebar'], ['header', 'Nền header'], ['accent', 'Màu nhấn'],
  ['border', 'Màu đường viền'], ['menuActive', 'Menu đang chọn'],
];
function ColorControl({ id, label, value, onChange }) {
  return <Stack direction="row" alignItems="center" spacing={2} sx={{ p: 1.2, border: '1px solid #d9e6de', borderRadius: 2 }}>
    <input aria-label={label} type="color" value={/^#[0-9a-fA-F]{6}$/.test(value) ? value : '#087D4B'} onChange={e => onChange(e.target.value)} style={{ width: 48, height: 42, padding: 0, cursor: 'pointer', background: 'none', border: 'none' }}/>
    <Box sx={{ flex: 1, minWidth: 0 }}><Typography fontWeight={700} fontSize={14}>{label}</Typography><Typography variant="caption">{value}</Typography></Box>
    <TextField size="small" label="HEX" inputProps={{ maxLength: 7, 'aria-label': `${label} HEX` }} value={value} onChange={e => onChange(e.target.value)} sx={{ width: 116 }} />
  </Stack>;
}
export default function ClubAppearanceSettings({ profile }) {
  const saved = useClubAppearance();
  const [draft, setDraft] = useState(DEFAULT_APPEARANCE);
  const [logoFile, setLogoFile] = useState(null);
  const [logoPreview, setLogoPreview] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState(null);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) setDraft(sanitizeAppearance(saved));
  }, [saved, dirty]);
  useEffect(() => {
    if (!logoFile) { setLogoPreview(''); return; }
    const url = URL.createObjectURL(logoFile); setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);
  if (profile?.role !== 'admin') return <Alert severity="error">Chỉ Admin được thay đổi giao diện CLB.</Alert>;
  const edit = (key, value) => { setDraft(d => ({ ...d, [key]: value })); setDirty(true); setNotice(null); };
  const applyPreset = item => { setDraft(d => ({ ...d, ...item })); setDirty(true); setNotice(null); };
  const save = async () => {
    if (busy) return;
    for (const [key, label] of COLORS) {
      if (!/^#[0-9a-fA-F]{6}$/.test(draft[key])) { setNotice({ severity: 'error', text: `Mã màu ${label} phải có dạng #123ABC.` }); return; }
    }
    setBusy(true); setNotice(null);
    try {
      let logoUrl = draft.logoUrl || '';
      if (logoFile) {
        if (!['image/png','image/jpeg','image/webp'].includes(logoFile.type) || logoFile.size > 5*1024*1024) throw new Error('Logo phải là PNG, JPG hoặc WebP tối đa 5 MB.');
        setNotice({ severity: 'info', text: 'Đang tải logo lên Cloudinary…' });
        const uploaded = await uploadHonorImage(logoFile);
        logoUrl = uploaded.secure_url;
      }
      setNotice({ severity: 'info', text: 'Đang lưu cấu hình giao diện vào Firestore…' });
      await setDoc(doc(db, 'publicContentSettings', 'appearance'), {
        ...sanitizeAppearance({ ...draft, logoUrl }), updatedBy: auth.currentUser?.uid || '', updatedAt: serverTimestamp(),
      });
      setDraft(d => ({ ...d, logoUrl })); setDirty(false); setLogoFile(null);
      setNotice({ severity: 'success', text: 'Đã lưu giao diện. Màu và logo sẽ đồng bộ trên các thiết bị.' });
    } catch (error) {
      setNotice({ severity: 'error', text: `Lưu giao diện thất bại: ${error?.message || String(error)}. Nếu ảnh đã được tải lên, hãy kiểm tra trước khi thử lại.` });
    } finally { setBusy(false); }
  };
  return <Stack spacing={3} sx={{ maxWidth: 1150 }}>
    <Box><Typography variant="h5" fontWeight={850}>Giao diện & Thương hiệu</Typography><Typography color="text.secondary">Thiết lập logo, màu nền, tông chính/phụ và bộ màu chung cho toàn website.</Typography></Box>
    <Alert severity="info">Chỉ Admin được lưu. Chọn bộ màu hoặc điều chỉnh riêng, xem trước rồi nhấn Lưu để áp dụng cho mọi tài khoản.</Alert>
    {notice && <Alert severity={notice.severity}>{notice.text}</Alert>}
    <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={800} gutterBottom>1. Logo CLB</Typography>
      <Stack direction={{ xs: 'column', sm: 'row' }} alignItems="center" spacing={3}>
        <Box sx={{ p: 2, border: '1px solid #dce8e0', borderRadius: 2, bgcolor: '#fff', width: 144, height: 144, display: 'grid', placeItems: 'center' }}>
          <img src={logoPreview || draft.logoUrl || '/branding/green-emblem.png'} alt="Xem trước logo" style={{ width: 116, height: 116, objectFit: 'contain' }} />
        </Box>
        <Stack spacing={1} sx={{ flex: 1 }}>
          <Button component="label" variant="outlined" disabled={busy}>Chọn logo từ máy<input hidden type="file" accept="image/png,image/jpeg,image/webp" onChange={e => { const file = e.target.files?.[0]; if (file) { setLogoFile(file); setDirty(true); } e.target.value = ''; }}/></Button>
          <Button onClick={() => { setLogoFile(null); edit('logoUrl', ''); }} disabled={busy}>Khôi phục logo CLB ban đầu</Button>
          <Typography variant="caption" color="text.secondary">PNG trong suốt được khuyến nghị; tối đa 5 MB. Logo sẽ lưu qua Cloudinary Free có xác thực Admin, không cần Firebase Storage.</Typography>
        </Stack>
      </Stack>
    </Paper>
    <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={800} gutterBottom>2. Bộ màu giao diện (18 mẫu)</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px,1fr))', gap: 1.5 }}>
        {APPEARANCE_PRESETS.map(p => <Box key={p.name} component="button" type="button" onClick={() => applyPreset(p)} sx={{ cursor: 'pointer', textAlign: 'left', border: draft.name === p.name ? `2px solid ${p.primary}` : '1px solid #d7e5dc', borderRadius: 2, p: 1.4, bgcolor: '#fff' }}>
          <Stack direction="row" sx={{ mb: 1 }} spacing={0.5}>{[p.primary,p.secondary,p.sidebar,p.header,p.accent,p.background].map((c, i) => <Box key={i} sx={{ bgcolor: c, height: 35, flex: 1, borderRadius: 1, border: '1px solid #ddd' }}/>)}</Stack>
          <Typography fontWeight={700} fontSize={13}>{p.name}</Typography>
        </Box>)}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>Chọn một bộ màu làm nền, sau đó có thể chỉnh từng màu bên dưới. Không giới hạn màu tùy chỉnh.</Typography>
      <Divider sx={{ my: 2 }}/>
      <Typography variant="h6" fontWeight={800} gutterBottom>3. Tùy chỉnh màu</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'repeat(2, minmax(0,1fr))' }, gap: 1.5 }}>
        {COLORS.map(([key,label]) => <ColorControl key={key} id={key} label={label} value={draft[key] || ''} onChange={v => edit(key,v)}/>)}
      </Box>
    </Paper>
    <Paper sx={{ p: { xs: 2, md: 3 }, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={800} gutterBottom>4. Xem trước trước khi lưu</Typography>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '230px 1fr' }, borderRadius: 2, overflow: 'hidden', border: '1px solid #dce6df', minHeight: 240 }}>
        <Stack spacing={2} sx={{ p: 2.5, backgroundColor: draft.sidebar, color: '#fff' }}>
          <img src={logoPreview || draft.logoUrl || '/branding/green-emblem.png'} alt="Logo xem trước" style={{ maxWidth: 65, maxHeight: 65, objectFit: 'contain' }}/>
          <Typography fontWeight={850} color="inherit">CLB TAEKWONDO GREEN</Typography>
          <Typography color="inherit" fontSize={14}>Tổng quan</Typography><Typography color="inherit" fontSize={14}>Hội viên</Typography><Typography color="inherit" fontSize={14}>Điểm danh</Typography>
        </Stack>
        <Box sx={{ p: { xs: 2, md: 3 }, bgcolor: draft.background, color: draft.text }}>
          <Box sx={{ bgcolor: draft.header, p: 1.5, borderRadius: 1, border: `1px solid ${draft.border}` }}><Typography variant="h6" fontWeight={800} sx={{ color: draft.text }}>Bảng điều khiển</Typography></Box>
          <Typography fontSize={13} sx={{ opacity: .8, mb: 2 }}>Ví dụ màu sắc sau khi lưu</Typography>
          <Box sx={{ bgcolor: draft.surface, p: 2.5, borderRadius: 2, border: `1px solid ${draft.border}`, mb: 2 }}>
            <Typography fontWeight={750} color="inherit">Thống kê hội viên</Typography>
            <Typography fontSize={13} color="inherit">Nội dung và bảng dữ liệu</Typography>
          </Box>
          <Box sx={{ bgcolor: draft.menuActive, color: "#fff", borderRadius: 1, p: 1, mb: 1.5, maxWidth: 160, fontSize: 12 }}>Mục menu đang chọn</Box>
          <Stack direction="row" spacing={1} flexWrap="wrap"><Box sx={{ bgcolor: draft.primary, px: 2, py: 1, borderRadius: 2, color: 'white', fontWeight: 700 }}>Nút chính</Box><Box sx={{ bgcolor: draft.secondary, px: 2, py: 1, borderRadius: 2, color: '#fff', fontWeight: 700 }}>Nút phụ</Box></Stack>
        </Box>
      </Box>
    </Paper>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
      <Button variant="contained" disabled={busy || !dirty} onClick={save} sx={{ minHeight: 45 }}>{busy ? <CircularProgress size={20} color="inherit"/> : 'Lưu & Áp dụng giao diện'}</Button>
      <Button variant="outlined" disabled={busy} onClick={() => { setDraft(DEFAULT_APPEARANCE); setLogoFile(null); setDirty(true); setNotice(null); }}>Đặt lại màu mặc định</Button>
    </Stack>
  </Stack>;
}
