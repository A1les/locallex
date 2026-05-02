# LocalLex

LocalLex 是一个中文界面的 Chrome Manifest V3 离线英汉查词插件。它面向网页阅读场景：双击单词直接查词，划选文本先显示轻量 LocalLex 图标按钮，点击 Chrome 右上角插件图标或使用快捷键可打开插件界面手动查词。

## 普通用户安装

推荐下载 GitHub Releases 中的 `locallex-版本号.zip`，不要直接下载 GitHub 自动生成的 Source code zip。

1. 下载 `locallex-0.4.2.zip`
2. 解压 zip
3. 打开 Chrome，进入 `chrome://extensions`
4. 开启右上角 Developer Mode
5. 点击 Load unpacked
6. 选择解压后的 LocalLex 文件夹，也就是包含 `manifest.json` 的目录
7. 固定 Chrome 右上角 LocalLex 图标，即可使用

如果你是开发者，也可以 clone 仓库后直接通过 Load unpacked 加载项目根目录。

## 功能

- 完全离线英汉查词，不调用在线翻译、AI API 或远程脚本
- 双击网页英文单词，在文本附近显示 Shadow DOM 浮层
- 划选英文单词或短语，先显示 LocalLex 图标按钮，再点击显示释义
- 点击 Chrome 右上角 LocalLex 图标打开插件界面直接查词
- `Alt+B` 打开插件界面
- 支持 1-5 个英文 token 的短语，例如 `come on`
- 支持 ECDICT forms 词形映射和基础规则还原，例如 `moving -> move`
- 词性分组展示 `n.`、`v.`、`adj.`、`adv.` 等释义
- 展示英文解释和真实离线例句，可在设置页关闭例句
- 生词本收藏
- 本地查询统计、最近查询、查询排行、CSV 导出
- 浅色、暗黑、跟随系统三种主题
- IndexedDB 本地存储词库、例句、生词本、统计和设置
- 设置页内置 README 文档页，便于离线查看词库格式和数据来源

## 开发安装

1. 打开 `chrome://extensions`
2. 开启 Developer Mode
3. 点击 Load unpacked
4. 选择本项目目录 `offline-ec-dict`
5. 如果插件已加载过，请点击扩展卡片上的 Reload，并刷新已经打开的网页

## 使用

- 双击英文单词，例如 `move`
- 划选英文单词或短语，例如 `come on`，点击出现的 LocalLex 图标按钮
- 点击 Chrome 右上角 LocalLex 图标，在插件界面输入单词或短语
- 按 `Alt+B` 打开插件界面
- 划选文本后也可以通过右键菜单 `LocalLex 查词` 查询

Chrome 不允许扩展直接修改全局快捷键。可在设置页点击“打开设置”，或手动打开 `chrome://extensions/shortcuts` 修改快捷键。

设置页的“词库管理”区域提供“内部 README”入口，插件离线运行时也可以查看词库格式、数据来源和开发命令。

## 离线与隐私

LocalLex 只读取扩展包内的本地 JSON 文件，并将数据保存到本机 IndexedDB。用户选中的文本、输入的单词、生词本和统计数据都留在本机，不会上传。

## 词典数据

内置主词库来自 [skywind3000/ECDICT](https://github.com/skywind3000/ECDICT)，由 `vendor/ecdict.csv` 构建为 `data/entries_*.json` 和 `data/forms.json`。构建脚本保留单词、音标、中文释义、英文解释、词性、标签、词频和词形变化等字段，并额外生成 `senses` 结构用于分行展示词性释义。

真实例句位于 `data/examples_0.json`，由 [Tatoeba](https://tatoeba.org/) 英中句对在构建阶段生成，每个词最多保留 1 条例句。没有真实句对的词不会显示例句区，不使用模板句或自动拼接句。Tatoeba 导出数据采用 CC BY 2.0 FR 许可。

相关数据源：

- ECDICT: https://github.com/skywind3000/ECDICT
- Tatoeba downloads: https://tatoeba.org/gos/downloads
- Tatoeba per-language exports: https://downloads.tatoeba.org/exports/per_language/

## 自定义词库格式

设置页支持导入 JSON 词库，不支持直接导入 CSV。CSV 需要先转换为下面的 JSON 结构。

最简单格式是词条数组：

```json
[
  {
    "word": "hello",
    "phonetic": "həˈləʊ",
    "translation": "int. 你好",
    "definition": "used as a greeting"
  }
]
```

完整格式是包含 `version`、`name`、`entries`、`forms`、`examples` 的对象：

```json
{
  "version": "custom-1",
  "name": "My Dictionary",
  "entries": [
    {
      "word": "study",
      "phonetic": "ˈstʌdi",
      "translation": "n. 学习；研究；v. 学习；研究",
      "definition": "the activity of learning or gaining knowledge",
      "senses": [
        {
          "pos": "n.",
          "translation": "学习；研究",
          "definition": "the activity of learning or gaining knowledge"
        },
        {
          "pos": "v.",
          "translation": "学习；研究",
          "definition": ""
        }
      ]
    }
  ],
  "forms": [
    {
      "form": "studies",
      "base": "study"
    }
  ],
  "examples": [
    {
      "key": "study",
      "examples": [
        {
          "en": "She studies English every morning.",
          "zh": "她每天早上学习英语。",
          "source": "custom"
        }
      ]
    }
  ]
}
```

字段说明：

- `entries` 必填。每个词条至少需要 `word`，建议同时提供 `phonetic`、`translation`、`definition`。
- `senses` 可选。存在时优先用于展示词性释义；不存在时 LocalLex 会从 `translation` 和 `definition` 尝试解析。
- `forms` 可选。格式为 `{ "form": "studies", "base": "study" }`，用于词形还原。
- `examples` 可选。格式为 `{ "key": "study", "examples": [{ "en": "...", "zh": "...", "source": "..." }] }`，每个 key 只保留第一条例句。
- `version` 和 `name` 可选，但建议提供，便于设置页显示来源和版本。

## 数据导出

设置页支持导出本地数据：

- 生词本 CSV：`locallex-favorites.csv`，字段为 `word,createdAt,lastReviewedAt,note,phonetic,translation,definition`。
- 查询统计 CSV：`locallex-lookup-stats.csv`，字段为 `word,count,firstLookupAt,lastLookupAt,sources`。
- `sources` 是本地查询入口统计，例如 `popup`、`page`、`contextMenu`。

## 开发命令

```bash
npm install
npm run check
npm run download:dict
npm run download:examples
npm run build:dict
npm run build:examples
npm run update:dict
npm run package
npm run clean:data
```

源码无需前端构建即可被 Chrome 直接加载。`build:dict` 只把 ECDICT CSV 转换为扩展使用的 JSON 分片；`download:examples` 下载 Tatoeba 英中语料；`build:examples` 只从真实句对生成本地例句；`package` 生成可发布到 GitHub Releases 的 `dist/locallex-版本号.zip`。

## 验收建议

- `move`、`what`、`study`、`computer` 可以查询
- `moving -> move`、`studies -> study` 可以查询
- `come on` 可以作为短语查询
- 未找到词条时显示 `未找到释义`
- 收藏后刷新 popup/options 仍保留
- 同一词多次查询后统计次数递增
- 清空统计不删除词库和生词本
- 断网后仍可查词
