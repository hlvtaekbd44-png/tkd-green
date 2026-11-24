import { auth } from './firebase';

// Uses a backend-issued signed upload. No Cloudinary secret is ever shipped to the browser.
const MAX_IMAGE_BYTES=5*1024*1024;
const ALLOWED_TYPES=new Set(['image/jpeg','image/png','image/webp']);

async function fetchWithTimeout(url,options,ms,label) {
  const controller=new AbortController();
  const timeout=setTimeout(()=>controller.abort(),ms);
  try {
    return await fetch(url,{...options,signal:controller.signal});
  } catch(error) {
    if(error.name==='AbortError') throw new Error(`${label} quá thời gian. Kiểm tra mạng và thử lại sau khi xác nhận chưa có bài trùng.`);
    throw new Error(`${label} thất bại: ${error.message}`);
  } finally {clearTimeout(timeout)}
}

async function readJson(response,description) {
  const raw=await response.text();
  let data;
  try {data=JSON.parse(raw)} catch {
    throw new Error(`${description}: máy chủ không trả về JSON (${response.status}). Hãy kiểm tra Netlify Functions và biến môi trường.`);
  }
  if (!response.ok) {
    const detail = typeof data?.error === 'string'
      ? data.error
      : (typeof data?.error?.message === 'string' ? data.error.message : null);
    const message = detail || (typeof data?.message === 'string' ? data.message : null) || `HTTP ${response.status}`;
    throw new Error(`${description} (HTTP ${response.status}): ${message}`);
  }
  return data;
}

export async function uploadHonorImage(file) {
  if(!file || !ALLOWED_TYPES.has(file.type)) throw new Error('Ảnh phải là JPG, PNG hoặc WebP.');
  if(file.size<=0 || file.size>MAX_IMAGE_BYTES) throw new Error('Ảnh tối đa 5 MB.');
  const user=auth.currentUser;
  if(!user) throw new Error('Phiên đăng nhập hết hạn. Hãy đăng nhập Admin lại.');
  const token=await user.getIdToken();
  const signedResponse=await fetchWithTimeout('/.netlify/functions/honor-upload-sign',{
    method:'POST',
    headers:{'Content-Type':'application/json',Authorization:`Bearer ${token}`},
    body:JSON.stringify({contentType:file.type,size:file.size})
  },25000,'Xác thực quyền tải ảnh');
  const signed=await readJson(signedResponse,'Không lấy được chữ ký tải ảnh');
  if(!signed.signature||!signed.timestamp||!signed.cloudName||!signed.apiKey) throw new Error('Cấu hình tải ảnh trên Netlify chưa đầy đủ.');
  const data=new FormData();
  data.append('file',file);
  for(const key of ['api_key','timestamp','signature','folder','public_id']) {
    const src={api_key:signed.apiKey,timestamp:signed.timestamp,signature:signed.signature,folder:signed.folder,public_id:signed.publicId};
    data.append(key,String(src[key]));
  }
  const response=await fetchWithTimeout(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/image/upload`,{method:'POST',body:data},60000,'Tải ảnh Cloudinary');
  const uploaded=await readJson(response,'Cloudinary từ chối tải ảnh');
  if(!uploaded.secure_url?.startsWith(`https://res.cloudinary.com/${signed.cloudName}/`)) throw new Error('Cloudinary trả về URL ảnh không hợp lệ.');
  if(!uploaded.public_id?.startsWith(`${signed.folder}/`)) throw new Error('Ảnh không nằm trong thư mục vinh danh.');
  return {secure_url:uploaded.secure_url,public_id:uploaded.public_id};
}
