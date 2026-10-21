import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import Papa from "papaparse";
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import { evaluateExamResult, normalizeExamLevel } from "./beltLevels";

const clean = (value) => String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
const fold = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const key = (value) => clean(value).toUpperCase();

function dateKey(value) {
  const text = clean(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

const requiredHeaders = ["MaDotThi", "VTF ID", "Họ và Tên", "Ngày sinh", "Đẳng dự thi", "Kết quả"];

export default function ExamResultsPreview({ period, registrations = [], isAdmin = false }) {
  const [records, setRecords] = useState([]);
  const [fileName, setFileName] = useState("");
  const [report, setReport] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const periodCode = key(period?.name);
  const summary = useMemo(() => ({
    ok: report.filter((item) => item.ok).length,
    blocked: report.filter((item) => !item.ok).length,
  }), [report]);

  async function readCsv(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setRecords([]);
    setReport([]);
    setFileName("");
    setError("");
    setNotice("");
    if (!file || !isAdmin) return;
    if (!file.name.toLowerCase().endsWith(".csv")) {
      setError("Vui lòng chọn file CSV xuất từ Google Sheets.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setError("File CSV vượt quá 5 MB.");
      return;
    }
    setBusy(true);
    try {
      const parsed = await new Promise((resolve, reject) => {
        Papa.parse(file, {
          header: true,
          skipEmptyLines: "greedy",
          complete: resolve,
          error: reject,
        });
      });
      if (parsed.errors?.length) throw new Error(parsed.errors[0].message);
      const rows = parsed.data.map((row, index) => ({
        ...Object.fromEntries(Object.entries(row).map(([header, value]) => [header.replace(/^\uFEFF/, "").trim(), value])),
        sheetRow: index + 2,
      }));
      const headers = Object.keys(rows[0] || {});
      const missing = requiredHeaders.filter((header) => !headers.includes(header));
      if (missing.length) {
        setError(`File CSV thiếu cột: ${missing.join(", ")}`);
        return;
      }
      const filtered = rows.filter((row) => key(row.MaDotThi) === periodCode);
      setRecords(filtered);
      setFileName(file.name);
      if (!filtered.length) setError(`Không tìm thấy kết quả của ${periodCode} trong file.`);
    } catch (err) {
      console.error("Không đọc được CSV:", err);
      setError("Không thể đọc file CSV. Hãy xuất lại từ Google Sheets.");
    } finally {
      setBusy(false);
    }
  }

  async function check() {
    if (!records.length || busy || !isAdmin) return;
    setBusy(true);
    setError("");
    setReport([]);
    setNotice("");
    try {
      const seen = new Set();
      const all = records.map((row) => {
        const vtf = key(row["VTF ID"]);
        const errors = [];
        if (!vtf) errors.push("Thiếu VTF ID");
        if (vtf && seen.has(vtf)) errors.push("Trùng VTF ID trong file");
        if (vtf) seen.add(vtf);
        const evalResult = evaluateExamResult(row["Đẳng dự thi"], row["Kết quả"]);
        if (!evalResult.valid) errors.push(evalResult.error || "Kết quả không hợp lệ");
        const regs = registrations.filter((reg) => key(reg.maHV) === vtf);
        if (regs.length !== 1) errors.push(regs.length ? "Trùng đăng ký thi" : "Chưa đăng ký thi");
        const reg = regs.length === 1 ? regs[0] : null;
        if (reg && normalizeExamLevel(reg.dangDuThi) !== normalizeExamLevel(row["Đẳng dự thi"])) {
          errors.push("Cấp dự thi không khớp đăng ký");
        }
        return { row, vtf, errors, reg, evalResult, currentBelt: "", currentColor: "", rawBelt: "", rawColor: "", memberId: null };
      });

      const cache = new Map();
      for (const item of all) {
        if (!item.vtf || !item.reg) continue;
        if (!cache.has(item.vtf)) {
          const snapshot = await getDocs(query(collection(db, "members"), where("maHV", "==", item.vtf)));
          cache.set(item.vtf, snapshot.docs);
        }
        const matches = cache.get(item.vtf);
        if (matches.length !== 1) {
          item.errors.push(matches.length ? "Trùng mã hội viên" : "Không tìm thấy hồ sơ");
          continue;
        }
        const member = matches[0];
        const data = member.data();
        item.memberId = member.id;
        if (member.id !== item.reg.memberDocId) item.errors.push("Hồ sơ không khớp đăng ký");
        if (fold(data.hoTen) !== fold(item.row["Họ và Tên"])) item.errors.push("Họ tên không khớp");
        const dob = dateKey(item.row["Ngày sinh"]);
        if (!dob || dob !== dateKey(data.ngaySinh)) item.errors.push("Ngày sinh không khớp");
        item.rawBelt = data.capDaiDang ?? "";
        item.rawColor = data.mauDai ?? "";
        item.currentBelt = data.capDaiDang || "Chưa cập nhật";
        item.currentColor = data.mauDai || "";
      }
      setReport(all.map((item) => ({ ...item, ok: item.errors.length === 0 })));
    } catch (err) {
      console.error("Lỗi đối chiếu Firestore:", err);
      setError("Không thể đối chiếu Firestore. Kiểm tra kết nối và quyền đọc dữ liệu.");
    } finally {
      setBusy(false);
    }
  }


  async function applyMatchedResults() {
    if (busy || !isAdmin || !period?.id || !report.length) return;
    const eligible = report.filter((item) => item.ok && item.evalResult.shouldUpdateBelt);
    if (!eligible.length) return;
    const accepted = window.confirm(
      `Cập nhật cấp đai cho ${eligible.length} võ sinh thi ĐẠT và đã KHỚP trong ${periodCode}?\n` +
      `Các dòng chưa khớp sẽ được bỏ qua. Thao tác sẽ ghi dữ liệu lên Firestore.`
    );
    if (!accepted) return;

    setBusy(true);
    setError("");
    setNotice("");
    let updated = 0;
    let skipped = 0;
    const failures = [];

    for (const item of eligible) {
      try {
        if (!item.memberId || !item.reg?.id || !item.reg?.memberDocId) {
          throw new Error("Thiếu ID hồ sơ hoặc đăng ký");
        }
        const memberRef = doc(db, "members", item.memberId);
        const regRef = doc(db, "examRegistrations", item.reg.id);
        const outcome = await runTransaction(db, async (tx) => {
          const memberSnap = await tx.get(memberRef);
          const regSnap = await tx.get(regRef);
          if (!memberSnap.exists() || !regSnap.exists()) throw new Error("Hồ sơ/đăng ký đã bị xóa");
          const member = memberSnap.data();
          const reg = regSnap.data();
          if (reg.periodId !== period.id || reg.memberDocId !== item.memberId ||
              key(reg.maHV) !== item.vtf || key(member.maHV) !== item.vtf ||
              normalizeExamLevel(reg.dangDuThi) !== item.evalResult.capDai ||
              fold(member.hoTen) !== fold(item.row["Họ và Tên"]) ||
              dateKey(member.ngaySinh) !== dateKey(item.row["Ngày sinh"])) {
            throw new Error("Dữ liệu Firestore đã thay đổi, cần đối chiếu lại");
          }
          if (reg.resultApplied === true || reg.examResultApplied === true) return "skipped";
          if (clean(member.capDaiDang) !== clean(item.rawBelt) ||
              clean(member.mauDai) !== clean(item.rawColor)) {
            throw new Error("Cấp/màu đai đã thay đổi, cần đối chiếu lại");
          }
          const capDai = item.evalResult.capDai;
          const mauDai = item.evalResult.mauDai;
          if (!capDai || !mauDai || item.evalResult.result !== "Đạt") {
            throw new Error("Cấp dự thi hoặc kết quả không hợp lệ");
          }
          tx.update(memberRef, { capDaiDang: capDai, mauDai });
          tx.update(regRef, {
            ketQua: "Đạt",
            capDaiTruoc: member.capDaiDang ?? "",
            mauDaiTruoc: member.mauDai ?? "",
            capDaiSau: capDai,
            mauDaiSau: mauDai,
            resultApplied: true,
            resultAppliedAt: serverTimestamp(),
            resultSource: fileName,
          });
          return "updated";
        });
        if (outcome === "updated") updated += 1;
        else skipped += 1;
      } catch (err) {
        console.error("Không cập nhật được", item.vtf, err);
        failures.push(`${item.vtf}: ${err.message || "Lỗi không xác định"}`);
      }
    }
    setBusy(false);
    setReport([]); // Buộc đối chiếu lại từ Firestore sau khi ghi.
    setNotice(`Đã cập nhật ${updated}; bỏ qua đã xử lý ${skipped}; lỗi ${failures.length}. Hãy đối chiếu lại trước khi thao tác tiếp.`);
    if (failures.length) setError(failures.slice(0, 5).join(" | "));
  }

  if (!isAdmin) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={700}>Nhập kết quả thi — xem trước</Typography>
      <Alert severity="info" sx={{ my: 2 }}>
        Đối chiếu trước khi cập nhật. Chỉ Admin được xác nhận; chỉ cập nhật dòng Đạt và Khớp.
      </Alert>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
        <Button variant="outlined" component="label" disabled={!periodCode || busy}>
          Chọn file CSV
          <input hidden type="file" accept=".csv,text/csv" onChange={readCsv} />
        </Button>
        <Typography variant="body2">
          {fileName || "Chưa chọn file"} — {records.length} dòng thuộc {periodCode || "đợt thi chưa chọn"}
        </Typography>
        <Button variant="contained" disabled={!records.length || busy} onClick={check}>
          {busy ? "Đang xử lý..." : "Đối chiếu Firestore"}
        </Button>
      </Stack>
      {error && <Alert severity="error" sx={{ mt: 2 }}>{error}</Alert>}
      {notice && <Alert severity="success" sx={{ mt: 2 }}>{notice}</Alert>}
      {report.length > 0 && (
        <Box sx={{ mt: 2 }}>
          <Stack direction="row" spacing={1} sx={{ mb: 2 }}>
            <Chip color="success" label={`Khớp: ${summary.ok}`} />
            <Chip color="error" label={`Cần kiểm tra: ${summary.blocked}`} />
            <Button
              variant="contained"
              color="success"
              disabled={busy || !period?.id || !report.some((item) => item.ok && item.evalResult.shouldUpdateBelt)}
              onClick={applyMatchedResults}
            >
              Xác nhận cập nhật cấp đai ({report.filter((item) => item.ok && item.evalResult.shouldUpdateBelt).length})
            </Button>
          </Stack>
          <TableContainer sx={{ maxHeight: 440 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Dòng</TableCell>
                  <TableCell>VTF ID</TableCell>
                  <TableCell>Họ tên</TableCell>
                  <TableCell>Kết quả</TableCell>
                  <TableCell>Cấp hiện tại</TableCell>
                  <TableCell>Màu đai hiện tại</TableCell>
                  <TableCell>Cấp sau thi</TableCell>
                  <TableCell>Màu đai sau thi</TableCell>
                  <TableCell>Đối chiếu</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {report.map((item) => (
                  <TableRow key={item.row.sheetRow}>
                    <TableCell>{item.row.sheetRow}</TableCell>
                    <TableCell>{item.vtf}</TableCell>
                    <TableCell>{item.row["Họ và Tên"]}</TableCell>
                    <TableCell>{item.evalResult.result || item.row["Kết quả"]}</TableCell>
                    <TableCell>{item.currentBelt || "—"}</TableCell>
                    <TableCell>{item.currentColor || "—"}</TableCell>
                    <TableCell>{item.evalResult.shouldUpdateBelt ? item.evalResult.capDai : "Giữ nguyên"}</TableCell>
                    <TableCell>{item.evalResult.shouldUpdateBelt ? item.evalResult.mauDai : "Giữ nguyên"}</TableCell>
                    <TableCell>
                      {item.ok ? (
                        <Chip size="small" color="success" label="Khớp" />
                      ) : (
                        <Typography variant="caption" color="error">
                          {item.errors.join("; ")}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}
    </Paper>
  );
}
