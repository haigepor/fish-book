<div align="center">
  <img src="public/images/logo.png" alt="fish-book" width="96" height="96">
  <h1>fish-book</h1>
  <p>把故事放在桌面一角：轻量、离线、可定制的 Windows 悬浮阅读器。</p>
</div>

[项目特色](#项目特色) · [安装与启动](#安装与启动) · [第一次阅读](#第一次阅读) · [快捷键](#阅读器交互) · [常见问题](#常见问题)

fish-book 将本地书架与一块可移动、可缩放的悬浮阅读窗口结合起来。导入自己的小说后，你可以调整文字与背景透明度，用快捷键翻页，或让阅读器只在指定应用处于前台时显示。

书籍正文、阅读进度、书签和偏好均保存在本机，不上传到远程服务。界面使用 React、Vite、Tailwind CSS 与 shadcn/ui，桌面能力由 Electron 提供。

## 项目特色

| 特色 | 使用体验 |
| --- | --- |
| 轻量悬浮窗口 | 默认 `560 × 110 px`，最小可缩放至 `100 × 100 px`；拖动位置后继续阅读。 |
| 跟随指定应用 | 绑定整个应用或单个窗口，切到其他应用时自动隐藏，返回时恢复且不抢输入焦点。 |
| 独立阅读外观 | 单独设置配色、背景与文字透明度、模糊和圆角；Windows 11 使用 Acrylic，其他环境回退到 CSS 霜化效果。 |
| 自适应排版 | 调整窗口、字号或行高后重新计算当前页容量，保留阅读位置。 |
| 纯本地书架 | 批量导入、搜索、标签、备注、章节、书签和阅读进度管理。 |
| 键盘与清屏 | 自定义全局快捷键；清屏后隐藏操作按钮，用快捷键或 `Esc` 恢复。 |

主界面支持亮色、暗黑和跟随系统。项目也提供浏览器预览，便于调试界面与导入、阅读交互；系统窗口绑定等能力需要 Windows 桌面端。

## 安装与启动

当前仓库没有发布 Release 安装包，请从源码运行，或自行构建 Windows 安装包。

### 环境要求

| 工具 | 要求 |
| --- | --- |
| 操作系统 | Windows 10 或 Windows 11 |
| Node.js | `>=24.14.0 <25`，与 `package.json` 的 `engines` 保持一致 |
| 包管理器 | Yarn Classic `1.22.x` |
| Git | 用于克隆和更新源码 |

Electron 由项目依赖安装，无需单独全局安装。开始前可运行 `node --version` 和 `yarn --version` 检查环境。

### 从源码启动桌面版

在 PowerShell 中运行：

```powershell
git clone https://github.com/haigepor/fish-book.git
cd fish-book
yarn install --frozen-lockfile
yarn electron:dev
```

启动命令会同时运行 Vite 和 Electron，并打开桌面主界面。开发服务使用 `127.0.0.1:5173`，请确保该端口空闲；在终端按 `Ctrl+C` 停止开发服务。

### 仅预览网页界面

安装依赖后运行：

```powershell
yarn web:dev
```

访问 <http://127.0.0.1:5173/>。浏览器书籍保存在 IndexedDB，偏好保存在 localStorage，与桌面书库完全隔离。浏览器浮层只在页面内显示，快捷键也只在页面获得焦点时生效。

### 构建 Windows 安装包

在 Windows 上安装依赖后运行：

```powershell
yarn electron:build
```

该命令先构建前端，再由 electron-builder 打包，产物保存在 `release/`。`yarn build` 只生成 `app-dist/`，不会生成安装包。

## 第一次阅读

1. 在“我的书架”点击“导入书籍”，选择 TXT、EPUB、HTML/HTM 或 FB2 文件，可一次导入多本。
2. 在书籍卡片点击“打开阅读”；再次进入时可使用“继续阅读”。
3. 打开“阅读偏好”，分别设置“外观”“文字排版”“悬浮窗口”和“快捷键”，修改会自动保存。
4. 拖动阅读窗口到合适位置，用 `Alt+Z` / `Alt+C` 翻页；在阅读器中打开章节目录或添加书签。
5. 如需只在某个应用中显示，按下文设置“跟随指定应用”。

单个文件最大 32 MB。所有支持格式均转换为纯文字阅读，具体限制见[支持的书籍格式](#支持的书籍格式)。

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

### 跟随指定应用

在“阅读偏好 → 悬浮窗口 → 跟随指定应用”中，刷新并选择已打开的窗口，再选择绑定范围：

- 整个应用：按程序完整路径识别，多个窗口均生效，目标应用重启后仍可使用。
- 单个窗口：只在选定窗口处于前台时显示；窗口关闭或身份失效后需要重新绑定。

切到其他应用、目标窗口最小化或关闭时，阅读器自动隐藏；返回有效目标后自动显示且不抢输入焦点。点击阅读器操作按钮不会让它反复显隐。手动隐藏优先于自动显示，并与绑定规则一起保存在本机，重启 fish-book 后继续有效。点击“恢复显示”或使用显示/隐藏快捷键可重新开启；“解除绑定”恢复普通阅读模式，并保留手动隐藏状态。

此功能仅支持 Windows 桌面端。它通过常驻的 Windows PowerShell 辅助进程监听窗口事件；系统禁用 PowerShell 或无法读取目标进程时，会保持隐藏并提示重试。浏览器内不同标签页视为同一个应用，不能单独绑定网页。

## 支持的书籍格式

| 格式 | 解析方式 |
| --- | --- |
| TXT | 识别 UTF-8、UTF-16 与 GB18030，并匹配常见章节标题 |
| EPUB | 按 OPF `spine` 顺序读取正文，支持 EPUB 3 导航和 EPUB 2 NCX 目录 |
| HTML / HTM | 提取标题与正文段落，过滤脚本、样式及嵌入资源 |
| FB2 | 读取 XML 元数据、正文和嵌套章节标题，忽略二进制图片与独立注释正文 |

所有格式都会转换为纯文字阅读，不保留复杂排版、封面和插图。单个文件最大 32 MB；暂不支持加密 EPUB、PDF、DOCX、MOBI 和 AZW3。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `yarn electron:dev` | 同时启动 Vite 和 Electron |
| `yarn web:dev` | 仅启动浏览器调试页面 |
| `yarn lint` | 检查 React、Electron 和测试代码 |
| `yarn test` | 运行 Node.js 回归测试 |
| `yarn test:desktop` | Windows 真实窗口、IPC、设置界面和重启记忆集成测试（先运行 `yarn build`） |
| `yarn build` | 构建前端资源到 `app-dist/` |
| `yarn electron:build` | 构建 Windows 安装包到 `release/` |

`app-dist/`、`release/`、浏览器测试截图和其他构建目录均为可再生成产物，不提交到 Git。

## 本地数据

- 桌面书库默认位于“文档/fish-book/books”，也可以在应用中选择其他目录。
- 阅读位置、窗口尺寸、窗口位置、书签和偏好通过 `electron-store` 保存在本机。
- 浏览器调试数据与桌面数据相互独立；清除站点数据会移除浏览器书库。
- 应用不会加载 HTML 书籍中的远程脚本或外部资源。

## 常见问题

| 问题 | 处理方式 |
| --- | --- |
| 依赖安装提示 Node.js 版本不匹配 | 切换到上文要求的 Node.js 24 版本，再安装依赖。 |
| Vite 提示端口被占用 | 先停止占用 `5173` 的旧开发服务，再运行启动命令。 |
| 找不到阅读窗口 | 在“阅读偏好 → 悬浮窗口”点击“找回阅读窗口”；绑定模式下也要检查目标应用是否在前台。 |
| 切回目标应用后仍不显示 | 手动隐藏优先于自动显示，点击“恢复显示”或使用显示/隐藏快捷键；单窗口绑定失效时重新选择窗口。 |
| 清屏后找不到按钮 | 按 `Alt+Q`，或在阅读器聚焦时按 `Esc`；也可在“阅读偏好 → 快捷键”恢复普通阅读模式。 |
| 快捷键未生效 | 检查重复配置和系统占用；浏览器预览需要页面获得焦点。 |
| 导入后没有图片或原始排版 | 当前阅读器只保留纯文字；加密 EPUB、PDF、DOCX、MOBI、AZW3 暂不支持。 |

如果 Electron 或打包工具下载较慢，可按需配置镜像后重新安装依赖。以下设置会影响当前用户的 Yarn 配置：

```powershell
yarn config set registry https://registry.npmmirror.com
yarn config set electron_mirror https://npmmirror.com/mirrors/electron/
yarn config set electron_builder_binaries_mirror https://npmmirror.com/mirrors/electron-builder-binaries/
```

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
