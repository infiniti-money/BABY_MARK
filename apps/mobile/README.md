# Expo native starter
App.js là mã nguồn màn hình đăng nhập, chọn ca, kiểm tra quyền, camera trước và GPS. Chưa chạy thử trên thiết bị.
Tạo project Expo tương thích trong thư mục tạm bằng npx create-expo-app@latest babymark-native --template blank.
Sao chép App.js và app.json vào project mới. Cài dependencies bằng npx expo install expo-camera expo-location expo-image-manipulator @react-native-async-storage/async-storage react-native-url-polyfill; npm install --save-exact @supabase/supabase-js@2.95.3.
Sao chép .env.example thành .env, điền publishable key và HTTPS API URL. Chạy npx expo install --fix, npx expo-doctor và npx expo start; commit package.json và lockfile sau khi kiểm thử. Không dùng service role key.
Mock detection phụ thuộc hệ điều hành và phiên bản SDK. Chưa có device attestation/root/jailbreak checks. Cần EAS dev build và thiết bị thật để kiểm thử.

## Push notifications
Cài thêm npx expo install expo-notifications expo-constants expo-dev-client. Sao chép notifications.js cùng App.js. Chạy eas init, cấu hình FCM v1 và APNs qua EAS credentials, tạo development build, thử trên thiết bị thật. Bật thông báo trong màn hình sau đăng nhập. Xem docs/notifications.md.

## Nhận diện BABY MARK
Sao chép thư mục assets khi tạo project Expo. Logo 288px dùng cho giao diện và cấu hình icon/splash thử nghiệm. Trước phát hành App Store/Play Store, chuẩn bị icon PNG vuông 1024px từ logo gốc có độ phân giải cao; kiểm tra vùng an toàn Android adaptive icon. Không sử dụng ảnh banner quảng cáo làm nền bảng công.
