
import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
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
import {
  PaymentsRounded,
  SearchRounded,
  ReceiptLongRounded,
} from "@mui/icons-material";
import { db } from "./firebase";

const money = (value) =>
  Number(value || 0).toLocaleString("vi-VN") + " ₫";

export default function TuitionManagement({
  students = [],
  profile,
  loading = false,
  error = "",
  location,
  onLocationChange,
  locations = [],
}) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState("Tháng");
  const [selectedMember, setSelectedMember] = useState(null);
  const [amount, setAmount] = useState("");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toLocaleDateString("en-CA")
  );
  const [note, setNote] = useState("");
  const [payments, setPayments] = useState([]);
  const [paymentsLoading, setPaymentsLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, "tuitionPayments"),
      (snapshot) => {
        setPayments(
          snapshot.docs.map((item) => ({
            id: item.id,
            ...item.data(),
          }))
        );
        setPaymentsLoading(false);
      },
      (err) => {
        console.error("Lỗi đọc lịch sử học phí:", err);
        setPaymentsLoading(false);
        setFormError(
          "Không đọc được lịch sử thu. Hãy kiểm tra quyền Firestore."
        );
      }
    );

    return unsubscribe;
  }, []);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");

    return students.filter((student) => {
      const matchLocation =
        location === "Tất cả điểm tập" ||
        student.location === location;

      const matchSearch =
        !keyword ||
        `${student.maHV} ${student.name} ${student.location}`
          .toLocaleLowerCase("vi")
          .includes(keyword);

      return matchLocation && matchSearch;
    });
  }, [students, location, search]);

  const totalCollected = useMemo(() => {
    const now = new Date();
    return payments.reduce((sum, payment) => {
      if (!payment.ngayThu) return sum;

      const date = new Date(`${payment.ngayThu}T12:00:00`);
      if (
        date.getFullYear() === now.getFullYear() &&
        date.getMonth() === now.getMonth()
      ) {
        return sum + Number(payment.soTien || 0);
      }
      return sum;
    }, 0);
  }, [payments]);

  const openPayment = (member) => {
    setSelectedMember(member);
    setAmount("");
    setPeriod("Tháng");
    setPaymentDate(new Date().toLocaleDateString("en-CA"));
    setNote("");
    setMessage("");
    setFormError("");
  };

  const closePayment = () => {
    if (saving) return;
    setSelectedMember(null);
    setFormError("");
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    setMessage("");
    setFormError("");

    if (!selectedMember?.id) {
      setFormError("Không tìm thấy hồ sơ hội viên.");
      return;
    }

    const numericAmount = Number(amount);

    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setFormError("Vui lòng nhập số tiền thu hợp lệ.");
      return;
    }

    if (!paymentDate) {
      setFormError("Vui lòng chọn ngày thu.");
      return;
    }

    setSaving(true);

    try {
      await addDoc(collection(db, "tuitionPayments"), {
        memberId: selectedMember.id,
        maHV: selectedMember.maHV || selectedMember.id,
        hoTen: selectedMember.name || "",
        diemTap: selectedMember.location || "",
        ngayThu: paymentDate,
        soTien: numericAmount,
        loaiHocPhi: period,
        ghiChu: note.trim(),
        nguoiThu: profile?.email || "",
        createdAt: serverTimestamp(),
      });

      await updateDoc(doc(db, "members", selectedMember.id), {
        tinhTrangHocPhi: "Đã đóng",
      });

      setMessage(
        `Đã lưu khoản thu ${money(numericAmount)} của ${selectedMember.name}.`
      );
      setSelectedMember(null);
    } catch (err) {
      console.error("Lỗi lưu khoản thu:", err);
      setFormError(
        `Không thể lưu khoản thu: ${err.code || ""} ${err.message || ""}`
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5" fontWeight={800}>
          Quản lý học phí
        </Typography>
        <Typography color="text.secondary" mt={0.5}>
          Theo dõi khoản thu và lịch sử đóng học phí của hội viên.
        </Typography>
      </Box>

      {message && <Alert severity="success">{message}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}
      {formError && !selectedMember && (
        <Alert severity="error">{formError}</Alert>
      )}

      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "1fr",
            sm: "repeat(3, minmax(0, 1fr))",
          },
          gap: 2,
        }}
      >
        <Paper elevation={0} sx={{ p: 2.5, border: "1px solid #e3ebe5" }}>
          <Typography color="text.secondary" variant="body2">
            Hội viên trong danh sách
          </Typography>
          <Typography variant="h4" fontWeight={800} mt={1}>
            {filteredStudents.length.toLocaleString("vi-VN")}
          </Typography>
        </Paper>

        <Paper elevation={0} sx={{ p: 2.5, border: "1px solid #e3ebe5" }}>
          <Typography color="text.secondary" variant="body2">
            Đã thu trong tháng này
          </Typography>
          <Typography variant="h4" fontWeight={800} mt={1} color="primary">
            {money(totalCollected)}
          </Typography>
        </Paper>

        <Paper elevation={0} sx={{ p: 2.5, border: "1px solid #e3ebe5" }}>
          <Typography color="text.secondary" variant="body2">
            Giao dịch đã ghi nhận
          </Typography>
          <Typography variant="h4" fontWeight={800} mt={1}>
            {payments.length.toLocaleString("vi-VN")}
          </Typography>
        </Paper>
      </Box>

      <Paper elevation={0} sx={{ p: 2, border: "1px solid #e3ebe5" }}>
        <Stack
          direction={{ xs: "column", md: "row" }}
          spacing={1.5}
          alignItems={{ md: "center" }}
        >
          <TextField
            fullWidth
            size="small"
            placeholder="Tìm mã hội viên, họ tên..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            slotProps={{
              input: {
                startAdornment: (
                  <SearchRounded sx={{ mr: 1, color: "text.secondary" }} />
                ),
              },
            }}
          />

          <TextField
            select
            size="small"
            label="Điểm tập"
            value={location}
            onChange={(event) => onLocationChange?.(event.target.value)}
            sx={{ minWidth: { md: 200 } }}
          >
            {locations.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>
        </Stack>
      </Paper>

      <Paper elevation={0} sx={{ border: "1px solid #e3ebe5", overflow: "hidden" }}>
        <Box sx={{ p: 2 }}>
          <Typography fontWeight={800}>Danh sách học viên</Typography>
          <Typography color="text.secondary" variant="body2">
            Chọn hội viên để ghi nhận khoản thu học phí.
          </Typography>
        </Box>

        {loading ? (
          <Box sx={{ p: 4, textAlign: "center" }}>
            <CircularProgress size={28} />
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 480 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Mã hội viên</TableCell>
                  <TableCell>Họ và tên</TableCell>
                  <TableCell>Điểm tập</TableCell>
                  <TableCell>Trạng thái HP</TableCell>
                  <TableCell align="right">Thao tác</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredStudents.map((student) => (
                  <TableRow hover key={student.id}>
                    <TableCell>{student.maHV}</TableCell>
                    <TableCell>
                      <Typography fontWeight={600}>
                        {student.name || "Chưa có tên"}
                      </Typography>
                    </TableCell>
                    <TableCell>{student.location}</TableCell>
                    <TableCell>
                      <Chip
                        size="small"
                        label={student.fee || "Chưa cập nhật"}
                        color={
                          student.fee === "Đã đóng" ? "success" : "default"
                        }
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<PaymentsRounded />}
                        onClick={() => openPayment(student)}
                      >
                        Thu học phí
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}

                {!filteredStudents.length && (
                  <TableRow>
                    <TableCell colSpan={5} align="center">
                      Không có hội viên phù hợp.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Paper elevation={0} sx={{ border: "1px solid #e3ebe5", overflow: "hidden" }}>
        <Box sx={{ p: 2 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <ReceiptLongRounded color="primary" />
            <Typography fontWeight={800}>Lịch sử thu học phí</Typography>
          </Stack>
        </Box>

        {paymentsLoading ? (
          <Box sx={{ p: 3, textAlign: "center" }}>
            <CircularProgress size={24} />
          </Box>
        ) : (
          <TableContainer sx={{ maxHeight: 360 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Ngày thu</TableCell>
                  <TableCell>Mã hội viên</TableCell>
                  <TableCell>Họ tên</TableCell>
                  <TableCell>Loại HP</TableCell>
                  <TableCell align="right">Số tiền</TableCell>
                  <TableCell>Ghi chú</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {[...payments]
                  .sort((a, b) =>
                    (b.ngayThu || "").localeCompare(a.ngayThu || "")
                  )
                  .map((payment) => (
                    <TableRow key={payment.id}>
                      <TableCell>{payment.ngayThu || "—"}</TableCell>
                      <TableCell>{payment.maHV || "—"}</TableCell>
                      <TableCell>{payment.hoTen || "—"}</TableCell>
                      <TableCell>{payment.loaiHocPhi || "—"}</TableCell>
                      <TableCell align="right">
                        <Typography fontWeight={700}>
                          {money(payment.soTien)}
                        </Typography>
                      </TableCell>
                      <TableCell>{payment.ghiChu || "—"}</TableCell>
                    </TableRow>
                  ))}
                {!payments.length && (
                  <TableRow>
                    <TableCell colSpan={6} align="center">
                      Chưa có giao dịch thu học phí.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={Boolean(selectedMember)} onClose={closePayment} fullWidth maxWidth="sm">
        <Box component="form" onSubmit={submitPayment}>
          <DialogTitle>Ghi nhận thu học phí</DialogTitle>
          <DialogContent>
            {selectedMember && (
              <Box sx={{ mb: 2, mt: 1 }}>
                <Typography fontWeight={800}>
                  {selectedMember.name}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {selectedMember.maHV} · {selectedMember.location}
                </Typography>
              </Box>
            )}

            {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}

            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                select
                label="Loại học phí"
                value={period}
                onChange={(event) => setPeriod(event.target.value)}
                fullWidth
              >
                <MenuItem value="Tháng">Tháng</MenuItem>
                <MenuItem value="Quý">Quý</MenuItem>
              </TextField>

              <TextField
                label="Số tiền thu (VNĐ)"
                type="number"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputProps={{ min: 1, step: 1000 }}
                required
                fullWidth
              />

              <TextField
                label="Ngày thu"
                type="date"
                value={paymentDate}
                onChange={(event) => setPaymentDate(event.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                required
                fullWidth
              />

              <TextField
                label="Ghi chú"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Ví dụ: Học phí tháng 10"
                multiline
                minRows={2}
                fullWidth
              />
            </Stack>
          </DialogContent>

          <DialogActions sx={{ p: 2.5, pt: 0 }}>
            <Button onClick={closePayment} disabled={saving}>
              Hủy
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={saving}
              startIcon={<PaymentsRounded />}
            >
              {saving ? "Đang lưu..." : "Lưu khoản thu"}
            </Button>
          </DialogActions>
        </Box>
      </Dialog>
    </Stack>
  );
}
