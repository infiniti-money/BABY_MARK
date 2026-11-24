import 'server-only';
import {createClient} from '@supabase/supabase-js';
export function serviceClient(){return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})}
export async function authenticatedUser(req){
 const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];if(!token)return null;
 const client=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});
 const {data,error}=await client.auth.getUser(token);if(error||!data.user)return null;
 const service=serviceClient();
 const {data:profile}=await service.from('profiles').select('id,active').eq('id',data.user.id).single();
 return profile?.active?profile.id:null;
}
