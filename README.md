# Luke Teleprompter

中文 / English 智能提词器。推荐直接在 Google Chrome 中使用；网页版通过 Chrome 语音识别把结果与原稿做前向匹配，原稿不会被转写结果改写。原来的 macOS Tauri/Whisper 版本仍保留在项目中。

## 功能

- 自动跟读：允许漏读或跳句后向前追赶，不会自动倒退
- 麦克风测试：显示输入电平、是否检测到说话以及实时转写文本
- 匀速滚动：`0.5×–2.0×`，`1.0×` 为每分钟 8 行
- 中英文安全换行：英文单词不会从中间切断
- 应用内编辑以及 UTF-8 TXT 打开/保存
- 字号、水平镜像、全屏、上一句/下一句与暂停控制
- 阅读位置可在屏幕高度的 `30%–70%` 间调整，并与其他设置一起自动保存
- 文稿和所有阅读设置自动保存在本机
- 网页版无需下载模型，麦克风权限由 Google Chrome 管理

## 在 Chrome 中使用（推荐）

```bash
cd /Users/huazhi_luke/luke-projects/luke-teleprompter
npm run web
```

浏览器打开 `http://127.0.0.1:1420` 后，点击“允许”授予 Google Chrome 麦克风权限。网页必须通过 `localhost`/`127.0.0.1` 或 HTTPS 打开，不能直接双击 `index.html`。

也可以在 Finder 中直接双击项目里的 `打开网页版.command`，它会启动服务并在 Google Chrome 中打开。

Chrome 语音识别可能使用 Google 的在线服务，因此网页版不承诺完全离线。文稿和阅读设置仍只保存在浏览器本机存储中。

## 在 iPad 上使用

正式网页地址：

<https://luke-teleprompter.pages.dev/>

1. 在 iPad 上用 Safari 打开上述 HTTPS 地址，并将 iPad 横屏。
2. 首次打开时允许 Safari 使用麦克风和语音识别。
3. 如果没有出现权限提示，点击一次“暂停”，再点击“继续”，以用户操作重新启动识别。
4. 如果仍无法转写，请在 iPad“设置”中启用 Siri 或“听写”，然后重新打开 Safari 页面。

建议直接保留在 Safari 普通标签页中使用。WebKit 的 `SpeechRecognition` 在添加到主屏幕后的独立 Web App 中仍可能不可用，因此暂不建议把它当作 PWA 启动。iPad 上的文稿、字号和阅读位置存储在 iPad Safari 本机，不会与 Mac 自动同步。

## 发布网页版

网页通过 Cloudflare Pages 发布。修改完成并通过测试后运行：

```bash
npm run deploy:web
```

该命令会先构建网页，再把 `dist` 上传到 `luke-teleprompter.pages.dev`。GitHub 仓库保持私有。

## 开发

要求：Node.js 22+、Rust stable、Xcode Command Line Tools、CMake。

```bash
npm install
npm run tauri dev
```

启动可实际使用麦克风和语音识别的网页版：

```bash
npm run web
```

## 测试与构建

```bash
npm test
npm run build
cd src-tauri && cargo test
cd .. && npm run tauri build
```

成品位于 `src-tauri/target/release/bundle/macos/` 和 `src-tauri/target/release/bundle/dmg/`。当前构建面向 Apple Silicon macOS 14+，采用本地 ad-hoc 签名，不包含 Apple 公证。

模型下载到：

```text
~/Library/Application Support/com.luke.teleprompter/models/ggml-base.bin
```

应用不会读取或修改 DaVinci Resolve、AutoSubs 或其他软件的模型文件。
