# Thông báo v0.2
1. Sau schema.sql, chạy notifications.sql một lần trên Supabase BABY_MARK (không chạy vào project khác). Kiểm tra RLS và publication.
2. Cấu hình CRON_SECRET ngẫu nhiên ít nhất 32 ký tự ở server, không đưa vào app. Tùy chọn EXPO_ACCESS_TOKEN nếu bật enhanced push security.
3. Bộ lập lịch server (hoặc Supabase Cron + Vault/HTTP) gọi GET https://<your-web>/api/cron/notifications mỗi phút với Authorization: Bearer <CRON_SECRET>. Không đưa secret vào URL hoặc repository. Nếu cron chỉ chạy hàng ngày thì không đáp ứng nhắc ca.
4. EAS project và FCM v1/APNs, development build, bật quyền thông báo trên mobile. Admin đăng nhập mobile để nhận push, hoặc dùng danh sách thông báo trong Dashboard. Push hiển thị nội dung chung để bảo vệ thông tin nhân viên trên màn hình khóa.
5. Kiểm tra ca bắt đầu sau 10 phút, ca kết thúc sau 10 phút, ca quá grace period, chấm công thành công, chạy job lặp không tạo thông báo trùng, 2 tài khoản trên 1 máy, RLS không đọc thông báo người khác.
6. 'accepted' chỉ là Expo nhận ticket, không chứng minh đã tới máy. Cần bổ sung worker truy vấn push receipts, xử lý lỗi, theo dõi trạng thái sending/failed trước production. Không tự retry sending để tránh gửi trùng khi kết quả không rõ. Kiểm tra log cron, giữ khóa bảo mật.
Không lưu nội dung ảnh/GPS trong push. Dữ liệu thông báo cần có chính sách lưu trữ và xóa. Không coi cảnh báo là quyết định kỷ luật.
