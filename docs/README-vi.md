# TDK CLI — khởi chạy dịch vụ trên máy của bạn

[English](../README.md) · Tiếng Việt · [Các ngôn ngữ khác](../README.md#readme-languages)

### Đừng để AI tự bịa ra hạ tầng cục bộ của bạn.

LLM viết logic ứng dụng rất giỏi, nhưng lại kém trong việc duy trì hạ tầng cục bộ. Mỗi khi AI viết lại `Dockerfile`, cấu hình sai `Tiltfile` hoặc làm hỏng `nginx.conf`, bạn mất thời gian tập trung và tiêu tốn token API không cần thiết.

**TDK CLI Core** thu hẹp khoảng cách đó. Bạn viết logic ứng dụng web, còn TDK tự động nhận diện stack và tạo, liên kết, điều phối môi trường cục bộ cho bạn.

Cài đặt:

```bash
npm install -g @tdk-landscape/tdk-cli-core
```

Bắt đầu nhanh:

```bash
mkdir shop && cd shop
tdk project --yes
tdk resource orders-api --type backend --stack shop --yes
tdk up shop
```

Xem [README tiếng Anh](../README.md) để biết yêu cầu hệ thống, giấy phép và cách khắc phục sự cố. Tài liệu có tại [trang web TDK](https://tdk-landscape.github.io/tdk-website/).
