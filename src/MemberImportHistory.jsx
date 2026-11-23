import { Box, Chip, Divider, Paper, Stack, Typography } from '@mui/material';
/** Thêm <MemberImportHistory member={member} /> vào màn hình xem hồ sơ (member là bản gốc Firestore). */
export default function MemberImportHistory({ member }) {
  const history=Array.isArray(member?.lichSuDieuChinh) ? member.lichSuDieuChinh.filter(h=>h?.type==='excel_import') : [];
  return <Paper variant="outlined" sx={{p:2.5,borderRadius:3}}>
    <Stack spacing={2}>
      <Stack direction="row" justifyContent="space-between" alignItems="center">
        <Typography fontWeight={800}>Lịch sử điều chỉnh từ Excel</Typography>
        <Chip size="small" label={`${history.length} lần`}/>
      </Stack>
      {!history.length && <Typography variant="body2" color="text.secondary">Chưa có lịch sử cập nhật từ Excel.</Typography>}
      {[...history].reverse().map((item,i)=><Box key={`${item.at}-${i}`}>
        {i>0&&<Divider sx={{mb:2}}/>}
        <Typography variant="body2" fontWeight={700}>{item.at?new Date(item.at).toLocaleString('vi-VN'):'Không rõ thời gian'} · {item.byEmail||item.byUid||'Không rõ người sửa'}</Typography>
        <Typography variant="caption" color="text.secondary">Dòng Excel: {item.fileRow||'—'}</Typography>
        {(item.fields||[]).map((change,j)=><Typography key={j} variant="body2" sx={{mt:.5,overflowWrap:'anywhere'}}><b>{change.label||change.field}:</b> {change.before||'(trống)'} → {change.after||'(trống)'}</Typography>)}
      </Box>)}
    </Stack>
  </Paper>;
}
