# Luke Teleprompter

中文 / English 智能提词器。推荐直接在 Google Chrome 中使用；网页版通过 Chrome 语音识别把结果与原稿做前向匹配，原稿不会被转写结果改写。原来的 macOS Tauri/Whisper 版本仍保留在项目中。

## 功能

- 自动跟读：允许漏读或跳句后向前追赶，不会自动倒退
- 麦克风测试：显示输入电平、是否检测到说话以及实时转写文本
- 匀速滚动：`0.5×–2.0×`，`1.0×` 为每分钟 8 行
- 中英文安全换行：英文单词不会从中间切断
- 应用内编辑以及 UTF-8 TXT 打开/保存
- 字号、水平镜像、全屏、上一句/下一句与暂停控制
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
