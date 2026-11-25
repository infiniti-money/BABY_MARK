# BABY MARK v1.2.0 — HR Management
Hệ thống quản lý nhân sự nội bộ cho chuỗi cửa hàng. Nền tảng đang hoạt động: `public/` + `functions/` trên **Cloudflare Pages + D1 + KV**. Không sử dụng API trả phí mới, không tự nâng cấp gói. Các thư mục Next.js/Expo/Supabase cũ chỉ là nguồn lịch sử, không nằm trong build Pages.

**Phiên bản mã nguồn:** v1.2.0. [Ghi chú phát hành và phạm vi nghiệm thu](docs/releases/v1.2.0.md). GitHub Release chỉ được công bố sau kiểm thử commit phát hành.

**Production:** https://babymark.pages.dev/  
**Lịch sử:** [v1.1.0](docs/releases/v1.1.0.md) · [v1.2.0 RC](docs/releases/v1.2.0-rc.md).

## Chức năng chính
- Quản trị theo vai trò, 14 cửa hàng, 50 nhân viên/quản lý hoạt động, tài khoản và phiên đăng nhập.
- Lịch ca cố định, đổi ca thứ Hai, tạo lịch tự động trước 14 ngày sau khi cấu hình.
- Chấm công Timemark trực tiếp, GPS, camera trước/sau, xác nhận ảnh, lưu riêng tư.
- Nghỉ phép, điều chỉnh công, thay ca, bàn giao, duyệt theo quyền.
- Báo cáo CSV, lương dự kiến theo giờ, bản chốt tháng bất biến.
- Thông báo đi muộn và Web Push (cần thiết lập).

## Kiểm thử và DEMO
Node >=22.13:
```sh
npm ci
npm run demo
```
Mở http://127.0.0.1:8788, dùng mã ngẫu nhiên xuất hiện ở Terminal. D1/KV local tạm thời, không kết nối production. [Hướng dẫn DEMO](docs/demo-testing.md).

```sh
npm test
npm run check:runtime
npx playwright install chromium webkit
npm run test:browser
npm run test:mobile
```

## Vận hành
- [Quản trị và camera](docs/admin-camera-upgrade.md) · [Giao diện](docs/workspace-redesign.md)
- [Lịch tự động / nghỉ / công và lương](docs/hr-phase-one.md) · [Ca cố định](docs/fixed-rosters.md)
- [Tài khoản](docs/internal-auth.md) · [Ghi nhớ phiên](docs/remember-device.md) · [Timemark](docs/timemark.md)
- [Cloudflare](docs/cloudflare-operations.md) · [Lưu trữ](docs/cloudflare-storage.md)
- [Migration D1](cloudflare/d1/) — chỉ áp dụng migration còn thiếu, không tự chạy trên production.
- [Lỗi còn tồn tại / phạm vi xác minh](docs/releases/v1.1.0.md).
- [Tối ưu D1, báo cáo và mobile: bằng chứng, kiểm thử, giới hạn](docs/performance-mobile-d1.md).
- [Rà soát giao diện và nghiệp vụ mobile: lỗi đã sửa, điều hướng và phạm vi kiểm thử](docs/mobile-workflow-audit.md).

Ảnh tối đa 200 KB, KV TTL tối đa 90 ngày cho ảnh mới theo ngân sách ảnh 900 MB, có thể hết hạn sớm; ảnh cũ giữ hạn đã cấp. Chính sách dọn bảng công và dọn dung lượng do Admin kiểm soát; không tự kích hoạt trong release. Ảnh và GPS client không chứng minh tuyệt đối sự hiện diện. Giờ máy chủ ghi nhận khi lưu; dấu giờ được cấp trước tối đa 90 giây.
