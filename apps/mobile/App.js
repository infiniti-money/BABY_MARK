import 'react-native-url-polyfill/auto';
import React,{useState,useEffect,useRef} from 'react';
import {View,Text,TextInput,Button,ScrollView,Platform,StyleSheet} from 'react-native';
import {CameraView,useCameraPermissions} from 'expo-camera';
import * as Location from 'expo-location';
import {registerPush,unregisterPush} from './notifications';

import * as ImageManipulator from 'expo-image-manipulator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {createClient} from '@supabase/supabase-js';
const url=process.env.EXPO_PUBLIC_SUPABASE_URL,key=process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,api=process.env.EXPO_PUBLIC_API_URL;
const db=url&&key?createClient(url,key,{auth:{storage:AsyncStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}}):null;
export default function App(){
 const [session,S]=useState(null),[email,E]=useState(''),[password,P]=useState(''),[msg,M]=useState(''),[permission,request]=useCameraPermissions(),[location,L]=useState(null),[assignments,A]=useState([]),[selected,Q]=useState(null),[show,V]=useState(false),[ready,Ready]=useState(false),[busy,B]=useState(false);const cam=useRef(null);
 const [notices,Notices]=useState([]);
 async function inbox(uid){const {data}=await db.from('attendance_notifications').select('id,title,body,created_at').eq('recipient_id',uid).order('created_at',{ascending:false}).limit(30);Notices(data||[])}
 useEffect(()=>{if(!db)return;db.auth.getSession().then(({data})=>S(data.session));const {data:{subscription}}=db.auth.onAuthStateChange((_,s)=>S(s));return()=>subscription.unsubscribe()},[]);
 useEffect(()=>{Notices([]);if(!session){A([]);Q(null);V(false);return}const uid=session.user.id;load();inbox(uid);const id=setInterval(()=>{load();inbox(uid)},30000);const ch=db.channel('staff-inbox-'+uid).on('postgres_changes',{event:'INSERT',schema:'public',table:'attendance_notifications',filter:'recipient_id=eq.'+uid},()=>inbox(uid)).subscribe();return()=>{clearInterval(id);db.removeChannel(ch)}},[session?.user.id]);
 async function load(){const {data,error}=await db.from('assignments').select('*').eq('user_id',session.user.id).gte('ends_at',new Date(Date.now()-86400000).toISOString()).order('starts_at').limit(50);if(error)M(error.message);else A(data)}
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
 M('Đã ghi nhận: '+data.status);V(false);
 }catch(e){M(e.message)}finally{B(false)}}
 if(!db||!api)return <View style={styles.page}><Text>Chưa cấu hình biến môi trường.</Text></View>;
 return <ScrollView contentContainerStyle={styles.page}><Text style={styles.title}>BABY_MARK Staff</Text><Text>{msg}</Text>{!session?<><TextInput style={styles.input} placeholder="Email" autoCapitalize="none" value={email} onChangeText={E}/><TextInput style={styles.input} secureTextEntry placeholder="Mật khẩu" value={password} onChangeText={P}/><Button title="Đăng nhập" onPress={login}/></>:<><Button title="Đăng xuất" onPress={async()=>{try{await unregisterPush(db,api);await db.auth.signOut()}catch(e){M('Không thể hủy đăng ký thông báo: '+e.message)}}}/><Button title="Bật thông báo nhắc ca" onPress={async()=>{try{await registerPush(db,api);M('Đã đăng ký nhận thông báo')}catch(e){M(e.message)}}}/><Text style={styles.title}>Ca làm việc</Text>{assignments.map(a=><View key={a.id} style={styles.input}><Button title={(selected===a.id?'✓ ':'')+a.work_date+' · '+new Date(a.starts_at).toLocaleTimeString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})} onPress={()=>Q(a.id)}/></View>)}<Button title="Mở camera và xác minh GPS" disabled={!selected||busy} onPress={open}/>{show&&<><CameraView ref={cam} style={{height:380}} facing="front" onCameraReady={()=>Ready(true)}/><Button title="Vào ca" disabled={!ready||busy||!permission?.granted||!location?.granted} onPress={()=>submit('IN')}/><Button title="Tan ca" disabled={!ready||busy||!permission?.granted||!location?.granted} onPress={()=>submit('OUT')}/><Button title="Đóng camera" onPress={()=>V(false)}/></>}<Text style={styles.title}>Thông báo</Text>{notices.map(n=><View key={n.id} style={styles.input}><Text style={{fontWeight:'700'}}>{n.title}</Text><Text>{n.body}</Text><Text>{new Date(n.created_at).toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh'})}</Text></View>)}<Text>Chỉ sử dụng camera và GPS khi bạn chấm công. Không theo dõi nền.</Text></>}</ScrollView>
}
const styles=StyleSheet.create({page:{padding:24,paddingTop:65,gap:14,backgroundColor:'#f3f6fa'},title:{fontSize:26,fontWeight:'700',color:'#155e75'},input:{borderWidth:1,borderColor:'#cbd5e1',borderRadius:10,padding:12,backgroundColor:'#fff'}});
