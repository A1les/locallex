# LocalLex

LocalLex 是一款离线英汉查词 Chrome 插件，面向网页阅读场景设计。它支持双击查词、划词查词、插件界面输入查询、生词本和本地查询统计，所有查询都在本机完成。

## 安装

请从 [Releases](https://github.com/A1les/locallex/releases) 下载最新版本的 `locallex-版本号.zip`。

1. 解压 `locallex-版本号.zip`
2. 打开 Chrome，进入 `chrome://extensions`
3. 开启 Developer Mode
4. 点击 Load unpacked
5. 选择解压后的 LocalLex 文件夹，也就是包含 `manifest.json` 的目录

请下载 Releases 里的 `locallex-版本号.zip`，不要下载 GitHub 自动生成的 Source code zip。

## 使用

- 双击英文单词，直接显示查询界面
- 划选英文单词或短语，点击 LocalLex 图标按钮查词
- 点击 Chrome 右上角 LocalLex 图标，打开插件界面手动查询
- 按 `Alt+B` 打开插件界面
- 在查询结果中点击书签图标加入生词本

快捷键可在 `chrome://extensions/shortcuts` 中调整。

## 功能亮点

- 完全离线，不调用在线翻译、AI API 或远程脚本
- 支持单词、常见词形变化和 1-5 个英文 token 的短语
- 展示音标、中文释义、英文解释和真实离线例句
- 支持生词本、查询统计和 CSV 导出
- 支持浅色、暗黑和跟随系统主题
- 查询界面使用 Shadow DOM，减少网页样式干扰

## 隐私

LocalLex 不上传用户选中的文本、输入的单词、生词本或查询统计。词库、例句、设置和学习数据都保存在本机浏览器的 IndexedDB 中。

详见 [PRIVACY.md](./PRIVACY.md)。

## 数据来源

LocalLex 使用离线数据构建词库和例句：

- 主词库：[ECDICT](https://github.com/skywind3000/ECDICT)
- 英中例句：[Tatoeba](https://tatoeba.org/gos/downloads)

例句只使用真实英中句对。没有真实例句的词条不会显示例句区。

第三方数据说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

## 本地构建

仓库源码不包含完整生成词库。发布包中的 `data/` 已经预先构建好；如需重新生成离线数据，可使用以下命令：

```bash
npm install
npm run check
npm run download:dict
npm run download:examples
npm run build:dict
npm run build:examples
npm run package
```

生成的发布包位于 `dist/locallex-版本号.zip`。

## License

LocalLex 源码基于 [MIT License](./LICENSE) 开源。
