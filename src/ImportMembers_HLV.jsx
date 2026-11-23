import { useState } from 'react';
import * as XLSX from 'xlsx';
import { Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useClubLocations, namesForProfile } from './useClubLocations';
import { downloadMemberTemplate } from './memberImportTemplate';
import { IMPORT_COLUMNS, loadExistingForImport, validateImportRows, importOneMember, updateExistingFromImport, formatDateVN } from './memberImportService';

const colors={create:'success',update:'warning',skip:'default',error:'error'};
const labels={create:'Thêm mới',update:'Cập nhật',skip:'Trùng hoàn toàn · bỏ qua',error:'Cần kiểm tra'};
const PERMISSION_MODE = 'hlv';

export default function ImportMembers({ open, onClose, students = [], profile }) {
  const resolvedProfile = profile || (PERMISSION_MODE === 'admin' ? {role:'admin'} : null);
  const { locations, loadingLocations, locationError }=useClubLocations();
  const locationNames=PERMISSION_MODE==='admin' ? locations.filter(x=>x.active!==false).map(x=>x.name) : namesForProfile(locations,resolvedProfile);
  const canCreate=resolvedProfile?.role==='admin' || (resolvedProfile?.role==='hlv' && resolvedProfile?.permissions?.members?.create===true);
  const canEdit=resolvedProfile?.role==='admin' || (resolvedProfile?.role==='hlv' && resolvedProfile?.permissions?.members?.edit===true);
  const [rows,setRows]=useState([]), [filename,setFilename]=useState('');
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[message,setMessage]=useState(''),[results,setResults]=useState([]);
  const totals={create:rows.filter(r=>r.action==='create').length,update:rows.filter(r=>r.action==='update').length,skip:rows.filter(r=>r.action==='skip').length,error:rows.filter(r=>r.action==='error').length};
  const actionable=rows.filter(r=>r.action==='create'||r.action==='update');
  function downloadExcelTemplate(){try{downloadMemberTemplate(locationNames);}catch(e){setMessage(e.message);}}
  async function handleFile(e){
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    setRows([]);setResults([]);setProgress(0);setMessage('');setFilename('');
    if(!/\.xlsx$/i.test(file.name)){setMessage('Chỉ nhận Excel .xlsx');return;}
    if(loadingLocations||locationError||!locationNames.length){setMessage(locationError||'Chưa tải được điểm tập');return;}
    setBusy(true);
    try{
      const book=XLSX.read(await file.arrayBuffer(),{type:'array'});
      const sheet=book.Sheets['DanhSachHoiVien'];if(!sheet)throw new Error('Không tìm thấy sheet DanhSachHoiVien');
      const headers=(XLSX.utils.sheet_to_json(sheet,{header:1,blankrows:false})[0]||[]).map(v=>String(v).trim());
      const missing=IMPORT_COLUMNS.filter(c=>!headers.includes(c));if(missing.length)throw new Error('Thiếu cột: '+missing.join(', '));
      const data=XLSX.utils.sheet_to_json(sheet,{defval:'',raw:true}).filter(r=>IMPORT_COLUMNS.some(k=>String(r[k]??'').trim()!==''));
      // Đọc bản mới nhất đầy đủ từ Firestore, không dựa vào students rút gọn.
      const existing=await loadExistingForImport(resolvedProfile,locationNames);
      setRows(validateImportRows(data,existing,locationNames));setFilename(file.name);
    }catch(err){setMessage(`Không thể xem trước: ${err.message}`);}finally{setBusy(false);}
  }
  async function handleImport(){
    if(busy||totals.error||!actionable.length||!canCreate&&totals.create||!canEdit&&totals.update)return;
    setBusy(true);setMessage('');setResults([]);setProgress(0);
    const done=[];
    for(const row of actionable){
      try{
        if(!locationNames.includes(row.member.diemTap))throw new Error('Điểm tập không còn hợp lệ');
        let result;
        if(row.action==='create'){
          if(!canCreate)throw new Error('Không có quyền thêm hội viên');
          result=await importOneMember(row.member,resolvedProfile);
        }else{
          if(!canEdit)throw new Error('Không có quyền sửa hội viên');
          result=await updateExistingFromImport(row,locationNames,resolvedProfile);
        }
        done.push({rowNumber:row.rowNumber,action:result.action||row.action,code:result.maHoiVienNoiBo||'',success:true});
      }catch(err){
        done.push({rowNumber:row.rowNumber,action:row.action,success:false,error:err.message});
        setMessage(`Đã dừng ở dòng ${row.rowNumber}: ${err.message}. Các dòng trước đã lưu; không tự chạy lại toàn bộ trước khi kiểm tra.`);
        setResults([...done]);setBusy(false);return;
      }
      setProgress(done.length);setResults([...done]);
    }
    setMessage(`Hoàn thành: ${done.filter(x=>x.action==='create').length} thêm mới; ${done.filter(x=>x.action==='update').length} cập nhật; ${totals.skip+done.filter(x=>x.action==='skip').length} không thay đổi.`);
    setBusy(false);
  }
  const disabled=busy||loadingLocations||!!locationError;
  return <Dialog open={open} onClose={busy?undefined:onClose} fullWidth maxWidth="lg" scroll="paper">
    <DialogTitle sx={{fontWeight:800}}>Import Hội viên · đối chiếu và cập nhật dữ liệu</DialogTitle>
    <DialogContent dividers><Stack spacing={2} sx={{pt:1}}>
      <Stack direction={{xs:'column',sm:'row'}} spacing={1.5}>
        <Button variant="outlined" disabled={disabled||!locationNames.length} onClick={downloadExcelTemplate}>Tải Excel mẫu (13 cột)</Button>
        <Button variant="contained" component="label" disabled={disabled}>Chọn file Excel <input hidden type="file" accept=".xlsx" onChange={handleFile}/></Button>
      </Stack>
      {locationError&&<Alert severity="error">{locationError}</Alert>}
      <Alert severity="info">Đối chiếu theo Mã VTF + Điểm tập; cùng mã nhưng thông tin khác sẽ cập nhật, trùng hoàn toàn sẽ bỏ qua. Ô Excel để trống không xóa giá trị hồ sơ cũ. Lịch sử chỉnh sửa lưu trong hồ sơ. Không tự chuyển điểm tập.</Alert>
      {filename&&<Typography variant="body2">File: {filename}</Typography>}
      <Stack direction="row" gap={1} flexWrap="wrap">
        <Chip label={`Tổng: ${rows.length}`}/>
        <Chip color="success" label={`Thêm: ${totals.create}`}/>
        <Chip color="warning" label={`Cập nhật: ${totals.update}`}/>
        <Chip label={`Bỏ qua: ${totals.skip}`}/>
        <Chip color="error" label={`Cần kiểm tra: ${totals.error}`}/>
      </Stack>
      {message&&<Alert severity={message.startsWith('Hoàn thành')?'success':'warning'}>{message}</Alert>}
      {busy&&<Box><LinearProgress variant={actionable.length?'determinate':'indeterminate'} value={actionable.length?(progress/actionable.length)*100:0}/><Typography variant="caption">Đã xử lý {progress}/{actionable.length} dòng cần ghi</Typography></Box>}
      <TableContainer sx={{maxHeight:480,border:'1px solid #dde9e0',borderRadius:2}}>
        <Table size="small" stickyHeader><TableHead><TableRow><TableCell>Dòng</TableCell><TableCell>Hội viên</TableCell><TableCell>Mã VTF</TableCell><TableCell>Điểm tập</TableCell><TableCell>Xử lý / trường thay đổi</TableCell></TableRow></TableHead>
          <TableBody>{rows.map(r=><TableRow key={r.rowNumber} hover>
            <TableCell>{r.rowNumber}</TableCell><TableCell><Typography fontWeight={700} variant="body2">{r.member.hoTen}</Typography><Typography variant="caption">{formatDateVN(r.member.ngaySinh)}</Typography></TableCell>
            <TableCell>{r.member.maHV||'—'}</TableCell><TableCell>{r.member.diemTap}</TableCell><TableCell><Stack spacing={.5}>
              <Chip size="small" color={colors[r.action]} label={labels[r.action]} sx={{alignSelf:'flex-start'}}/>
              {r.changes.map(c=><Typography key={c.field} variant="caption" sx={{overflowWrap:'anywhere'}}><b>{c.label}:</b> {c.before||'(trống)'} → {c.after}</Typography>)}
              {r.errors.map((x,i)=><Typography key={i} variant="caption" color="error">{x}</Typography>)}
            </Stack></TableCell>
          </TableRow>)}</TableBody>
        </Table>
      </TableContainer>
      {results.length>0&&<Typography variant="body2">Đã xử lý: {results.length} dòng. {results.filter(r=>!r.success).map(r=>`Dòng ${r.rowNumber}: ${r.error}`).join('; ')}</Typography>}
    </Stack></DialogContent>
    <DialogActions sx={{p:2}}><Button disabled={busy} onClick={onClose}>Đóng</Button><Button variant="contained" disabled={disabled||!actionable.length||totals.error>0||results.length>0||(totals.create>0&&!canCreate)||(totals.update>0&&!canEdit)} onClick={handleImport}>Xác nhận ({totals.create} thêm, {totals.update} cập nhật)</Button></DialogActions>
  </Dialog>;
}
