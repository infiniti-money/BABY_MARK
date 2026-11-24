import 'react-native-url-polyfill/auto';
import React,{useState,useEffect,useRef} from 'react';
import {View,Text,TextInput,Pressable,Image,ScrollView,Platform,StyleSheet,StatusBar,Linking} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import * as Location from 'expo-location';
import {registerPush,unregisterPush} from './notifications';

import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient} from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,api=process.env.EXPO_PUBLIC_API_URL;
const db=url&&key?createClient(url,key,{auth:{storage:AsyncStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}}):null;
function Button({title,onPress,disabled=false,variant='primary'}){return <Pressable accessibilityRole="button" accessibilityState={{disabled}} disabled={disabled} onPress={onPress} style={({pressed})=>[styles.button,variant==='secondary'&&styles.secondary,disabled&&styles.disabled,pressed&&!disabled&&{opacity:.83}]}><Text style={[styles.buttonText,variant==='secondary'&&styles.secondaryText]}>{title}</Text></Pressable>}
function Brand(){return <View style={styles.brand}><Image source={require('./assets/logo.png')} style={styles.logo} accessibilityLabel="BABY MARK Mom & baby"/><Text style={styles.tagline}>An tâm cho mẹ – Trọn vẹn cho bé</Text><Text style={styles.eyebrow}>CHẤM CÔNG NỘI BỘ</Text></View>}
export default function App(){
 const [session,S]=useState(null),[email,E]=useState(''),[password,P]=useState(''),[msg,M]=useState(''),[permission,request]=useCameraPermissions(),[location,L]=useState(null),[assignments,A]=useState([]),[selected,Q]=useState(null),[show,V]=useState(false),[ready,Ready]=useState(false),[busy,B]=useState(false);const cam=useRef(null);
 const [notices,Notices]=useState([]),[history,History]=useState([]);
 async function inbox(uid){const {data}=await db.from('attendance_notifications').select('id,title,body,created_at').eq('recipient_id',uid).order('created_at',{ascending:false}).limit(30);Notices(data||[])}
 useEffect(()=>{if(!db)return;db.auth.getSession().then(({data})=>S(data.session));const {data:{subscription}}=db.auth.onAuthStateChange((_,s)=>S(s));return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{Notices([]);History([]);if(!session){A([]);Q(null);V(false);return}const uid=session.user.id;load();inbox(uid);const id=setInterval(()=>{load();inbox(uid)},30000);const ch=db.channel('staff-inbox-'+uid).on('postgres_changes',{event:'INSERT',schema:'public',table:'attendance_notifications',filter:'recipient_id=eq.'+uid},()=>inbox(uid)).subscribe();return()=>{clearInterval(id);db.removeChannel(ch)}},[session?.user.id]);
 async function load(){
 const uid=session?.user.id;if(!uid)return;
 const [a,h]=await Promise.all([db.from('assignments').select('*,branches(name)').eq('user_id',uid).gte('ends_at',new Date(Date.now()-86400000).toISOString()).order('starts_at').limit(50),db.from('attendances').select('id,type,server_timestamp,status,late_minutes,early_minutes').eq('user_id',uid).order('server_timestamp',{ascending:false}).limit(50)]);
 if(a.error)M(a.error.message);else A(a.data||[]);
 if(h.error)M(h.error.message);else History(h.data||[]);
}
 async function login(){const {error}=await db.auth.signInWithPassword({email,password});if(error)M(error.message)}
 async function open(){try{const c=await request(),l=await Location.requestForegroundPermissionsAsync();L(l);if(!c.granted||!l.granted)throw Error('Cần cấp quyền camera và vị trí.');if(Platform.OS==='android'&&l.android?.accuracy==='coarse')throw Error('Cần bật vị trí chính xác.');if(Platform.OS==='ios'&&l.ios?.accuracy==='reduced')throw Error('Cần bật vị trí chính xác.');const p=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});if(p.mocked===true)throw Error('Phát hiện vị trí giả lập.');if(p.coords.accuracy==null||p.coords.accuracy>50)throw Error('GPS chưa đủ chính xác.');Ready(false);V(true)}catch(e){M(e.message)}}
 async function submit(type){if(!selected||!cam.current||!ready||busy)return;B(true);M('');try{
 const p=await Location.getCurrentPositionAsync({accuracy:Location.Accuracy.High});
 if(p.mocked===true||p.coords.accuracy==null||p.coords.accuracy>50)throw Error('Vị trí giả lập hoặc không đủ chính xác');
 const shot=await cam.current.takePictureAsync({quality:.7});if(!shot)throw Error('Không chụp được ảnh');
 const compressed=await ImageManipulator.manipulateAsync(shot.uri,[{resize:{width:800}}],{compress:.7,format:ImageManipulator.SaveFormat.JPEG});
 const f=new FormData();Object.entries({type,assignment_id:selected,lat:p.coords.latitude,lng:p.coords.longitude,accuracy:p.coords.accuracy,mocked:p.mocked===true}).forEach(([k,v])=>f.append(k,String(v)));
 f.append('photo',{uri:compressed.uri,name:'capture.jpg',type:'image/jpeg'});
 const {data:{session:s}}=await db.auth.getSession();const res=await fetch(api.replace(/\/$/,'')+'/api/attendance',{method:'POST',headers:{Authorization:'Bearer '+s.access_token},body:f});const data=await res.json();if(!res.ok)throw Error(data.error);
 M('Đã ghi nhận: '+data.status);V(false);await load();
 }catch(e){M(e.message)}finally{B(false)}}
 if(!db||!api)return <View style={styles.page}><Brand/><Text>Chưa cấu hình biến môi trường.</Text></View>;
 return <ScrollView contentContainerStyle={styles.page} keyboardShouldPersistTaps="handled"><StatusBar barStyle="dark-content" backgroundColor="#fff1f4"/><Brand/>{!!msg&&<Text style={styles.notice}>{msg}</Text>}{!session?<View style={styles.panel}><Text style={styles.title}>Chào mừng trở lại</Text><Text style={styles.muted}>Đăng nhập tài khoản nhân viên</Text><TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={E}/><TextInput style={styles.input} secureTextEntry placeholder="Mật khẩu" value={password} onChangeText={P}/><Button title="Đăng nhập" onPress={login}/></View>:<><Button variant="secondary" title="Đăng xuất" onPress={async()=>{try{await unregisterPush(db,api);await db.auth.signOut()}catch(e){M('Không thể hủy đăng ký thông báo: '+e.message)}}}/><Button variant="secondary" title="Bật thông báo nhắc ca" onPress={async()=>{try{await registerPush(db,api);M('Đã đăng ký nhận thông báo')}catch(e){M(e.message)}}}/><Text style={styles.title}>Ca làm việc</Text>{assignments.map(a=><View key={a.id} style={styles.input}><Button title={(selected===a.id?'✓ ':'')+a.work_date+' · '+(a.branches?.name||'Cửa hàng')+' · '+new Date(a.starts_at).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} onPress={()=>Q(a.id)}/></View>)}<Button title="Mở camera và xác minh GPS" disabled={!selected||busy} onPress={open}/>{show&&<><CameraView ref={cam} style={{height:380}} facing="front" onCameraReady={()=>Ready(true)}/><Button title="Vào ca" disabled={!ready||busy||!permission?.granted||!location?.granted} onPress={()=>submit('IN')}/><Button title="Tan ca" disabled={!ready||busy||!permission?.granted||!location?.granted} onPress={()=>submit('OUT')}/><Button variant="secondary" title="Đóng camera" onPress={()=>V(false)}/></>}<Text style={styles.title}>Lịch sử chấm công</Text>{history.length?history.map(h=><View key={h.id} style={styles.input}><Text style={{fontWeight:'700'}}>{h.type==='IN'?'Vào ca':'Tan ca'} · {({ON_TIME:'Đúng giờ',LATE:'Đi muộn',EARLY:'Về sớm',OUTSIDE:'Ngoài vùng'})[h.status]||h.status}</Text><Text>{new Date(h.server_timestamp).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</Text><Text>Muộn {h.late_minutes} phút · Sớm {h.early_minutes} phút</Text></View>):<Text style={styles.muted}>Chưa có nhật ký chấm công</Text>}<Button variant="secondary" title="Xin nghỉ / điều chỉnh công trên web" onPress={()=>Linking.openURL(api.replace(/\/$/,'')+'/#requests').catch(e=>M(e.message))}/><Text style={styles.title}>Thông báo</Text>{notices.map(n=><View key={n.id} style={styles.input}><Text style={{fontWeight:'700'}}>{n.title}</Text><Text>{n.body}</Text><Text>{new Date(n.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</Text></View>)}<Text style={styles.muted}>Chỉ sử dụng camera và GPS khi bạn chấm công. Không theo dõi nền.</Text></>}</ScrollView>
}
const styles=StyleSheet.create({
page:{padding:20,paddingTop:Platform.OS==='ios'?64:40,paddingBottom:45,gap:12,backgroundColor:'#fff1f4',flexGrow:1},
brand:{alignItems:'center',paddingVertical:16,marginBottom:6,borderRadius:24,backgroundColor:'#fff1f4'},
logo:{width:180,height:180,resizeMode:'contain',borderRadius:24},
tagline:{fontSize:15,color:'#9c3449',textAlign:'center',fontWeight:'600'},eyebrow:{fontSize:11,letterSpacing:1.8,fontWeight:'700',color:'#9c3449',marginTop:12},
title:{fontSize:24,fontWeight:'700',color:'#632334',marginTop:8},muted:{fontSize:13,color:'#785560',lineHeight:20},
input:{borderWidth:1,borderColor:'#efd0d7',borderRadius:14,padding:14,backgroundColor:'#fff',color:'#40232d',minHeight:48},
panel:{backgroundColor:'#fff',borderRadius:24,padding:22,gap:14,borderWidth:1,borderColor:'#f1d8df'},
button:{minHeight:49,borderRadius:14,paddingHorizontal:15,paddingVertical:13,alignItems:'center',justifyContent:'center',backgroundColor:'#c91e3c'},
buttonText:{fontSize:15,fontWeight:'700',color:'#fff',textAlign:'center'},secondary:{backgroundColor:'#fff',borderWidth:1,borderColor:'#e9bdc7'},secondaryText:{color:'#9c3449'},disabled:{opacity:.45},
notice:{padding:14,borderRadius:12,backgroundColor:'#fff',color:'#8b2440',borderWidth:1,borderColor:'#edc4ce'}
});
