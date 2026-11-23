import { useState } from "react";
import { GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup } from "firebase/auth";
import { Alert, Box, Button, CircularProgress, IconButton, InputAdornment, Stack, TextField, Typography } from "@mui/material";
import { VisibilityOutlined, VisibilityOffOutlined, LockOutlined, AccountCircleOutlined, ArrowForwardRounded, VerifiedUserOutlined } from "@mui/icons-material";
import { auth } from "./firebase";
import "./LoginScreen.css";

// Tài khoản tạo bởi manage-accounts.mjs dùng email nội bộ để đăng nhập.
const INTERNAL_DOMAIN = "accounts.tkdgreen.invalid";
const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{2,39}$/;

function resolveEmail(value) {
  const name = String(value || "").trim().toLowerCase();
  if (name.includes("@")) return name;
  if (!USERNAME_RE.test(name)) return null;
  return `${name}@${INTERNAL_DOMAIN}`;
}

export default function LoginScreen() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handlePasswordLogin(event) {
    event.preventDefault();
    const email = resolveEmail(identifier);
    if (!email || !password) {
      setError("Vui lòng nhập đúng tên đăng nhập/email và mật khẩu.");
      return;
    }
    setBusy(true); setError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
      setPassword("");
    } catch (err) {
      console.error("TKD Green sign-in failed:", err.code);
      setError("Không đăng nhập được. Kiểm tra tên đăng nhập, mật khẩu hoặc trạng thái tài khoản.");
    } finally { setBusy(false); }
  }

  async function handleGoogleLogin() {
    setBusy(true); setError("");
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
    } catch (err) {
      console.error("TKD Green Google sign-in failed:", err.code);
      setError(err.code === "auth/popup-blocked"
        ? "Trình duyệt đang chặn cửa sổ Google. Hãy cho phép popup và thử lại."
        : "Không đăng nhập được bằng Google. Hãy thử lại hoặc kiểm tra quyền tài khoản.");
    } finally { setBusy(false); }
  }

  return (
    <Box className="tkdg-login-page">
      <Box className="tkdg-login-shell">
        <Box className="tkdg-login-brand-panel">
          <Box className="tkdg-login-brand">
            <Box className="tkdg-login-logo"><img src="/branding/green-emblem.png" alt="Biểu trưng CLB Taekwondo Green" /></Box>
            <Box><Typography className="tkdg-login-brand-title">TKD GREEN</Typography>
              <Typography className="tkdg-login-brand-sub">CLUB MANAGEMENT SYSTEM</Typography></Box>
          </Box>
          <Box className="tkdg-login-brand-copy">
            <Box className="tkdg-login-line" />
            <Typography className="tkdg-login-hero">Một nền tảng.<br/>Quản lý toàn diện.</Typography>
            <Typography className="tkdg-login-desc">Đồng hành cùng Ban quản trị, Huấn luyện viên và Võ sinh trong mọi hoạt động của câu lạc bộ.</Typography>
          </Box>
          <Box className="tkdg-login-club-info tkdg-login-club-info-desktop">
            <Typography className="tkdg-login-club-name">CLB TAEKWONDO GREEN</Typography>
            <Typography>Chủ nhiệm CLB: <strong>Nguyễn Hữu Tài</strong></Typography>
            <Typography>SĐT: <a href="tel:0984449404">0984.44.94.04</a> - <a href="tel:0974949404">0974.94.94.04</a></Typography>
          </Box>
          <Box className="tkdg-login-brand-footer"><VerifiedUserOutlined fontSize="small" /> Hệ thống dành cho tài khoản được CLB cấp quyền</Box>
        </Box>
        <Box className="tkdg-login-form-panel">
          <Box className="tkdg-login-mobile-brand">
            <img src="/branding/green-emblem.png" alt="TKD Green" /><strong>TKD GREEN</strong>
          </Box>
          <Box className="tkdg-login-form-content">
            <Typography className="tkdg-login-kicker">CHÀO MỪNG TRỞ LẠI</Typography>
            <Typography component="h1" className="tkdg-login-heading">Đăng nhập hệ thống</Typography>
            <Typography className="tkdg-login-help">Sử dụng tài khoản được CLB cấp hoặc tài khoản Google đã được phân quyền.</Typography>
            <Box component="form" onSubmit={handlePasswordLogin} noValidate sx={{ mt: 3 }}>
              <Stack spacing={2.1}>
                <TextField fullWidth label="Tên đăng nhập hoặc email" placeholder="Nhập tài khoản của bạn" autoComplete="username" value={identifier}
                  onChange={e => setIdentifier(e.target.value)} disabled={busy}
                  InputProps={{ startAdornment: <InputAdornment position="start"><AccountCircleOutlined /></InputAdornment> }} />
                <TextField fullWidth label="Mật khẩu" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password}
                  onChange={e => setPassword(e.target.value)} disabled={busy}
                  InputProps={{ startAdornment: <InputAdornment position="start"><LockOutlined /></InputAdornment>,
                    endAdornment: <InputAdornment position="end"><IconButton edge="end" aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} onClick={() => setShowPassword(v => !v)} disabled={busy}>{showPassword ? <VisibilityOffOutlined/> : <VisibilityOutlined/>}</IconButton></InputAdornment> }} />
                {error && <Alert severity="error" role="alert">{error}</Alert>}
                <Button fullWidth variant="contained" type="submit" disabled={busy} className="tkdg-login-submit" endIcon={!busy && <ArrowForwardRounded/>}>
                  {busy ? <CircularProgress size={22} color="inherit" /> : "Đăng nhập"}
                </Button>
              </Stack>
            </Box>
            <Box className="tkdg-login-divider"><span>hoặc</span></Box>
            <Button fullWidth variant="outlined" disabled={busy} onClick={handleGoogleLogin} className="tkdg-login-google">
              <Box component="span" aria-hidden="true" sx={{ fontWeight: 900, fontSize: 21, color: '#4285F4', mr: 1 }}>G</Box>
              Tiếp tục với Google
            </Button>
            <Typography className="tkdg-login-note">Quên mật khẩu hoặc chưa được cấp tài khoản? Vui lòng liên hệ Admin CLB.</Typography>
            <Button fullWidth variant="text" href="/?gioi-thieu=1" sx={{mt:2,fontWeight:800,color:"#087d4b"}}>Xem CLB & hệ thống điểm tập (không cần đăng nhập)</Button>
            <Box className="tkdg-login-club-info tkdg-login-club-info-mobile">
              <Typography className="tkdg-login-club-name">CLB TAEKWONDO GREEN</Typography>
              <Typography>Chủ nhiệm CLB: <strong>Nguyễn Hữu Tài</strong></Typography>
              <Typography>SĐT: <a href="tel:0984449404">0984.44.94.04</a> - <a href="tel:0974949404">0974.94.94.04</a></Typography>
            </Box>
          </Box>
          <Typography className="tkdg-login-copyright">© 2026 TKD GREEN CLUB · BẢO MẬT TÀI KHOẢN</Typography>
        </Box>
      </Box>
    </Box>
  );
}
