// Netlify Function, server only. Never import this file into React/Vite.
const crypto=require('node:crypto');
const { initializeApp,cert,getApps }=require('firebase-admin/app');
const { getAuth }=require('firebase-admin/auth');
const { getFirestore }=require('firebase-admin/firestore');

const response=(status,body)=>({statusCode:status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'},body:JSON.stringify(body)});
function adminApp(){
  if(getApps().length) return getApps()[0];
  const raw=process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if(!raw) throw new Error('Thiếu FIREBASE_SERVICE_ACCOUNT_JSON trong Netlify Environment Variables.');
  const serviceAccount=JSON.parse(raw);
  if(serviceAccount.project_id!=='tkd-green') throw new Error('Service account không thuộc dự án tkd-green.');
  return initializeApp({credential:cert(serviceAccount),projectId:'tkd-green'});
}
exports.handler=async (event)=>{
  if(event.httpMethod!=='POST') return response(405,{error:'Chỉ chấp nhận POST.'});
  try {
    const key=process.env.CLOUDINARY_API_KEY;
    const secret=process.env.CLOUDINARY_API_SECRET;
    const cloudName=process.env.CLOUDINARY_CLOUD_NAME;
    if(!key||!secret||!cloudName) return response(503,{error:'Thiếu Cloudinary Environment Variables trên Netlify.'});
    if(!/^[a-zA-Z0-9_-]+$/.test(cloudName)) return response(503,{error:'Cloudinary cloud name không hợp lệ.'});
    const authorization=event.headers.authorization||event.headers.Authorization||'';
    const match=authorization.match(/^Bearer (\S+)$/);
    if(!match) return response(401,{error:'Bạn phải đăng nhập tài khoản Admin.'});
    const incoming=JSON.parse(event.body||'{}');
    if(!['image/jpeg','image/png','image/webp'].includes(incoming.contentType)||!Number.isInteger(incoming.size)||incoming.size<1||incoming.size>5*1024*1024) {
      return response(400,{error:'Chỉ hỗ trợ ảnh JPG/PNG/WebP tối đa 5 MB.'});
    }
    const app=adminApp();
    const decoded=await getAuth(app).verifyIdToken(match[1],true);
    const user=await getFirestore(app).doc(`users/${decoded.uid}`).get();
    if(!user.exists||user.data().active!==true||user.data().role!=='admin') return response(403,{error:'Chỉ Admin đang hoạt động có quyền tải ảnh.'});
    const timestamp=Math.floor(Date.now()/1000);
    const folder='tkd-green/honor';
    const publicId=crypto.randomUUID();
    const params={folder,public_id:publicId,timestamp};
    const toSign=Object.keys(params).sort().map(k=>`${k}=${params[k]}`).join('&');
    const signature=crypto.createHash('sha1').update(toSign+secret).digest('hex');
    return response(200,{cloudName,apiKey:key,signature,timestamp,folder,publicId});
  } catch(error) {
    console.error('Honor upload sign failed:',error?.code||error?.message||'unknown');
    if(error?.code==='auth/id-token-expired'||error?.code==='auth/argument-error'||error?.code==='auth/id-token-revoked') return response(401,{error:'Phiên đăng nhập không hợp lệ hoặc đã hết hạn. Hãy đăng nhập lại.'});
    return response(500,{error:'Không tạo được chữ ký tải ảnh. Kiểm tra cấu hình Netlify Function và quyền Firebase Admin.'});
  }
};
