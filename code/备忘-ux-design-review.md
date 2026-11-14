# CorpusFlow 交互设计全面评审报告

> 评审日期：2026-04-28
> 评审范围：前端交互设计（src/App.tsx, QuickTaskWorkspace.tsx）
> 评审方法：启发式评估（Heuristic Evaluation）+ 认知走查（Cognitive Walkthrough）

---

## 一、执行摘要

### 总体评估
CorpusFlow 作为一款 LLM 训练数据生成平台，其交互设计在**功能完整性**上表现良好，但在**状态管理**、**操作容错**和**一致性**方面存在明显问题。用户在复杂工作流中容易产生**迷失感**和**失控感**，尤其是在多阶段生成任务中。

### 关键发现（Top 5）

| 优先级 | 问题类别 | 严重程度 | 用户影响 |
|-------|---------|---------|---------|
| P0 | 状态可见性缺失 | 🔴 严重 | 用户不知道系统当前在做什么 |
| P0 | 无撤销机制 | 🔴 严重 | 误操作导致数据丢失，无法恢复 |
| P1 | 导航混乱 | 🟡 高 | 多视图切换时上下文丢失 |
| P1 | 反馈不一致 | 🟡 高 | 相同操作在不同位置效果不同 |
| P2 | 认知负荷过高 | 🟢 中 | 新手用户难以理解工作流 |

---

## 二、详细评审维度

### 2.1 信息架构与导航设计

#### 2.1.1 视图层级混乱

**现状问题**：
```typescript
// App.tsx:160-166
function getTaskView(task: Task): View {
  if (task.name.includes("批量")) return "quick";      // 基于名称推断
  if (task.workMode === "quick" || task.name.includes("快速")) return "quick";
  return "fine-tune";
}
```

**问题分析**：
- **隐式路由规则**：视图切换依赖 `task.name.includes()` 字符串匹配，而非显式元数据
- **魔法字符串**："批量"、"快速" 等关键词硬编码，无配置中心
- **不可预测性**：用户无法从UI上理解为什么点击同一个任务，有时会进入快速模式，有时进入精调模式

**用户场景**：
> 用户创建一个名为"快速批量处理-客服场景"的任务，期望进入精调模式，却因包含"快速"字样被强制转入快速模式。

**修复建议**：
1. 在创建任务时显式选择模式（单选按钮），而非推断
2. 视图切换后显示当前模式指示器（面包屑或标签）
3. 提供"以XX模式打开"的二次确认选项

#### 2.1.2 面包屑导航缺失

**现状**：
```typescript
// App.tsx:946-957
<div className="flex items-center gap-2 text-xs font-medium text-slate-500">
  <span className={cn("cursor-pointer hover:text-indigo-400", view === 'home' && "text-indigo-400")}
        onClick={() => setView('home')}>首页</span>
  {view !== 'home' && (
    <>
      <ChevronLeft size={12} className="rotate-180" />
      <span className="text-indigo-400">
        {view === 'fine-tune' ? '精调生成' : view === 'quick' ? '快速任务' : '任务列表'}
      </span>
    </>
  )}
</div>
```

**问题分析**：
- 仅支持两级导航（首页 → 当前页），无法反映复杂工作流
- 缺失任务级导航：首页 → 任务列表 → 具体任务 → 生成阶段
- 点击面包屑返回时，**状态未保存**，用户数据可能丢失

**修复建议**：
```
首页 → 任务列表 → [任务名称] → 阶段2:仿写句子 → 阶段4:批量生成
  ↓          ↓           ↓              ↓               ↓
可点击     可点击      可点击         显示状态        当前位置
```

#### 2.1.3 视图切换数据丢失

**现状代码**：
```typescript
// App.tsx:1052-1054
onClick={() => {
  setView('quick');
  setMode('quick');
  clearQuickWorkspace();  // 切换视图时清空工作区！
}}
```

**严重程度**：🔴 **严重**

**问题分析**：
- 视图切换等同于"放弃当前工作"，无任何提示
- `clearQuickWorkspace()` 会清空导入的文件、配置参数、生成结果
- 用户误点击导航栏可能导致**未保存工作全部丢失**

**修复建议**：
1. 添加「离开确认」对话框："您有未保存的更改，确定要离开吗？"
2. 实现自动草稿保存（每30秒保存到localStorage）
3. 返回时自动恢复上次工作状态

---

### 2.2 状态可见性与系统反馈

#### 2.2.1 生成进度不透明

**现状**：
```typescript
// 精调模式 - 仅显示数字统计
<span className="text-[10px] text-slate-500">
  任务进度: {completedSeeds}/{seeds.length} 已解析
</span>

// 快速模式 - 仅显示状态标签
<span>{quickRunStatus === "done" ? "已完成" : "生成中…"}</span>
```

**问题分析**：
- **无进度条**：用户不知道生成需要多久，产生焦虑
- **无阶段指示**：不知道当前在处理第几个种子、哪个阶段
- **无预估时间**：无法判断是等待还是先去喝杯咖啡
- **无取消选项**：一旦开始生成，只能等待完成或强制刷新

**对比业界实践**：

| 产品 | 进度展示 |
|------|---------|
| ChatGPT | 逐字输出 + 打字机效果 |
| Midjourney | 百分比进度 + 预览图生成过程 |
| Runway | 队列位置 + 预计等待时间 |

**修复建议**：
```typescript
interface ProgressIndicator {
  currentStep: number;        // 当前步骤
  totalSteps: number;         // 总步骤
  currentSeed: string;        // 当前处理种子文本（前20字）
  stage: '分析' | '扩写' | '仿写' | '生成';  // 当前阶段
  etaSeconds: number;         // 预估剩余时间
  cancelable: boolean;        // 是否可取消
}
```

#### 2.2.2 处理状态可视化不足

**现状**：
```typescript
// App.tsx:1905
<div className={cn("space-y-6", seed.status === 'pending' && "opacity-40 grayscale pointer-events-none")}>
```

**问题分析**：
- `opacity-40 grayscale` 是唯一的视觉反馈，过于隐晦
- 无明确文字说明："等待中..."、"处理中..."、"已完成"
- 无动画指示：用户难以区分是"卡顿"还是"正在处理"
- 多种子并行时，无法快速识别哪些已完成、哪些失败

**修复建议**：
1. 使用明确的**状态标签**（Badge）：待处理 / 解析中 ✓ / 失败 ✗
2. 添加**骨架屏**或**脉冲动画**表示正在加载
3. 提供**种子状态筛选器**：只看失败项 / 只看处理中

#### 2.2.3 结果生成无通知

**现状**：生成完成后无任何提示，用户需滚动查看

```typescript
// App.tsx:611
setQuickGeneratedItems(items);  // 直接设置，无反馈
setQuickRunStatus("done");      // 状态变更，但无视觉提示
```

**问题分析**：
- 长列表场景下，新生成的结果在可视区域外
- 用户不知道何时可以开始审查结果
- 无「新结果」标记，难以区分新旧数据

**修复建议**：
1. 生成完成时播放 subtle 提示音（可开关）
2. 显示 Toast 通知："生成完成，共 50 条结果"
3. 自动滚动到第一个新结果，并高亮显示（fade in）
4. 添加「新」标签：24小时内生成的结果标记为"New"

---

### 2.3 操作容错与撤销机制

#### 2.3.1 完全无撤销功能

**现状调查**：
```bash
$ grep -n "undo\|撤销\|redo\|重做\|revert\|恢复" /Users/Harland/Go/CorpusFlow/src/App.tsx
# 无任何匹配结果
```

**严重程度**：🔴 **严重**

**高危操作清单**：

| 操作 | 后果 | 是否有确认对话框 |
|------|------|----------------|
| 清空结果 | 所有生成数据丢失 | ✅ 有（仅一次确认） |
| 删除任务 | 任务及所有关联数据丢失 | ✅ 有（仅一次确认） |
| 重新解析 | 覆盖所有分析结果 | ❌ 无 |
| 切换视图 | 当前工作区数据清空 | ❌ 无 |
| 删除单个生成项 | 单个数据丢失 | ✅ 有（hover时出现） |
| 修改种子文本 | 原解析结果清空 | ❌ 无 |

**用户场景**：
> 用户花费30分钟调整参数生成了一批高质量语料，误点击"清空结果"按钮，虽有确认对话框但习惯性点击"确定"，结果无法挽回。

**修复建议**：

**短期（Soft Delete）**：
```typescript
// 不真正删除，而是标记为 deleted
type GeneratedItem = {
  id: string;
  // ...
  deletedAt?: Date;  // 软删除标记
};

// 提供"最近删除"恢复区域
const [recentlyDeleted, setRecentlyDeleted] = useState<GeneratedItem[]>([]);
// 30天后自动清理
```

**长期（Undo Stack）**：
```typescript
interface UndoAction {
  type: 'DELETE_ITEM' | 'CLEAR_RESULTS' | 'UPDATE_FIELD';
  payload: any;
  timestamp: Date;
  description: string;  // "删除了一条生成结果"
}

const [undoStack, setUndoStack] = useState<UndoAction[]>([]);
// Ctrl+Z 或显示浮动"撤销"按钮
```

#### 2.3.2 确认对话框设计不一致

**现状对比**：

```typescript
// 方式1：使用原生 confirm（清空结果）
if (confirm("确定要清空当前任务已生成的语料吗？")) {
  setGeneratedData([]);
}

// 方式2：直接执行（重新解析）
onClick={handleGeneratePreview}  // 无任何确认，直接覆盖

// 方式3：条件确认（删除任务）
if (confirm("确定要删除该任务及其所有数据吗？")) {
  // ...执行删除
}
```

**问题分析**：
- **阻断程度不一致**：有的用原生confirm（阻断性强），有的直接执行
- **文案不一致**："清空"、"删除"、"移除"等用词混用
- **风险等级未区分**：高危操作（删除任务）和低危操作（收起面板）使用相同确认方式
- **无"不再询问"选项**：重复操作每次都要确认，效率低下

**修复建议**：

| 风险等级 | 示例 | 交互模式 |
|---------|------|---------|
| 极高 | 删除任务 | 模态对话框 + 输入确认文字（如"DELETE"） |
| 高 | 清空结果 | 模态对话框 + 明确后果说明 |
| 中 | 重新解析 | 非阻断提示 + 5秒内可撤销 |
| 低 | 删除单条 | Hover 显示删除按钮 + 无确认 |

#### 2.3.3 自动保存缺失

**现状**：
```typescript
// 仅在切换任务时保存（行400-406）
useEffect(() => {
  apiService.saveSeeds(activeTask, seeds).catch(...);
  apiService.saveGenerated(activeTask, generatedData).catch(...);
}, [activeTask, seeds, generatedData]);
```

**问题分析**：
- 只有**主动切换任务**时才触发保存
- 浏览器崩溃、意外关闭时，当前工作全部丢失
- 长时间编辑后，无法知道上次保存时间

**修复建议**：
1. **自动保存**：每30秒或每次用户操作后自动保存到localStorage
2. **保存状态指示器**：显示"已保存"、"保存中..."、"上次保存：2分钟前"
3. **崩溃恢复**：启动时检测是否有未提交的自动保存，提示恢复

---

### 2.4 认知负荷与心智模型

#### 2.4.1 四阶段流程缺乏引导

**现状**：
```typescript
// Card 组件显示步骤编号（step={1}, step={2}, step={3}）
<Card title="句子解析" step={1} ... />
<Card title="仿写句子" step={2} ... />
<Card title="多轮问答预览" step={3} ... />
// 阶段4是"生成控制"侧边栏，无 step 标记
```

**问题分析**：
- **阶段4位置不一致**：前3阶段在中间卡片，第4阶段在右侧边栏
- **无流程图**：用户无法一眼看出当前在整体流程的哪一步
- **阶段依赖不清晰**：不知道完成阶段1才能进入阶段2
- **无法跳过**：即使阶段1结果不满意，也必须继续后续阶段

**修复建议**：

**方案A：步骤条（Stepper）**
```
[1 种子输入] → [2 句子解析] → [3 实体扩写] → [4 仿写生成] → [5 批量生成]
    ✓完成        进行中        未开始        未开始        未开始
```

**方案B：泳道视图（Pipeline）**
```
种子1: [分析✓] → [扩写✓] → [仿写进行中] → [批量生成]
种子2: [分析✓] → [扩写进行中] → [等待...] → [等待...]
种子3: [分析✓] → [等待...] → [等待...] → [等待...]
```

#### 2.4.2 术语一致性差

**术语混用清单**：

| 功能 | 精调模式术语 | 快速模式术语 |
|------|-------------|-------------|
| 原始输入 | 种子语句 | Query |
| 变体生成 | 仿写句子 | 生成结果 |
| 批量生成 | 生成语料 | 快速生成 |
| 配置参数 | 扩写倍数 | 生成规模 |
| 实体扩展 | AI扩写 | - |

**问题分析**：
- 同一概念在不同模式下使用不同术语，增加学习成本
- 用户从快速模式切换到精调模式时，需要重新建立映射关系
- 文档和帮助中心难以编写（需要两套术语体系）

**修复建议**：
1. 建立术语表（Glossary），统一使用"种子/语料"体系
2. UI上添加术语提示（Tooltip）："语料：指生成的训练数据条目"
3. 提供「术语对照表」帮助文档

#### 2.4.3 帮助与引导缺失

**现状调查**：
```bash
$ grep -n "help\|帮助\|指南\|guide\|教程\|tutorial" /Users/Harland/Go/CorpusFlow/src/App.tsx
# 无任何匹配结果（除placeholder中的示例文本）
```

**新手用户痛点**：
- 首次进入系统，不知道"种子语句"是什么意思
- 不清楚"扩写倍数"和"生成规模"的区别
- 不了解"AI扩写"按钮的作用和时机
- 不知道何时使用"重新生成仿写" vs "AI扩写"

**修复建议**：

**方案A：引导式教程（Onboarding）**
```typescript
const onboardingSteps = [
  {
    target: '.seed-input',
    title: '第一步：输入种子语句',
    content: '种子语句是您希望扩展的原始指令，如"打开空调到25度"',
  },
  {
    target: '.analysis-card',
    title: '第二步：检查语义解析',
    content: 'AI将自动提取主体、动作、对象等语义要素',
  },
  // ...
];
```

**方案B：上下文帮助（Contextual Help）**
- 每个输入框旁添加 `?` 图标，点击展开帮助
- Hover 提示：显示参数说明和最佳实践
- 空状态时提供「示例数据」一键填充

---

### 2.5 一致性与交互模式

#### 2.5.1 按钮位置与样式不一致

**生成按钮对比**：

| 位置 | 文案 | 样式 | 图标 |
|------|------|------|------|
| 精调-左栏 | "生成预览" | bg-blue-600/20 (蓝色半透明) | Sparkles |
| 精调-左栏 | "生成语料" | bg-indigo-600 (靛蓝) | Play |
| 快速-左栏 | "开始生成" | bg-emerald-600 (绿色) | Play |
| 快速-结果 | "重新生成" | border + bg-transparent | RefreshCw |
| 批量-配置 | "开始生成" | bg-sky-600 (天蓝) | Play |

**问题分析**：
- **主按钮颜色不统一**：精调用靛蓝，快速用绿色，批量用天蓝
- **相同功能不同文案**：都是生成，但叫"生成语料"、"开始生成"、"生成预览"
- **图标混用**：生成操作用 Sparkles/Play/RefreshCw 都有

**修复建议**：
1. 建立设计系统（Design System），定义：
   - 主操作按钮：固定使用 Indigo-600 + Play图标
   - 次要操作按钮：Slate-700 + 无边框
   - 危险操作按钮：Red-500 + Trash图标

#### 2.5.2 列表操作模式不一致

**删除操作对比**：

```typescript
// 模式A：Hover 显示删除按钮（生成结果卡片）
<button
  onClick={() => handleDeleteGeneratedItem(gen.id)}
  className="opacity-0 group-hover:opacity-100 ..."
>
  <X size={10} />
</button>

// 模式B：始终显示 + 确认对话框（任务列表）
<button onClick={(e) => handleDeleteTask(task.id, e)}>
  <Trash2 size={16} />
</button>

// 模式C：直接删除无确认（无实例，但需确保一致性）
```

**问题分析**：
- **发现性差异**：有的删除操作需要hover才能看到，有的始终可见
- **图标差异**：用 X 还是 Trash2，用户难以建立统一认知
- **确认程度差异**：有的直接删除，有的需确认

**修复建议**：
```typescript
// 统一删除模式
interface DeleteAction {
  icon: 'Trash2';           // 统一使用Trash2
  confirm: boolean;         // 是否显示确认
  confirmLevel: 'none' | 'simple' | 'complex';  // 确认级别
  undoable: boolean;        // 是否支持撤销
  toast: string;            // 删除后提示文案
}

// 应用到所有删除场景
const deletePresets = {
  item: { icon: 'Trash2', confirm: false, undoable: true, toast: '已删除，可撤销' },
  task: { icon: 'Trash2', confirm: true, confirmLevel: 'complex', undoable: false, toast: '任务已删除' },
  results: { icon: 'Trash2', confirm: true, confirmLevel: 'simple', undoable: true, toast: '结果已清空' },
};
```

#### 2.5.3 表单验证与错误提示不一致

**现状对比**：

```typescript
// 方式1：Inline 提示（快速任务指令模板）
{!quickInstructionTemplate.trim() && (
  <p className="text-[10px] text-rose-400">指令微调模式必须填写 Instruction</p>
)}

// 方式2：Toast 提示（API错误）
addToast(error instanceof Error ? error.message : '生成失败');

// 方式3：顶部 Alert（服务错误）
{apiError && (
  <div className="bg-amber-900/20 ...">
    <AlertCircle size={14} />
    <span>{apiError}</span>
  </div>
)}
```

**问题分析**：
- 相同错误类型（如必填项缺失）在不同位置使用不同提示方式
- Toast 消息4秒后自动消失，用户可能来不及阅读
- 无字段级错误指示（如红色边框、错误图标）

**修复建议**：
| 错误类型 | 提示方式 | 持续时间 |
|---------|---------|---------|
| 字段级验证 | Inline + 红色边框 | 直到修正 |
| 表单提交错误 | 表单顶部错误摘要 | 直到修正 |
| API错误 | Toast + 重试按钮 | 5秒 |
| 系统错误 | Modal对话框 | 需用户关闭 |

---

### 2.6 批量操作与效率设计

#### 2.6.1 无批量编辑能力

**现状**：所有操作都是单条处理

```typescript
// 仅支持单条删除
const handleDeleteGeneratedItem = (id: string) => {
  setGeneratedData(prev => prev.filter(item => item.id !== id));
};

// 仅支持单条编辑
const handleEditGeneratedItem = (id: string, field: 'q' | 'a', value: string) => {
  setGeneratedData(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
};
```

**用户场景**：
> 用户生成了500条语料，发现其中100条包含敏感词需要删除，必须逐条点击删除，耗时且痛苦。

**修复建议**：

**阶段1：批量选择模式**
```typescript
const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
const [isBatchMode, setIsBatchMode] = useState(false);

// UI：复选框 + 批量操作栏
<div className="batch-toolbar">
  <span>已选择 {selectedItems.size} 项</span>
  <button onClick={batchDelete}>批量删除</button>
  <button onClick={batchExport}>批量导出</button>
  <button onClick={batchTag}>批量打标签</button>
</div>
```

**阶段2：筛选操作**
```typescript
// 按条件筛选后批量操作
const filteredItems = generatedData.filter(item =>
  item.q.includes(searchText) ||
  item.type === selectedType
);
// 对筛选结果执行批量操作
```

#### 2.6.2 无键盘快捷键支持

**现状调查**：
```bash
$ grep -n "keydown\|keypress\|shortcut\|hotkey\|快捷键" /Users/Harland/Go/CorpusFlow/src/App.tsx
# 无任何匹配结果
```

**缺失的快捷键**：

| 操作 | 建议快捷键 | 场景 |
|------|-----------|------|
| 生成预览 | Ctrl+Enter | 种子输入完成后 |
| 保存当前任务 | Ctrl+S | 编辑过程中 |
| 撤销操作 | Ctrl+Z | 误操作后 |
| 导出结果 | Ctrl+E | 生成完成后 |
| 切换视图 | Cmd+1/2/3 | 快速切换模式 |
| 搜索 | Cmd+K | 全局搜索 |

**修复建议**：
1. 引入 `react-hotkeys-hook` 或类似库
2. 提供「快捷键指南」模态框（按 ? 触发）
3. 菜单项显示快捷键提示

#### 2.6.3 导入导出流程繁琐

**现状流程**：
```
1. 点击"导入文件"（快速模式）
2. 选择文件
3. 等待解析（无进度条）
4. 查看字段识别结果
5. 配置输出类型
6. 配置生成参数
7. 点击开始生成
8. 等待生成（无进度）
9. 点击导出按钮
10. 选择格式
11. 下载文件
```

**问题分析**：
- **11步流程**才能完成从导入到导出，中间无断点保存
- 任意步骤出错需要重新开始
- 无「断点续传」：导入大文件后如果浏览器崩溃，需重新上传

**修复建议**：

**方案A：会话恢复**
```typescript
// 每完成一个阶段自动保存会话
const saveSession = () => {
  localStorage.setItem('importSession', JSON.stringify({
    stage: 'parsed',  // uploaded/parsed/configured/generated
    file: fileInfo,
    parsedData: quickRows,
    config: { quickTaskKind, quickTargetPerSeed, ... },
    timestamp: Date.now(),
  }));
};

// 页面加载时检测并恢复
useEffect(() => {
  const session = localStorage.getItem('importSession');
  if (session) {
    // 提示用户：检测到未完成的导入任务，是否恢复？
  }
}, []);
```

**方案B：后台任务队列**
```typescript
// 大文件上传后转为后台任务
const handleLargeFileImport = async (file) => {
  const taskId = await uploadToQueue(file);
  // 显示：文件已加入处理队列，预计5分钟完成
  // 用户可离开页面，完成后邮件/站内信通知
};
```

---

### 2.7 错误处理与用户引导

#### 2.7.1 错误信息技术化

**现状错误提示**：
```typescript
// 直接显示API返回的错误
addToast(error instanceof Error ? error.message : '生成失败');

// 或者显示固定文案
setApiError("批量生成失败，请检查后端或算法服务");
```

**实际显示给用户的错误**：
- "Request failed: 500" —— 用户不知道该做什么
- "Connection refused" —— 技术术语，无解决方案
- "Failed to fetch" —— 过于笼统

**修复建议**：

**错误映射表**：
```typescript
const errorMessages: Record<string, { title: string; description: string; action: string }> = {
  'NETWORK_ERROR': {
    title: '网络连接失败',
    description: '无法连接到服务器，请检查网络连接',
    action: '重试',
  },
  'RATE_LIMIT': {
    title: '请求过于频繁',
    description: '已达到API调用限制，请稍后再试',
    action: '等待60秒后自动重试',
  },
  'INVALID_SEED': {
    title: '种子语句格式错误',
    description: '种子语句为空或包含非法字符',
    action: '检查并修正种子语句',
  },
  'GENERATION_TIMEOUT': {
    title: '生成超时',
    description: '当前任务过于复杂，已中断',
    action: '减少种子数量或降低扩写倍数后重试',
  },
};
```

#### 2.7.2 无网络断线处理

**现状**：
```typescript
// 网络错误时仅显示Toast，4秒后消失
addToast('生成失败，请检查网络连接');
// 用户需手动重试，无自动重试机制
```

**问题分析**：
- 临时网络波动导致任务失败，用户需重新开始
- 长任务（批量生成1000条）失败成本高
- 无「断点续传」：部分完成的任务无法恢复

**修复建议**：
1. **自动重试**：指数退避重试（1s, 2s, 4s, 8s，最多3次）
2. **断点续传**：后端支持从第N条继续生成
3. **离线模式**：编辑操作本地缓存，网络恢复后自动同步

#### 2.7.3 成功反馈缺失

**现状**：
```typescript
// 导出成功 - 无任何提示
apiService.export(...).then((result) => {
  const blob = new Blob([result.content], { type: mimeType });
  // 直接触发下载，无成功提示
});
```

**问题分析**：
- 用户不知道操作是否成功完成
- 下载开始后无反馈，用户可能多次点击
- 无「下次可用」提示（如导出历史）

**修复建议**：
```typescript
// 成功反馈设计
const showSuccessFeedback = (action: string, result: any) => {
  // Toast 提示
  addToast(`${action}成功！`, 'success');

  // 显示结果摘要
  setLastAction({
    type: 'export',
    timestamp: Date.now(),
    summary: `导出 ${result.recordCount} 条记录`,
    downloadUrl: result.url,  // 提供再次下载
  });

  // 可选：轻微动画反馈（按钮缩放）
  triggerButtonAnimation('export-btn');
};
```

---

## 三、交互流程重构建议

### 3.1 推荐的信息架构

```
CorpusFlow
├── 工作台（Dashboard）
│   ├── 最近任务
│   ├── 快速开始模板
│   └── 使用统计
├── 任务中心
│   ├── 任务列表（可按模式/状态筛选）
│   └── 回收站（30天内可恢复）
├── 精调工作台
│   ├── 阶段1：种子管理
│   ├── 阶段2：语义解析
│   ├── 阶段3：实体扩写
│   ├── 阶段4：仿写生成
│   └── 阶段5：批量导出
├── 快速工作台
│   ├── 导入区
│   ├── 配置区
│   ├── 生成区
│   └── 导出区
└── 设置
    ├── API密钥
    ├── 偏好设置
    └── 帮助中心
```

### 3.2 推荐的工作流设计

**精调模式工作流**：
```
[新建任务] → [选择模式：精调] → [输入种子] → [AI解析] → [审核解析结果]
    ↓                                              ↓（不满意可重新解析）
[扩写实体验] → [选择要使用的实体] → [生成仿写] → [审核仿写结果]
    ↓                                              ↓（可调整风格重新生成）
[生成多轮问答] → [审核问答对] → [批量生成语料] → [审核语料]
    ↓                                              ↓（可编辑/删除单条）
[导出数据] → [选择格式：JSON/CSV/JSONL] → [下载]
```

**快速模式工作流**：
```
[新建任务] → [选择模式：快速] → [上传文件] → [自动识别字段]
    ↓                                              ↓（识别错误可手动修正）
[配置输出类型：QA/Instruct/Multi/Code] → [配置生成参数]
    ↓
[开始生成] → [实时预览结果] → [批量导出]
```

### 3.3 推荐的组件设计

#### 全局状态栏
```typescript
interface GlobalStatusBar {
  connection: 'connected' | 'disconnected' | 'reconnecting';
  unsavedChanges: boolean;
  autoSaveStatus: 'saved' | 'saving' | 'error';
  lastSavedAt: Date;
  currentTask: { id: string; name: string };
}
```

#### 步骤导航器
```typescript
interface StepNavigatorProps {
  steps: Array<{
    id: string;
    title: string;
    status: 'completed' | 'current' | 'pending' | 'error';
    isOptional?: boolean;
  }>;
  currentStep: string;
  onStepClick: (stepId: string) => void;  // 允许跳转（已完成阶段）
}
```

#### 批量操作栏
```typescript
interface BatchActionsProps {
  selectedCount: number;
  totalCount: number;
  actions: Array<{
    id: string;
    label: string;
    icon: IconType;
    onClick: () => void;
    danger?: boolean;
  }>;
  onClearSelection: () => void;
}
```

---

## 四、优先级与实施路线图

### 4.1 优先级矩阵

| 优先级 | 问题 | 实施难度 | 用户价值 | 建议版本 |
|-------|------|---------|---------|---------|
| P0 | 自动保存机制 | 低 | 极高 | v1.1 |
| P0 | 软删除 + 撤销 | 中 | 极高 | v1.1 |
| P0 | 进度指示器 | 中 | 高 | v1.1 |
| P1 | 统一设计系统 | 中 | 高 | v1.2 |
| P1 | 步骤导航器 | 中 | 高 | v1.2 |
| P1 | 错误信息优化 | 低 | 高 | v1.2 |
| P2 | 快捷键支持 | 低 | 中 | v1.3 |
| P2 | 批量操作 | 高 | 中 | v1.3 |
| P2 | 引导教程 | 高 | 中 | v1.3 |
| P3 | 离线模式 | 高 | 低 | v2.0 |

### 4.2 设计系统建设

**Phase 1: 基础规范（v1.1）**
- [ ] 定义颜色体系（主色、功能色、中性色）
- [ ] 定义字体规范（层级、行高、字重）
- [ ] 定义间距系统（4px基栅格）
- [ ] 定义圆角规范

**Phase 2: 组件库（v1.2）**
- [ ] Button（主/次/危险/禁用状态）
- [ ] Input（Text/Select/TextArea/错误状态）
- [ ] Card（带标题/步骤/操作区）
- [ ] Modal（确认/信息/表单）
- [ ] Toast（成功/错误/警告/信息）
- [ ] Progress（进度条/步骤条/加载中）
- [ ] EmptyState（空状态/引导）

**Phase 3: 模式库（v1.3）**
- [ ] 创建任务流程
- [ ] 导入文件流程
- [ ] 批量操作模式
- [ ] 错误恢复模式
- [ ] 空状态引导模式

---

## 五、附录：启发式评估清单

基于 Nielsen 的 10 条可用性启发式原则，对 CorpusFlow 的评分：

| 原则 | 评分 | 主要问题 |
|------|------|---------|
| 1. 系统状态可见性 | ⭐⭐ | 进度不透明，状态反馈缺失 |
| 2. 系统与现实世界匹配 | ⭐⭐⭐ | 术语混用，概念映射不清晰 |
| 3. 用户控制与自由 | ⭐ | 无撤销，误操作不可逆 |
| 4. 一致性与标准 | ⭐⭐ | 交互模式不统一，设计不一致 |
| 5. 错误预防 | ⭐⭐ | 确认对话框设计不当 |
| 6. 识别而非回忆 | ⭐⭐⭐ | 选项可见，但帮助信息不足 |
| 7. 使用的灵活性与效率 | ⭐⭐ | 无快捷键，无批量操作 |
| 8. 美学与极简设计 | ⭐⭐⭐⭐ | UI简洁美观 |
| 9. 帮助用户识别与恢复错误 | ⭐⭐ | 错误信息技术化 |
| 10. 帮助与文档 | ⭐ | 无任何帮助系统 |

**总分：21/50（需重大改进）**

---

## 六、参考与资源

### 设计系统参考
- [Material Design](https://m3.material.io/)
- [Ant Design](https://ant.design/)
- [Carbon Design System](https://carbondesignsystem.com/)

### UX模式库
- [UX Movement](https://uxmovement.com/)
- [Nielsen Norman Group](https://www.nngroup.com/)
- [Smashing Magazine - UX](https://www.smashingmagazine.com/category/ux-design/)

### 无障碍标准
- [WCAG 2.1](https://www.w3.org/WAI/WCAG21/quickref/)
- [A11Y Project](https://www.a11yproject.com/)

---

*评审完成。如需针对特定问题出详细设计方案，请告知。*
