import { useEffect, useRef, useState } from 'react';
import { Alert, Avatar, Box, Button, CircularProgress, Stack, Typography } from '@mui/material';
import { CloudDownloadRounded, CloudUploadRounded, PersonRounded } from '@mui/icons-material';
import { canManageMemberPhoto, canViewMemberPhoto, downloadMemberPhoto, legacyPhotoUrl, loadMemberPhoto, replaceMemberPhoto } from './memberPhotoService';

export function MemberPhotoAvatar({ member, size = 112, variant = 'rounded', className = '' }) {
  const [state, setState] = useState({ url: '', error: '' });
  useEffect(() => {
    const controller = new AbortController();
    let currentURL = '';
    setState({ url: member?.photoPath ? '' : legacyPhotoUrl(member), error: '' });
    if (member?.photoPath) {
      loadMemberPhoto(member, controller.signal).then(url => {
        if (controller.signal.aborted) { if (url) URL.revokeObjectURL(url); return; }
        currentURL = url || '';
        setState({ url: currentURL, error: '' });
      }).catch(err => { if (!controller.signal.aborted) setState({ url: '', error: `Không tải được ảnh: ${err?.message || 'Kiểm tra Storage Rules/CORS'}` }); });
    }
    return () => { controller.abort(); if (currentURL) URL.revokeObjectURL(currentURL); };
  }, [member?.id, member?.photoPath, member?.hinhAnh, member?.hinhAnhUrl]);
  return <Box sx={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: .5 }}>
    <Avatar src={state.url || undefined} variant={variant} className={className} alt={member?.hoTen || member?.name || 'Hội viên'} sx={{ width: size, height: size, bgcolor: '#e5f5eb', color: '#08784b' }}>
      <PersonRounded sx={{ fontSize: Math.round(size * .54) }} />
    </Avatar>
    {state.error && <Typography variant="caption" color="error" sx={{ maxWidth: 235, textAlign: 'center' }}>{state.error}</Typography>}
  </Box>;
}

// In the member list, only fetch photos when the row is about to enter the viewport.
export function LazyMemberPhotoAvatar({ member, size = 40 }) {
  const container = useRef(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(false);
    const node = container.current;
    if (!node) return undefined;
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return undefined; }
    const observer = new IntersectionObserver(entries => {
      if (entries.some(x => x.isIntersecting)) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '160px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [member?.id]);
  return <Box ref={container} sx={{ width: size, height: size, flexShrink: 0 }}>
    {visible ? <MemberPhotoAvatar member={member} size={size} />
      : <Avatar sx={{ width: size, height: size, bgcolor: '#e5f5eb', color: '#08784b' }}><PersonRounded/></Avatar>}
  </Box>;
}

export default function MemberPhoto({ member, profile, onUpdated }) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const canEdit = canManageMemberPhoto(profile, member);
  const canDownload = canViewMemberPhoto(profile, member);
  const [file, setFile] = useState(null);

  const upload = async () => {
    if (!canEdit || !file || busy) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await replaceMemberPhoto(member, file);
      setFile(null);
      setNotice(result.oldPhotoCleanupFailed
        ? 'Ảnh mới đã được lưu. Không thể xóa ảnh cũ trên Storage; Admin cần kiểm tra lại quyền xóa.'
        : 'Đã cập nhật ảnh và xóa ảnh cũ trên Storage (nếu có).');
      onUpdated?.();
    } catch (err) { setError(err?.message || 'Không tải được ảnh lên.'); }
    finally { setBusy(false); }
  };
  const download = async () => {
    if (!canDownload || busy) return;
    setBusy(true); setError('');
    try { await downloadMemberPhoto(member); }
    catch (err) { setError(err?.message || 'Không thể tải ảnh về.'); }
    finally { setBusy(false); }
  };
  return <Box sx={{ border: '1px solid #dce9df', borderRadius: 3, bgcolor: '#f8fbf9', p: 2, my: 2 }}>
    <Typography fontWeight={800} mb={1.5}>Hình ảnh hội viên</Typography>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems={{ xs: 'center', sm: 'flex-start' }}>
      <MemberPhotoAvatar member={member} size={128} />
      <Stack gap={1.5} sx={{ flex: 1, minWidth: 0 }}>
        <Typography variant="body2" color="text.secondary">Ảnh JPG, PNG hoặc WebP, tối đa 4 MB. Ảnh hiển thị trong hồ sơ và tài khoản Hội viên/Phụ huynh.</Typography>
        {canEdit && <>
          <Button variant="outlined" component="label" startIcon={<CloudUploadRounded />} disabled={busy} sx={{ alignSelf: 'flex-start' }}>
            Chọn ảnh mới
            <input hidden type="file" accept="image/jpeg,image/png,image/webp" onChange={event => setFile(event.target.files?.[0] || null)} />
          </Button>
          {file && <Typography variant="body2">Đã chọn: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)</Typography>}
          {file && <Button variant="contained" disabled={busy} onClick={upload} sx={{ alignSelf: 'flex-start' }}>{busy ? <CircularProgress size={20} color="inherit"/> : 'Lưu ảnh mới'}</Button>}
        </>}
        {canDownload && member?.photoPath && <Button variant="outlined" color="success" onClick={download} disabled={busy} startIcon={<CloudDownloadRounded/>} sx={{ alignSelf: 'flex-start' }}>Tải ảnh về máy</Button>}
        {error && <Alert severity="error">{error}</Alert>}
        {notice && <Alert severity={notice.startsWith('Ảnh mới') ? 'warning' : 'success'}>{notice}</Alert>}
      </Stack>
    </Stack>
  </Box>;
}
