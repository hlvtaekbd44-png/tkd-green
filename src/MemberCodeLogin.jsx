import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { Alert, Box, Button, CircularProgress, Stack, TextField, Typography } from '@mui/material';
import { auth } from './firebase';

// Chèn <MemberCodeLogin/> vào màn hình LoginScreen hiện có, KHÔNG thay thế đăng nhập Google/Admin/HLV.
export default function MemberCodeLogin() {
  const [code,setCode]=useState('');
  const [password,setPassword]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const submit=async e=>{
    e.preventDefault();
    if(busy) return;
    setBusy(true);setError('');
    try {
      const res=await fetch('/.netlify/functions/resolve-member-login',{
        method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code:code.trim()})
      });
      const data=await res.json();
      if(!res.ok || !data.ok || !data.email) throw new Error('Mã hoặc mật khẩu không hợp lệ.');
      await signInWithEmailAndPassword(auth,data.email,password);
      setPassword('');
    } catch {
      setError('Không đăng nhập được. Kiểm tra mã CLB/VTF, mật khẩu, trạng thái tài khoản và kết nối máy chủ.');
    } finally {setBusy(false);}
  };
  return <Box component="form" onSubmit={submit} sx={{width:'100%',maxWidth:420}}>
    <Stack spacing={2}>
      <Typography fontWeight={800}>VÕ SINH / PHỤ HUYNH</Typography>
      <Typography variant="body2" color="text.secondary">
        Chưa có VTF ID: đăng nhập bằng mã CLB. Khi được cấp VTF ID: dùng mã VTF và mật khẩu cũ.
      </Typography>
      <TextField fullWidth required label="Mã CLB hoặc VTF ID" value={code}
        onChange={e=>setCode(e.target.value)} autoComplete="username" inputProps={{maxLength:40}} disabled={busy}/>
      <TextField fullWidth required label="Mật khẩu" type="password" value={password}
        onChange={e=>setPassword(e.target.value)} autoComplete="current-password" disabled={busy}/>
      {error && <Alert severity="error">{error}</Alert>}
      <Button fullWidth variant="contained" type="submit" disabled={busy || !code.trim() || !password}>
        {busy ? <CircularProgress size={22} color="inherit"/> : 'Đăng nhập hội viên'}
      </Button>
    </Stack>
  </Box>;
}
