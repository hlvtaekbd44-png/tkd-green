import { auth } from "./firebase";

export const normalizeUsername = (value) => String(value || "").trim().toLowerCase();
export const validUsername = (value) => /^[a-z0-9][a-z0-9._-]{2,39}$/.test(normalizeUsername(value));

export async function accountRequest(action, payload = {}) {
  const currentUser = auth.currentUser;
  if (!currentUser) throw new Error("Vui lòng đăng nhập lại bằng tài khoản Admin.");
  const token = await currentUser.getIdToken();
  let response;
  try {
    response = await fetch("/.netlify/functions/manage-accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ action, ...payload }),
    });
  } catch {
    throw new Error("Không kết nối được Netlify Function. Chạy qua netlify dev hoặc trang Netlify đã deploy, không dùng riêng npm run dev.");
  }
  let data;
  try { data = await response.json(); } catch { throw new Error("Dịch vụ tạo tài khoản chưa chạy hoặc trả kết quả không hợp lệ."); }
  if (!response.ok || !data.ok) throw new Error(data.error || "Không thao tác được tài khoản.");
  return data;
}
