# BABY_MARK — Attendance
Nền tảng chấm công cho nhân viên và quản lý. Múi giờ nghiệp vụ Asia/Ho_Chi_Minh.
## Tình trạng v0.2 (chưa kiểm thử triển khai)
Mã nguồn nền tảng, chưa triển khai production. Không lưu bí mật hoặc ảnh thật vào GitHub.
- Supabase Auth, PostgreSQL, RLS, ca/lịch phân công, ảnh private, API xác thực thời gian server và geofence.
- Khoảng cách ngoài vùng được ghi cờ OUTSIDE để quản lý xem xét. GPS do thiết bị cung cấp, không phải bằng chứng tuyệt đối chống giả mạo.
- Timestamps là thời gian API nhận yêu cầu, không phải thời điểm màn trập đã được xác thực. Không lấy giờ máy khách làm giờ công.
## Cài đặt
1. Tạo project Supabase riêng, chạy supabase/schema.sql một lần trên project mới bằng SQL Editor.
2. Tạo người dùng Auth (tắt đăng ký công khai), tạo profiles với UUID tương ứng và mã nhân viên. Chỉ người vận hành có quyền DB mới tạo admin.
3. Tạo branches, shifts và assignments (starts_at/ends_at là timestamptz, work_date là ngày tại Việt Nam, grace_minutes sao chép từ ca). Ca qua đêm cần ends_at vào ngày kế tiếp.
4. cd apps/web; copy .env.example thành .env.local; điền URL, publishable key và service role key (chỉ phía server); tùy chọn Goong key. npm install; npm test; npm run build; npm run dev.
5. Trước production, cập nhật bản vá dependency, khóa lockfile, chạy kiểm thử quyền RLS và tải ảnh. Camera/GPS web cần HTTPS hoặc localhost.
## Bảo mật và riêng tư
Chỉ xin vị trí lúc chấm công; không theo dõi nền. Hạn chế quyền đọc ảnh; không dùng nhận diện khuôn mặt. Xác định chính sách thông báo, lưu trữ/xóa ảnh, quyền truy cập và quy trình sửa công trước triển khai. Không coi root/mock check là bảo đảm chống gian lận. Không dùng kết quả GPS đơn lẻ để tự động kỷ luật.
## Tiếp theo
Hoàn thiện Expo native, quản lý lịch ca, thông báo FCM/APNs và kiểm thử trên thiết bị. Báo cáo ngày/tháng cần đối soát ngày nghỉ, ca qua đêm, nghỉ giữa ca, duyệt ngoại lệ và phép trước khi tính lương.

## Cập nhật thông báo và đồng bộ
Sau schema.sql, chạy supabase/notifications.sql trên project BABY_MARK; cấu hình CRON_SECRET và bộ lập lịch mỗi phút theo docs/notifications.md. Dashboard nhận thông báo realtime và có polling dự phòng. Push native cần EAS credentials; chưa kiểm thử thực tế.

## v0.4 — Quản trị nhân sự và yêu cầu công
Sau schema.sql và notifications.sql, chạy workforce.sql rồi workforce-notifications.sql trên đúng project BABY_MARK. Admin tạo tài khoản Auth bằng Dashboard Supabase, sau đó thêm hồ sơ bằng UUID trong giao diện Nhân sự. Vai trò manager chỉ đọc dữ liệu được RLS cho phép và duyệt yêu cầu tại các chi nhánh được cấp quyền; chỉ admin phân ca và cấu hình cửa hàng. Nhân viên gửi yêu cầu nghỉ hoặc điều chỉnh giờ qua mobile web; không sửa log ảnh/GPS gốc. Báo cáo tách ngày có công, số ca hoàn tất, ngày có nghỉ; chưa tính lương hoặc nghỉ giữa ca. Kiểm tra docs/workforce.md trước khi sử dụng.
