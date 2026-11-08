# 🚀 Garena Automation Bridge - MV3 Extension Architecture

## 📝 Giới thiệu (Overview)
Đây là một dự án cá nhân nhằm mục đích **nghiên cứu và học tập** về kiến trúc **Chrome Extension (Manifest V3)** và kỹ thuật **Web Automation (DOM Manipulation)**. 

Dự án mô phỏng quy trình tự động hóa đăng ký tài khoản, xử lý OTP qua API email tạm thời, và vượt qua các rào cản DOM của Single Page Application (React/Vue).

> ⚠️ **Tuyên bố miễn trừ trách nhiệm:** Dự án này chỉ dành cho mục đích học tập (Educational Purposes) và làm Portfolio. Tác giả không khuyến khích sử dụng để vi phạm Điều khoản Dịch vụ của bất kỳ nền tảng nào.

## 🏆 Điểm nổi bật về Kỹ thuật (Technical Highlights)
Dự án đã trải qua 9 phiên bản Audit liên tục để tối ưu hóa kiến trúc, giải quyết các bài toán khó của lập trình Web hiện đại:

1. **MV3 Service Worker Lifecycle Management:**
   - Xử lý triệt để lỗi "Service Worker bị kill sau 30s" bằng cơ chế Keep-Alive Ping (`chrome.runtime.getPlatformInfo`).
   - Hydration state từ `chrome.storage.local` để chống mất dữ liệu khi Worker khởi động lại.

2. **Advanced DOM Manipulation (React/Vue Bypassing):**
   - Áp dụng `nativeInputValueSetter` để vượt qua cơ chế kiểm soát dữ liệu (Data Binding) của React.
   - Sử dụng `MutationObserver` thay vì `setTimeout` để bắt sự kiện DOM render (SPA Hydration) và theo dõi trạng thái CAPTCHA.

3. **Xử lý Bất đồng bộ & Race Conditions:**
   - Chống Race Condition trong quá trình chờ chuyển trang (Tab Navigation) bằng cờ `isResolved`.
   - Quản lý Log Buffer bằng mảng (Array) kết hợp Promise để tránh mất mát dữ liệu.

4. **Iframe Piercing & Performance:**
   - Sử dụng `allFrames: true` để xuyên thủng Iframe.
   - Áp dụng "Early-Exit Guard" (`innerHTML.length < 100`) để bỏ qua các frame rác, tăng tốc độ tool.

## 🛠️ Hướng dẫn cài đặt (Installation)
1. Clone repository này về máy:
   \`\`\`bash
   git clone https://github.com/your-username/Garena-Automation-Bridge.git
   \`\`\`
2. Mở trình duyệt Chrome/Edge, truy cập: `chrome://extensions/`
3. Bật **"Developer mode"** (Chế độ dành cho nhà phát triển) ở góc trên bên phải.
4. Bấm **"Load unpacked"** (Tải tiện ích đã giải nén).
5. Chọn thư mục \`v2.9-final-production\` trong mã nguồn vừa clone.
6. Mở Extension và bấm **"Start Persistent Flow"**.

---
*Developed with ❤️ by [Tên Của Bạn]*
