# BABY MARK — ký chính chủ miễn phí
## Android: tạo một khóa duy nhất trên máy của chủ dự án
Không tải keystore trên Internet, không tạo khóa trong CI, không gửi mật khẩu hoặc khóa riêng vào GitHub/chat. Dùng JDK 17 keytool, Android SDK 36, build-tools 36.0.0 và Gradle 8.13. Tạo thư mục riêng được mã hóa bên ngoài repository, sau đó chạy lệnh sau tại thư mục đó (chỉ một lần, không ghi đè khóa cũ):
```sh
keytool -genkeypair -v -keystore babymark-release.p12 -storetype PKCS12 -alias babymark -keyalg RSA -keysize 3072 -validity 10000
```
Keytool hỏi mật khẩu và thông tin chứng chỉ; không đưa mật khẩu vào lệnh. Sao lưu khóa và mật khẩu riêng biệt, giữ bản sao mã hóa. Cùng applicationId và khóa ký cho các lần cập nhật; versionCode phải tăng. Debug APK đã ký bằng khóa khác có thể phải gỡ trước khi cài, sẽ mất dữ liệu/phiên lưu trên máy.
Từ Git Bash (Windows) hoặc Bash trên macOS/Linux tại thư mục repo, sau khi cài SDK/JDK/Gradle:
```sh
bash apps/native/sign-android.sh "/path/outside/repo/babymark-release.p12" babymark "/path/outside/repo/BABY-MARK-v1.2.4.apk"
```
Lệnh build release không ký, căn chỉnh ZIP, ký với keystore qua prompt, xác minh chữ ký và chỉ tạo output mới. Không lưu password trong Gradle, env hay CI. Hoặc dùng Android Studio Generate Signed Bundle/APK. Không phát hành APK debug cho nhân viên. Kiểm thử trên thiết bị vật lý trước phân phối. Android developer verification/installation policies may apply depending on device/region; a self-signed APK is not a guarantee of unrestricted distribution.
## iOS: Personal Team
Trên máy Mac có Xcode và iPhone, dùng Apple Account chính chủ miễn phí. Tại repo chạy bash apps/native/prepare-assets.sh ios, mở apps/native/ios/BABYMARK.xcodeproj, Signing & Capabilities > Automatically manage signing > Personal Team. Bundle ID com.infinitimoney.babymark phải khả dụng; nếu Apple không cho đăng ký, chọn ID riêng của chủ tài khoản cho bản thử nghiệm. Kết nối iPhone, chọn thiết bị, bật Developer Mode nếu được yêu cầu, Product > Run. Provisioning miễn phí hết hạn sau 7 ngày; ký/chạy lại. Không cam kết xuất IPA phân phối từ Personal Team, không có Ad Hoc/TestFlight/App Store miễn phí theo cách này. CI unsigned .app ZIP không cài trực tiếp. Không yêu cầu mật khẩu Apple, p12, profile hoặc bypass chữ ký.
## PWA
Safari > https://babymark.pages.dev/ > Share > Add to Home Screen (Thêm vào màn hình chính). Không cần ký IPA hay Apple Developer Program. Android Chrome cũng có thể cài PWA nếu được trình duyệt hỗ trợ. Giữ nguyên production và manifest.
## Tài liệu chính chủ
- https://developer.android.com/studio/publish/app-signing
- https://developer.android.com/build/building-cmdline
- https://developer.apple.com/help/account/basics/about-your-developer-account/
- https://developer.apple.com/help/account/membership/programs-overview
## Phạm vi kiểm thử
Không tạo khóa thật hoặc IPA đã ký trong repository/CI. Kiểm thử build native và camera/GPS/session thực tế là điều kiện trước phát hành. APK release do chủ khóa ký; iOS miễn phí chỉ thử trên thiết bị cá nhân.
