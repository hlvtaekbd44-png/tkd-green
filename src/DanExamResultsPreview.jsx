import React, { useMemo, useState } from 'react';
import * as XLSX from 'xlsx';
import { collection, doc, getDocs, query, where, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Alert, Box, Button, Chip, Dialog, DialogTitle, DialogContent, DialogActions, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { db, auth } from './firebase';
import { BELT_LEVELS, normalizeBeltLevel } from './BeltBadge';

// Định dạng gốc: SBD | Mã VTF | Đơn vị | Câu Lạc Bộ | Họ và Tên |
// Năm sinh | Giới tính | Đẳng hiện tại | Thi thăng | Trạng thái
const REQUIRED = ['SBD', 'Mã VTF', 'Đơn vị', 'Câu Lạc Bộ', 'Họ và Tên', 'Năm sinh', 'Giới tính', 'Đẳng hiện tại', 'Thi thăng', 'Trạng thái'];
const clean = v => String(v ?? '').normalize('NFC').trim().replace(/\s+/g, ' ');
const fold = v => clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toLowerCase();
const key = v => clean(v).toUpperCase();
const normalizedGrade = v => fold(v).replace(/\s+/g, '');
const dateKey = value => {
  const v = clean(value);
  const match = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return '';
};
const normalizeResult = v => {
  const text = fold(v);
  if (['dat', 'pass'].includes(text)) return 'Đạt';
  if (['khong dat', 'khongdat', 'fail'].includes(text)) return 'Không đạt';
  return '';
};
const cancelled = reg => ['khong du thi', 'da huy', 'huy'].includes(fold(reg.status || reg.trangThai));
const priorResult = reg => Boolean(reg.resultApplied || reg.examResultApplied || ['dat', 'khong dat'].includes(fold(reg.ketQua)));
// Dãy thăng đẳng chính thức trong CLB. Chỉ cho thăng đúng một bậc.
const danNext = current => {
  const belt = normalizeBeltLevel(current);
  if (belt === 'Cấp 1') return '1 Đẳng';
  const match = belt.match(/^([1-6]) Đẳng$/);
  return match ? `${Number(match[1]) + 1} Đẳng` : '';
};
const sameGrade = (a, b) => normalizeBeltLevel(a) === normalizeBeltLevel(b);


export default function DanExamResultsPreview({ period, registrations = [], isAdmin = false }) {
  const [rows, setRows] = useState([]);
  const [filename, setFilename] = useState('');
  const [report, setReport] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmCode, setConfirmCode] = useState('');
  const [commitLog, setCommitLog] = useState([]);
  const [committed, setCommitted] = useState(false);
  const code = clean(period?.name);
  const counts = useMemo(() => ({ ok: report.filter(r => r.ok).length, errors: report.filter(r => !r.ok).length }), [report]);
  const canCommit = Boolean(isAdmin && report.length && counts.errors === 0 && !busy && !committed && auth.currentUser);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    setRows([]); setReport([]); setFilename(''); setError(''); setCommitLog([]); setCommitted(false); setConfirmOpen(false); setConfirmCode('');
    if (!file) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) { setError('Chỉ chấp nhận Excel .xlsx/.xls hoặc CSV .csv.'); return; }
    if (file.size > 5 * 1024 * 1024) { setError('File lớn hơn giới hạn 5 MB.'); return; }
    setBusy(true);
    try {
      const raw = await file.arrayBuffer();
      const book = XLSX.read(raw, { type: 'array', cellDates: false });
      const sheet = book.Sheets[book.SheetNames[0]];
      if (!sheet) throw new Error('Không tìm thấy trang tính.');
      const content = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
      if (!content.length) throw new Error('Không có dòng dữ liệu.');
      const fields = Object.keys(content[0]).map(x => x.replace(/^\uFEFF/, '').trim());
      const missing = REQUIRED.filter(x => !fields.includes(x));
      if (missing.length) throw new Error(`Thiếu cột: ${missing.join(', ')}. Mẫu phải giữ đúng 10 cột gốc.`);
      if (content.length > 2000) throw new Error('Mỗi lần nhập tối đa 2.000 dòng.');
      const mapped = content.map((r, i) => ({
        ...Object.fromEntries(Object.entries(r).map(([k, v]) => [k.replace(/^\uFEFF/, '').trim(), v])),
        sheetRow: i + 2,
      }));
      setRows(mapped); setFilename(file.name);
    } catch (e) { setError(`Không đọc được file: ${e.message}`); }
    finally { setBusy(false); }
  }

  async function checkRows() {
    if (!rows.length || busy || !isAdmin || !code) return;
    setBusy(true); setError(''); setReport([]); setCommitLog([]); setCommitted(false);
    try {
      if (!/^L[1-9]\d*-\d{4}$/i.test(code) || (period.examType && period.examType !== 'dan')) {
        throw new Error('Chỉ đối chiếu trong đợt Thi đẳng L... đang chọn.');
      }
      const seen = new Set();
      const memberCache = new Map();
      const out = [];
      for (const row of rows) {
        const errors = [];
        const vtf = key(row['Mã VTF']);
        const result = normalizeResult(row['Trạng thái']);
        const target = clean(row['Thi thăng']);
        const existing = clean(row['Đẳng hiện tại']);
        if (!vtf) errors.push('Thiếu mã VTF');
        if (vtf && seen.has(vtf)) errors.push('Trùng mã VTF trong file');
        seen.add(vtf);
        if (!result) errors.push('Trạng thái chỉ nhận Đạt / Không đạt');
        if (!/^[1-7]\s*Đẳng$/i.test(target)) errors.push('Thi thăng phải có dạng 1 Đẳng đến 7 Đẳng');
        if (danNext(existing) !== normalizeBeltLevel(target)) errors.push('Không đúng bậc thăng kế tiếp');
        if (!dateKey(row['Năm sinh'])) errors.push('Ngày sinh không đúng dd/mm/yyyy');
        // TKD_VTF_SYNC_V1: Tìm hồ sơ bằng VTF chính thức, rồi liên kết đăng ký bằng memberDocId.
        if (vtf && !memberCache.has(vtf)) {
          const snap = await getDocs(query(collection(db, 'members'), where('maHV', '==', vtf)));
          memberCache.set(vtf, snap.docs);
        }
        const matchingMemberIds = new Set((memberCache.get(vtf) || []).map(m => m.id));
        const matches = registrations.filter(r => matchingMemberIds.has(r.memberDocId) && (!r.periodId || r.periodId === period.id));
        if (matches.length !== 1) errors.push(matches.length ? 'Trùng đăng ký thi trong đợt' : 'Chưa có đăng ký trong đợt');
        const reg = matches.length === 1 ? matches[0] : null;
        if (reg) {
          if (reg.examType && reg.examType !== 'dan') errors.push('Đăng ký không thuộc Thi đẳng');
          if (cancelled(reg)) errors.push('Đăng ký đã hủy');
          if (priorResult(reg)) errors.push('Đã có kết quả/chốt trước đó');
          if (normalizedGrade(reg.dangDuThi) !== normalizedGrade(target)) errors.push('Đẳng dự thi không khớp đăng ký');
        }
        let member = null;
        if (reg && vtf) {
          if (!memberCache.has(vtf)) {
            const snap = await getDocs(query(collection(db, 'members'), where('maHV', '==', vtf)));
            memberCache.set(vtf, snap.docs);
          }
          const docs = memberCache.get(vtf);
          if (docs.length !== 1) errors.push(docs.length ? 'Mã VTF trùng hồ sơ' : 'Không tìm thấy hồ sơ VTF');
          else {
            member = { id: docs[0].id, ...docs[0].data() };
            if (member.id !== reg.memberDocId) errors.push('Hồ sơ không khớp đăng ký');
            if (fold(member.hoTen) !== fold(row['Họ và Tên'])) errors.push('Họ tên không khớp');
            if (dateKey(member.ngaySinh) !== dateKey(row['Năm sinh'])) errors.push('Ngày sinh không khớp');
            if (normalizedGrade(member.capDaiDang) !== normalizedGrade(existing)) errors.push('Đẳng hiện tại không khớp hồ sơ');
            if (fold(member.gioiTinh) !== fold(row['Giới tính'])) errors.push('Giới tính không khớp');
          }
        }
        out.push({ row, vtf, target, existing, result, regId: reg?.id || '', memberId: member?.id || '', errors, ok: errors.length === 0 });
      }
      setReport(out);
    } catch(e) { setError(`Lỗi đối chiếu: ${e.message}`); }
    finally { setBusy(false); }
  }

  // Chốt tuần tự từng võ sinh. Mỗi giao dịch atomically ghi hồ sơ + đăng ký,
  // và không thể ghi đè kết quả cũ. Nếu gặp lỗi, báo từng dòng để xử lý.
  async function commitResults() {
    if (!canCommit || !confirmOpen || confirmCode.trim().toUpperCase() !== code.toUpperCase()) return;
    setConfirmOpen(false);
    setBusy(true); setError(''); setCommitLog([]);
    const operator = auth.currentUser?.uid;
    const output = [];
    try {
      if (!operator) throw new Error('Hết phiên đăng nhập. Hãy đăng nhập lại.');
      // Bảo vệ trong trường hợp đợt thi bị đổi hoặc xóa sau khi đối chiếu.
      const periodRef = doc(db, 'examPeriods', period.id);
      for (const item of report) {
        try {
          if (!item.ok || !item.regId || !item.memberId) throw new Error('Dòng chưa đối chiếu hợp lệ.');
          const registrationRef = doc(db, 'examRegistrations', item.regId);
          const memberRef = doc(db, 'members', item.memberId);
          await runTransaction(db, async tx => {
            const [periodSnap, regSnap, memberSnap] = await Promise.all([
              tx.get(periodRef), tx.get(registrationRef), tx.get(memberRef),
            ]);
            if (!periodSnap.exists() || periodSnap.data().examType !== 'dan' ||
                key(periodSnap.data().name) !== key(code)) throw new Error('Đợt Thi đẳng đã thay đổi.');
            if (!regSnap.exists() || !memberSnap.exists()) throw new Error('Không tìm thấy hồ sơ/đăng ký.');
            const reg = regSnap.data(), member = memberSnap.data();
            if (reg.periodId !== period.id || (reg.examType && reg.examType !== 'dan') ||
                reg.memberDocId !== item.memberId ||
                key(member.maHV) !== item.vtf) throw new Error('Đăng ký hoặc mã VTF đã thay đổi.');
            if (cancelled(reg) || priorResult(reg)) throw new Error('Đăng ký đã hủy hoặc đã chốt kết quả.');
            if (fold(member.hoTen) !== fold(item.row['Họ và Tên']) ||
                dateKey(member.ngaySinh) !== dateKey(item.row['Năm sinh']) ||
                fold(member.gioiTinh) !== fold(item.row['Giới tính'])) {
              throw new Error('Thông tin hội viên đã thay đổi, cần đối chiếu lại.');
            }
            if (!sameGrade(reg.dangDuThi, item.target) ||
                !sameGrade(member.capDaiDang, item.existing) ||
                danNext(member.capDaiDang) !== normalizeBeltLevel(item.target)) {
              throw new Error('Cấp/đẳng hiện tại hoặc đẳng dự thi không còn phù hợp.');
            }
            if (!['Đạt', 'Không đạt'].includes(item.result)) throw new Error('Kết quả thi không hợp lệ.');
            const before = normalizeBeltLevel(member.capDaiDang);
            const after = item.result === 'Đạt' ? normalizeBeltLevel(item.target) : before;
            if (item.result === 'Đạt') {
              if (!BELT_LEVELS[after]) throw new Error('Không tìm thấy đai đẳng trong cấu hình CLB.');
              tx.update(memberRef, {
                capDaiDang: after,
                mauDai: BELT_LEVELS[after].name,
              });
            }
            tx.update(registrationRef, {
              ketQua: item.result,
              resultApplied: true,
              examResultApplied: true,
              capDaiTruocThi: before,
              capDaiSauThi: after,
              resultAppliedAt: serverTimestamp(),
              resultAppliedBy: operator,
              resultSource: 'dong_nai_10_columns',
              sbd: String(item.row.SBD ?? ''),
            });
          });
          output.push({ vtf: item.vtf, name: item.row['Họ và Tên'], ok: true, result: item.result });
        } catch (rowError) {
          output.push({ vtf: item.vtf, name: item.row['Họ và Tên'], ok: false, message: rowError?.message || 'Lỗi không xác định' });
        }
      }
      setCommitLog(output);
      setCommitted(true); // Không cho bấm lặp; muốn chốt lại phải tải file và đối chiếu mới.
    } catch(e) {
      setError(`Không thể chốt kết quả: ${e?.message || 'Lỗi không xác định'}`);
      setCommitted(true);
    } finally {
      setBusy(false); setConfirmCode('');
    }
  }

  if (!isAdmin) return null;
  return <Paper variant="outlined" sx={{ p: 2.5, mt: 3, borderRadius: 3 }}>
    <Typography variant="h6" fontWeight={800}>Nhập kết quả Thi đẳng – Mẫu 10 cột</Typography>
    <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
      Đợt đang chọn: {code || 'Chưa chọn'} · Hỗ trợ mẫu SBD / Mã VTF / Đơn vị / Câu Lạc Bộ / Họ và Tên / Năm sinh / Giới tính / Đẳng hiện tại / Thi thăng / Trạng thái.
    </Typography>
    <Alert severity="info" sx={{ my: 2 }}>Bước 1: Đối chiếu. Bước 2: Admin xác nhận chốt kết quả. Nếu Đạt, cập nhật đẳng mới trong hồ sơ; nếu Không đạt, giữ nguyên đẳng và lưu kết quả thi. Một kết quả đã chốt sẽ không được ghi đè.</Alert>
    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2} alignItems="center">
      <Button component="label" variant="outlined" disabled={!code || busy}>
        Chọn file Excel / CSV
        <input type="file" accept=".xlsx,.xls,.csv" hidden onChange={handleFile}/>
      </Button>
      <Typography variant="body2">{filename || 'Chưa chọn file'} · {rows.length} dòng</Typography>
      <Button variant="contained" disabled={!rows.length || busy} onClick={checkRows}>{busy ? 'Đang xử lý...' : 'Đối chiếu Firestore'}</Button>
      <Button color="success" variant="contained" disabled={!canCommit} onClick={() => setConfirmOpen(true)}>Chốt kết quả & cập nhật đẳng</Button>
    </Stack>
    {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
    {!!report.length && <Box sx={{ mt: 2 }}>
      <Stack direction="row" spacing={1} sx={{ mb: 2 }}><Chip color="success" label={`Khớp: ${counts.ok}`}/><Chip color="error" label={`Cần kiểm tra: ${counts.errors}`}/></Stack>
      <TableContainer sx={{ maxHeight: 460 }}><Table stickyHeader size="small">
        <TableHead><TableRow>{['Dòng','SBD','Mã VTF','Họ và Tên','Đẳng hiện tại','Thi thăng','Kết quả','Đối chiếu'].map(h => <TableCell key={h}>{h}</TableCell>)}</TableRow></TableHead>
        <TableBody>{report.map(item => <TableRow key={item.row.sheetRow}>
          <TableCell>{item.row.sheetRow}</TableCell><TableCell>{item.row.SBD}</TableCell><TableCell>{item.vtf}</TableCell><TableCell>{item.row['Họ và Tên']}</TableCell><TableCell>{item.existing}</TableCell><TableCell>{item.target}</TableCell><TableCell>{item.result || '—'}</TableCell>
          <TableCell>{item.ok ? <Chip color="success" size="small" label="Khớp"/> : <Typography variant="caption" color="error">{item.errors.join('; ')}</Typography>}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
    </Box>}
    {!!commitLog.length && <Box sx={{ mt: 2 }}>
      <Alert severity={commitLog.every(x => x.ok) ? 'success' : 'warning'}>
        Chốt thành công {commitLog.filter(x => x.ok).length}/{commitLog.length} hội viên.
        {commitLog.some(x => !x.ok) ? ' Dòng lỗi không được ghi. Hãy khắc phục và đối chiếu lại trước khi chốt tiếp.' : ' Hội viên Đạt đã được cập nhật cấp đẳng.'}
      </Alert>
      {commitLog.filter(x => !x.ok).map(x => <Typography key={x.vtf} color="error" variant="body2" sx={{ mt: 0.75 }}>{x.vtf} · {x.name}: {x.message}</Typography>)}
    </Box>}
    <Dialog open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Xác nhận chốt kết quả Thi đẳng</DialogTitle>
      <DialogContent>
        <Alert severity="warning" sx={{ mb: 2 }}>
          Thao tác sẽ ghi kết quả chính thức và thăng đẳng cho hội viên Đạt. Không có chức năng ghi đè kết quả đã chốt.
        </Alert>
        <Typography>Đợt thi: <b>{code}</b>. Dòng hợp lệ: <b>{counts.ok}</b>. Đạt: <b>{report.filter(r => r.ok && r.result === 'Đạt').length}</b>. Không đạt: <b>{report.filter(r => r.ok && r.result === 'Không đạt').length}</b>.</Typography>
        <Typography sx={{ mt: 2, mb: 1 }}>Nhập chính xác mã đợt <b>{code}</b> để xác nhận:</Typography>
        <Box component="input" value={confirmCode} onChange={e => setConfirmCode(e.target.value)} autoComplete="off" sx={{ width: '100%', p: 1.5, fontSize: 16, border: '1px solid #aaa', borderRadius: 1 }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setConfirmOpen(false)}>Hủy</Button>
        <Button variant="contained" color="success" disabled={busy || !canCommit || confirmCode.trim().toUpperCase() !== code.toUpperCase()} onClick={commitResults}>Xác nhận chốt kết quả</Button>
      </DialogActions>
    </Dialog>
  </Paper>;
}
