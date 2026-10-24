import { useEffect, useState } from "react";
import {
  Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, FormControlLabel, Stack, Typography,
} from "@mui/material";
import { accountRequest } from "./accountApi";

export default function DeleteMemberDialog({ open, member, onClose }) {
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setConfirmed(false);
    setError("");
  }, [open, member?.id]);

  const code = String(member?.maHoiVienNoiBo || member?.maHV || member?.id || "").trim();

  async function submit() {
    if (!member?.id || !confirmed || !code || busy) return;
    if (!window.confirm(`XÓA VĨNH VIỄN ${member.name || "hội viên"}? Không thể khôi phục.`)) return;

    setBusy(true);
    setError("");
    try {
      // Giữ confirmCode để tương thích với Netlify Function hiện tại.
      // Đây không thay thế kiểm tra quyền Admin ở phía máy chủ.
      await accountRequest("deleteMemberForever", {
        memberDocId: member.id,
        confirmCode: code,
      });
      onClose?.();
    } catch (e) {
      setError(e.message || "Xóa thất bại. Kiểm tra Netlify Function logs.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Xóa vĩnh viễn hội viên — chỉ Admin</DialogTitle>
      <DialogContent>
        <Stack spacing={2} sx={{ pt: 1 }}>
          <Typography fontWeight={700}>
            {member?.name || "Hội viên"} · {code || "Chưa có mã"}
          </Typography>
          <Alert severity="error">
            Thao tác này xóa hồ sơ, lịch sử thi cấp, thu học phí, các bản ghi
            điểm danh liên kết và tài khoản đăng nhập. Không thể hoàn tác.
            Hãy sao lưu và đối soát chứng từ trước khi xóa.
          </Alert>
          <Alert severity="warning">
            Dữ liệu cũ không liên kết đúng hồ sơ có thể không được tìm thấy
            tự động. Không xóa khi chưa đối soát dữ liệu liên quan.
          </Alert>
          {error && <Alert severity="error">{error}</Alert>}
          <FormControlLabel
            control={
              <Checkbox
                checked={confirmed}
                onChange={(event) => setConfirmed(event.target.checked)}
                disabled={busy}
              />
            }
            label="Tôi đã kiểm tra và xác nhận muốn xóa vĩnh viễn hội viên này."
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Hủy</Button>
        <Button
          variant="contained"
          color="error"
          disabled={busy || !confirmed || !member?.id || !code}
          onClick={submit}
        >
          {busy ? <CircularProgress size={20} color="inherit" /> : "Xóa vĩnh viễn"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
