import React from "react";
import { Box, Stack, Typography } from "@mui/material";

// Bảng quy đổi chính thức do CLB GREEN cung cấp.
// Không làm thay đổi trường cấp/đẳng trong Firestore.
export const BELT_LEVELS = Object.freeze({
  "Cấp 10": { name: "Đai trắng", base: "#FFFFFF", stripe: null, count: 0 },
  "Cấp 9": { name: "Đai trắng 1 vạch xanh dương", base: "#FFFFFF", stripe: "#1685E8", count: 1 },
  "Cấp 8": { name: "Đai trắng 2 vạch xanh dương", base: "#FFFFFF", stripe: "#1685E8", count: 2 },
  "Cấp 7": { name: "Đai vàng", base: "#FFD43B", stripe: null, count: 0 },
  "Cấp 6": { name: "Đai xanh lá", base: "#23A55A", stripe: null, count: 0 },
  "Cấp 5": { name: "Đai xanh dương", base: "#1877DB", stripe: null, count: 0 },
  "Cấp 4": { name: "Đai đỏ", base: "#DC3545", stripe: null, count: 0 },
  "Cấp 3": { name: "Đai đỏ 1 vạch vàng", base: "#DC3545", stripe: "#FFD43B", count: 1 },
  "Cấp 2": { name: "Đai đỏ 2 vạch vàng", base: "#DC3545", stripe: "#FFD43B", count: 2 },
  "Cấp 1": { name: "Đai đỏ 3 vạch vàng", base: "#DC3545", stripe: "#FFD43B", count: 3 },
  "1 Đẳng": { name: "Đai đen 1 vạch trắng", base: "#171C22", stripe: "#FFFFFF", count: 1 },
  "2 Đẳng": { name: "Đai đen 2 vạch trắng", base: "#171C22", stripe: "#FFFFFF", count: 2 },
  "3 Đẳng": { name: "Đai đen 3 vạch vàng", base: "#171C22", stripe: "#FFD43B", count: 3 },
  "4 Đẳng": { name: "Đai đen 4 vạch vàng", base: "#171C22", stripe: "#FFD43B", count: 4 },
  "5 Đẳng": { name: "Đai đen 5 vạch đỏ", base: "#171C22", stripe: "#DC3545", count: 5 },
  "6 Đẳng": { name: "Đai đen 6 vạch đỏ", base: "#171C22", stripe: "#DC3545", count: 6 },
  "7 Đẳng": { name: "Đai đen 7 vạch trắng", base: "#171C22", stripe: "#FFFFFF", count: 7 },
});

export function normalizeBeltLevel(value) {
  const raw = String(value ?? "").trim().replace(/\s+/g, " ");
  let match = raw.match(/^cấp\s*(10|[1-9])$/i);
  if (match) return `Cấp ${Number(match[1])}`;
  match = raw.match(/^(?:([1-7])\s*đẳng|đẳng\s*([1-7]))$/i);
  if (match) return `${Number(match[1] || match[2])} Đẳng`;
  return raw;
}

export function getBeltAppearance(value) {
  return BELT_LEVELS[normalizeBeltLevel(value)] ?? null;
}

export default function BeltBadge({ level, showName = false, compact = false }) {
  const normalized = normalizeBeltLevel(level);
  const belt = getBeltAppearance(level);
  if (!belt) return <Typography variant="body2" color="text.secondary">{normalized || "Chưa cập nhật"}</Typography>;

  return (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ minWidth: 0 }}>
      <Box
        title={belt.name}
        aria-label={`${normalized}: ${belt.name}`}
        role="img"
        sx={{
          width: compact ? 42 : 56,
          height: compact ? 16 : 20,
          borderRadius: "4px",
          bgcolor: belt.base,
          border: "1px solid rgba(80,90,92,.4)",
          boxShadow: "inset 0 1px 2px rgba(0,0,0,.12)",
          display: "flex",
          alignItems: "stretch",
          justifyContent: "flex-end",
          gap: "2px",
          pr: "5px",
          pl: "4px",
          flexShrink: 0,
          overflow: "hidden",
        }}
      >
        {Array.from({ length: belt.count }, (_, index) => (
          <Box key={index} sx={{ width: "3px", bgcolor: belt.stripe, flexShrink: 0 }} />
        ))}
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="body2" fontWeight={700} sx={{ lineHeight: 1.25, whiteSpace: "nowrap" }}>
          {normalized}
        </Typography>
        {showName && <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.25 }}>{belt.name}</Typography>}
      </Box>
    </Stack>
  );
}
