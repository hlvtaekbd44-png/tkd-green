import { Box, Stack, Typography } from "@mui/material";
import { getBeltAppearance } from "./BeltBadge";

// Dùng DUY NHẤT bảng quy đổi màu đai của hệ thống hiện tại.
// Không suy diễn màu từ cấp số; khi không xác định, hiện chữ và thông báo.
export default function BeltIndicator({ value, mauDai }) {
  const label = String(value || "Chưa cập nhật").trim();
  const appearance = getBeltAppearance(label);
  const name = appearance?.name || String(mauDai || "").trim();

  // Các phiên bản BeltBadge có thể lưu CSS bằng thuộc tính khác nhau.
  // Chỉ sử dụng giá trị màu của bảng gốc, không tạo bảng mới.
  const candidate = appearance?.background ?? appearance?.backgroundColor ??
    appearance?.backgroundImage ?? appearance?.color ?? appearance?.bgColor ?? null;
  const palette = {
    "trắng": "#ffffff", "vàng": "#f2c637", "xanh lá": "#249a55",
    "xanh dương": "#2376bd", "xanh": "#2376bd", "đỏ": "#d64242", "đen": "#222222",
  };
  const normalized = name.toLocaleLowerCase("vi").trim();
  const namedColors = Object.entries(palette)
    .filter(([key]) => new RegExp(`(^|[^\\p{L}])${key}(?=$|[^\\p{L}])`, "u").test(normalized))
    .filter(([key]) => key !== "xanh" || (!normalized.includes("xanh lá") && !normalized.includes("xanh dương")))
    .sort((a,b) => normalized.indexOf(a[0]) - normalized.indexOf(b[0]));
  const namedBackground = namedColors.length >= 2
    ? `linear-gradient(90deg, ${namedColors[0][1]} 50%, ${namedColors[1][1]} 50%)`
    : namedColors[0]?.[1] || null;
  const actualBackground = typeof candidate === "string" && (
    /^#(?:[0-9a-f]{3,8})$/i.test(candidate) ||
    /^rgba?\(/i.test(candidate) ||
    /^linear-gradient\(/i.test(candidate)
  ) ? candidate : namedBackground;
  const background = actualBackground;

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      {background && (
        <Box role="img" aria-label={`Màu đai ${name}`}
          sx={{ width: 38, height: 14, flexShrink: 0, border: "1px solid #9da9a2",
            borderRadius: "2px",
            ...(background.startsWith("linear-gradient") ? { backgroundImage: background } : { backgroundColor: background }) }} />
      )}
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700} sx={{ overflowWrap:"anywhere", lineHeight:1.3 }}>{label}</Typography>
        {name && <Typography variant="caption" color="text.secondary">{name}</Typography>}
      </Box>
    </Stack>
  );
}
