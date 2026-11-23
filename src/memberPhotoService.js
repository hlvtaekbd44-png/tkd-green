// TKD GREEN - Private member photographs in Firebase Storage.
// Firestore stores only photoPath. No public download token URLs are generated.
import { deleteField, doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { deleteObject, getBlob, getStorage, ref, uploadBytes } from 'firebase/storage';
import { db } from './firebase';

const storage = getStorage();
const PREFIX = 'memberPhotos';
const LIMIT = 4 * 1024 * 1024;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

export const memberPhotoPath = member => member?.photoPath || '';
export const legacyPhotoUrl = member => member?.hinhAnh || member?.hinhAnhUrl || '';

export function canViewMemberPhoto(profile, member) {
  if (!member?.id || profile?.active === false) return false;
  if (profile?.role === 'admin') return true;
  return profile?.role === 'hlv' && profile?.permissions?.members?.view === true
    && Array.isArray(profile?.locationPermissions?.members)
    && profile.locationPermissions.members.includes(member.diemTap || member.location);
}

export function canManageMemberPhoto(profile, member) {
  if (!member?.id || profile?.active === false) return false;
  if (profile?.role === 'admin') return true;
  if (profile?.role !== 'hlv') return false;
  return profile?.permissions?.members?.edit === true &&
    Array.isArray(profile?.locationPermissions?.members) &&
    profile.locationPermissions.members.includes(member.diemTap || member.location);
}

export async function loadMemberPhoto(member, signal) {
  const path = memberPhotoPath(member);
  if (!path) return null;
  if (!member?.id || !path.startsWith(`${PREFIX}/${member.id}/`)) throw new Error('Đường dẫn ảnh không hợp lệ.');
  const blob = await getBlob(ref(storage, path), 10 * 1024 * 1024);
  if (signal?.aborted) return null;
  return URL.createObjectURL(blob);
}

export async function downloadMemberPhoto(member) {
  const path = memberPhotoPath(member);
  if (!path || !member?.id || !path.startsWith(`${PREFIX}/${member.id}/`)) throw new Error('Chưa có ảnh lưu trong Firebase Storage.');
  const blob = await getBlob(ref(storage, path), 10 * 1024 * 1024);
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    const mime = blob.type || 'image/jpeg';
    a.download = `TKD_GREEN_${String(member.maHV || member.maHoiVienNoiBo || member.id).replace(/[^a-zA-Z0-9_-]/g, '_')}.${EXT[mime] || 'jpg'}`;
    document.body.appendChild(a); a.click(); a.remove();
  } finally { setTimeout(() => URL.revokeObjectURL(url), 2000); }
}

export async function replaceMemberPhoto(member, file) {
  if (!member?.id) throw new Error('Không xác định hội viên.');
  if (!file || !Object.hasOwn(EXT, file.type)) throw new Error('Chỉ nhận ảnh JPG, PNG hoặc WebP.');
  if (!file.size || file.size > LIMIT) throw new Error('Ảnh tối đa 4 MB.');
  const path = `${PREFIX}/${member.id}/${crypto.randomUUID()}.${EXT[file.type]}`;
  const newRef = ref(storage, path);
  await uploadBytes(newRef, file, { contentType: file.type, customMetadata: { memberId: member.id } });
  let previous = '';
  try {
    await runTransaction(db, async transaction => {
      const target = doc(db, 'members', member.id);
      const snap = await transaction.get(target);
      if (!snap.exists()) throw new Error('Hội viên không còn tồn tại.');
      previous = snap.data().photoPath || '';
      transaction.update(target, {
        photoPath: path, photoUpdatedAt: serverTimestamp(),
        hinhAnh: deleteField(), hinhAnhUrl: deleteField(),
      });
    });
  } catch (err) {
    try { await deleteObject(newRef); } catch (cleanupErr) { console.error('Không thể dọn file mới khi lỗi:', cleanupErr); }
    throw err;
  }
  // Only delete the old managed Storage object after Firestore commit succeeds.
  // A failed cleanup does not roll back the successfully saved new photo.
  if (previous && previous !== path && previous.startsWith(`${PREFIX}/${member.id}/`)) {
    try { await deleteObject(ref(storage, previous)); }
    catch (err) { console.warn('Ảnh mới đã lưu, nhưng ảnh cũ chưa được dọn:', err); return { oldPhotoCleanupFailed: true }; }
  }
  return { oldPhotoCleanupFailed: false };
}
