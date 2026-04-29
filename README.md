# 对话日记 PWA

一个自用的聊天式日记 PWA。代码是纯静态文件，适合直接发布到 GitHub Pages；日记内容保存在浏览器本地 IndexedDB，不上传服务器。

## 本地预览

在当前目录启动任意静态文件服务器，然后打开 `index.html`。例如：

```powershell
python -m http.server 8080
```

## iPhone 使用

1. 发布到 GitHub Pages。
2. 用 iPhone Safari 打开发布后的 HTTPS 地址。
3. 点 Safari 分享按钮，选择“添加到主屏幕”。

## 备份

在“备份”页导出 JSON 文件。导入备份会替换当前本机数据。
