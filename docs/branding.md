# BABY MARK — Brand Kit RC.12
Nguồn chính thức: bộ ZIP **BabyMark_Logo_Va_Mobile_Icon_Tron_Bo.zip** do chủ dự án cung cấp (87 tệp). Màu đỏ #D2282F, trắng #FFFFFF, đen #141414. Không vẽ lại logo. Slogan trong thiết kế gốc “Thấu hiểu điều mẹ muốn !”; giao diện dùng câu đã chốt “Thấu hiểu điều mẹ muốn”.
- `public/brand/logo.png`: biểu tượng mẹ và bé PNG gốc trong suốt (632×697). Intro ghép bốn góc biểu tượng và chữ thương hiệu SVG gốc, dùng chung login/sidebar/boot.
- `public/brand/`: sáu biến thể SVG đỏ, biểu tượng và chữ trắng; logo đen ngang `print-black.png` sẵn cho in ấn. Không chỉnh layout báo cáo A4/POS.
- Favicon .ico, PNG 16/32/48/64/128/192/512 và Apple touch icon 180px đúng từ bộ kit. PWA manifest khai báo 192/512 purpose any; không khai báo maskable khi chưa xác minh vùng an toàn. Notification dùng favicon 192.
- `apps/mobile/assets/`: icon iOS 1024px RGB, Android adaptive foreground 432px và nền trắng, biểu tượng trong suốt. app.json cập nhật tài nguyên cho native Expo cũ; không build APK/IPA hay phát hành store. Web/PWA là runtime hiện hành.
- `public/brand/timemark.png`: logo đầy đủ thu nhỏ trong suốt giữ tỷ lệ, nhúng vào SVG cho **ảnh chấm công mới**; dữ liệu/ảnh đã lưu không bị sửa. Cả hai nguồn Timemark đồng nhất.
- Tệp nguồn PNG/WebP/SVG/PDF, iOS appiconset và Android mipmap đầy đủ được giữ trong gói tài nguyên bàn giao ngoài runtime. Không nạp các bản in độ phân giải cao vào mỗi trang web.
- Kiểm tra mã băm Git blob cho mọi tài nguyên tích hợp, kích thước icon và tương thích manifest. Thiết bị thật cần nghiệm thu; cài PWA cũ có thể cần cập nhật icon từ hệ điều hành.
