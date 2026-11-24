# Thử nghiệm BABY MARK không ảnh hưởng production
Chỉ sử dụng máy chủ Miniflare/D1/KV cục bộ, bind 127.0.0.1, dữ liệu tạm trong bộ nhớ. Không tạo tài khoản demo trên babymark.pages.dev, không dùng bí mật production, không triển khai seed vào Pages.
Windows, Node.js 22.13+: trong thư mục repo chạy `npm ci`, sau đó `npm run demo`. Mở http://127.0.0.1:8788. Terminal in mã truy cập 48 ký tự ngẫu nhiên mỗi lần chạy, dùng chung cho tài khoản giả trong phiên demo.
- demo-admin: tổng quan, quản trị, chốt công/lương.
- demo-ql-01: quản lý BM-001 tới BM-007; demo-ql-02: BM-008 tới BM-014.
- demo-01-a, demo-01-b ... demo-14-a, demo-14-b: 28 nhân viên giả, luân phiên thứ Hai; lịch tự động 14 ngày, thứ Hai–thứ Sáu (chỉ giả định thử nghiệm).
- Địa chỉ và GPS đều giả lập 20,106; không phải tọa độ cửa hàng. Các lượt lịch sử giả lập không có ảnh thực, photo_source LEGACY_UNVERIFIED.
- Chọn tháng trước để xem dự thảo công/lương, đã có 14 ca nghỉ duyệt và 14 ca vắng, ca đi muộn, đơn giá minh họa. Admin thử chốt phiên bản, xuất CSV. Yêu cầu nghỉ tương lai chờ duyệt tại BM-001. Hôm nay có 28 ca chưa chấm.
- Camera và GPS có thể cần thiết lập DevTools Sensors (tọa độ 20,106) hoặc chạy kiểm thử Playwright dùng camera giả. Không thay đổi kiểm tra GPS trên production.
Ctrl+C dừng server, dữ liệu demo mất. Không chạy SQL seed trên D1 thật. `npm test` chạy kiểm thử tự động cả mô hình 14 cửa hàng. `npm run test:browser` chạy bộ kiểm thử giao diện độc lập sau `npm run check:runtime`.
Lỗi 401 của scheduler production vẫn cần đồng bộ Secret trên hai hệ thống; demo chỉ xác minh logic khi Secret phù hợp.