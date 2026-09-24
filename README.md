<div align="center">
  <img src="public/images/logo.png" alt="fish-book" width="96" height="96">
  <h1>fish-book</h1>
  <p>轻量、离线、可高度定制的桌面悬浮阅读器。</p>
</div>

## 项目介绍

fish-book 是一款面向 Windows 的本地小说阅读工具。它将书架管理、阅读偏好与一块可自由移动和缩放的轻量悬浮阅读器结合起来，让阅读窗口尽量融入当前桌面，而不是变成显眼的大型阅读应用。

本项目已使用 React、Vite、Tailwind CSS 与 shadcn/ui 重构界面，并保留 Electron 桌面能力。书籍正文、阅读进度、书签和偏好均保存在本机，不上传到远程服务。

## 主要功能

- 本地书架：批量导入、搜索、阅读状态、标签、备注、章节和书签管理。
- 多格式解析：支持 TXT、EPUB、HTML/HTM、FB2。
- 轻隐阅读器：默认 `560 × 110 px`，最小可缩放至 `100 × 100 px`。
- 半透明毛玻璃：Windows 11 使用系统 Acrylic，其他环境使用 CSS 霜化效果回退。
- 独立外观：阅读器配色、背景透明度、文字透明度、模糊强度和圆角不受主界面主题影响。
- 自适应排版：窗口尺寸、字号或行高变化后自动重新计算当前页容量。
- 阅读操作：上一页、下一页、章节目录、章节跳转、书签和阅读进度记忆。
- 清屏模式：隐藏所有操作按钮，通过快捷键或 `Esc` 恢复普通模式。
- 键盘操作：支持单键、方向键、功能键和组合键，并检测重复配置。
- 明暗主题：主界面支持亮色、暗黑和跟随系统。
- 浏览器调试：无需启动 Electron，也能预览界面、导入书籍和验证大部分交互。

## 阅读器交互

| 操作 | 默认方式 |
| --- | --- |
| 移动窗口 | 拖动顶部章节栏空白区域，或按住空格拖动正文 |
| 调整大小 | 拖动窗口边缘或四角 |
| 上一页 | `Alt+Z` |
| 下一页 | `Alt+C` |
| 显示或隐藏阅读器 | `Alt+V` |
| 退出清屏 | `Alt+Q`，阅读器聚焦时也可按 `Esc` |

快捷键可以在“阅读偏好 → 快捷键”中直接按键修改并自动保存。全局快捷键由 Electron 注册；浏览器预览中的快捷键仅在页面获得焦点时生效。

## 支持的书籍格式

| 格式 | 解析方式 |
| --- | --- |
| TXT | 识别 UTF-8、UTF-16 与 GB18030，并匹配常见章节标题 |
| EPUB | 按 OPF `spine` 顺序读取正文，支持 EPUB 3 导航和 EPUB 2 NCX 目录 |
| HTML / HTM | 提取标题与正文段落，过滤脚本、样式及嵌入资源 |
| FB2 | 读取 XML 元数据、正文和嵌套章节标题，忽略二进制图片与独立注释正文 |

所有格式都会转换为纯文字阅读，不保留复杂排版、封面和插图。单个文件最大 32 MB；暂不支持加密 EPUB、PDF、DOCX、MOBI 和 AZW3。

## 环境要求

- Windows 10 或 Windows 11
- Node.js `>=24.14.0 <25`
- Yarn Classic `1.22.x`
- Electron 25（项目依赖当前解析为 25.9.x）

### 国内镜像配置

```powershell
yarn config set registry https://registry.npmmirror.com
yarn config set electron_mirror https://npmmirror.com/mirrors/electron/
yarn config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

## 快速开始

```powershell
git clone https://github.com/haigepor/fish-book.git
cd fish-book
yarn
yarn electron:dev
```

如果只需要调试 React 页面：

```powershell
yarn web:dev
```

然后访问 <http://127.0.0.1:5173/>。浏览器书籍保存在 IndexedDB，偏好保存在 localStorage，与桌面书库完全隔离。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `yarn electron:dev` | 同时启动 Vite 和 Electron |
| `yarn web:dev` | 仅启动浏览器调试页面 |
| `yarn lint` | 检查 React、Electron 和测试代码 |
| `yarn test` | 运行 Node.js 回归测试 |
| `yarn build` | 构建前端资源到 `app-dist/` |
| `yarn electron:build` | 构建 Windows 安装包到 `release/` |

`app-dist/`、`release/`、浏览器测试截图和其他构建目录均为可再生成产物，不提交到 Git。

## 本地数据

- 桌面书库默认位于“文档/fish-book/books”，也可以在应用中选择其他目录。
- 阅读位置、窗口尺寸、窗口位置、书签和偏好通过 `electron-store` 保存在本机。
- 浏览器调试数据与桌面数据相互独立；清除站点数据会移除浏览器书库。
- 应用不会加载 HTML 书籍中的远程脚本或外部资源。

## 项目结构

```text
electron/      Electron 主进程、预加载桥接、书籍解析和窗口逻辑
src/           React 页面、阅读器、书架与 shadcn/ui 组件
tests/         解析器、分页、快捷键和窗口行为回归测试
books/         随应用打包的本地说明文档
public/        应用图标与静态资源
```

## 致谢

项目基于 [3529/fish-book](https://github.com/3529/fish-book) 继续开发，目前维护仓库为 [haigepor/fish-book](https://github.com/haigepor/fish-book)。
