import { isDanExamLevel } from "./examRankPolicy";
import React, { useMemo, useState } from "react";
import {
  Alert, Box, Button, Chip, Paper, Stack, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, Typography,
} from "@mui/material";
import * as XLSX from "xlsx";
import { collection, doc, getDocs, query, runTransaction, serverTimestamp, where } from "firebase/firestore";
import { db } from "./firebase";
import { evaluateExamResult, normalizeExamLevel, previousExamLevel } from "./examRankPolicy";

const clean = (value) => String(value ?? "").normalize("NFC").trim().replace(/\s+/g, " ");
const fold = (value) => clean(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/gi, "d").toLowerCase();
const key = (value) => clean(value).toUpperCase();

function dateKey(value) {
  const text = clean(value);
  const match = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) return `${match[3]}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

const requiredHeaders = ["VTF ID", "Họ và Tên", "Ngày sinh", "Đẳng dự thi", "Kết quả"];
const alias = {
  "SBD": ["sbd", "số báo danh", "so bao danh"],
  "VTF ID": ["vtf id", "vtfid", "mã vtf", "ma vtf"],
  "Họ và Tên": ["họ và tên", "ho va ten", "họ tên", "ho ten"],
  "Giới tính": ["giới tính", "gioi tinh"],
  "Ngày sinh": ["ngày sinh", "ngay sinh", "ntns"],
  "Đẳng dự thi": ["đẳng dự thi", "dang du thi", "cấp dự thi", "cap du thi"],
  "Kết quả": ["kết quả", "ket qua"],
};
function canonicalHeader(v) {
  const k = fold(v).replace(/^\uFEFF/, "");
  return Object.entries(alias).find(([, values]) => values.includes(k))?.[0] || clean(v);
}
function excelDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,"0")}-${String(value.getDate()).padStart(2,"0")}`;
  }
  if (typeof value === "number" && value > 10000 && value < 100000) {
    const d = XLSX.SSF.parse_date_code(value);
    if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  return value;
}

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

  async function readExcel(event) {
    const file = event.target.files?.[0];
    event.target.value = "";
    setRecords([]); setReport([]); setFileName(""); setError(""); setNotice("");
    if (!file || !isAdmin) return;
    if (!/\.(xlsx|xls|csv)$/i.test(file.name)) {
      setError("Chỉ hỗ trợ Excel (.xlsx, .xls) hoặc CSV (.csv)."); return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setError("File vượt quá 10 MB."); return;
    }
    setBusy(true);
    try {
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      if (!sheet) throw new Error("Không tìm thấy Sheet dữ liệu.");
      const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", raw: true, blankrows: false });
      const headerIndex = matrix.findIndex(row => Array.isArray(row) && row.map(canonicalHeader).includes("VTF ID"));
      if (headerIndex < 0) throw new Error("Không tìm thấy dòng tiêu đề chứa VTF ID.");
      const headers = matrix[headerIndex].map(canonicalHeader);
      const missing = requiredHeaders.filter(h => !headers.includes(h));
      if (missing.length) throw new Error(`File thiếu cột: ${missing.join(", ")}`);
      const rows = matrix.slice(headerIndex + 1).map((values, index) => {
        const row = Object.fromEntries(headers.map((h, i) => [h, h === "Ngày sinh" ? excelDate(values[i]) : values[i]]));
        row.sheetRow = headerIndex + index + 2;
        return row;
      }).filter(r => requiredHeaders.some(h => clean(r[h])));
      if (!rows.length) throw new Error("File không có dữ liệu kết quả thi.");
      // File không cần MaDotThi: kỳ thi đang chọn trên giao diện là nguồn đối chiếu.
      setRecords(rows); setFileName(file.name);
    } catch (err) { setError(`Không đọc được Excel: ${err.message}`); }
    finally { setBusy(false); }
  }

  async function check() {
    if (!records.length || busy || !isAdmin) return;
    setBusy(true);
    setError("");
    setReport([]);
    setNotice("");
    try {
      // TKD_VTF_SYNC_V1: Excel tra mã VTF hiện tại ở hồ sơ trước khi tìm đăng ký theo ID cố định.
      const membersByVtf = new Map();
      for (const vtf of new Set(records.map(row => key(row["VTF ID"])).filter(Boolean))) {
        const snapshot = await getDocs(query(collection(db, "members"), where("maHV", "==", vtf)));
        membersByVtf.set(vtf, snapshot.docs);
      }
      const seen = new Set();
      const all = records.map((row) => {
        const vtf = key(row["VTF ID"]);
        const errors = [];
        if (!vtf) errors.push("Thiếu VTF ID");
        if (vtf && seen.has(vtf)) errors.push("Trùng VTF ID trong file");
        if (vtf) seen.add(vtf);
        const evalResult = evaluateExamResult(row["Đẳng dự thi"], row["Kết quả"]);
        if (evalResult.valid && isDanExamLevel(evalResult.capDai) !== ((period?.examType || "cap") === "dan")) errors.push("Bậc dự thi không thuộc loại đợt thi này");
        if (!evalResult.valid) errors.push(evalResult.error || "Kết quả không hợp lệ");
        const matchingMembers = membersByVtf.get(vtf) || [];
        const regs = registrations.filter((reg) => matchingMembers.some(m => m.id === reg.memberDocId));
        const sbd = key(row["SBD"]);
        if (regs.length !== 1) errors.push(regs.length ? "Trùng đăng ký thi" : "Chưa đăng ký thi");
        const reg = regs.length === 1 ? regs[0] : null;
        if (reg && sbd && key(reg.sbd) && key(reg.sbd) !== sbd) errors.push("SBD không khớp đăng ký");
        if (reg && reg.status === "Không dự thi") errors.push("Thí sinh đã hủy đăng ký");
        if (reg && (reg.resultApplied === true || reg.examResultApplied === true)) errors.push("Kết quả đã được áp dụng trước đó");
        if (reg && normalizeExamLevel(reg.dangDuThi) !== normalizeExamLevel(row["Đẳng dự thi"])) {
          errors.push("Cấp dự thi không khớp đăng ký");
        }
        return { row, vtf, errors, reg, evalResult, currentBelt: "", currentColor: "", rawBelt: "", rawColor: "", memberId: null };
      });

      const cache = new Map();
      for (const item of all) {
        if (!item.vtf || !item.reg) continue;
        if (!cache.has(item.vtf)) {
          cache.set(item.vtf, membersByVtf.get(item.vtf) || []);
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
        if (item.evalResult.valid && normalizeExamLevel(data.capDaiDang) !== previousExamLevel(item.evalResult.capDai)) {
          item.errors.push(`Cấp/đẳng hiện tại ${data.capDaiDang || 'trống'} không liền trước ${item.evalResult.capDai}`);
        }
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
      `Thăng cấp/đẳng cho ${eligible.length} võ sinh thi ĐẠT và đã KHỚP trong ${periodCode}?\n` +
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
              isDanExamLevel(reg.dangDuThi) !== ((period?.examType || "cap") === "dan") ||
              (key(item.row["SBD"]) && key(reg.sbd) && key(item.row["SBD"]) !== key(reg.sbd)) ||
              key(member.maHV) !== item.vtf ||
              normalizeExamLevel(reg.dangDuThi) !== item.evalResult.capDai ||
              fold(member.hoTen) !== fold(item.row["Họ và Tên"]) ||
              dateKey(member.ngaySinh) !== dateKey(item.row["Ngày sinh"])) {
            throw new Error("Dữ liệu Firestore đã thay đổi, cần đối chiếu lại");
          }
          if (reg.resultApplied === true || reg.examResultApplied === true) return "skipped";
          if (normalizeExamLevel(member.capDaiDang) !== previousExamLevel(item.evalResult.capDai)) {
            throw new Error("Cấp/đẳng hiện tại không liền trước bậc dự thi, không thể thăng");
          }
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

  async function saveFailedResults() {
    if (busy || !isAdmin || !period?.id) return;
    const failed = report.filter(item => item.ok && !item.evalResult.shouldUpdateBelt && ["Không đạt", "Khong dat"].includes(item.evalResult.result));
    if (!failed.length || !window.confirm(`Ghi ${failed.length} kết quả KHÔNG ĐẠT vào kỳ ${periodCode}? Cấp đai hội viên sẽ giữ nguyên.`)) return;
    setBusy(true); setError(""); setNotice("");
    let saved = 0, skipped = 0;
    const problems = [];
    for (const item of failed) {
      try {
        const outcome = await runTransaction(db, async tx => {
          const regRef = doc(db, "examRegistrations", item.reg.id);
          const memberRef = doc(db, "members", item.memberId);
          const regSnap = await tx.get(regRef);
          const memberSnap = await tx.get(memberRef);
          if (!regSnap.exists() || !memberSnap.exists()) throw new Error("Hồ sơ hoặc đăng ký không còn tồn tại");
          const reg = regSnap.data();
          const member = memberSnap.data();
          if (reg.periodId !== period.id || reg.memberDocId !== item.memberId ||
              isDanExamLevel(reg.dangDuThi) !== ((period?.examType || "cap") === "dan") ||
              key(member.maHV) !== item.vtf ||
              (key(item.row["SBD"]) && key(reg.sbd) && key(item.row["SBD"]) !== key(reg.sbd)) ||
              normalizeExamLevel(reg.dangDuThi) !== normalizeExamLevel(item.row["Đẳng dự thi"]) ||
              fold(member.hoTen) !== fold(item.row["Họ và Tên"]) ||
              dateKey(member.ngaySinh) !== dateKey(item.row["Ngày sinh"])) {
            throw new Error("Dữ liệu đã thay đổi, cần đối chiếu lại");
          }
          if (reg.resultApplied === true || reg.examResultApplied === true) return "skipped";
          if (normalizeExamLevel(member.capDaiDang) !== previousExamLevel(item.evalResult.capDai)) {
            throw new Error("Cấp/đẳng hiện tại không khớp cấp dự thi; hãy kiểm tra lại");
          }
          tx.update(regRef, {
            ketQua: "Không đạt", resultApplied: true, resultAppliedAt: serverTimestamp(),
            resultSource: fileName, capDaiTruoc: member.capDaiDang ?? "",
            capDaiSau: member.capDaiDang ?? "",
          });
          return "saved";
        });
        if (outcome === "saved") saved += 1; else skipped += 1;
      } catch (err) { problems.push(`${item.vtf}: ${err.message}`); }
    }
    setBusy(false); setReport([]);
    setNotice(`Đã lưu ${saved} kết quả Không đạt; bỏ qua ${skipped}; lỗi ${problems.length}.`);
    if (problems.length) setError(problems.slice(0,5).join(" | "));
  }

  if (!isAdmin) return null;

  return (
    <Paper variant="outlined" sx={{ p: 2, mt: 3, borderRadius: 3 }}>
      <Typography variant="h6" fontWeight={700}>Nhập kết quả thi — xem trước</Typography>
      <Alert severity="info" sx={{ my: 2 }}>
        Đối chiếu trước khi cập nhật. Đạt: lên đúng một cấp/đẳng; Không đạt: giữ nguyên. Chỉ Admin được xác nhận và phải khớp bậc liền trước. Kỳ thi lấy theo mục đang chọn trên web.
      </Alert>
      <Stack direction={{ xs: "column", sm: "row" }} spacing={2} alignItems="center">
        <Button variant="outlined" component="label" disabled={!periodCode || busy}>
          Chọn Excel / CSV
          <input hidden type="file" accept=".xlsx,.xls,.csv" onChange={readExcel} />
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
            <Button variant="outlined" color="warning" disabled={busy || !report.some(item => item.ok && !item.evalResult.shouldUpdateBelt && ["Không đạt", "Khong dat"].includes(item.evalResult.result))} onClick={saveFailedResults}>
              Lưu Không đạt ({report.filter(item => item.ok && !item.evalResult.shouldUpdateBelt && ["Không đạt", "Khong dat"].includes(item.evalResult.result)).length})
            </Button>
            <Button
              variant="contained"
              color="success"
              disabled={busy || !period?.id || !report.some((item) => item.ok && item.evalResult.shouldUpdateBelt)}
              onClick={applyMatchedResults}
            >
              Xác nhận thăng cấp/đẳng ({report.filter((item) => item.ok && item.evalResult.shouldUpdateBelt).length})
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
                  <TableCell>Cấp/đẳng hiện tại</TableCell>
                  <TableCell>Màu đai hiện tại</TableCell>
                  <TableCell>Cấp/đẳng sau thi</TableCell>
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
