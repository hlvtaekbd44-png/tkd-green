
import { useMemo, useState } from "react";
import {
  Box,
  Button,
  Chip,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import AddRounded from "@mui/icons-material/AddRounded";
import EditRounded from "@mui/icons-material/EditRounded";
import VisibilityRounded from "@mui/icons-material/VisibilityRounded";
import MemberProfile from "./MemberProfile";
import  UploadFileRounded from "@mui/icons-material/UploadFileRounded";
import ImportMembers from "./ImportMembers";

export default function MemberList({
  students = [],
  loading = false,
  error = "",
  location,
  onLocationChange,
  locations = [],
  onAdd,
  onEdit,
  profile,
}) {
  const [search, setSearch] = useState("");
  const [viewMember, setViewMember] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const filteredStudents = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi");

    return students.filter((student) => {
      const matchesLocation =
        location === "Tất cả điểm tập" ||
        student.location === location;

      const content = [
        student.maHoiVienNoiBo,
        student.maHV,
        student.name,
        student.location,
      ]
        .join(" ")
        .toLocaleLowerCase("vi");

      return matchesLocation && content.includes(keyword);
    });
  }, [students, search, location]);

  return (
    <Box sx={{ display: "grid", gap: 2, mt: 2 }}>
      <Stack
        direction={{ xs: "column", sm: "row" }}
        justifyContent="space-between"
        alignItems={{ sm: "center" }}
        spacing={2}
      >
        <Box>
          <Typography variant="h5" fontWeight={800}>
            Danh sách hội viên
          </Typography>
          <Typography color="text.secondary">
            {loading
              ? "Đang tải dữ liệu..."
              : error
                ? error
                : `Tìm thấy ${filteredStudents.length} hội viên`}
          </Typography>
        </Box>

        <Stack direction="row" spacing={1} flexWrap="wrap">
  {profile?.role === "admin" && (
    <Button
      variant="outlined"
      startIcon={<UploadFileRounded />}
      onClick={() => setImportOpen(true)}
    >
      Import Excel
    </Button>
  )}

  <Button
    variant="contained"
    startIcon={<AddRounded />}
    onClick={onAdd}
  >
    Thêm hội viên
  </Button>
</Stack>
      </Stack>

      <Paper elevation={0} sx={{ p: 2, borderRadius: 3 }}>
        <Stack
          direction={{ xs: "column", sm: "row" }}
          spacing={2}
        >
          <TextField
            fullWidth
            size="small"
            label="Tìm mã nội bộ, mã VTF hoặc họ tên"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <TextField
            select
            size="small"
            label="Điểm tập"
            value={location}
            onChange={(event) =>
              onLocationChange(event.target.value)
            }
            sx={{ minWidth: { sm: 200 } }}
            slotProps={{ select: { native: true } }}
          >
            {locations.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </TextField>
        </Stack>
      </Paper>

      <Paper
        elevation={0}
        sx={{ borderRadius: 3, overflowX: "auto" }}
      >
        <Box sx={{ minWidth: 760 }}>
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "1.1fr 1.7fr 1.2fr 1fr 1fr auto",
              gap: 2,
              p: 2,
              bgcolor: "action.hover",
              fontWeight: 700,
            }}
          >
            <Typography variant="body2" fontWeight={700}>
              Mã nội bộ / VTF
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              Họ và tên
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              Điểm tập
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              Cấp đai
            </Typography>
            <Typography variant="body2" fontWeight={700}>
              Trạng thái
            </Typography>
            <Typography variant="body2" fontWeight={700}>
  Thao tác
</Typography>
          </Box>

          {loading ? (
            <Typography sx={{ p: 3 }}>
              Đang tải hội viên từ Firebase...
            </Typography>
          ) : error ? (
            <Typography color="error" sx={{ p: 3 }}>
              {error}
            </Typography>
          ) : filteredStudents.length === 0 ? (
            <Typography sx={{ p: 3 }} color="text.secondary">
              Chưa có hội viên phù hợp.
            </Typography>
          ) : (
            filteredStudents.map((student) => (
              <Box
                key={student.id}
                sx={{
                  display: "grid",
                  gridTemplateColumns:
                    "1.1fr 1.7fr 1.2fr 1fr 1fr auto",
                  gap: 2,
                  p: 2,
                  borderTop: "1px solid",
                  borderColor: "divider",
                  alignItems: "center",
                }}
              >
                <Stack spacing={0.5}>
  <Typography
    variant="body2"
    fontWeight={700}
    color="primary.main"
  >
    {student.maHoiVienNoiBo || "Chưa cấp ID"}
  </Typography>

  <Typography
    variant="caption"
    color="text.secondary"
  >
    VTF: {student.maHV || "Chưa cấp"}
  </Typography>
</Stack>
                <Typography fontWeight={600}>
                  {student.name}
                </Typography>
                <Typography variant="body2">
                  {student.location}
                </Typography>
                <Typography variant="body2">
  {student.belt}
</Typography>

<Box>
  <Chip
    label={student.status || "Chưa cập nhật"}
    size="small"
    color={
      student.status === "Đang học"
        ? "success"
        : "default"
    }
    variant="outlined"
  />
</Box>

<Box>
  <Stack direction="row" spacing={1}>
    <Button
      size="small"
      variant="outlined"
      startIcon={<VisibilityRounded />}
      onClick={() => setViewMember(student)}
    >
      Xem
    </Button>

    <Button
      size="small"
      variant="outlined"
      startIcon={<EditRounded />}
      onClick={() => onEdit?.(student)}
    >
      Sửa hồ sơ
    </Button>
  </Stack>
</Box>
              </Box>
            ))
          )}
        </Box>
            </Paper>

      <MemberProfile
        open={Boolean(viewMember)}
        onClose={() => setViewMember(null)}
        member={viewMember}
        profile={profile}
      />

      <ImportMembers
  open={importOpen && profile?.role === "admin"}
  onClose={() => setImportOpen(false)}
  students={students}
      />
    </Box>
  );
}
