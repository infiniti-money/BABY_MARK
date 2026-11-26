package com.infinitimoney.babymark;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.WindowInsets;
import android.webkit.*;
import android.widget.FrameLayout;

public final class MainActivity extends Activity {
 private static final String HOME = "https://babymark.pages.dev/";
 private static final String HOST = "babymark.pages.dev";
 private WebView web;
 private PermissionRequest camera;
 private GeolocationPermissions.Callback location;
 private String locationOrigin;
 private static boolean trusted(Uri uri) {
  return uri != null && "https".equals(uri.getScheme()) && HOST.equals(uri.getHost())
   && (uri.getPort()==-1 || uri.getPort()==443) && uri.getUserInfo()==null;
 }
 private boolean currentTrusted(){return web!=null && web.getUrl()!=null && trusted(Uri.parse(web.getUrl()));}
 private boolean allowed(String permission){return checkSelfPermission(permission)==PackageManager.PERMISSION_GRANTED;}
 private static boolean maps(Uri uri){
  return uri!=null && "https".equals(uri.getScheme()) && "www.google.com".equals(uri.getHost())
   && (uri.getPort()==-1||uri.getPort()==443) && uri.getUserInfo()==null
   && uri.getPath()!=null && uri.getPath().startsWith("/maps/");
 }
 private void openMaps(Uri uri){
  try{startActivity(new Intent(Intent.ACTION_VIEW,uri));}
  catch(Exception e){message("Không thể mở Google Maps.");}
 }
 private void message(String text){if(!isFinishing())new AlertDialog.Builder(this).setMessage(text).setPositiveButton("Đóng",null).show();}
 @Override public void onCreate(Bundle saved){
  super.onCreate(saved);
  FrameLayout root=new FrameLayout(this);
  if(Build.VERSION.SDK_INT>=30){
   getWindow().setDecorFitsSystemWindows(false);
   root.setOnApplyWindowInsetsListener((v,insets)->{
    android.graphics.Insets system=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());
    android.graphics.Insets ime=insets.getInsets(WindowInsets.Type.ime());
    v.setPadding(system.left,system.top,system.right,Math.max(system.bottom,ime.bottom));
    return insets;
   });
  }
  web=new WebView(this);root.addView(web,new FrameLayout.LayoutParams(-1,-1));setContentView(root);
  WebView.setWebContentsDebuggingEnabled(false);
  WebSettings settings=web.getSettings();
  settings.setJavaScriptEnabled(true);settings.setDomStorageEnabled(true);settings.setGeolocationEnabled(true);
  settings.setAllowFileAccess(false);settings.setAllowContentAccess(false);settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
  settings.setJavaScriptCanOpenWindowsAutomatically(false);settings.setSupportMultipleWindows(false);
  CookieManager.getInstance().setAcceptThirdPartyCookies(web,false);
  web.setWebViewClient(new WebViewClient(){
   @Override public boolean shouldOverrideUrlLoading(WebView view,WebResourceRequest request){
    Uri uri=request.getUrl();
    if(trusted(uri))return false;
    if(request.isForMainFrame() && request.hasGesture() && currentTrusted() && maps(uri))openMaps(uri);
    return true;
   }
   @Override public void onReceivedSslError(WebView view,SslErrorHandler handler,android.net.http.SslError error){handler.cancel();}
  });
  web.setWebChromeClient(new WebChromeClient(){
   @Override public void onPermissionRequest(PermissionRequest request){
    runOnUiThread(()->{
     String[] resources=request.getResources();
     if(!currentTrusted()||!trusted(request.getOrigin())||resources.length!=1||
       !PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(resources[0])||camera!=null||location!=null){request.deny();return;}
     if(allowed(Manifest.permission.CAMERA)){request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});return;}
     camera=request;requestPermissions(new String[]{Manifest.permission.CAMERA},101);
    });
   }
   @Override public void onPermissionRequestCanceled(PermissionRequest request){runOnUiThread(()->{if(camera==request)camera=null;});}
   @Override public void onGeolocationPermissionsShowPrompt(String origin,GeolocationPermissions.Callback callback){
    if(!currentTrusted()||!trusted(Uri.parse(origin))||location!=null||camera!=null){callback.invoke(origin,false,false);return;}
    if(allowed(Manifest.permission.ACCESS_FINE_LOCATION)){callback.invoke(origin,true,false);return;}
    location=callback;locationOrigin=origin;
    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION},102);
   }
   @Override public void onGeolocationPermissionsHidePrompt(){location=null;locationOrigin=null;}
  });
  web.setDownloadListener((url,agent,disposition,mime,length)->message("Xuất tệp chưa hỗ trợ trong bản Android thử nghiệm. Hãy mở BABY MARK trên Chrome để xuất báo cáo."));
  web.loadUrl(HOME);
 }
 @Override public void onRequestPermissionsResult(int code,String[] permissions,int[] grants){
  super.onRequestPermissionsResult(code,permissions,grants);
  if(code==101&&camera!=null){PermissionRequest req=camera;camera=null;
   if(currentTrusted()&&trusted(req.getOrigin())&&allowed(Manifest.permission.CAMERA))req.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});else req.deny();
  }
  if(code==102&&location!=null){GeolocationPermissions.Callback cb=location;String origin=locationOrigin;location=null;locationOrigin=null;
   cb.invoke(origin,currentTrusted()&&trusted(Uri.parse(origin))&&allowed(Manifest.permission.ACCESS_FINE_LOCATION),false);
  }
 }
 @Override protected void onPause(){if(web!=null)web.onPause();super.onPause();}
 @Override protected void onResume(){super.onResume();if(web!=null)web.onResume();}
 @Override protected void onDestroy(){
  if(camera!=null){camera.deny();camera=null;}if(location!=null){location.invoke(locationOrigin,false,false);location=null;}
  if(web!=null){web.stopLoading();web.destroy();web=null;}super.onDestroy();
 }
}
