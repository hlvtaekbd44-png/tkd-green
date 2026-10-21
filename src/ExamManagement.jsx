
import React, { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  doc,
  where,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { db } from "./firebase";

export default function ExamManagement({
  students = [],
  profile,
  loading = false,
  error = "",
  location = "Tất cả điểm tập",
}) {
  const [periods, setPeriods] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [periodDialog, setPeriodDialog] = useState(false);
  const [registerDialog, setRegisterDialog] = useState(false);
  const [periodName, setPeriodName] = useState("");
  const [maDotThi, setMaDotThi] = useState("");
  const [examDate, setExamDate] = useState("");
  const [examLocation, setExamLocation] = useState("");
  const [studentId, setStudentId] = useState("");
  const [dangDuThi, setDangDuThi] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] = useState("info");

  const isAdmin = profile?.role === "admin";

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, "examPeriods")),
      (snapshot) => {
        const data = snapshot.docs.map((item) => ({
          id: item.id,
          ...item.data(),
        }));
        setPeriods(data);

        if (data.length && !selectedPeriod) {
          setSelectedPeriod(data[0].id);
        }
      },
      (err) => {
        console.error("Không tải được đợt thi:", err);
        setMessage(
          "Không tải được đợt thi. Cần kiểm tra quyền Firestore."
        );
        setMessageType("error");
      }
    );

    return unsubscribe;
  }, [selectedPeriod]);

  
  useEffect(() => {
    if (!selectedPeriod) {
      setRegistrations([]);
      return undefined;
    }

    const registrationsRef = collection(db, "examRegistrations");

    // Admin xem tất cả đăng ký của đợt thi.
    // HLV chỉ xem đăng ký tại các điểm tập được phân công.
    const registrationsQuery =
      profile?.role === "admin"
        ? query(
            registrationsRef,
            where("periodId", "==", selectedPeriod)
          )
        : query(
            registrationsRef,
            where("periodId", "==", selectedPeriod),
            where("diemTap", "in", profile?.diemTap || [])
          );

    const unsubscribe = onSnapshot(
      registrationsQuery,
      (snapshot) => {
        setRegistrations(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
      },
      (err) => {
        console.error("Không tải được đăng ký:", err);
        setMessage(
          "Không tải được danh sách đăng ký. Cần kiểm tra quyền Firestore."
        );
        setMessageType("error");
      }
    );

    return unsubscribe;
  }, [selectedPeriod, profile]);


  const visibleStudents = useMemo(() => {
    return students.filter((student) => {
      const locationMatches =
        location === "Tất cả điểm tập" ||
        student.location === location;

      const assignedLocations = Array.isArray(profile?.diemTap)
        ? profile.diemTap
        : [];

      const permissionMatches =
        isAdmin || assignedLocations.includes(student.location);

      return locationMatches && permissionMatches;
    });
  }, [students, location, profile, isAdmin]);

  const selectedPeriodData = periods.find(
    (period) => period.id === selectedPeriod
  );

  const registeredIds = new Set(
    registrations.map((item) => item.memberDocId)
  );

  
const handleCreatePeriod = async () => {
  const code = maDotThi.trim().toUpperCase();

  if (
    !periodName.trim() ||
    !examDate ||
    !examLocation.trim() ||
    !code
  ) {
    setMessage(
      "Vui lòng nhập mã đợt thi, tên đợt thi, ngày thi và địa điểm."
    );
    setMessageType("warning");
    return;
  }

  if (!/^[A-Z0-9_-]+$/.test(code)) {
    setMessage(
      "Mã đợt thi chỉ được chứa chữ không dấu, số, dấu gạch ngang và gạch dưới."
    );
    setMessageType("warning");
    return;
  }

  const duplicate = periods.some(
    (period) =>
      (period.maDotThi || "").trim().toUpperCase() === code
  );

  if (duplicate) {
    setMessage("Mã đợt thi này đã tồn tại. Vui lòng chọn mã khác.");
    setMessageType("warning");
    return;
  }

  setBusy(true);
  setMessage("");

  try {
    const ref = await addDoc(collection(db, "examPeriods"), {
      maDotThi: code,
      name: periodName.trim(),
      examDate,
      examLocation: examLocation.trim(),
      status: "Đang đăng ký",
      createdBy: profile?.email || "",
      createdAt: serverTimestamp(),
    });

    setSelectedPeriod(ref.id);
    setPeriodDialog(false);
    setMaDotThi("");
    setPeriodName("");
    setExamDate("");
    setExamLocation("");
    setMessage("Đã tạo đợt thi với mã " + code + ".");
    setMessageType("success");
  } catch (err) {
    console.error("Lỗi tạo đợt thi:", err);
    setMessage(
      "Chưa tạo được đợt thi. Kiểm tra quyền Firestore trước khi thử lại."
    );
    setMessageType("error");
  } finally {
    setBusy(false);
  }
};

  const handleRegister = async () => {
    const student = visibleStudents.find(
      (item) => item.id === studentId
    );

    if (!selectedPeriodData || !student || !dangDuThi.trim()) {
      setMessage("Vui lòng chọn đợt thi, võ sinh và đẳng dự thi.");
      setMessageType("warning");
      return;
    }

    if (registeredIds.has(student.id)) {
      setMessage("Võ sinh này đã đăng ký trong đợt thi đang chọn.");
      setMessageType("warning");
      return;
    }

    setBusy(true);
    setMessage("");

    try {
      const registrationId =
        `${selectedPeriod}_${encodeURIComponent(student.id)}`;

      await setDoc(doc(db, "examRegistrations", registrationId), {
        periodId: selectedPeriod,
        memberDocId: student.id,
        maHV: student.maHV,
        hoTen: student.name,
        diemTap: student.location,
        dangDuThi: dangDuThi.trim(),
        status: "Đã đăng ký",
        createdBy: profile?.email || "",
        createdAt: serverTimestamp(),
      });

      setRegisterDialog(false);
      setStudentId("");
      setDangDuThi("");
      setMessage("Đã đăng ký võ sinh vào đợt thi.");
      setMessageType("success");
    } catch (err) {
      console.error(err);
      setMessage(
        "Chưa lưu được đăng ký. Kiểm tra quyền Firestore trước khi thử lại."
      );
      setMessageType("error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        spacing={2}
        sx={{ mb: 3 }}
      >
        <Box>
          <Typography variant="h5" fontWeight={800}>
            Quản lý thi cấp
          </Typography>
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            Quản lý đợt thi và đăng ký võ sinh trên web.
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap">
          {isAdmin && (
            <Button
              variant="outlined"
              onClick={() => setPeriodDialog(true)}
            >
              Tạo đợt thi
            </Button>
          )}
          <Button
            variant="contained"
            onClick={() => setRegisterDialog(true)}
            disabled={!selectedPeriod || loading}
            sx={{ bgcolor: "#176b45" }}
          >
            Đăng ký võ sinh
          </Button>
        </Stack>
      </Stack>

      {message && (
        <Alert
          severity={messageType}
          onClose={() => setMessage("")}
          sx={{ mb: 2 }}
        >
          {message}
        </Alert>
      )}

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, mb: 3, borderRadius: 3 }}>
        <Typography fontWeight={700} sx={{ mb: 1 }}>
          Đợt thi
        </Typography>

        <TextField
          select
          fullWidth
          label="Chọn đợt thi"
          value={selectedPeriod}
          onChange={(event) => setSelectedPeriod(event.target.value)}
        >
          {periods.map((period) => (
            <MenuItem key={period.id} value={period.id}>
              {period.maDotThi
  ? `${period.maDotThi} — `
  : ""}
{period.name} — {period.examDate || "Chưa có ngày thi"}
            </MenuItem>
          ))}
        </TextField>

        {selectedPeriodData && (
          <Stack
            direction="row"
            spacing={1}
            useFlexGap
            flexWrap="wrap"
            sx={{ mt: 2 }}
          >
            <Chip label={`Mã đợt thi: ${selectedPeriodData.maDotThi || "Chưa có mã"}`}/>
            <Chip label={`Ngày thi: ${selectedPeriodData.examDate}`} />
            <Chip label={`Địa điểm: ${selectedPeriodData.examLocation}`} />
            <Chip label={selectedPeriodData.status || "Chưa xác định"} />
            <Chip label={`${registrations.length} thí sinh đăng ký`} />
          </Stack>
        )}

        {!periods.length && (
          <Typography color="text.secondary" sx={{ mt: 2 }}>
            Chưa có đợt thi. Quản trị viên có thể tạo đợt thi mới.
          </Typography>
        )}
      </Paper>

      <TableContainer component={Paper} variant="outlined">
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Mã VTF</TableCell>
              <TableCell>Họ và tên</TableCell>
              <TableCell>Điểm tập</TableCell>
              <TableCell>Đẳng dự thi</TableCell>
              <TableCell>Trạng thái</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {registrations.map((item) => (
              <TableRow key={item.id}>
                <TableCell>{item.maHV}</TableCell>
                <TableCell>{item.hoTen}</TableCell>
                <TableCell>{item.diemTap}</TableCell>
                <TableCell>{item.dangDuThi}</TableCell>
                <TableCell>
                  <Chip
                    size="small"
                    label={item.status || "Đã đăng ký"}
                    color="success"
                  />
                </TableCell>
              </TableRow>
            ))}

            {!registrations.length && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  Chưa có thí sinh đăng ký trong đợt thi này.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog
        open={periodDialog}
        onClose={() => !busy && setPeriodDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Tạo đợt thi mới</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
            label="Mã đợt thi"
            placeholder="Ví dụ: Q3-2026"
            value={maDotThi}
            onChange={(event) => setMaDotThi(event.target.value)}
            helperText="Mã này phải trùng với cột MaDotThi trong Google Sheets."
            fullWidth
            />
            <TextField
            label="Tên đợt thi"
            placeholder="Ví dụ: Kỳ thi thăng cấp đai tháng 10/2026"
            value={periodName}
            onChange={(event) => setPeriodName(event.target.value)}
            fullWidth
            />
            <TextField
              label="Ngày thi"
              type="date"
              value={examDate}
              onChange={(event) => setExamDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              fullWidth
            />
            <TextField
              label="Địa điểm thi"
              value={examLocation}
              onChange={(event) => setExamLocation(event.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPeriodDialog(false)} disabled={busy}>
            Hủy
          </Button>
          <Button onClick={handleCreatePeriod} disabled={busy} variant="contained">
            Lưu đợt thi
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog
        open={registerDialog}
        onClose={() => !busy && setRegisterDialog(false)}
        fullWidth
        maxWidth="sm"
      >
        <DialogTitle>Đăng ký võ sinh thi cấp</DialogTitle>
        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            <TextField
              select
              label="Võ sinh"
              value={studentId}
              onChange={(event) => setStudentId(event.target.value)}
              fullWidth
            >
              {visibleStudents
                .filter((student) => !registeredIds.has(student.id))
                .map((student) => (
                  <MenuItem key={student.id} value={student.id}>
                    {student.maHV} — {student.name} ({student.location})
                  </MenuItem>
                ))}
            </TextField>

            <TextField
              label="Đẳng dự thi"
              placeholder="Ví dụ: Cấp 1"
              value={dangDuThi}
              onChange={(event) => setDangDuThi(event.target.value)}
              fullWidth
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRegisterDialog(false)} disabled={busy}>
            Hủy
          </Button>
          <Button onClick={handleRegister} disabled={busy} variant="contained">
            Lưu đăng ký
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
