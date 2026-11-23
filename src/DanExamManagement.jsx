import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot, query, serverTimestamp, updateDoc, doc } from 'firebase/firestore';
import { db } from './firebase';
import { Alert, Box, Button, Chip, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';

const clean = s => String(s || '').trim();
export default function DanExamManagement({ profile, students = [], location = 'Tất cả điểm tập', locations = [] }) {
  const isAdmin = profile?.role === 'admin';
  const canView = isAdmin || profile?.permissions?.dan?.view === true;
  const canManage = isAdmin || (canView && profile?.permissions?.dan?.manage === true);
  const assigned = profile?.locationPermissions?.dan || [];
  const [sessions, setSessions] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [date, setDate] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [memberId, setMemberId] = useState('');
  const [target, setTarget] = useState('1 Đẳng');
  const [result, setResult] = useState('Chưa thi');
  const [viewLocation, setViewLocation] = useState('');

  useEffect(() => {
    if (!canView) return;
    const off1 = onSnapshot(collection(db, 'danExamSessions'), s => setSessions(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => setError('Không đọc được đợt Thi đẳng: ' + e.message));
    const off2 = onSnapshot(collection(db, 'danExamRegistrations'), s => setRegistrations(s.docs.map(d => ({ id: d.id, ...d.data() }))), e => setError('Không đọc được đăng ký Thi đẳng: ' + e.message));
    return () => { off1(); off2(); };
  }, [canView]);
  const permitted = name => isAdmin || assigned.includes(name);
  const visibleStudents = useMemo(() => students.filter(s => permitted(s.location) && (location === 'Tất cả điểm tập' || s.location === location)), [students, location, isAdmin, assigned.join('|')]);
  const visibleSessions = sessions.filter(s => isAdmin || (s.location && permitted(s.location)));
  const selectedSession = sessions.find(s => s.id === sessionId);
  const visibleRegs = registrations.filter(r => (isAdmin || permitted(r.location)) && (!sessionId || r.sessionId === sessionId));
  const allowedLocations = locations.filter(n => n !== 'Tất cả điểm tập' && permitted(n));
  async function write(op, success) {
    setBusy(true); setError(''); setMessage('');
    try { await op(); setMessage(success); }
    catch (e) { setError(e.message || 'Không lưu được. Kiểm tra Firestore Rules.'); }
    finally { setBusy(false); }
  }
  if (!canView) return <Alert severity="error">Tài khoản chưa được cấp quyền xem Thi đẳng.</Alert>;
  return <Stack spacing={2.5} sx={{ mt: 2 }}>
    <Typography variant="h5" fontWeight={800}>Quản lý Thi đẳng</Typography>
    <Alert severity="info">Dữ liệu Thi đẳng lưu riêng tại danExamSessions và danExamRegistrations. Kết quả nhập tại đây chưa tự thay đổi cấp đai hội viên; chức năng xét đạt và cập nhật đẳng cần đối chiếu quy chế trước khi kích hoạt.</Alert>
    {error && <Alert severity="error">{error}</Alert>}
    {message && <Alert severity="success">{message}</Alert>}
    {canManage && <Paper sx={{ p: 2.5 }}><Typography fontWeight={800} gutterBottom>Tạo đợt Thi đẳng</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1}>
        <TextField label="Mã đợt (ví dụ L1-2026)" value={code} onChange={e => setCode(e.target.value)} />
        <TextField label="Tên đợt" value={name} onChange={e => setName(e.target.value)} />
        <TextField type="date" label="Ngày thi" InputLabelProps={{ shrink: true }} value={date} onChange={e => setDate(e.target.value)} />
        <TextField select label="Điểm tập" value={viewLocation} onChange={e => setViewLocation(e.target.value)} sx={{ minWidth: 175 }}>
          {allowedLocations.map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
        </TextField>
        <Button disabled={busy || !clean(code) || !clean(name) || !date || !viewLocation || visibleSessions.some(s => s.code === clean(code) && s.location === viewLocation)} variant="contained" onClick={() => write(async () => {
          await addDoc(collection(db, 'danExamSessions'), { code: clean(code), name: clean(name), date, location: viewLocation, createdAt: serverTimestamp(), createdBy: profile?.uid || '' });
          setCode(''); setName(''); setDate('');
        }, 'Đã tạo đợt Thi đẳng.')}>Tạo đợt</Button>
      </Stack>
    </Paper>}
    <Paper sx={{ p: 2.5 }}><Typography fontWeight={800} gutterBottom>Danh sách đợt thi</Typography>
      <Stack direction="row" gap={1} flexWrap="wrap">{visibleSessions.map(s => <Button key={s.id} variant={sessionId === s.id ? 'contained' : 'outlined'} onClick={() => setSessionId(s.id)}>{s.code} · {s.location}</Button>)}</Stack>
      {!visibleSessions.length && <Typography color="text.secondary">Chưa có đợt Thi đẳng trong phạm vi được cấp.</Typography>}
    </Paper>
    {canManage && selectedSession && permitted(selectedSession.location) && <Paper sx={{ p: 2.5 }}>
      <Typography fontWeight={800} gutterBottom>Đăng ký dự thi · {selectedSession.code}</Typography>
      <Stack direction={{ xs: 'column', md: 'row' }} gap={1}>
        <TextField select label="Hội viên" value={memberId} onChange={e => setMemberId(e.target.value)} sx={{ minWidth: 240 }}>
          {visibleStudents.filter(s => s.location === selectedSession.location).map(s => <MenuItem key={s.id} value={s.id}>{s.name} · {s.belt}</MenuItem>)}
        </TextField>
        <TextField label="Đẳng dự thi" value={target} onChange={e => setTarget(e.target.value)} />
        <Button variant="contained" disabled={busy || !memberId || !clean(target) || registrations.some(r => r.sessionId === sessionId && r.memberId === memberId)} onClick={() => write(async () => {
          const student = visibleStudents.find(s => s.id === memberId);
          if (!student || student.location !== selectedSession.location) throw new Error('Hội viên không thuộc điểm tập của đợt thi.');
          await addDoc(collection(db, 'danExamRegistrations'), { sessionId, sessionCode: selectedSession.code, memberId, memberName: student.name, location: student.location, target: clean(target), result: 'Chưa thi', createdBy: profile?.uid || '', createdAt: serverTimestamp() });
          setMemberId('');
        }, 'Đã đăng ký dự thi.')}>Đăng ký</Button>
      </Stack>
    </Paper>}
    <Paper sx={{ p: 2.5 }}><Typography fontWeight={800} gutterBottom>Danh sách đăng ký / kết quả</Typography>
      {visibleRegs.map(r => <Box key={r.id} sx={{ py: 1.3, borderBottom: '1px solid #e4eae5' }}>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1.5} alignItems={{ md: 'center' }} justifyContent="space-between">
          <Box><Typography fontWeight={700}>{r.memberName} · {r.target}</Typography><Typography variant="caption">{r.sessionCode} · {r.location}</Typography></Box>
          {canManage && permitted(r.location) ? <TextField select size="small" label="Kết quả" value={r.result || 'Chưa thi'} onChange={e => write(() => updateDoc(doc(db, 'danExamRegistrations', r.id), { result: e.target.value, updatedAt: serverTimestamp() }), 'Đã cập nhật kết quả.')} disabled={busy} sx={{ minWidth: 160 }}>
            {['Chưa thi', 'Đạt', 'Không đạt'].map(n => <MenuItem key={n} value={n}>{n}</MenuItem>)}
          </TextField> : <Chip label={r.result || 'Chưa thi'} />}
        </Stack>
      </Box>)}
      {!visibleRegs.length && <Typography color="text.secondary">Chưa có đăng ký dự thi.</Typography>}
    </Paper>
  </Stack>;
}
