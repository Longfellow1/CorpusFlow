# CorpusFlow 复赛 PPT 与录屏材料

## 0. 一小时交付优先级

1. **PPT 先给 ChatGPT 做设计**：把下面“ChatGPT PPT 设计提示词”和“10 页 PPT 大纲”一起发过去，让它先出视觉版式和逐页文案。
2. **录屏先求干净稳定**：优先录浏览器 Tab，不录整个桌面，避免出现 macOS 菜单栏、Dock、终端、密钥、个人账号。
3. **鼠标跟随不要过度折腾**：1 小时内优先用浏览器录屏 + cursor highlight/spotlight。真正的 camera follow / auto zoom 可作为增强路线，工具安装失败不阻塞交付。

## ChatGPT PPT 设计提示词

把以下内容直接复制给 ChatGPT：

```text
你是资深 B2B AI 基础设施产品路演设计师。请基于我提供的 CorpusFlow 复赛材料，设计一套 10 页 PPT。

目标：
- 面向 NEXTAI 复赛评委，5-8 分钟讲清楚产品价值、演示主线、技术方案和开源长期叙事。
- 不做营销官网风，不做夸张 AI 炫技风；要像成熟的数据工程 / EvalOps / AI Infra 工具。
- 核心叙事是：AI 应用上线后的失败证据，不应该停留在日志和表格里，而应该被转成下一轮训练与回归评测可用的数据资产。
- 复赛只是一个可验证切片：failure evidence -> root-cause hypothesis -> production strategy -> dataset asset package。

设计风格：
- 专业、克制、高密度但不拥挤。
- 主色建议：深色底 + 白/灰文字 + 少量红色表示失败证据 + 绿色表示数据资产 + 蓝色表示诊断/系统流程。
- 每页只保留一个主判断，不要堆大段文字。
- 可以使用架构图、流程图、生态位图、录屏截图、导出文件示意、飞轮图。
- 避免使用“全自动解决”“真实根因已证明”“替代所有 Eval 工具”这类过度承诺。

请输出：
1. 10 页逐页设计方案：标题、主视觉、布局、页面文案、讲稿要点。
2. 每页推荐截图/图示素材。
3. 统一视觉规范：颜色、字体层级、图标风格、图表样式。
4. 5 分钟演讲串词。
5. 最后一页如何把复赛切片上升到开源 Trace-to-Dataset Pipeline 的长期机会。

下面是材料：
```

## 10 页 PPT 大纲

| 页 | 标题 | 核心信息 | 建议画面 | 演讲要点 |
| --- | --- | --- | --- | --- |
| 1 | 让每一次 badcase 成为下一轮 AI 能力提升的数据资产 | CorpusFlow 不是 Prompt 工具，而是从失败证据到训练/评测资产的管道。 | 评测增强工作台全屏截图，标题使用“失败证据 -> 数据资产包”。 | 开场只讲一个问题：AI 应用上线后，失败如何进入下一轮改进。 |
| 2 | 企业 AI 应用真正卡住的是失败回流 | badcase、日志、评测表、用户反馈散落，人工读、归类、补 expected、写 eval points。 | 手工流程图：日志/反馈/评测结果 -> 人工整理 -> 表格/样本。 | 数据生产不是一次性生成，而是持续工程流程。 |
| 3 | 现有生态缺中间层 | Observability 记录失败，Eval Runner 运行评测，Labeling 做标注，Training 做训练；中间缺 failure evidence -> dataset asset。 | 生态位图：Langfuse/Phoenix、Promptfoo/DeepEval/Ragas、Label Studio、LLaMA-Factory，中间放 CorpusFlow。 | CorpusFlow 是 evals、observability、feedback、fine-tuning 之间的数据回流层，不替代它们。 |
| 4 | 复赛切片：证明闭环，而不是铺满平台 | 复赛只证明 badcase/eval failure -> 理解报告 -> 资产包。 | 四步主线：导入失败证据 -> 根因诊断 -> 生成预览 -> 下载资产包。 | 不做完整 Eval Runner、LLM Judge、CI Gate、训练平台。 |
| 5 | Demo 主线：4 个动作跑通闭环 | 进入评测增强；使用复赛样例或上传；查看材料理解和问题族；生成资产包。 | 录屏关键帧拼接。 | 评委只需要记住两个对象：输入是失败证据，输出是数据资产包。 |
| 6 | 系统先读懂证据，不要求用户整理模板 | 支持 CSV/XLSX/JSON，识别用户问题、实际回答、期望行为、上下文、评测结果、失败备注等证据角色。 | 左侧上传、指标、字段识别截图。 | 重点讲“系统适应用户材料”，不是让用户按固定模板上传。 |
| 7 | 从失败样本到可复核的根因假设 | 失败信号被聚成问题族，展示 badcase 分布、代表 case、根因假设、修复方向。 | Badcase 分布图、根因聚合卡、case drawer。 | 话术必须是“根因假设”，不是“真实根因已自动证明”。 |
| 8 | 输出不是文本，是资产包 | 资产包包含 training candidates、eval cases、negative cases、quality report、provenance。 | 资产包弹窗、下载文件、JSONL/provenance 示例。 | 工程属性：字段稳定、可追溯、可下载、可进入训练或回归评测流水线。 |
| 9 | 技术方案：契约稳定，算法可替换 | 稳定数据契约先跑通闭环，后续替换 Normalizer/Clusterer/Generator。 | 架构图：React -> Express API -> evaluationMode 契约 -> 文件资产。 | 当前价值是把状态机和数据契约跑通，避免被算法不稳定拖住。 |
| 10 | 开源方向：Trace-to-Dataset Pipeline | 长期做 AI 应用失败证据到数据资产的开源基础设施。 | 飞轮图：trace/eval failure/user feedback -> evidence pack -> dataset asset -> review/export -> next version。 | 收束句：评测不是终点，失败证据是模型持续变好的燃料。 |

## 录屏分镜

建议总时长 4 到 5 分钟，PPT 中可裁成 60 到 90 秒核心片段。

| 段落 | 时长 | 画面/操作 | 旁白要点 |
| --- | ---: | --- | --- |
| 1. 入口定位 | 15s | 首页展示三入口，点击“评测增强”。 | 这不是新的评测执行器，而是把 badcase 回流成数据资产的工作台。 |
| 2. 导入证据 | 25s | 评测增强空态，点击“使用复赛样例”；备选展示“上传失败证据”。 | 输入可以是评测失败、badcase 表、用户反馈；复赛用内置样例保证现场稳定。 |
| 3. 材料理解 | 35s | 左侧展示 source file、原始记录、候选 case、明确失败、安全拒识、字段识别。 | 系统先识别材料里每列承担什么证据角色。 |
| 4. 一句话结论 | 20s | 右侧顶部结论区域。 | 用户先看到系统读懂了什么：问题集中在哪几类失败。 |
| 5. Badcase 分布 | 40s | Badcase 分布图，hover 点位，点击 cluster tag。 | 分布图用于组织证据，不宣称数学上证明根因；每个点能回到原始 case。 |
| 6. 根因聚合 | 45s | 展示根因卡，打开 case drawer。 | 产出可复核的根因假设和生产策略，例如多轮上下文、工具调用、安全边界。 |
| 7. 人工 loop | 25s | 点击采纳/拒绝；打开编辑策略，调整生成数量或资产类型。 | 人审不被跳过，资产包受人工决策影响。 |
| 8. 生成预览 | 30s | 点击“生成预览样例”，打开资产包弹窗。 | 生成前先预览文件和数量，避免黑盒批量生成。 |
| 9. 生成与下载 | 40s | 点击“确认生成资产包”，下载 JSONL/report/provenance。 | 输出是可进入下游流程的数据文件，不是页面文案。 |
| 10. 文件证明 | 30s | 打开下载内容或编辑器展示 JSONL/provenance 片段。 | 每条资产包含来源 case、问题族、生成时间，支持复核和回溯。 |
| 11. 结尾远景 | 20s | 回到飞轮页或工作台全景。 | 复赛展示第一段：failure evidence 到 dataset asset；长期目标是开源 Trace-to-Dataset Pipeline。 |

## 推荐录制方式

推荐路线：**浏览器 Tab 录制优先**。这样输出里只出现产品页面，不出现 macOS 桌面、菜单栏、Dock、终端和浏览器地址栏。

1. 浏览器页面尺寸建议保持 1440 x 960 或 1440 x 900。
2. 打开演示页面，进入评测增强完成态。
3. 使用浏览器录屏工具录“当前 Tab”，不要录整个屏幕。
4. 开 cursor highlight 或 spotlight，让评委看清点击位置。
5. 先录无声干净版，后续再补旁白或让 PPT 使用关键帧。
6. 鼠标动作放慢：移动 0.5s，点击后停 1s，弹窗打开后停 1-2s。
7. 完整录一版 4 到 5 分钟；再剪一版 60 到 90 秒放 PPT。

## 评测模式录屏所需能力

录屏验收不等于完整产品验收。当前 1 小时内，评测模式只需要让镜头里的主线成立：

**失败证据进入 -> 系统理解 -> 根因聚合 -> 人工确认 -> 生产预览 -> 资产包下载。**

### P0：录屏必须真实可用

这些能力是录屏硬门槛，任何一个缺失都会让演示像静态 UI：

1. **一键载入复赛样例**
   - 页面空态必须能点“使用复赛样例”。
   - 载入后要出现 source file、原始记录数、候选 case、明确失败数、安全拒识数。
   - 不依赖临场上传和外部模型服务，避免录屏翻车。

2. **一句话材料理解结论**
   - 载入后右侧顶部必须出现一句清晰结论，例如：
     “这是一个 vehicle_agent 评测结果，问题集中在多轮上下文承接失败、应调用工具但未调用、安全拒识边界不稳。”
   - 这句话要吸顶，滚动时仍能看见，服务于 PPT 截图和旁白。

3. **字段识别 / Evidence Case 标准化**
   - 左侧必须能展示系统识别了哪些字段角色：用户输入、模型回答、期望输出、失败原因、上下文等。
   - 不需要把算法讲复杂，但页面必须证明“不是要求用户按固定模板上传”。

4. **Badcase 分布图**
   - 图上要有点位、聚类颜色、hover 气泡。
   - 需要支持基础缩放/复位；录屏时可轻轻缩放一次证明不是死图。
   - 文案保持克制，不要写“自动展开”“单点为 bad case”这类给用户增加负担的话。

5. **根因聚合卡**
   - 至少 3 个根因族：多轮上下文、工具调用、安全边界。
   - 每个卡片要有：名称、概要、根因假设、生成策略、case 数。
   - `xx cases` 必须可点开，展示代表 badcase，并且关闭后不能把页面滚回顶部。

6. **人工 loop**
   - 根因卡必须能采纳、拒绝、编辑。
   - 拒绝后卡片不能消失，只改变状态和下游生产影响。
   - 编辑策略至少能改：资产类型、生成数量、修复方向。

7. **生产预览**
   - 点击“生成预览样例”后必须弹出资产包预览。
   - 预览要展示文件名、条数、样例片段，避免用户感觉是黑盒生成。
   - 预览内容可以来自 deterministic fixture，但不能只显示空壳。

8. **确认生成资产包**
   - 点击后状态从“等待预览/预览已生成”变为“资产包已生成”。
   - 下载区必须出现并能下载真实文本文件。
   - 至少包含 `training_candidates.jsonl`、`eval_cases.jsonl`、`quality_report.json`、`provenance.json`。

9. **状态持久化**
   - 刷新页面或重新打开任务后，评测结果、采纳/拒绝状态、预览/资产包状态不能全部丢失。
   - 录屏前可提前准备任务，避免从空白页开始等接口。

10. **降级兜底**
    - 上传失败、算法服务失败、生成失败时，能切到内置复赛样例继续演示。
    - 页面不要暴露堆栈、服务异常细节、终端路径。

### P1：有时间再补，能提高录屏可信度

1. **样例数据更像真实 eval 输出**
   - case 内保留 input / actual output / expected behavior / judgment / failure note。
   - 代表 case 文案不要太短句造句，要体现多轮、工具调用、业务上下文。

2. **下载后打开文件证明**
   - 录屏最后可打开下载文件或页面内预览，展示 JSONL/provenance 片段。
   - 每条资产包含 source case、cluster id、生成策略和时间。

3. **任务列表入口**
   - 左侧任务列表里能看到评测任务。
   - 文案使用“打开查看资产”，不要混同前两个生成模式的“xx 条结果”。

4. **进度反馈**
   - 生成预览和生成资产包要有短暂 loading。
   - 不能太久，录屏最好 0.5-1.5 秒完成。

### 当前不建议做

这些对录屏收益低，容易耗时间：

- 完整 Eval Runner。
- LLM Judge 在线判分。
- 复杂 embedding 聚类服务。
- 真实接 Langfuse / promptfoo / OpenTelemetry。
- CLI 和 adapter。
- 多用户权限、团队协作、审计日志完整版。

### 录屏验收脚本

录屏前按这条路径手动跑一遍：

1. 打开首页，点击“评测增强”。
2. 点击“使用复赛样例”。
3. 确认左侧出现文件摘要和字段识别。
4. 确认右侧顶部出现一句话结论。
5. 展开 Badcase 分布，hover 一个点，缩放一次，再复位。
6. 点击一个 cluster tag 或 `xx cases`，打开 badcase drawer，关闭后页面不跳到顶部。
7. 对一个根因点拒绝，再恢复采纳。
8. 编辑一个根因策略，把数量从默认值改成另一个值。
9. 点击“生成预览样例”，看到资产包预览。
10. 点击“确认生成资产包”，看到状态变成“资产包已生成”。
11. 下载 `training_candidates.jsonl` 和 `provenance.json`。
12. 刷新页面，确认任务状态还能恢复。

## 开源录屏工具调研

| 工具 | 是否开源 | 平台 | 鼠标能力 | 适合现在吗 | 判断 |
| --- | --- | --- | --- | --- | --- |
| Screenity | GPL-3.0，Chrome 扩展 | Chromium 浏览器 | cursor highlight、click highlight、spotlight；可录 Tab | **最适合 1 小时内交付** | 不是真正 camera follow，但能隐藏系统 UI，安装和操作成本最低。适合录 CorpusFlow 网页。 |
| Recordly | AGPL-3.0 / GitHub 开源 | macOS / Windows / Linux | auto-zoom、smooth cursor、timeline、背景包装 | 值得试，但不要阻塞 | 输出更像 Screen Studio，适合产品 Demo；新项目，安装/导出稳定性需要现场确认。 |
| Screenize | Apache 2.0 | macOS 13+ | 根据 cursor/click 自动生成 zoom keyframes，click effects，keystroke overlays | 可作为 macOS 本机增强路线 | 效果强，但仍是 macOS app；如果目标是不体现系统痕迹，最终导出可做到，但录制流程本身依赖 macOS。 |
| Zoominator for OBS | OBS 插件，源码在 GitHub | Windows / macOS / Linux；官方强调 Windows 更稳 | source follow mouse + zoom，真实鼠标跟随 | 不建议现在主路 | 效果最接近“镜头跟随鼠标”，但 OBS 插件配置有时间风险。 |
| obs-zoom-and-follow | OBS Python script | OBS + Python | zoom to mouse + follow | 备选，不建议现在主路 | 老牌方案，配置 Python / OBS script 容易耗时。 |
| Screen Demo | MIT | Windows | 录屏、鼠标轨迹、手动 zoom animation | 非当前主路 | Windows 向，更多是后期手动加 zoom。 |
| Cap | 开源 screen recording/sharing | macOS / Windows | cursor effects、auto zoom | 可关注，不做当前主路 | 更偏 Loom 替代和分享链路，不如 Screenity/Recordly 直接服务当前录屏。 |

来源：

- Screenity cursor/click/spotlight 文档：https://help.screenity.io/recording/how-to-highlight-your-cursor-or-clicks-in-screenity
- Screenity 开源说明：https://alternativeto.net/software/screenity/about/
- Screenity GitHub：https://github.com/alyssaxuu/screenity
- Recordly 官网：https://recordly.dev/
- Recordly GitHub：https://github.com/webadderallorg/Recordly
- Screenize 官网：https://castle-yein.com/screenize/
- Zoominator OBS 插件：https://obsproject.com/forum/resources/zoominator-source-zoom-and-mouse-follow-plugin.2357/
- obs-zoom-and-follow：https://github.com/tryptech/obs-zoom-and-follow
- Screen Demo：https://github.com/njraladdin/screen-demo

## 当前推荐录屏方案

### A. 最稳方案：Screenity 录浏览器 Tab

适合今天交付。

操作：

1. 安装 Screenity Chrome/Edge 扩展。
2. 打开 CorpusFlow 演示页，只保留一个干净 Tab。
3. Screenity 选择录制当前 Tab。
4. 打开 cursor highlight 或 spotlight；不要打开摄像头。
5. 录制 4-5 分钟完整路径。
6. 导出 MP4 / WebM，选关键帧进 PPT。

优点：

- 不出现 macOS UI。
- 不需要后期复杂配置。
- cursor spotlight 已经足够让评委跟住操作。

限制：

- 它不是“画面随鼠标自动平移缩放”的 camera follow。
- 如果页面细节太小，需要浏览器缩放到 110%-125% 或录制前调整窗口尺寸。

### B. 效果方案：Recordly

适合有 10-15 分钟试装时间时尝试。

操作：

1. 下载 Recordly。
2. 录制浏览器窗口或区域。
3. 让工具自动生成 auto-zoom / smooth cursor。
4. 只接受必要 zoom，避免画面跳得太频繁。
5. 导出 MP4。

判断：

- 如果安装顺利，输出会更像专业产品 Demo。
- 如果安装、权限、导出任何一步卡住，立刻回到 Screenity。

### C. 真鼠标跟随方案：OBS + Zoominator

适合后续精修，不适合作为 1 小时内的主路径。

操作方向：

1. OBS 新建 Scene，只捕获浏览器内容区域。
2. 安装 Zoominator。
3. 对浏览器 capture source 开启 mouse follow + zoom。
4. 输出 1080p MP4。

判断：

- 优点是真正 source 跟随鼠标。
- 风险是 OBS 插件、权限、坐标映射、裁剪和导出会占时间。
- 今天只有 1 小时，不把它作为主交付路径。

## 录屏卫生清单

- 不展示 `.env.local`、Cloudflare / Render 控制台、API key、JWT、终端命令。
- 不展示个人邮箱、浏览器密码管理器、书签栏、无关标签页。
- 不展示 macOS Dock、顶部菜单栏、通知中心、桌面文件。
- 浏览器缩放统一，页面不要忽大忽小。
- 点击前让鼠标先停在目标上，点击后停 1 秒。
- 弹窗打开后先不动鼠标，让画面可截图。
- 失败链路不临场调试；如果服务不稳，直接用内置复赛样例。

## 必备截图素材

- 首页三入口。
- 评测增强空态。
- 复赛样例导入后的左侧指标。
- 字段识别区域。
- 一句话结论区域。
- Badcase 分布图。
- 根因卡。
- case drawer。
- 策略编辑弹窗。
- 资产包弹窗。
- 下载后的 JSONL/provenance 局部。

## 风险与话术边界

| 风险点 | 不要讲太满 | 推荐说法 |
| --- | --- | --- |
| 根因诊断 | 不说“自动证明真实根因”。 | 生成可复核的根因假设和修复策略。 |
| 算法能力 | 不说“已支持任意 trace/日志全自动理解”。 | P0 支持 CSV/XLSX/JSON 与内置样例，契约为 messy evidence 扩展预留。 |
| 开源生态位 | 不说“替代 Langfuse/Promptfoo/Label Studio/LLaMA-Factory”。 | 连接这些工具之间缺失的数据回流层。 |
| 评测平台 | 不说“CorpusFlow 是完整 EvalOps 平台”。 | 不运行评测，负责把评测失败转成下一轮数据资产。 |
| 生成质量 | 不说“生成数据可直接作为 gold 数据”。 | 输出 training/eval candidates，需要人审和 provenance 支撑。 |
| 工程成熟度 | 不强调 adapter、CLI、zip 已完成。 | 复赛 P0 已跑通前后端闭环；adapter/CLI 是复赛后路线。 |
| 指标收益 | 不编具体节省百分比。 | 用原始记录、有效 case、失败数、字段识别率、资产数量作为演示量化证据。 |
| LLM Judge | 不说“系统会自动判分”。 | 当前用已有 judgment/annotation 和规则抽取 failure signals；后续可接 LLM 增强。 |
