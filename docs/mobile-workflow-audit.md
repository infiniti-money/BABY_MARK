# Rà soát giao diện và nghiệp vụ trên thiết bị di động

Phạm vi: ứng dụng Pages `public/` + `functions/`, ba vai trò nhân viên, quản lý cửa hàng và Admin. Nền PR #8 tại `a47faba`; thay đổi tiếp nối phần tối ưu báo cáo/camera/mạng của PR #9. Không hợp nhất main, chạy migration production hoặc đổi gói dịch vụ.

## Phát hiện và sửa có kiểm chứng

| Vấn đề quan sát được | Kết quả sau sửa | Bằng chứng kiểm thử |
| --- | --- | --- |
| Thanh dưới chưa ưu tiên yêu cầu theo vai trò; menu mở rộng trộn các chức năng và tài khoản. | Ba nút thường dùng theo vai trò, nút Thêm mở menu chia nhóm. Native dialog giữ focus, có tên truy cập, Escape/chạm nền để đóng; nút chạm ít nhất 44 px. Desktop giữ đủ sidebar. | `mobile-workflows.spec.mjs`: toàn bộ 8/10/12 màn hình theo ba vai trò, WebKit/iPhone và Chromium/Android, dọc/ngang, desktop; kiểm tra console và tràn chiều ngang. |
| Cả vào ca và tan ca có thể bấm khi chưa bật camera hoặc chưa có lượt vào. | Nút chỉ bật khi camera sẵn sàng, đúng ca, đúng lượt tiếp theo và không có kết quả trước đang cần xác minh. Hướng dẫn trạng thái ngay cạnh nút. | `workspace.test.mjs`, `workflow-ux.spec.mjs`: camera giả lập, ghi vào thật qua API local, bật/tắt camera, chuyển trạng thái vào → ra; server vẫn kiểm tra toàn bộ điều kiện. |
| Khoảng xem yêu cầu mặc định kết thúc hôm nay nên ca nghỉ tương lai khó tìm; ca đã có đơn vẫn xuất hiện trong form. | Mặc định 30 ngày trước đến 31 ngày sau; sau gửi mở rộng phạm vi để thấy đơn vừa tạo. Lọc tất cả/chờ hoặc cần tôi duyệt/đã duyệt/từ chối, chờ duyệt đứng trước, hiển thị từng trang 30 đơn. Form loại ca có đơn PENDING/APPROVED. | Nghỉ nhiều ngày xuất hiện ngay; quản lý chỉ duyệt người khác trong cửa hàng được cấp, không duyệt đơn riêng/ngoài phạm vi. |
| Form xin nghỉ cho phép chọn loại không hợp lệ với ca đã chấm; duyệt ca thay thiếu thông tin để đối soát. | Ca có chấm công chuyển sang điều chỉnh. Chỉ điền giờ gốc đã ghi, giờ thiếu để trống để nhập theo thực tế. Quyết định ca bổ sung hiện người/cửa hàng/ngày/người thay/lý do; từ chối cần ghi chú. | Kiểm thử trình duyệt xác minh trường giờ, không tự tạo giờ ra, tên/nguyên nhân trong hộp thoại và không POST khi thiếu lý do từ chối. |
| Nhấn gửi nhiều lần hoặc đóng hộp thoại khi đang ghi dễ làm người dùng không biết đã gửi chưa. | Chặn gửi lặp, khóa đóng/Escape trong lúc lưu các form yêu cầu và tài khoản liên quan; trả lỗi trong form. | Giữ phản hồi mạng ở trạng thái chờ, gọi submit hai lần: chỉ một POST và một đơn được lưu. Không tự phát lại thao tác ghi sau kết nối lại. |
| Chat hai cột chật trên điện thoại; mở danh sách có thể đánh dấu nội dung chưa xem là đã đọc; đổi phòng mất bản nháp. | Điện thoại tách danh sách/nội dung, có nút quay lại. Chỉ đánh dấu đã đọc khi phòng thật sự mở, trang hiện và không có hộp thoại che. Bản nháp riêng theo phòng, tối đa 20 phòng × 2.000 ký tự, chỉ trong RAM và xóa khi đổi phiên/đăng xuất. | Hai phòng và tin hệ thống chưa đọc, số POST read/send, chuyển màn hình, local/sessionStorage và đăng xuất; chạy cả hai engine mobile. |
| Đăng xuất từ tab khác khi menu đang mở có thể để màn hình đăng nhập bị inert. | Đóng menu, gỡ inert/aria-hidden và xóa nội dung của phiên cũ trước khi dựng login. | Kiểm thử sự kiện storage khi menu mở; login hoạt động và không còn menu người trước. |
| Trên D1 local, một số thao tác báo lỗi 409 sau khi dữ liệu đã lưu, hoặc số bản ghi tăng gấp đôi do trigger cập nhật `payroll_epoch`. | Dùng `RETURNING` để nhận đúng hàng của thao tác chính. Sửa phản hồi chấm công, duyệt ca bổ sung, kết thúc giai đoạn làm việc, đối soát công, tạo lịch/nghỉ hàng loạt, preset/bán kính và số lượng dọn theo chính sách hiện có. | `d1-runtime-contract.test.mjs` chạy **handler thật bên trong workerd với D1/KV tạm**, không chỉ adapter SQLite. Xác minh dữ liệu đã lưu, số audit, gửi lại, phiên bản cũ, quyền và số lượng thực. |

“Cảnh báo công” là cảnh báo chấm công; “Thiết bị & thông báo” là quyền thiết bị/Web Push; “Tin nhắn” có thông báo toàn hệ thống. Nhãn được tách rõ để tránh mở nhầm.

## Điều hướng thường dùng

| Vai trò | Ba nút chính trên điện thoại | Màn hình mở đầu |
| --- | --- | --- |
| Nhân viên | Chấm công · Lịch làm việc · Yêu cầu công | Chấm công |
| Quản lý | Chấm công · Yêu cầu công · Báo cáo | Chấm công |
| Admin | Tổng quan · Yêu cầu công · Quản trị | Tổng quan |

Nút Thêm luôn chứa toàn bộ màn hình đã được cấp quyền, cùng thao tác tài khoản phù hợp. Admin tiếp tục không tự tạo đơn nghỉ/chấm công; quản lý tiếp tục không đọc lương hoặc quản trị. Bộ phận không được dùng làm quyền. Menu chỉ sắp xếp lối vào, không thay kiểm tra quyền trên máy chủ.

## Lỗi phản hồi D1

Trên runtime local, `UPDATE branches ... RETURNING id` có thể trả một hàng nhưng `meta.changes` là 2: trigger tăng phiên bản lương cũng là một thay đổi. So sánh `meta.changes === 1` vì thế không chứng minh thao tác chính thành công/thất bại. SQLite adapter Node dùng trực tiếp `changes`, nên bộ test cũ không phát hiện sự khác biệt này.

Ví dụ trước sửa: tạo hai ca báo bốn; một đơn nghỉ báo hai; kết thúc giai đoạn và đối soát 0,5 công trả 409 nhưng giá trị đã lưu. Sau sửa phản hồi tương ứng là 2, 1, 200 và 201. Duyệt ca bổ sung từng trả 409 trong khi trạng thái đã là REJECTED; nay trả 200. Chi tiết đã bỏ mã ngẫu nhiên nằm trong [evidence/d1-trigger-responses-local.json](evidence/d1-trigger-responses-local.json).

Các điều kiện WHERE về phiên, chủ sở hữu, phạm vi cửa hàng, trạng thái PENDING và phiên bản dữ liệu vẫn giữ nguyên. Quy tắc tính giờ/công/lương, dữ liệu chấm công gốc và bản chốt không thay đổi. Lượt ghi mới trả 201, replay chấm công đã xác minh trả 200; gửi lại quyết định đã xử lý hoặc đối soát phiên bản cũ tiếp tục bị từ chối. Chính sách/lịch chạy dọn dữ liệu không đổi.

## Cách kiểm tra

```sh
npm ci
npm test
npm run check:runtime
npx playwright install --with-deps chromium webkit
npm run test:browser
npm run test:mobile
```

- 154 test logic/tích hợp, gồm 9 test cha/con với D1 runtime thật trên máy local.
- 47 test trình duyệt cho tài khoản, phân ca, chấm công, GPS/ảnh, đơn/duyệt, xuất báo cáo/Excel/in, CV, lương và phục hồi mạng.
- 12 test mobile: WebKit theo cấu hình iPhone và Chromium theo Android; menu và toàn bộ 30 tổ hợp vai trò/màn hình, chat/bản nháp, hộp thoại. Các test responsive sẵn có thêm 320/360/390/430, tablet 768/820 và desktop 1024/1440/1920 px.
- D1/KV chỉ dùng dữ liệu giả và cơ sở dữ liệu tạm trong các kiểm thử này. Worker test nằm trong `cloudflare/tests/helpers/`, không được sao chép sang `dist/` hay deploy.

## Phần chưa đo hoặc cần nghiệm thu thực tế

Các phép kiểm tra trên là tự động/local. Chưa xác minh trên iPhone/Android/tablet vật lý: camera trước/sau, GPS ngoài thực địa, bàn phím hệ thống che form/composer, Safari/PWA, nhận Push thật, pin/nhiệt và thiết bị ít RAM chạy nhiều giờ. Chưa thử bằng VoiceOver/TalkBack thật; kiểm tra focus/role/keyboard không thay thế nghiệm thu trình đọc màn hình. Chưa đo tốc độ D1 production, mạng di động kéo dài hoặc tính đúng của dữ liệu nhân sự thực tế.

Không kết luận mọi nghiệp vụ đã được nghiệm thu chỉ từ việc mở đủ màn hình. Các luồng ghi/xuất chính có test ở trên; chức năng cũ giữ bảo vệ hiện có và cần chủ nghiệp vụ đối soát theo dữ liệu thật trước phát hành. Không chạy migration D1 production, không bật dọn dữ liệu/cron và không thay chi phí dịch vụ. Ảnh vẫn tối đa 200 KB, TTL tối đa 90 ngày, ngân sách 900 MB.

Phần tối ưu sáu nhóm và phép đo JS/query plan tiếp tục ở [performance-mobile-d1.md](performance-mobile-d1.md).
