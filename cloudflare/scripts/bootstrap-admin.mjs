// Run locally on a trusted computer. Never commit output SQL or credentials.
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const username=String(process.argv[2]||'').toLowerCase();
if(!/^[a-z0-9._-]{3,64}$/.test(username))throw Error('Usage: node cloudflare/scripts/bootstrap-admin.mjs <username>');
const secret=randomBytes(24).toString('hex'),salt=randomBytes(16).toString('hex'),hash=createHash('sha256').update('babymark-credential-v1:'+salt+':'+secret).digest('hex'),id=randomUUID(),now=Date.now();
const sql="INSERT INTO profiles(id,employee_code,full_name,role,department,active) SELECT '"+id+"','ADMIN-001','Quản trị BABY MARK','admin','',1 WHERE NOT EXISTS(SELECT 1 FROM profiles WHERE role='admin');\nINSERT INTO credentials(user_id,username,salt,secret_hash,created_at,updated_at) SELECT '"+id+"','"+username+"','"+salt+"','"+hash+"',"+now+","+now+" WHERE EXISTS(SELECT 1 FROM profiles WHERE id='"+id+"' AND role='admin');\n";
writeFileSync('bootstrap-admin.local.sql',sql,{flag:'wx',mode:0o600});
console.log('SQL: bootstrap-admin.local.sql (không commit). Tài khoản:',username);
console.log('Mã đăng nhập dùng riêng, lưu ngay vào password manager:',secret);
