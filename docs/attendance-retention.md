# Chính sách lưu trữ BABY MARK
- KV ảnh JPEG tối đa 200 KB, ngân sách payload 900 MB, TTL tối đa 60 ngày, xóa ảnh cũ nhất khi cần chỗ. Với 50 người × 2 ảnh/ngày × 200 KB, khoảng 45 ngày. Nếu trung bình <=150 KB, có thể lưu đủ 60 ngày. Ngân sách này không bảo đảm hạn mức tài khoản vì còn overhead và namespace khác.
- D1 giữ dữ liệu ca/chấm công trong 2 năm lịch, tính từ ngày kết thúc ca theo giờ Việt Nam. Khi quá hạn, xóa theo cả ca (IN/OUT, yêu cầu và thông báo liên quan) để báo cáo không bị mất một nửa ca. Không xóa tài khoản, cửa hàng, định nghĩa ca. Giữ yêu cầu đang chờ hoặc có hoạt động mới trong kỳ lưu; xử lý ngoại lệ trước khi xóa.
- Ảnh hết hạn không xóa bản ghi công. Không đồng bộ xóa ảnh với cleanup 2 năm. Bản sao lưu cũng cần chính sách lưu phù hợp.
## Triển khai
1. Target hiện tại cần đủ migrations 0001–0008 trên cơ sở dữ liệu thử nghiệm. Với dữ liệu có sẵn, chỉ áp dụng migration chưa chạy sau khi sao lưu/preflight. Không có migration production nào được áp dụng trong lần rà soát này.
2. Kiểm thử dữ liệu cũ/mới, ca qua đêm, yêu cầu đang chờ, quyết định mới, giới hạn 50 ca/lần. Kiểm tra yêu cầu lưu hồ sơ lao động/kế toán và sao lưu trước khi cho phép xóa tự động.
3. Thêm secret RETENTION_SECRET ngẫu nhiên >=32 ký tự trên Pages (không đưa vào GitHub). Chỉ khi đã duyệt chính sách, đặt ATTENDANCE_RETENTION_ENABLED=true. Endpoint POST /api/maintenance/attendance-retention với Authorization: Bearer <secret>. Không dùng GET. Mặc định tắt.
4. Cấu hình scheduler riêng (Cloudflare Worker Cron hoặc dịch vụ lập lịch được ủy quyền) gọi endpoint theo ngày, lặp các batch khi cần xử lý tồn đọng, không vượt quota. Pages Functions không tự chạy cron. Chưa cấu hình scheduler thực tế.
5. Kiểm tra retention_runs (số ca xóa, cutoff, thời điểm). Endpoint không trả thông tin cá nhân. Kiểm tra lỗi transaction trước khi retry. Không có thao tác xóa thực tế trong commit này.
