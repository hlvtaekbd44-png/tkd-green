import {useEffect,useState} from "react";
import {Alert,Button,Dialog,DialogTitle,DialogContent,DialogActions,Stack,TextField,Typography,CircularProgress} from "@mui/material";
import {accountRequest} from "./accountApi";

export default function DeleteMemberDialog({open,member,onClose}) {
 const [confirmation,setConfirmation]=useState("");
 const [error,setError]=useState("");
 const [busy,setBusy]=useState(false);
 useEffect(()=>{setConfirmation("");setError("");},[open,member?.id]);
 const code=String(member?.maHoiVienNoiBo || member?.maHV || member?.id || "").trim();
 async function submit(){
  if(!member?.id || confirmation.trim()!==code || busy)return;
  if(!window.confirm(`XÓA VĨNH VIỄN ${member.name || "hội viên"}? Không thể khôi phục.`))return;
  setBusy(true);setError("");
  try {await accountRequest("deleteMemberForever",{memberDocId:member.id,confirmCode:confirmation.trim()});onClose?.();}
  catch(e){setError(e.message || "Xóa thất bại. Kiểm tra Netlify Function logs.");}
  finally{setBusy(false);}
 }
 return <Dialog open={open} onClose={busy?undefined:onClose} maxWidth="sm" fullWidth>
  <DialogTitle>Xóa vĩnh viễn hội viên — chỉ Admin</DialogTitle>
  <DialogContent><Stack spacing={2} sx={{pt:1}}>
    <Typography fontWeight={700}>{member?.name} · {code}</Typography>
    <Alert severity="error">Thao tác này xóa hồ sơ, lịch sử thi cấp, thu học phí, các bản ghi điểm danh liên kết và tài khoản đăng nhập. Không có nút hoàn tác. Hãy sao lưu, kiểm tra nghĩa vụ lưu trữ chứng từ và đối soát trước khi xóa.</Alert>
    <Alert severity="warning">Các dữ liệu cũ không lưu đúng mã hồ sơ có thể không được tìm thấy tự động. Không dùng chức năng này khi chưa đối soát dữ liệu cũ.</Alert>
    {error&&<Alert severity="error">{error}</Alert>}
    <TextField fullWidth label={`Nhập chính xác mã ${code} để xác nhận`} value={confirmation} onChange={e=>setConfirmation(e.target.value)} disabled={busy}/>
   </Stack></DialogContent>
  <DialogActions><Button onClick={onClose} disabled={busy}>Hủy</Button><Button variant="contained" color="error" disabled={busy || confirmation.trim()!==code} onClick={submit}>{busy?<CircularProgress size={20}/>:"Xóa vĩnh viễn"}</Button></DialogActions>
 </Dialog>;
}
