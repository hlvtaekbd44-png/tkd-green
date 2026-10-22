
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Collapse,
  Divider,
  IconButton,
  InputAdornment,
  LinearProgress,
  MenuItem,
  Paper,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";

import {
  CalendarMonthRounded,
  CheckCircleRounded,
  CircleOutlined,
  CloseRounded,
  EditNoteRounded,
  EventBusyRounded,
  FactCheckRounded,
  FilterListRounded,
  RefreshRounded,
  RestartAltRounded,
  SaveRounded,
  SearchRounded,
  WarningAmberRounded,
} from "@mui/icons-material";

import { auth } from "./firebase";

import {
  ATTENDANCE_LOCATIONS,
  ATTENDANCE_STATUSES,
  loadAttendance,
  saveAttendance,
} from "./attendanceService";

// ==========================================
// 1. HÀM TIỆN ÍCH
// ==========================================

const COLORS = {
  green: "#176b45",
  greenDark: "#104b31",
  greenLight: "#e7f5ec",
  orange: "#e58a16",
  orangeLight: "#fff4df",
  red: "#dc4545",
  redLight: "#fff0f0",
  gray: "#77857c",
  border: "#e4ebe6",
};

function todayLocal() {
  const now = new Date();

  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function formatDate(value) {
  if (!value) return "";

  const [year, month, day] = value.split("-");

  return `${day}/${month}/${year}`;
}

function emptyRecord() {
  return {
    trangThai: "Chưa điểm danh",
    ghiChu: "",
  };
}

function normalizeRecord(record) {
  return {
    trangThai:
      record?.trangThai || "Chưa điểm danh",
    ghiChu: record?.ghiChu || "",
  };
}

function sameRecord(a, b) {
  return (
    a.trangThai === b.trangThai &&
    a.ghiChu === b.ghiChu
  );
}

function statusColor(status) {
  switch (status) {
    case "Có mặt":
      return COLORS.green;

    case "Vắng có phép":
      return COLORS.orange;

    case "Vắng không phép":
      return COLORS.red;

    default:
      return COLORS.gray;
  }
}

function getInitial(name) {
  const parts = (name || "").trim().split(/\s+/);

  return (parts[parts.length - 1] || "?")
    .charAt(0)
    .toUpperCase();
}

// ==========================================
// 2. THẺ THỐNG KÊ
// ==========================================

function SummaryCard({
  title,
  value,
  icon,
  color,
  background,
}) {
  return (
    <Paper
      elevation={0}
      sx={{
        p: { xs: 1.5, sm: 2 },
        borderRadius: 3,
        border: `1px solid ${COLORS.border}`,
        background: background || "background.paper",
        minWidth: 0,
      }}
    >
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        spacing={1}
      >
        <Typography
          variant="caption"
          sx={{
            color: "text.secondary",
            fontWeight: 700,
          }}
        >
          {title}
        </Typography>

        <Box sx={{ color }}>{icon}</Box>
      </Stack>

      <Typography
        sx={{
          mt: 1,
          fontSize: { xs: 25, sm: 32 },
          fontWeight: 900,
          color,
          lineHeight: 1.1,
        }}
      >
        {value}
      </Typography>
    </Paper>
  );
}

// ==========================================
// 3. THẺ ĐIỂM DANH VÕ SINH
// ==========================================

function StudentAttendanceCard({
  student,
  record,
  changed,
  disabled,
  noteOpen,
  onTogglePresent,
  onStatusChange,
  onNoteChange,
  onToggleNote,
}) {
  const status = record.trangThai;
  const isPresent = status === "Có mặt";
  const color = statusColor(status);

  return (
    <Paper
      elevation={0}
      sx={{
        borderRadius: 3,
        overflow: "hidden",
        border: "1px solid",
        borderColor: changed
          ? "warning.main"
          : isPresent
          ? "#b7dfc4"
          : COLORS.border,
        bgcolor: isPresent
          ? "rgba(23,107,69,0.035)"
          : "background.paper",
        transition: "border-color .15s, background .15s",
      }}
    >
      {/* Chạm vào phần thông tin để tích Có mặt */}
      <Box
        component="button"
        type="button"
        disabled={disabled}
        aria-label={`Đổi trạng thái có mặt của ${student.name}`}
        aria-pressed={isPresent}
        onClick={onTogglePresent}
        sx={{
          appearance: "none",
          border: 0,
          bgcolor: "transparent",
          color: "text.primary",
          width: "100%",
          minHeight: 76,
          px: { xs: 1.5, sm: 2 },
          py: 1.5,
          display: "flex",
          alignItems: "center",
          gap: 1.5,
          textAlign: "left",
          cursor: disabled ? "default" : "pointer",
          "&:focus-visible": {
            outline: `2px solid ${COLORS.green}`,
            outlineOffset: -2,
          },
        }}
      >
        <Avatar
          sx={{
            width: 43,
            height: 43,
            bgcolor: isPresent
              ? COLORS.green
              : COLORS.greenLight,
            color: isPresent
              ? "#fff"
              : COLORS.green,
            fontWeight: 800,
            flexShrink: 0,
          }}
        >
          {getInitial(student.name)}
        </Avatar>

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography
            sx={{
              fontWeight: 800,
              fontSize: { xs: 14, sm: 15 },
              overflowWrap: "anywhere",
            }}
          >
            {student.name}
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ display: "block", mt: 0.3 }}
          >
            {student.maHoiVienNoiBo || "Chưa có mã"}
            {" · VTF: "}
            {student.maHV || "Chưa cấp"}
          </Typography>

          {changed && (
            <Typography
              variant="caption"
              sx={{
                color: "warning.main",
                fontWeight: 800,
              }}
            >
              ● Chưa lưu
            </Typography>
          )}
        </Box>

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            flexShrink: 0,
            gap: 0.5,
          }}
        >
          {isPresent ? (
            <CheckCircleRounded
              sx={{ color, fontSize: 32 }}
            />
          ) : (
            <CircleOutlined
              sx={{
                color: "#a5b2a9",
                fontSize: 32,
              }}
            />
          )}
        </Box>
      </Box>

      <Divider />

      {/* Chọn trạng thái vắng bằng một chạm */}
      <Box
        sx={{
          px: { xs: 1.5, sm: 2 },
          py: 1.2,
        }}
      >
        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
        >
          <Button
            size="small"
            variant={
              status === "Vắng có phép"
                ? "contained"
                : "outlined"
            }
            color="warning"
            disabled={disabled}
            startIcon={<EventBusyRounded />}
            onClick={() =>
              onStatusChange(
                status === "Vắng có phép"
                  ? "Chưa điểm danh"
                  : "Vắng có phép"
              )
            }
            sx={{
              flex: 1,
              minHeight: 42,
              px: 0.8,
              fontSize: { xs: 11, sm: 12 },
              borderRadius: 2,
              whiteSpace: "nowrap",
            }}
          >
            Vắng phép
          </Button>

          <Button
            size="small"
            variant={
              status === "Vắng không phép"
                ? "contained"
                : "outlined"
            }
            color="error"
            disabled={disabled}
            startIcon={<WarningAmberRounded />}
            onClick={() =>
              onStatusChange(
                status === "Vắng không phép"
                  ? "Chưa điểm danh"
                  : "Vắng không phép"
              )
            }
            sx={{
              flex: 1,
              minHeight: 42,
              px: 0.8,
              fontSize: { xs: 11, sm: 12 },
              borderRadius: 2,
              whiteSpace: "nowrap",
            }}
          >
            Vắng KP
          </Button>

          <Tooltip title="Ghi chú">
            <span>
              <IconButton
                disabled={disabled}
                onClick={onToggleNote}
                aria-label={`Ghi chú cho ${student.name}`}
                sx={{
                  width: 42,
                  height: 42,
                  border: `1px solid ${COLORS.border}`,
                  color: record.ghiChu
                    ? COLORS.green
                    : "text.secondary",
                }}
              >
                <EditNoteRounded />
              </IconButton>
            </span>
          </Tooltip>
        </Stack>

        <Collapse in={noteOpen}>
          <TextField
            fullWidth
            multiline
            minRows={2}
            size="small"
            label="Ghi chú điểm danh"
            placeholder="Lý do nghỉ, đến muộn..."
            value={record.ghiChu}
            disabled={disabled}
            onChange={(event) =>
              onNoteChange(event.target.value)
            }
            slotProps={{
              htmlInput: { maxLength: 500 },
            }}
            sx={{ mt: 1.5 }}
          />
        </Collapse>

        {!noteOpen && record.ghiChu && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{
              display: "block",
              mt: 1,
              overflowWrap: "anywhere",
            }}
          >
            Ghi chú: {record.ghiChu}
          </Typography>
        )}
      </Box>
    </Paper>
  );
}

// ==========================================
// 4. GIAO DIỆN ĐIỂM DANH CHÍNH
// ==========================================

export default function AttendanceManagement({
  students = [],
  profile,
  loading = false,
}) {
  const isAdmin = profile?.role === "admin";

  const permitted = useMemo(() => {
    if (isAdmin) return ATTENDANCE_LOCATIONS;

    return ATTENDANCE_LOCATIONS.filter(
      (item) =>
        Array.isArray(profile?.diemTap) &&
        profile.diemTap.includes(item)
    );
  }, [isAdmin, profile?.diemTap]);

  const [location, setLocation] = useState("");
  const [date, setDate] = useState(todayLocal);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("Tất cả");

  const [records, setRecords] = useState({});
  const [changes, setChanges] = useState({});
  const [notesOpen, setNotesOpen] = useState({});

  const [sessionExists, setSessionExists] =
    useState(false);

  const [reading, setReading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const requestRef = useRef(0);

  // ========================================
  // 5. CHỌN ĐIỂM TẬP THEO PHÂN QUYỀN
  // ========================================

  useEffect(() => {
    if (!permitted.includes(location)) {
      setLocation(permitted[0] || "");
    }
  }, [permitted, location]);

  // ========================================
  // 6. DANH SÁCH VÕ SINH ĐANG HỌC
  // ========================================

  const locationStudents = useMemo(() => {
    return students
      .filter(
        (student) =>
          student.location === location &&
          student.status === "Đang học"
      )
      .sort((a, b) =>
        (a.name || "").localeCompare(
          b.name || "",
          "vi"
        )
      );
  }, [students, location]);

  // ========================================
  // 7. ĐỌC DỮ LIỆU FIRESTORE
  // ========================================

  useEffect(() => {
    const requestId = ++requestRef.current;

    setRecords({});
    setChanges({});
    setNotesOpen({});
    setSessionExists(false);
    setError("");
    setMessage("");

    if (!location || !date) {
      setReading(false);
      return;
    }

    setReading(true);

    loadAttendance(location, date)
      .then((result) => {
        if (requestRef.current !== requestId) return;

        setRecords(result.records);
        setSessionExists(Boolean(result.session));
      })
      .catch((err) => {
        if (requestRef.current !== requestId) return;

        setError(
          `Không đọc được điểm danh: ${err.message}`
        );
      })
      .finally(() => {
        if (requestRef.current === requestId) {
          setReading(false);
        }
      });

    return () => {
      requestRef.current++;
    };
  }, [location, date, reloadKey]);

  // ========================================
  // 8. TRẠNG THÁI HIỆN TẠI
  // ========================================

  function currentRecord(memberId) {
    return {
      ...emptyRecord(),
      ...normalizeRecord(records[memberId]),
      ...(changes[memberId] || {}),
    };
  }

  function updateRecord(memberId, patch) {
    if (reading || saving || loading || error) return;

    setChanges((previous) => {
      const original = normalizeRecord(
        records[memberId]
      );

      const current = {
        ...original,
        ...(previous[memberId] || {}),
      };

      const next = {
        ...current,
        ...patch,
      };

      const updated = { ...previous };

      if (sameRecord(next, original)) {
        delete updated[memberId];
      } else {
        updated[memberId] = {
          trangThai: next.trangThai,
          ghiChu: next.ghiChu,
        };
      }

      return updated;
    });

    setMessage("");
  }

  function togglePresent(memberId) {
    const current = currentRecord(memberId);

    updateRecord(memberId, {
      trangThai:
        current.trangThai === "Có mặt"
          ? "Chưa điểm danh"
          : "Có mặt",
    });
  }

  // ========================================
  // 9. CÓ MẶT TẤT CẢ
  // ========================================

  function markAllPresent() {
    if (reading || saving || loading || error) return;

    const confirmed = window.confirm(
      `Đánh dấu Có mặt cho ${locationStudents.length} ` +
      `võ sinh tại ${location}?`
    );

    if (!confirmed) return;

    setChanges((previous) => {
      const next = { ...previous };

      locationStudents.forEach((student) => {
        const original = normalizeRecord(
          records[student.id]
        );

        const note =
          previous[student.id]?.ghiChu ??
          original.ghiChu;

        const updated = {
          trangThai: "Có mặt",
          ghiChu: note,
        };

        if (sameRecord(updated, original)) {
          delete next[student.id];
        } else {
          next[student.id] = updated;
        }
      });

      return next;
    });

    setMessage("");
  }

  // ========================================
  // 10. BỎ THAY ĐỔI VÀ TẢI LẠI
  // ========================================

  const dirtyCount = Object.keys(changes).length;

  function discardChanges() {
    if (
      dirtyCount > 0 &&
      !window.confirm("Bỏ tất cả thay đổi chưa lưu?")
    ) {
      return;
    }

    setChanges({});
    setMessage("");
  }

  function refreshData() {
    if (saving || reading) return;

    if (
      dirtyCount > 0 &&
      !window.confirm(
        "Tải lại sẽ bỏ các thay đổi chưa lưu. Tiếp tục?"
      )
    ) {
      return;
    }

    setReloadKey((value) => value + 1);
  }

  function changeLocation(value) {
    if (saving || reading) return;

    if (
      dirtyCount > 0 &&
      !window.confirm(
        "Đổi điểm tập sẽ bỏ thay đổi chưa lưu. Tiếp tục?"
      )
    ) {
      return;
    }

    setLocation(value);
  }

  function changeDate(value) {
    if (saving || reading) return;

    if (
      dirtyCount > 0 &&
      !window.confirm(
        "Đổi ngày sẽ bỏ thay đổi chưa lưu. Tiếp tục?"
      )
    ) {
      return;
    }

    setDate(value);
  }

  // ========================================
  // 11. THỐNG KÊ ĐIỂM DANH
  // ========================================

  const counts = useMemo(() => {
    const result = Object.fromEntries(
      ATTENDANCE_STATUSES.map(
        (status) => [status, 0]
      )
    );

    locationStudents.forEach((student) => {
      const status =
        changes[student.id]?.trangThai ??
        records[student.id]?.trangThai ??
        "Chưa điểm danh";

      if (status in result) {
        result[status] += 1;
      }
    });

    return result;
  }, [locationStudents, changes, records]);

  const total = locationStudents.length;
  const present = counts["Có mặt"] || 0;
  const absentWithLeave = counts["Vắng có phép"] || 0;
  const absentWithoutLeave =
    counts["Vắng không phép"] || 0;

  const notMarked = counts["Chưa điểm danh"] || 0;
  const marked = total - notMarked;

  const progress =
    total > 0 ? (marked / total) * 100 : 0;

  // ========================================
  // 12. TÌM KIẾM VÀ LỌC
  // ========================================

  const visibleStudents = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("vi");

    return locationStudents.filter((student) => {
      const status =
        changes[student.id]?.trangThai ??
        records[student.id]?.trangThai ??
        "Chưa điểm danh";

      const matchesSearch = [
        student.name || "",
        student.maHoiVienNoiBo || "",
        student.maHV || "",
      ]
        .join(" ")
        .toLocaleLowerCase("vi")
        .includes(term);

      const matchesStatus =
        filter === "Tất cả" || filter === status;

      return matchesSearch && matchesStatus;
    });
  }, [
    locationStudents,
    search,
    filter,
    changes,
    records,
  ]);

  // ========================================
  // 13. LƯU FIRESTORE
  // ========================================

  const disabled =
    reading ||
    saving ||
    loading ||
    Boolean(error) ||
    !location;

  async function handleSave() {
    if (disabled || dirtyCount === 0) return;

    const confirmed = window.confirm(
      `Lưu ${dirtyCount} thay đổi điểm danh ` +
      `tại ${location}, ngày ${formatDate(date)}?`
    );

    if (!confirmed) return;

    setSaving(true);
    setError("");
    setMessage("");

    const savedChanges = { ...changes };

    try {
      const result = await saveAttendance({
        location,
        date,
        students: locationStudents,
        changes: savedChanges,
        user: auth.currentUser,
      });

      const latest = await loadAttendance(
        location,
        date
      );

      setRecords(latest.records);
      setChanges({});
      setSessionExists(Boolean(latest.session));

      setMessage(
        `Đã lưu thành công ${result.count} thay đổi.`
      );
    } catch (err) {
      setError(
        `Không lưu được điểm danh: ${err.message}. ` +
        "Hãy kiểm tra trước khi thử lại."
      );
    } finally {
      setSaving(false);
    }
  }

  // ========================================
  // 14. GIAO DIỆN
  // ========================================

  return (
    <Box
      sx={{
        display: "grid",
        gap: 2.5,
        pb: { xs: 12, md: 4 },
        maxWidth: 1500,
        mx: "auto",
        minWidth: 0,
      }}
    >
      {/* TIÊU ĐỀ */}
      <Stack
        direction="row"
        alignItems="center"
        spacing={1.5}
      >
        <Box
          sx={{
            width: 48,
            height: 48,
            borderRadius: 3,
            bgcolor: COLORS.greenLight,
            color: COLORS.green,
            display: "grid",
            placeItems: "center",
          }}
        >
          <FactCheckRounded fontSize="large" />
        </Box>

        <Box>
          <Typography
            variant="h5"
            sx={{
              fontWeight: 900,
              fontSize: { xs: 20, sm: 25 },
            }}
          >
            Điểm danh võ sinh
          </Typography>

          <Typography
            variant="caption"
            color="text.secondary"
          >
            TKD GREEN · QUẢN LÝ BUỔI TẬP
          </Typography>
        </Box>
      </Stack>

      {/* BỘ LỌC */}
      <Paper
        elevation={0}
        sx={{
          p: { xs: 1.5, sm: 2.5 },
          borderRadius: 3,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "1fr 1fr",
              md: "220px 190px minmax(200px, 1fr) 190px",
            },
            gap: 1.5,
          }}
        >
          <TextField
            select
            fullWidth
            size="small"
            label="Điểm tập"
            value={location}
            disabled={saving || reading}
            onChange={(event) =>
              changeLocation(event.target.value)
            }
          >
            {permitted.map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>

          <TextField
            fullWidth
            size="small"
            type="date"
            label="Ngày tập"
            value={date}
            disabled={saving || reading}
            onChange={(event) =>
              changeDate(event.target.value)
            }
            slotProps={{
              inputLabel: { shrink: true },
            }}
          />

          <TextField
            fullWidth
            size="small"
            label="Tìm võ sinh"
            placeholder="Tên, mã nội bộ, VTF..."
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            sx={{
              gridColumn: { xs: "1 / -1", md: "auto" },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <SearchRounded />
                  </InputAdornment>
                ),
              },
            }}
          />

          <TextField
            select
            fullWidth
            size="small"
            label="Lọc trạng thái"
            value={filter}
            onChange={(event) =>
              setFilter(event.target.value)
            }
            sx={{
              gridColumn: { xs: "1 / -1", md: "auto" },
            }}
            slotProps={{
              input: {
                startAdornment: (
                  <InputAdornment position="start">
                    <FilterListRounded fontSize="small" />
                  </InputAdornment>
                ),
              },
            }}
          >
            {[
              "Tất cả",
              ...ATTENDANCE_STATUSES,
            ].map((item) => (
              <MenuItem key={item} value={item}>
                {item}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Stack
          direction="row"
          spacing={1}
          alignItems="center"
          flexWrap="wrap"
          useFlexGap
          sx={{ mt: 2 }}
        >
          <CalendarMonthRounded
            sx={{
              fontSize: 18,
              color: COLORS.green,
            }}
          />

          <Typography
            variant="body2"
            fontWeight={700}
          >
            {location || "Chưa chọn điểm tập"}
            {" · "}
            {formatDate(date)}
          </Typography>

          <Chip
            size="small"
            color={
              sessionExists ? "success" : "default"
            }
            label={
              sessionExists
                ? "Đã có dữ liệu"
                : "Buổi chưa được lưu"
            }
          />
        </Stack>
      </Paper>

      {/* THỐNG KÊ */}
      <Box
        sx={{
          display: "grid",
          gridTemplateColumns: {
            xs: "repeat(2, minmax(0, 1fr))",
            md: "repeat(4, minmax(0, 1fr))",
          },
          gap: 1.5,
        }}
      >
        <SummaryCard
          title="Có mặt"
          value={present}
          color={COLORS.green}
          background={COLORS.greenLight}
          icon={<CheckCircleRounded />}
        />

        <SummaryCard
          title="Vắng có phép"
          value={absentWithLeave}
          color={COLORS.orange}
          background={COLORS.orangeLight}
          icon={<EventBusyRounded />}
        />

        <SummaryCard
          title="Vắng không phép"
          value={absentWithoutLeave}
          color={COLORS.red}
          background={COLORS.redLight}
          icon={<WarningAmberRounded />}
        />

        <SummaryCard
          title="Chưa điểm danh"
          value={notMarked}
          color={COLORS.gray}
          icon={<CircleOutlined />}
        />
      </Box>

      {/* TIẾN ĐỘ */}
      <Paper
        elevation={0}
        sx={{
          p: 2,
          borderRadius: 3,
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <Stack
          direction="row"
          justifyContent="space-between"
          alignItems="center"
          sx={{ mb: 1 }}
        >
          <Typography fontWeight={800} variant="body2">
            Tiến độ điểm danh
          </Typography>

          <Typography
            variant="body2"
            color="text.secondary"
          >
            {marked}/{total} võ sinh
          </Typography>
        </Stack>

        <LinearProgress
          variant="determinate"
          value={progress}
          sx={{
            height: 9,
            borderRadius: 9,
            bgcolor: "#e9eeeb",
            "& .MuiLinearProgress-bar": {
              bgcolor: COLORS.green,
              borderRadius: 9,
            },
          }}
        />
      </Paper>

      {/* THANH THAO TÁC */}
      <Stack
        direction="row"
        spacing={1}
        flexWrap="wrap"
        useFlexGap
      >
        <Button
          variant="contained"
          color="success"
          startIcon={<CheckCircleRounded />}
          onClick={markAllPresent}
          disabled={disabled || total === 0}
          sx={{
            minHeight: 44,
            borderRadius: 2.5,
            fontWeight: 800,
          }}
        >
          Có mặt tất cả
        </Button>

        <Button
          variant="outlined"
          startIcon={<RestartAltRounded />}
          onClick={discardChanges}
          disabled={disabled || dirtyCount === 0}
          sx={{ minHeight: 44, borderRadius: 2.5 }}
        >
          Bỏ thay đổi
        </Button>

        <Button
          variant="outlined"
          startIcon={<RefreshRounded />}
          onClick={refreshData}
          disabled={reading || saving}
          sx={{ minHeight: 44, borderRadius: 2.5 }}
        >
          Tải lại
        </Button>
      </Stack>

      {/* THÔNG BÁO */}
      {reading && <LinearProgress />}

      {error && (
        <Alert
          severity="error"
          onClose={() => setError("")}
        >
          {error}
        </Alert>
      )}

      {message && (
        <Alert
          severity="success"
          onClose={() => setMessage("")}
        >
          {message}
        </Alert>
      )}

      {!permitted.length && (
        <Alert severity="warning">
          Tài khoản chưa được phân quyền điểm tập.
        </Alert>
      )}

      {/* DANH SÁCH */}
      <Box>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1.5 }}
        >
          <Box>
            <Typography
              variant="h6"
              fontWeight={900}
            >
              Danh sách võ sinh
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
            >
              Chạm vào thẻ võ sinh để đánh dấu Có mặt
            </Typography>
          </Box>

          <Chip
            label={`${visibleStudents.length}/${total}`}
            sx={{ fontWeight: 800 }}
          />
        </Stack>

        {!loading && !reading && (
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: {
                xs: "minmax(0, 1fr)",
                lg: "repeat(2, minmax(0, 1fr))",
              },
              gap: 1.5,
            }}
          >
            {visibleStudents.map((student) => {
              const record = currentRecord(student.id);

              return (
                <StudentAttendanceCard
                  key={student.id}
                  student={student}
                  record={record}
                  changed={Boolean(changes[student.id])}
                  disabled={disabled}
                  noteOpen={
                    Boolean(notesOpen[student.id]) ||
                    Boolean(record.ghiChu)
                  }
                  onTogglePresent={() =>
                    togglePresent(student.id)
                  }
                  onStatusChange={(status) =>
                    updateRecord(student.id, {
                      trangThai: status,
                    })
                  }
                  onNoteChange={(note) =>
                    updateRecord(student.id, {
                      ghiChu: note,
                    })
                  }
                  onToggleNote={() =>
                    setNotesOpen((old) => ({
                      ...old,
                      [student.id]: !old[student.id],
                    }))
                  }
                />
              );
            })}
          </Box>
        )}

        {!loading &&
          !reading &&
          visibleStudents.length === 0 && (
            <Paper
              elevation={0}
              sx={{
                p: 4,
                textAlign: "center",
                borderRadius: 3,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              <Typography color="text.secondary">
                Không tìm thấy võ sinh phù hợp.
              </Typography>
            </Paper>
          )}

        {loading && (
          <Stack alignItems="center" sx={{ p: 4 }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>
              Đang tải danh sách võ sinh...
            </Typography>
          </Stack>
        )}
      </Box>

      {/* THANH LƯU - CỐ ĐỊNH TRÊN ĐIỆN THOẠI */}
      <Paper
        elevation={4}
        sx={{
          position: { xs: "fixed", md: "sticky" },
          bottom: { xs: 0, md: 12 },
          left: { xs: 0, md: "auto" },
          right: { xs: 0, md: "auto" },
          zIndex: 1200,
          p: { xs: 1.5, md: 2 },
          pb: {
            xs: "calc(12px + env(safe-area-inset-bottom))",
            md: 2,
          },
          borderRadius: { xs: 0, md: 3 },
          border: `1px solid ${COLORS.border}`,
        }}
      >
        <Stack
          direction="row"
          spacing={1.5}
          alignItems="center"
          justifyContent="space-between"
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography
              fontWeight={800}
              fontSize={{ xs: 12, sm: 14 }}
            >
              {dirtyCount > 0
                ? `${dirtyCount} thay đổi chưa lưu`
                : "Đã đồng bộ"}
            </Typography>

            <Typography
              variant="caption"
              color="text.secondary"
              sx={{
                display: { xs: "none", sm: "block" },
              }}
            >
              {location} · {formatDate(date)}
            </Typography>
          </Box>

          <Button
            variant="contained"
            startIcon={
              saving ? (
                <CircularProgress
                  size={17}
                  color="inherit"
                />
              ) : (
                <SaveRounded />
              )
            }
            onClick={handleSave}
            disabled={disabled || dirtyCount === 0}
            sx={{
              bgcolor: COLORS.green,
              "&:hover": {
                bgcolor: COLORS.greenDark,
              },
              borderRadius: 2.5,
              minHeight: 48,
              minWidth: { xs: 165, sm: 210 },
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {saving
              ? "Đang lưu..."
              : `Lưu điểm danh (${dirtyCount})`}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
