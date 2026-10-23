import { useEffect, useState } from "react";
import { GoogleAuthProvider, onAuthStateChanged, signInWithEmailAndPassword, signInWithPopup, signOut } from "firebase/auth";
import { Alert, Box, Button, Stack, TextField, Typography } from "@mui/material";
import { auth } from "./firebase";

// Mã đăng nhập cấp từ hệ thống được ánh xạ nội bộ sang email Firebase Auth.
// KHÔNG đọc Firestore công khai để tìm tài khoản từ mã VTF.
const LOGIN_DOMAIN = "accounts.tkdgreen.invalid";
function usernameToEmail(value) {
  const username = String(value || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    throw new Error("Tên đăng nhập dài 3–40 ký tự, chỉ gồm a-z, 0-9, dấu chấm, gạch ngang hoặc gạch dưới.");
  }
  return `${username}@${LOGIN_DOMAIN}`;
}

export default function GoogleLogin() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  useEffect(() => onAuthStateChanged(auth, u => { setUser(u); setLoading(false); }), []);

  async function passwordLogin(event) {
    event.preventDefault(); setError(""); setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
      setPassword("");
    } catch (err) {
      setError(err.message?.includes("Tên đăng nhập") ? err.message : "Tên đăng nhập hoặc mật khẩu không đúng, hoặc tài khoản bị khóa.");
    } finally { setBusy(false); }
  }
  async function googleLogin() {
    setError(""); setBusy(true);
    try { await signInWithPopup(auth, new GoogleAuthProvider()); }
    catch { setError("Không đăng nhập được bằng Google."); }
    finally { setBusy(false); }
  }
  async function logout() {
    setError(""); setBusy(true);
    try { await signOut(auth); } catch { setError("Không đăng xuất được."); }
    finally { setBusy(false); }
  }

  if (loading) return <Typography>Đang kiểm tra đăng nhập...</Typography>;
  if (user) return <Stack direction="row" alignItems="center" spacing={1} sx={{ flexWrap:"wrap" }}>
    <Typography variant="body2">{user.displayName || user.email || "Tài khoản"}</Typography>
    <Button size="small" variant="outlined" onClick={logout} disabled={busy}>Đăng xuất</Button>
    {error && <Alert severity="error">{error}</Alert>}
  </Stack>;
  return <Box sx={{maxWidth:380}}>
    <Stack spacing={2}>
      <Typography fontWeight={800}>Đăng nhập TKD Green</Typography>
      <Box component="form" onSubmit={passwordLogin}>
        <Stack spacing={1.5}>
          <TextField label="Tên đăng nhập / Mã VTF / Mã nội bộ" value={username} autoComplete="username" required fullWidth onChange={e=>setUsername(e.target.value)} />
          <TextField label="Mật khẩu" type="password" value={password} autoComplete="current-password" required fullWidth onChange={e=>setPassword(e.target.value)} />
          <Button type="submit" variant="contained" disabled={busy}>Đăng nhập</Button>
        </Stack>
      </Box>
      <Button variant="text" disabled={busy} onClick={googleLogin}>Đăng nhập Google (Admin dự phòng)</Button>
      {error && <Alert severity="error">{error}</Alert>}
    </Stack>
  </Box>;
}
