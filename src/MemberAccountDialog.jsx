import { useEffect, useState } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Stack, Typography, TextField, Alert, Chip, CircularProgress } from "@mui/material";
import { accountRequest, normalizeUsername, validUsername } from "./accountApi";

export default function MemberAccountDialog({ member, open, onClose }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  useEffect(() => {
    if (!open || !member?.id) return;
    let alive = true;
    setUsername(String(member.maHV && !/^chưa/i.test(member.maHV) ? member.maHV : member.maHoiVienNoiBo || "").trim().toLowerCase());
    setPassword(""); setError(""); setSuccess(""); setAccount(null); setLoading(true);
    accountRequest("inspectMember", { memberDocId: member.id })
      .then(result => { if (alive) setAccount(result.account || null); })
      .catch(err => { if (alive) setError(err.message); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [open, member?.id]);

  const create = async () => {
    if (!member?.id || busy) return;
    if (!validUsername(username) || password.length < 12) { setError("Tên đăng nhập cần 3–40 ký tự hợp lệ và mật khẩu tối thiểu 12 ký tự."); return; }
    setBusy(true); setError(""); setSuccess("");
    try {
      const data = await accountRequest("createMember", { memberDocId: member.id, username: normalizeUsername(username), password });
      setAccount(data.account); setPassword("");
      setSuccess(`Đã cấp tài khoản ${data.account.username}. Hãy chuyển mật khẩu qua kênh riêng.`);
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  const changeStatus = async () => {
    if (!account?.uid || busy) return;
    const active = !account.active;
    if (!window.confirm(`Bạn chắc chắn muốn ${active ? "kích hoạt" : "ngừng kích hoạt"} tài khoản ${account.username}?`)) return;
    setBusy(true); setError(""); setSuccess("");
    try {
      await accountRequest("setActive", { uid: account.uid, active });
      setAccount(prev => ({...prev, active})); setSuccess(active ? "Đã kích hoạt tài khoản." : "Đã ngừng kích hoạt tài khoản.");
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  };

  return <Dialog open={open} onClose={busy ? undefined : onClose} fullWidth maxWidth="sm">
    <DialogTitle>Cấp / Quản lý tài khoản hội viên</DialogTitle>
    <DialogContent><Stack spacing={2} sx={{ pt:1 }}>
      <Typography fontWeight={700}>{member?.name || "Hội viên"} · {member?.maHV || member?.maHoiVienNoiBo || "Chưa có mã"}</Typography>
      {loading && <CircularProgress size={22}/>}
      {error && <Alert severity="error">{error}</Alert>}
      {success && <Alert severity="success">{success}</Alert>}
      {!loading && account ? <>
        <Typography>Tên đăng nhập: <strong>{account.username || "Chưa cập nhật"}</strong></Typography>
        <Chip color={account.active ? "success" : "default"} label={account.active ? "Đã kích hoạt" : "Ngừng kích hoạt"} />
        <Button color={account.active ? "error" : "success"} variant="outlined" disabled={busy} onClick={changeStatus}>
          {account.active ? "Ngừng kích hoạt" : "Kích hoạt lại"}
        </Button>
      </> : !loading && !error && <>
        <Alert severity="info">Mã VTF được ưu tiên làm tên đăng nhập. Nếu chưa có mã VTF, dùng mã hội viên nội bộ. Tài khoản được liên kết bằng ID hồ sơ Firebase.</Alert>
        <TextField label="Tên đăng nhập" value={username} onChange={e=>setUsername(e.target.value)} disabled={busy} fullWidth />
        <TextField label="Mật khẩu khởi tạo (ít nhất 12 ký tự)" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="new-password" disabled={busy} fullWidth />
      </>}
    </Stack></DialogContent>
    <DialogActions sx={{ p:2 }}>
      <Button onClick={onClose} disabled={busy}>Đóng</Button>
      {!loading && !account && <Button variant="contained" disabled={busy || !validUsername(username) || password.length < 12} onClick={create}>Cấp tài khoản</Button>}
    </DialogActions>
  </Dialog>;
}
