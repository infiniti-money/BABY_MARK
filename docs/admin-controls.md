# Quản trị mở rộng
Áp dụng cloudflare/d1/0009_admin_controls.sql một lần sau 0008. Trước migration, cài đặt/đóng cửa hàng bị vô hiệu hóa; đăng nhập, phân ca cũ và chính sách môi trường vẫn dùng được. Sao lưu D1 trước khi chạy SQL thủ công.
- Cửa hàng ngừng hoạt động giữ mọi lịch sử và quyền báo cáo; phải hủy hoặc hoàn tất lịch chưa kết thúc trước khi đóng (đợi hết cửa sổ chấm công 12h). Giới hạn 1–50 cửa hàng hoạt động, mặc định 14, không giảm thấp hơn số đang hoạt động. Giới hạn 50 nhân viên không đổi.
- Hủy ca tương lai chưa có dữ liệu liên quan; lưu ảnh chụp thông tin ca trong management_audit, không xóa ảnh/bảng công. Xóa mẫu ca chưa được dùng. Phân ca tối đa 31 ngày/100 lượt một giao dịch; xung đột hủy toàn bộ đợt. 
- Nhân viên và quản lý tự đổi mật khẩu với mật khẩu/mã cũ; phiên cũ bị thu hồi. Admin cũ giữ nguyên.
- Cài đặt bật/tắt thông báo muộn trong ứng dụng theo phạm vi quyền (cập nhật khi mở/làm mới, không push nền); bật/tắt xóa ảnh khi đầy 900MB và dọn D1 sau 2 năm. TTL ảnh tối đa 60 ngày không đổi. Dọn D1 cần RETENTION_SECRET cấu hình trên Cloudflare và scheduler gọi POST, không tự chạy chỉ vì bật checkbox.
- Không chạy migration production hoặc xóa dữ liệu trong lần cập nhật mã nguồn này. Thực hiện kiểm thử và sao lưu trước khi bật xóa.
