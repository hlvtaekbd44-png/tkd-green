import { useEffect, useState } from 'react';
import { Avatar, Box, IconButton, ListItemIcon, Menu, MenuItem, Tooltip, Typography } from '@mui/material';
import LogoutRounded from '@mui/icons-material/LogoutRounded';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from './firebase';

export default function HeaderAccount() {
  const [user, setUser] = useState(auth.currentUser);
  const [anchorEl, setAnchorEl] = useState(null);
  useEffect(() => onAuthStateChanged(auth, setUser), []);
  const close = () => setAnchorEl(null);
  const logout = async () => {
    close();
    try { await signOut(auth); }
    catch (error) { console.error('Lỗi đăng xuất:', error); window.alert('Không thể đăng xuất. Vui lòng thử lại.'); }
  };
  if (!user) return null;
  const displayName = user.displayName || user.email || 'Tài khoản';
  return (
    <>
      <Tooltip title="Tài khoản của tôi">
        <IconButton aria-label="Mở menu tài khoản" onClick={(event) => setAnchorEl(event.currentTarget)}
          className="tkd-header-account" aria-haspopup="menu" aria-expanded={Boolean(anchorEl)}>
          <Avatar src={user.photoURL || undefined} alt={displayName} sx={{ width: 34, height: 34, bgcolor: '#087d4b', color: 'white', fontWeight: 800 }}>
            {displayName.trim().charAt(0).toUpperCase()}
          </Avatar>
        </IconButton>
      </Tooltip>
      <Menu anchorEl={anchorEl} open={Boolean(anchorEl)} onClose={close}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        PaperProps={{ sx: { mt: 1, width: 250, borderRadius: 2.5, boxShadow: '0 14px 45px rgba(17,48,32,.16)' } }}>
        <Box sx={{ px: 2, py: 1.3, maxWidth: 250 }}>
          <Typography variant="body2" fontWeight={800} noWrap>{displayName}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block' }} noWrap>{user.email || ''}</Typography>
        </Box>
        <MenuItem onClick={logout} sx={{ py: 1.3 }}>
          <ListItemIcon><LogoutRounded fontSize="small" /></ListItemIcon>Đăng xuất
        </MenuItem>
      </Menu>
    </>
  );
}
