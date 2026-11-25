# Tối ưu báo cáo và thiết bị di động

Nhánh tối ưu dựa trên PR #8 (`a47faba`), chưa hợp nhất main hoặc triển khai production. Các thay đổi nhắm vào ứng dụng Pages đang dùng (`public/` và `functions/`); không sửa các ứng dụng Next.js/Expo/Supabase lịch sử.

## Sáu nhóm thay đổi

| Nhóm | Bằng chứng và thay đổi | Kiểm tra |
| --- | --- | --- |
| D1 và báo cáo | Query plan cũ quét assignments và sắp xếp yêu cầu phụ theo từng ca. Migration **tùy chọn** 0022 bổ sung index ngày và index biểu thức đúng thứ tự APPROVED/PENDING/REJECTED. Chọn khóa của trang trước khi join bằng chứng chấm công. | SQLite thực thi migration thật, so sánh có/không index, thứ tự ưu tiên và phạm vi của ba vai trò. |
| JavaScript | Camera kéo theo khoảng 39 KB Timemark khi mở trang, dù chưa chụp. Chuyển camera/Timemark, CV và in CV sang import khi sử dụng; workbook tiếp tục tải theo nhu cầu. | Theo dõi request trên trình duyệt; đo đồ thị module tĩnh trước/sau. |
| Camera, GPS, nén ảnh | Tái sử dụng một canvas thu nhỏ; giải phóng canvas nguồn trong finally; hỗ trợ hủy và timeout từng bước xử lý ảnh. Camera ưu tiên 24 fps, tối đa 30 fps. GPS chỉ cập nhật khi độ chính xác cải thiện và dừng khi đóng hộp thoại lấy tọa độ. | JPEG thực với ảnh nhiễu, giới hạn 200.000 byte, ca vào/ra, hủy encoder giả lập, thu hồi URL, giải phóng GPS đồng bộ/bất đồng bộ. |
| Thông báo và tin nhắn | Thông báo hệ thống dùng cùng luồng tin nhắn hiện có. Polling ngừng khi offline/ẩn trang, chỉ một lượt đang chạy; tăng khoảng chờ khi không đổi hoặc lỗi; tôn trọng Retry-After cả khi trở lại foreground. | Đồng hồ giả lập và phản hồi 429; offline/online; không tự phát sinh thao tác gửi tin. Push/cron và cài đặt gửi thông báo giữ nguyên. |
| iPhone/Android | Nút đóng hộp thoại đạt 44 × 44 px; danh sách chat dùng chiều cao động; giới hạn nội dung dài trong cột và cho nhóm nút phân trang xuống dòng. | WebKit cấu hình iPhone và Chromium cấu hình Android; chiều rộng 320/390/844 px, dọc/ngang và chiều cao thu nhỏ. |
| Dọn bộ nhớ và phục hồi mạng | Hủy GET khi đổi trang, hủy request khi đổi tài khoản, giới hạn thời gian đọc/ghi, bao gồm tải thân ảnh/CSV. Thu hồi URL ảnh, bỏ các phần tử rời DOM khỏi motion observer. Gộp các lần phục hồi phiên trùng nhau khi online. | Mock encoder/observer và phản hồi treo; phục hồi phiên; bộ test mất phản hồi chấm công/idempotency hiện có. |

Rà soát bổ sung tổ chức lại menu theo vai trò, yêu cầu công và chat trên điện thoại; sửa phản hồi ghi D1 bị ảnh hưởng bởi trigger. Chi tiết phát hiện, quy tắc nghiệp vụ giữ nguyên và test runtime nằm trong [mobile-workflow-audit.md](mobile-workflow-audit.md).

## API phân trang và nghiệp vụ

- API cũ `/api/reports` và `format=csv` tiếp tục xuất đầy đủ theo bộ lọc, giới hạn 5.000 ca và khoảng ngày hiện có. Không đổi phép tính công, lương hoặc bằng chứng điều chỉnh.
- `view=summary` trả tổng hợp cho **toàn bộ bộ lọc**, không gửi lại mảng chi tiết. Lượt này vẫn đọc đủ ca, tối đa 5.000; đây chưa phải truy vấn tổng hợp SQL hay cache.
- `page_size=1..100` trả `rows` và `next`, không trả tổng của riêng trang để tránh nhầm với tổng báo cáo. Client truyền lại đủ bốn trường trong `next`: `after_date`, `after_start`, `after_code`, `after_id`.
- Thứ tự giữ nguyên: ngày, giờ bắt đầu, mã nhân viên, ID ca. Mọi trang đều áp dụng lại phiên đăng nhập, quyền nhân viên/quản lý và bộ lọc trên máy chủ. Cursor không cấp thêm quyền.
- Giao diện giữ một trang 30 ca và các cursor; tổng và tổng theo cửa hàng thuộc toàn bộ bộ lọc. Excel/in bảng công lấy lại dữ liệu đầy đủ khi người dùng chọn xuất. In từ tổng quan giữ đúng ngày/cửa hàng/nhân viên đã chọn.
- Đây là danh sách trực tiếp, không phải snapshot bất biến: nếu lịch hoặc quyền thay đổi giữa các lượt đọc, dữ liệu trang có thể thay đổi. Dùng Làm mới để tính lại tổng. Bản chốt lương bất biến không bị sửa.
- Lần mở báo cáo cần một lượt tổng hợp và một lượt trang đầu; tổng công việc D1 ban đầu có thêm truy vấn nhỏ của trang. Những trang tiếp theo chỉ join chi tiết trang, không tính lại toàn bộ tổng.

## Đo local có thể lặp lại

```sh
npm ci
npm run perf:local
```

Script chỉ tạo SQLite trong bộ nhớ với 40 nhân viên giả lập, 1.200 ca và 24.000 yêu cầu bị từ chối. Nó bỏ/tạo hai index **trên fixture này**, không có cấu hình hoặc đường kết nối D1 production. Đồ thị JavaScript so với nhánh `origin/fix/pages-routing-performance`; clone nông cần fetch nhánh đó để có nguồn so sánh.

Kết quả và query plan nằm trong [evidence/report-performance-local.json](evidence/report-performance-local.json). Thời gian là median 7 lượt trên máy local, không phải độ trễ D1 hay mức tiết kiệm chi phí. Kích thước là byte nguồn/JSON chưa nén, không phải dung lượng truyền HTTP sau nén.

| Đo trên fixture local | Trước | Sau |
| --- | ---: | ---: |
| Mã nguồn module tải khi khởi động | 263.860 byte | 234.604 byte (giảm khoảng 11%) |
| Phản hồi chi tiết báo cáo | 1.579.046 byte | 39.687 byte/trang 30 ca + 557 byte tổng hợp lần đầu |
| Median truy vấn đầy đủ | 16,75 ms khi bỏ hai index | 11,76 ms khi có index |
| Median truy vấn trang 30 ca | — | 0,69 ms khi có index |

Query plan sau index dùng `SEARCH a USING INDEX assignment_report_date` và `request_report_choice`. Vẫn có thể sắp xếp tạm ở mức ngoài do thứ tự mã nhân viên nằm trong bảng profiles; không tuyên bố đã loại bỏ toàn bộ sort hoặc tối ưu mọi phạm vi quản lý.

Tham chiếu phương pháp kiểm tra: [Cloudflare D1 — Use indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/).

## Migration và giới hạn xác minh

**Không có migration production được thực hiện.** Migration `cloudflare/d1/0022_report_indexes.sql` chỉ tạo hai index, không cập nhật/xóa bản ghi. Mã tiếp tục chạy khi chưa có hai index. Việc áp dụng lên môi trường thật là công việc vận hành riêng sau review, backup và đo query plan/rows_read trên bản sao thích hợp. Index tăng dung lượng và công việc ghi; chưa đo tác động này trên D1 thật. Các chỉ báo migration nghiệp vụ vẫn đến 0021 vì 0022 không phải điều kiện chạy chức năng.

CI chỉ kiểm thử local, không có bước deploy, remote migration, thay đổi binding, gói dịch vụ hoặc bật cron. Giữ ảnh tối đa 200 KB, TTL tối đa 90 ngày, ngân sách ảnh 900 MB và thời hạn ảnh cũ. Không thêm dịch vụ trả phí hoặc cache dữ liệu nhân sự.

Lệnh kiểm tra:

```sh
npm test
npm run check:runtime
npx playwright install --with-deps chromium webkit
npm run test:browser
npm run test:mobile
```

Chưa đo trên iPhone/Android vật lý: camera trước/sau, quyền Safari/PWA, pin/nhiệt, tốc độ GPS ngoài thực địa, bàn phím hệ thống, chất lượng chữ trên JPEG ngoài đời và mạng di động yếu kéo dài. Việc thu nhỏ viewport không mô phỏng đầy đủ bàn phím thật. Test dọn tài nguyên kiểm tra vòng đời và số đối tượng; chưa phải heap profile hay kiểm tra nhiều giờ trên thiết bị RAM thấp. Chưa có số đo D1 production, `meta.rows_read`, độ trễ mạng thật hoặc LCP/INP thực tế.
