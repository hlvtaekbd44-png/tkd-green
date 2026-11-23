import { useState } from 'react';
import { Box, Button, Dialog, DialogContent, IconButton, Stack, Typography } from '@mui/material';
import { CloseRounded, LoginRounded, ArrowBackRounded } from '@mui/icons-material';
import PublicLocationIntroduction from './PublicLocationIntroduction';
import LoginScreen from './LoginScreen';

/** Public landing page. No Firebase login required to read publicLocations. */
export default function PublicHome() {
  const [loginOpen, setLoginOpen] = useState(false);
  return <Box sx={{minHeight:'100vh', bgcolor:'#f3f8f5', fontFamily:'"Segoe UI", Arial, sans-serif', '& .MuiTypography-root, & .MuiButton-root':{fontFamily:'"Segoe UI", Arial, sans-serif', letterSpacing:'normal'}}}>
    <Box component="header" sx={{position:'sticky',top:0,zIndex:10,bgcolor:'#fff',borderBottom:'1px solid #dce9df',px:{xs:2,md:5},py:1.2}}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
        <Stack direction="row" alignItems="center" spacing={1.5}>
          <Box component="img" src="/branding/green-emblem.png" alt="Logo CLB" sx={{width:42,height:42,objectFit:'contain'}}/>
          <Box><Typography fontWeight={800} sx={{color:'#075d3d',lineHeight:1.2}}>CLB TAEKWONDO GREEN</Typography>
            <Typography variant="caption" sx={{color:'#638273'}}>Giới thiệu & hệ thống điểm tập</Typography></Box>
        </Stack>
        <Button startIcon={<LoginRounded/>} onClick={()=>setLoginOpen(true)} variant="contained" sx={{fontWeight:800,borderRadius:2,whiteSpace:'nowrap'}}>Đăng nhập</Button>
      </Stack>
    </Box>
    <PublicLocationIntroduction embedded />
    <Dialog open={loginOpen} onClose={()=>setLoginOpen(false)} fullWidth maxWidth="lg" scroll="body" PaperProps={{sx:{borderRadius:3,overflow:'visible',bgcolor:'#f3f8f5'}}}>
      <Box sx={{position:'relative'}}>
        <IconButton aria-label="Đóng đăng nhập" onClick={()=>setLoginOpen(false)} sx={{position:'absolute',right:9,top:9,zIndex:2,bgcolor:'#fff','&:hover':{bgcolor:'#e7f1e9'}}}><CloseRounded/></IconButton>
        <DialogContent sx={{p:{xs:1,md:2}}}><LoginScreen/></DialogContent>
        <Button startIcon={<ArrowBackRounded/>} onClick={()=>setLoginOpen(false)} sx={{mx:2,mb:2}}>Quay lại giới thiệu</Button>
      </Box>
    </Dialog>
  </Box>;
}
