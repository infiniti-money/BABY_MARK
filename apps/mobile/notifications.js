import {Platform} from 'react-native';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
const STORAGE_KEY='babymark_push_token';
Notifications.setNotificationHandler({handleNotification:async()=>({shouldShowBanner:true,shouldShowList:true,shouldPlaySound:true,shouldSetBadge:false})});
async function sync(db,api,token,method){
 const {data:{session}}=await db.auth.getSession();if(!session)throw Error('Cần đăng nhập');
 const response=await fetch(api.replace(/\/$/,'')+'/api/push/register',{method,headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({token})});
 if(!response.ok)throw Error('Không thể đăng ký hoặc hủy thông báo');
}
export async function registerPush(db,api){
 if(Platform.OS==='web')throw Error('Push cần bản native');
 if(Platform.OS==='android')await Notifications.setNotificationChannelAsync('default',{name:'Chấm công',importance:Notifications.AndroidImportance.HIGH});
 let permission=await Notifications.getPermissionsAsync();if(permission.status!=='granted')permission=await Notifications.requestPermissionsAsync();
 if(permission.status!=='granted')throw Error('Bạn chưa cấp quyền thông báo');
 const projectId=Constants.expoConfig?.extra?.eas?.projectId??Constants.easConfig?.projectId;
 if(!projectId)throw Error('Chưa cấu hình EAS project ID');
 const token=(await Notifications.getExpoPushTokenAsync({projectId})).data;
 await sync(db,api,token,'POST');await AsyncStorage.setItem(STORAGE_KEY,token);
}
export async function unregisterPush(db,api){
 const token=await AsyncStorage.getItem(STORAGE_KEY);if(token){await sync(db,api,token,'DELETE');await AsyncStorage.removeItem(STORAGE_KEY)}
}
