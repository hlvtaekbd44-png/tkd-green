import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Alert, Box, Chip, CircularProgress, Divider, Paper, Stack, Typography } from '@mui/material';
import { db } from './firebase';
import GoogleLogin from './GoogleLogin';

const show = v => v === null || v === undefined || v === '' ? 'Chưa cập nhật' : String(v);
function Info({label, value}) { return <Box><Typography variant="caption" color="text.secondary">{label}</Typography><Typography fontWeight={600}>{show(value)}</Typography></Box>; }

export default function MemberSelfPortal({profile}) {
  const [member, setMember] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!profile?.memberDocId) { setLoading(false); setError('Tài khoản chưa liên kết hồ sơ.'); return; }
    setLoading(true); setMember(null); setError('');
    return onSnapshot(doc(db, 'members', profile.memberDocId), snap => {
      if (!snap.exists()) {setError('Không tìm thấy hồ sơ đã liên kết.');setMember(null);}
      else {setMember({id:snap.id,...snap.data()});setError('');}
      setLoading(false);
    }, e => {console.error(e);setError('Không có quyền đọc hồ sơ cá nhân. Hãy kiểm tra Firestore Rules.');setLoading(false);});
  }, [profile?.memberDocId]);
  return <Box sx={{minHeight:'100vh',bgcolor:'#f4f7f5',p:{xs:2,md:4}}}>
    <Paper sx={{maxWidth:860,mx:'auto',p:{xs:2,md:4},borderRadius:3}}>
      <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2}>
        <Box><Typography variant="h5" fontWeight={800}>TKD GREEN · Hội viên</Typography><Typography color="text.secondary">Thông tin cá nhân của tôi</Typography></Box>
        <GoogleLogin />
      </Stack>
      <Divider sx={{my:3}}/>
      {loading && <CircularProgress/>}
      {error && <Alert severity="error">{error}</Alert>}
      {member && <Stack spacing={3}>
        <Stack direction="row" spacing={1} alignItems="center"><Typography variant="h6" fontWeight={800}>{show(member.hoTen)}</Typography><Chip label={show(member.trangThai)} size="small"/></Stack>
        <Box sx={{display:'grid',gridTemplateColumns:{xs:'1fr',sm:'1fr 1fr'},gap:2}}>
          <Info label="Mã VTF" value={member.maHV}/>
          <Info label="Mã nội bộ" value={member.maHoiVienNoiBo}/>
          <Info label="Ngày sinh" value={member.ngaySinh}/>
          <Info label="Giới tính" value={member.gioiTinh}/>
          <Info label="Điểm tập" value={member.diemTap}/>
          <Info label="Cấp đai" value={member.capDaiDang}/>
          <Info label="Loại học phí" value={member.loaiHocPhi}/>
          <Info label="Đã thanh toán đến" value={member.ngayHetHan}/>
        </Box>
        <Alert severity="info">Chức năng xin phép nghỉ sẽ được mở khi Admin bật cho điểm tập và Firestore Rules cho phép gửi đơn. Hiện màn hình này chỉ đọc hồ sơ cá nhân.</Alert>
      </Stack>}
    </Paper>
  </Box>;
}
