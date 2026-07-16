# Luke Teleprompter

中文 / English 智能提词器。网页在本机模式下会把 Chrome 捕获的麦克风 PCM 音频发送到 `127.0.0.1`，由 Rust + whisper.cpp / Metal 使用本机 Whisper base 模型完成转写；原稿不会被转写结果改写。原来的 macOS Tauri 版本仍保留在项目中。

## 功能

- 自动跟读：允许漏读或跳句后向前追赶，不会自动倒退
- 麦克风测试：显示输入电平、是否检测到说话以及实时转写文本
- 匀速滚动：`0.5×–2.0×`，`1.0×` 为每分钟 8 行
- 中英文安全换行：英文单词不会从中间切断
- 应用内编辑以及 UTF-8 TXT 打开/保存
- 动作提示：在文稿中输入 `//动作 1//`，正文位置会出现零宽插入标记，提示框显示在对应行上方，并且不参与语音跟读匹配
- 重点词：在文稿中输入 `**文本 1**`，文本会黄色高亮，并且照常参与语音跟读匹配
- 字号、水平镜像、全屏、第一句/上一句/下一句/最后一句与暂停控制
- 阅读位置可在屏幕高度的 `30%–70%` 间调整，并与其他设置一起自动保存
- 手机竖屏会显示横屏入口；手机横屏会切换为紧凑控制栏
- 文稿和所有阅读设置自动保存在本机
- 网页版本机模式复用已经下载的 Whisper base 模型，麦克风权限由 Google Chrome 管理

## 在 Chrome 中使用：本机 Whisper 模式

先启动本机转写服务，再启动网页：

```bash
cd /Users/huazhi_luke/luke-projects/luke-teleprompter
npm run whisper:web
```

另开一个终端窗口：

```bash
cd /Users/huazhi_luke/luke-projects/luke-teleprompter
npm run web
```

浏览器打开 `http://127.0.0.1:1420` 后，点击“允许”授予 Google Chrome 麦克风权限。网页必须通过 `localhost`/`127.0.0.1` 或 HTTPS 打开，不能直接双击 `index.html`。

`npm run whisper:web` 会复用：

```text
~/Library/Application Support/com.luke.teleprompter/models/ggml-base.bin
```

没有运行该服务时，网页会显示启动提示；音频不会发送到外网。此分支当前只面向同一台 Mac，本机服务仅监听 `127.0.0.1`，因此不会支持 iPad / 手机访问。

## 在 iPad 和手机上使用

正式网页地址（当前 `main` 的在线版本）：

<https://luke-teleprompter.pages.dev/>

1. 在 iPad 或手机上打开上述 HTTPS 地址。
2. 竖屏打开时点击“进入横屏”，或直接把设备旋转为横屏。
3. 首次打开时允许浏览器使用麦克风和语音识别。
4. 如果没有出现权限提示，点击一次“暂停”，再点击“继续”，以用户操作重新启动识别。
5. 如果仍无法转写，请在系统设置中启用 Siri、听写或浏览器麦克风权限，然后重新打开页面。

浏览器的横屏锁定能力不一致：Android Chrome 通常支持点击后进入全屏横屏；iPhone/iPad Safari 往往不允许网页强制旋转，只能显示提示并由用户手动横屏。

建议直接保留在 Safari 普通标签页中使用。WebKit 的 `SpeechRecognition` 在添加到主屏幕后的独立 Web App 中仍可能不可用，因此暂不建议把它当作 PWA 启动。移动设备上的文稿、字号和阅读位置存储在当前浏览器本机，不会与 Mac 自动同步。

## 发布网页版

网页通过 Cloudflare Pages 发布。修改完成并通过测试后运行：

```bash
npm run deploy:web
```

该命令会先构建网页，再把 `dist` 上传到 `luke-teleprompter.pages.dev`。GitHub 仓库保持私有。注意：本机 Whisper 分支当前不部署到正式站；它依赖同一台 Mac 上运行的 `npm run whisper:web`。

## 开发

要求：Node.js 22+、Rust stable、Xcode Command Line Tools、CMake。

```bash
npm install
npm run tauri dev
```

启动本机 Whisper 网页版：

```bash
npm run whisper:web
```

另开一个终端：

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
