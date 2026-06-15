# NQ-Assistant

> 跨平台 AI 对话内容提取与导出工具 · 浏览器扩展

一键捕获 DeepSeek / ChatGPT / Claude / Kimi / 豆包 的 AI 回复，Markdown 编辑预览，导出为 Word 文档。

## 🚀 功能

| 功能 | 说明 |
|------|------|
| 📋 **一键捕获** | AI 回复下方自动注入「预览」按钮，点击即提取 |
| ✏️ **Markdown 编辑** | 内置编辑器，实时修改内容 |
| 📄 **Word 导出** | HTML-DOC 格式，WPS/Word 完美兼容 |
| 📦 **合并导出** | 多选消息合并为一份文档 |
| 🎨 **4 套模板** | 学术报告 / 技术文档 / 会议纪要 / 自定义 |
| 📑 **自动目录** | 根据标题自动生成 TOC |
| 💾 **持久化存储** | 关闭侧栏不丢失，下次打开继续编辑 |
| 🔄 **拖拽排序** | 自由调整消息顺序 |
| 🌐 **多平台** | DeepSeek / ChatGPT / Claude / Kimi / 豆包 |
| 🔢 **引用清理** | 自动去除 AI 搜索引用编号和网页链接 |
| 🌓 **双主题** | 亮色 / 暗色 |

## 📥 安装

### Edge 浏览器
1. 下载本项目 ZIP 并解压
2. 打开 `edge://extensions`
3. 开启**开发人员模式**
4. 点击**加载解压缩的扩展** → 选择项目文件夹

### Chrome 浏览器
1. 打开 `chrome://extensions`
2. 开启**开发者模式**
3. 点击**加载已解压的扩展程序**

## 🎯 使用

1. 打开支持的 AI 平台，正常对话
2. 每条 AI 回复下方出现 **📋 预览** 按钮
3. 点击按钮 → 内容出现在侧边栏
4. 编辑、排序、选择模板 → 导出 Word

快捷键：`Ctrl+E` 导出 Word

## 🛠️ 项目结构

```
├── manifest.json          # 扩展配置 (Manifest V3)
├── background.js          # Service Worker + 持久化存储
├── content.js             # 多平台 DOM 提取 + 按钮注入
├── sidepanel/             # 侧边栏 UI
│   ├── sidepanel.html
│   ├── sidepanel.js       # Markdown 渲染 + 导出逻辑
│   └── sidepanel.css
├── lib/                   # 第三方库
│   ├── markdown-it.min.js # Markdown 渲染器
│   ├── highlight.min.js   # 代码语法高亮
│   └── ...
└── icons/                 # 扩展图标
```

## 📄 License

MIT
