
export const MEMBER_LOCATIONS = [
  { name: "Lê Văn Tám", prefix: "LVTA" },
  { name: "Nghĩa Trung", prefix: "NTRU" },
  { name: "Đồng Tâm", prefix: "DTAM" },
  { name: "Thôn 6", prefix: "T6" },
  { name: "Phước Sơn", prefix: "PSON" },
  { name: "Minh Hưng", prefix: "MHUN" },
];

export const LOCATION_NAMES = MEMBER_LOCATIONS.map(
  (item) => item.name
);

export function getMemberPrefix(location) {
  return MEMBER_LOCATIONS.find(
    (item) => item.name === location
  )?.prefix || null;
}

export function formatMemberId(prefix, number) {
  return `${prefix}-${String(number).padStart(4, "0")}`;
}
