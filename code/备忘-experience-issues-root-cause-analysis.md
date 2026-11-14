# CorpusFlow 体验问题根因分析报告

## 问题总览

| 问题编号 | 问题描述 | 根因定位 | 严重程度 |
|---------|---------|---------|---------|
| 1 | 仿写句子阶段，agent输入框文本被自动拼合到阶段4批量生成 | `handleGeneratePreview` 与 `Generation Loop` 数据流问题 | 高 |
| 2 | 种子语句修改后"生成预览"应只推理新句子，老卡片不动 | `handleGeneratePreview` 全量重置 `seeds` | 高 |
| 3 | AI仿写生成五元组后，点击生成按钮应确保上游数据拼合 | `processSeed` 未检查 `selectedExpansions` | 中 |
| 4 | 精调模式需支持温度调节；批量生成0-100倍、10为倍数、手动输入 | UI 组件缺失 + state 未传递 | 中 |
| 5 | 五元组icon置灰时下游仿写不应继续认 | `handleRegenerateParaphrase` 使用 `selectedExpansions` 但未校验空 | 中 |
| 6 | AI实体扩写点击失效，只能出现第一批次 | `handleExpandSeed` 异步竞态 + 未清理旧数据 | 高 |
| 7 | 批量扩写无法清理上一轮缓存；不同任务应解耦 | `handleClearGenerated` 逻辑不统一 + `quickGeneratedItems` 单例 | 高 |

---

## 问题1：阶段4批量生成自动拼合agent输入框文本

### 现象
在仿写句子阶段（阶段2）的agent输入框中，只要有文本输入，阶段4（生成控制）的批量生成就把该文本拼合进去。

### 根因定位
**文件**: `src/App.tsx`
**代码位置**:
- `handleGeneratePreview` 函数（行621-642）
- `Generation Loop` useEffect（行412-465）

### 当前逻辑分析

```typescript
// handleGeneratePreview 行621-642
const handleGeneratePreview = async () => {
  const lines = seedInput.split('\n').filter(line => line.trim() !== '');
  const newSeeds: SeedData[] = lines.map((line, index) => normalizeSeed({
    id: `seed-${Date.now()}-${index}`,
    text: line.trim(),
    status: 'pending'
  }));
  setSeeds(newSeeds);  // 这里直接替换了整个seeds
  // ...并发处理
};

// Generation Loop 行412-465
useEffect(() => {
  if (!isGenerating || view === "batch") return;

  (async () => {
    // 问题：这里直接使用最新的 seeds，包含所有状态
    if (mode === "quick" && seeds.length === 0) {
      const lines = seedInput.split("\n").filter((line) => line.trim());
      nextSeeds = lines.map((text, index) => normalizeSeed({
        // ...
        paraphrases: [{ text: text, type: "convergence" }],  // 这里把seedInput的原始文本作为paraphrase
      }));
    }

    // 生成时传递了所有seeds，包括agent输入框的内容
    const result = await apiService.generate(activeTask || `temp-${Date.now()}`, {
      task: { mode, expansionRatio, overallRequirement, multiTurnContext, styleAdjustment },
      seeds: nextSeeds,  // 这里的seeds可能包含用户编辑中的文本
    });
  })();
}, [isGenerating, view, mode, seeds, seedInput, expansionRatio, ...]);
```

### 问题根因
1. **seedInput 是实时绑定的**：`seedInput` state与输入框实时双向绑定（行337）
2. **Generation Loop 依赖 seedInput**：useEffect 的依赖数组包含 `seedInput`（行465）
3. **每次输入变化触发重新生成准备**：当用户在agent输入框（阶段2）编辑时，`seedInput` 变化，如果 `isGenerating` 为true，会触发新的生成流程
4. **数据拼合逻辑缺失**：没有区分"待生成文本"和"正在编辑的文本"

### 修复建议
1. 在 `handleGeneratePreview` 中创建快照 `generationSnapshot`，冻结当前要生成的种子列表
2. Generation Loop 使用快照而非实时 `seeds`，避免编辑中内容混入
3. 添加 `isGenerationLocked` 状态，生成过程中禁止编辑输入框

---

## 问题2：种子语句修改后"生成预览"只推理新句子

### 现象
种子语句支持用户中途添加和修改，任务不是一次性任务。当种子语句有新的文本输入时用户再点击"生成预览"，此时只推理新句子，老句子子任务卡片不动。

### 根因定位
**文件**: `src/App.tsx`
**代码位置**: `handleGeneratePreview` 函数（行621-642）

### 当前逻辑分析

```typescript
// 行621-642
const handleGeneratePreview = async () => {
  const lines = seedInput.split('\n').filter(line => line.trim() !== '');
  const newSeeds: SeedData[] = lines.map((line, index) => normalizeSeed({
    id: `seed-${Date.now()}-${index}`,  // 每次都是新的ID
    text: line.trim(),
    status: 'pending'
  }));

  // 问题：这里直接替换了整个seeds数组，老种子的解析状态全部丢失
  setSeeds(newSeeds);

  // 然后对所有newSeeds进行并发处理
  const queue = [...newSeeds];
  const workers = Array.from({ length: Math.min(concurrencyLimit, queue.length) }, async () => {
    while (queue.length > 0) {
      const seed = queue.shift();
      if (seed) {
        await processSeed(seed.id, seed.text);  // 处理所有种子
      }
    }
  });
  await Promise.all(workers);
};
```

### 问题根因
1. **每次创建全新seeds**：`newSeeds` 使用 `Date.now()` 生成新ID，没有任何与老种子的关联逻辑
2. **全量替换state**：`setSeeds(newSeeds)` 直接替换，老种子的 `analysis`, `paraphrases`, `expansions` 等状态全部丢失
3. **无diff机制**：没有比较新老种子列表，找出新增的种子
4. **无状态复用**：即使文本相同，也被视为全新种子处理

### 修复建议
1. 实现种子diff算法，基于文本内容生成稳定ID（如hash）
2. 只处理新增的种子，保留已有种子的解析状态
3. 示例逻辑：
   ```typescript
   const existingSeedsMap = new Map(seeds.map(s => [s.text, s]));
   const newSeeds = lines.map(line => {
     const existing = existingSeedsMap.get(line.trim());
     return existing || normalizeSeed({ id: `seed-${hash(line)}`, text: line.trim() });
   });
   const seedsToProcess = newSeeds.filter(s => s.status === 'pending');
   ```

---

## 问题3：AI仿写生成五元组后，点击生成按钮应确保上游数据拼合

### 现象
AI仿写生成了新的五元组（实体扩写），相当于默认下阶段输入了新内容。点击本种子任意生成按钮时确保上游数据有拼合。

### 根因定位
**文件**: `src/App.tsx`
**代码位置**: `processSeed` 函数（行644-705）和 `handleRegenerateParaphrase` 函数（行707-747）

### 当前逻辑分析

```typescript
// processSeed - 首次解析时（行644-705）
const processSeed = async (id: string, text: string) => {
  // ...
  const expansions = await expandSeedFields(text, analysis, {...});
  const paraphrases = await generateParaphrases(text, analysis, {
    expansions,  // 首次生成使用API返回的expansions
    // ...
  });

  setSeeds(prev => prev.map(s => s.id === id ? {
    ...s,
    analysis,
    expansions,           // 保存expansions
    selectedExpansions: expansions,  // 默认全选
    paraphrases,
    // ...
  } : s));
};

// handleRegenerateParaphrase - 重新生成仿写（行707-747）
const handleRegenerateParaphrase = async (id: string, styleInput?: string) => {
  const seed = seeds.find(s => s.id === id);
  if (!seed) return;

  const paraphrases = await generateParaphrases(seed.text, seed.analysis, {
    expansions: seed.selectedExpansions,  // 使用用户选择的expansions
    style: nextStyle || seed.appliedStyleAdjustment || styleAdjustment,
    // ...
  });
  // ...
};
```

### 问题根因
1. **processSeed 使用原始expansions**：首次生成时用的是API返回的原始expansions，不是selectedExpansions
2. **用户修改selectedExpansions后无重新生成**：用户在UI上点击icon取消选择后，selectedExpansions变化，但paraphrases还是旧的
3. **无自动重新触发机制**：selectedExpansions变化时，没有自动重新生成paraphrases
4. **拼合逻辑缺失**：生成paraphrases时应该检查"如果selectedExpansions与上次生成时不一致，需要重新生成"

### 修复建议
1. 在 `SeedData` 类型中添加 `lastGeneratedWithExpansions` 字段，记录上次生成时使用的expansions
2. 在 `handleRegenerateParaphrase` 或点击生成按钮时，比较当前 `selectedExpansions` 与 `lastGeneratedWithExpansions`
3. 如果不一致，先重新调用 `generateParaphrases` 再展示结果
4. 或者在用户修改selectedExpansions时（handleToggleExpansion），自动触发重新生成

---

## 问题4：精调模式需支持温度调节；批量生成倍数设置

### 现象
- 精调模式需要支持用户调节温度（temperature）
- 批量生成支持0-100倍，滑动块以10为倍数、支持手动输入具体数字

### 根因定位
**文件**: `src/App.tsx`, `src/components/QuickTaskWorkspace.tsx`
**代码位置**:
- 精调模式：无temperature相关state（全局搜索无temperature）
- 批量生成：`expansionRatio` state（行211）和 `quickTargetPerSeed` state（行248）

### 当前逻辑分析

```typescript
// App.tsx 行211-213
const [expansionRatio, setExpansionRatio] = useState(22);  // 精调模式的扩写倍数

// 行2299-2313 UI实现
<div className="space-y-3">
  <div className="flex justify-between items-end">
    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">扩写倍数</label>
    <span className="text-sm font-bold text-indigo-400">{expansionRatio}倍</span>
  </div>
  <input
    type="range"
    min="1"
    max="100"
    value={expansionRatio}
    onChange={(e) => setExpansionRatio(parseInt(e.target.value))}
    className="w-full h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
  />
  // 缺少：1. 以10为倍数的步进 2. 手动输入框
</div>

// QuickTaskWorkspace.tsx 行344-362
<div className="space-y-3 rounded-2xl border border-slate-800 bg-[#161621] p-4">
  <div className="flex items-center justify-between">
    <div className="text-xs font-bold text-slate-400">生成规模</div>
    <div className="text-sm font-bold text-emerald-400">x{quickTargetPerSeed}</div>
  </div>
  <input
    type="range"
    min="1"
    max="10"  // 问题：最大只有10
    value={quickTargetPerSeed}
    onChange={(event) => onTargetPerSeedChange(Number(event.target.value))}
    // ...
  />
  // 缺少：1. 0-100范围 2. 以10为倍数 3. 手动输入
</div>
```

### 问题根因
1. **精调模式无temperature概念**：代码中完全没有temperature相关的state、props或API调用
2. **expansionRatio范围1-100但UI无步进**：滑动条是连续值，没有step=10限制
3. **无手动输入框**：只有滑动条，没有number input支持直接输入
4. **QuickTaskWorkspace quickTargetPerSeed最大10**：与要求的0-100倍不符

### 修复建议
1. **精调模式添加temperature**：
   - 添加 `const [temperature, setTemperature] = useState(0.7)`
   - 在调用geminiService时传递temperature参数
   - 在算法层(Python)支持temperature参数

2. **批量倍数UI优化**：
   ```typescript
   // 添加步进和手动输入
   <input type="range" min="0" max="100" step="10" value={expansionRatio} ... />
   <input
     type="number"
     min="0"
     max="100"
     value={expansionRatio}
     onChange={(e) => setExpansionRatio(Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))}
   />
   ```

---

## 问题5：五元组icon置灰时下游仿写不应继续认

### 现象
五元组中任意实体icon置灰（取消选择）时，下游仿写不应继续认该实体。

### 根因定位
**文件**: `src/App.tsx`
**代码位置**: `handleToggleExpansion`（行772-787）和 `handleRegenerateParaphrase`（行707-747）

### 当前逻辑分析

```typescript
// handleToggleExpansion - 切换选中状态（行772-787）
const handleToggleExpansion = (seedId: string, field: 'subject' | 'action' | 'object' | 'modifiers', value: string) => {
  setSeeds((prev) => prev.map((item) => {
    if (item.id !== seedId) return item;
    const current = item.selectedExpansions[field] || [];
    const next = current.includes(value)
      ? current.filter((entry) => entry !== value)  // 取消选择（置灰）
      : [...current, value];  // 添加选择
    return {
      ...item,
      selectedExpansions: {
        ...item.selectedExpansions,
        [field]: next,  // 只更新了selectedExpansions
      },
    };
  }));
  // 问题：没有触发重新生成paraphrases！
};

// handleRegenerateParaphrase - 重新生成仿写（行707-747）
const handleRegenerateParaphrase = async (id: string, styleInput?: string) => {
  const seed = seeds.find(s => s.id === id);
  if (!seed) return;

  const paraphrases = await generateParaphrases(seed.text, seed.analysis, {
    expansions: seed.selectedExpansions,  // 使用selectedExpansions
    // ...
  });

  setSeeds(prev => prev.map(s => s.id === id ? {
    ...s,
    paraphrases: [...(s.paraphrases || []), ...paraphrases],  // 追加新结果
    // ...
  } : s));
};

// UI渲染 - icon置灰逻辑（行1940-2050区域）
{(seed.expansions.subject || []).map((item, itemIndex) => (
  <button
    key={`${seed.id}-subject-${itemIndex}`}
    onClick={() => handleToggleExpansion(seed.id, 'subject', item)}
    className={cn(
      "rounded-full px-2.5 py-0.5 text-[11px] transition-all",
      seed.selectedExpansions.subject.includes(item)
        ? "bg-sky-500/20 text-sky-200 ring-1 ring-sky-500/40"  // 选中状态
        : "bg-slate-800 text-slate-500 hover:text-slate-300"   // 置灰状态
    )}
  >
    {item}
  </button>
))}
```

### 问题根因
1. **handleToggleExpansion 只更新state**：点击icon只更新了`selectedExpansions`，没有触发任何重新生成
2. **paraphrases仍是旧的**：用户看到的仿写句子还是基于全选expansions生成的，尽管某些icon已置灰
3. **无实时联动**：UI上置灰了，但数据层未重新生成
4. **需要显式点击"重新生成仿写"**：用户必须手动点击"重新生成仿写"按钮才会使用新的selectedExpansions

### 修复建议
1. **方案A：实时重新生成**（体验好但API开销大）：
   - 在 `handleToggleExpansion` 中，如果所有选中项都被取消，清空paraphrases；否则自动触发重新生成

2. **方案B：视觉提示+手动触发**（推荐，平衡体验与性能）：
   - 添加 `expansionsDirty` 标记，当selectedExpansions变化时置为true
   - UI上"重新生成仿写"按钮高亮提示
   - 点击后清除dirty标记

3. **方案C：筛选已有paraphrases**（性能最好但质量可能下降）：
   - 保留所有生成的paraphrases
   - UI层根据selectedExpansions筛选显示

---

## 问题6：AI实体扩写点击失效，只能出现第一批次

### 现象
AI实体扩写（AI扩写按钮）点击失效，只能出现第一批次的结果，后续点击无反应。

### 根因定位
**文件**: `src/App.tsx`
**代码位置**: `handleExpandSeed` 函数（行789-835）

### 当前逻辑分析

```typescript
// handleExpandSeed 行789-835
const handleExpandSeed = async (seedId: string) => {
  const seed = seeds.find((item) => item.id === seedId);
  if (!seed) return;

  try {
    // 设置processing状态
    setSeeds((prev) => prev.map((item) => item.id === seedId ? {
      ...item,
      expansionStatus: "processing",
    } : item));

    // 调用API获取扩写结果
    const generated = await expandSeedFields(seed.text, seed.analysis, {...});

    // 更新expansions和selectedExpansions
    setSeeds((prev) => prev.map((item) => {
      if (item.id !== seedId) return item;
      return {
        ...item,
        expansions: {
          subject: generated.subject || [],
          action: generated.action || [],
          object: generated.object || [],
          modifiers: generated.modifiers || [],
        },
        selectedExpansions: {
          subject: generated.subject || [],
          action: generated.action || [],
          object: generated.object || [],
          modifiers: generated.modifiers || [],
        },
        expansionStatus: "idle",
      };
    }));
  } catch (error) {
    // 错误处理时清空所有expansions
    setSeeds((prev) => prev.map((item) => item.id === seedId ? {
      ...item,
      expansionStatus: "idle",
      expansions: { subject: [], action: [], object: [], modifiers: [] },
      selectedExpansions: { subject: [], action: [], object: [], modifiers: [] },
    } : item));
  }
};
```

### 问题根因
1. **竞态条件**：如果用户快速点击多次，可能有多个并发的 `expandSeedFields` 调用
2. **结果覆盖**：后返回的结果会覆盖先返回的结果，导致显示混乱
3. **无去重机制**：每次点击都重新生成，不会合并新旧结果
4. **错误处理过于激进**：出错时清空所有expansions，导致之前的有效数据也丢失
5. **无增量追加逻辑**：每次都是全量替换，没有"保留已有+追加新"的机制

### 修复建议
1. **添加防抖/锁机制**：
   ```typescript
   const [expandingSeeds, setExpandingSeeds] = useState<Set<string>>(new Set());

   const handleExpandSeed = async (seedId: string) => {
     if (expandingSeeds.has(seedId)) return; // 防止重复点击
     setExpandingSeeds(prev => new Set(prev).add(seedId));
     // ...
     finally {
       setExpandingSeeds(prev => {
         const next = new Set(prev);
         next.delete(seedId);
         return next;
       });
     }
   };
   ```

2. **实现增量追加**：
   - 添加 `append` 模式参数
   - 新结果与已有expansions合并（去重）
   - 而不是直接替换

3. **错误处理保留旧数据**：
   - 出错时不清空已有expansions，只显示错误提示

---

## 问题7：批量扩写无法清理上一轮缓存；不同任务模块解耦

### 现象
1. 批量扩写无法清理上一轮生成的缓存结果，需强制刷新页面
2. 不同任务模块下的"批量生成"应该解耦，不能是公用一个通道

### 根因定位
**文件**: `src/App.tsx`
**代码位置**: `handleClearGenerated` 函数（行884-904）、`clearQuickWorkspace` 函数（行514-532）

### 当前逻辑分析

```typescript
// handleClearGenerated 行884-904
const handleClearGenerated = () => {
  if (view === "quick") {
    if (confirm("确定要清空当前快速任务已生成的结果吗？")) {
      setQuickGeneratedItems([]);
      setQuickRunStats(null);
      setQuickRunStatus("idle");
    }
    return;
  }

  if (confirm("确定要清空当前任务已生成的语料吗？")) {
    setGeneratedData([]);  // 精调模式的生成数据
    setTaskDataMap(prev => ({
      ...prev,
      [activeTask]: {
        ...prev[activeTask],
        generated: []
      }
    }));
  }
};

// clearQuickWorkspace 行514-532
const clearQuickWorkspace = () => {
  setQuickImportStatus("idle");
  setQuickImportError("");
  setQuickFile(null);
  setQuickTaskKind("qa");
  setQuickRows([]);
  setQuickHeaders([]);
  setQuickColumns({...});
  setQuickWarnings([]);
  setQuickRunStatus("idle");
  setQuickRunStats(null);
  setQuickGeneratedItems([]);  // 清空快速任务生成结果
  setQuickInstructionTemplate("");
};

// Generation Loop useEffect 行412-465
useEffect(() => {
  if (!isGenerating || view === "batch") return;  // view === "batch" 被跳过

  (async () => {
    // 使用全局的seeds、seedInput、expansionRatio等
    const result = await apiService.generate(...);
    setGeneratedData(result.items);  // 直接设置到全局state
  })();
}, [isGenerating, view, mode, seeds, seedInput, expansionRatio, ...]);
```

### 问题根因

#### 子问题7.1：批量扩写无法清理缓存
1. **`setGeneratedData([])` 只清空内存state**：没有调用API清理后端缓存
2. **后端可能有缓存**：`apiService.generate` 可能返回缓存结果
3. **无任务级别隔离**：精调模式的数据存在 `generatedData`，快速任务存在 `quickGeneratedItems`，但底层可能共享某些资源

#### 子问题7.2：不同任务模块应解耦
1. **全局state混用**：
   - `seeds`：精调模式和快速任务共用
   - `seedInput`：精调模式和快速任务共用
   - `expansionRatio`：精调模式和快速任务共用
   - `generatedData`：虽然精调模式有，但快速任务用 `quickGeneratedItems`

2. **切换视图时清理不完全**：
   - 切换到快速任务时调用 `clearQuickWorkspace`（行1052）
   - 但精调模式的 `seeds`、`generatedData` 等没有被清理
   - 切换回来后数据还在，造成混淆

3. **单例模式风险**：
   ```typescript
   // App.tsx 全局定义
   const [quickGeneratedItems, setQuickGeneratedItems] = useState(...);  // 快速任务只有一个

   // 所有快速任务共享这个state，而不是按任务隔离
   ```

### 修复建议

#### 针对7.1（清理缓存）
1. 添加 `clearCache` API调用：
   ```typescript
   const handleClearGenerated = async () => {
     // ...确认对话框
     await apiService.clearCache(activeTask);  // 调用后端清理缓存
     setGeneratedData([]);
     // ...
   };
   ```

2. 或者添加 `forceRefresh` 参数：
   ```typescript
   apiService.generate(activeTask, { ..., forceRefresh: true });
   ```

#### 针对7.2（任务模块解耦）
1. **按任务隔离state**：
   ```typescript
   // 替代方案：每个任务有自己的workspace state
   const [taskWorkspaces, setTaskWorkspaces] = useState<Record<string, TaskWorkspace>>({});

   // 访问时
   const currentWorkspace = taskWorkspaces[activeTask];
   ```

2. **视图切换时完全清理**：
   ```typescript
   // 切换到快速任务
   const enterQuickMode = () => {
     // 保存当前精调模式状态到taskDataMap
     saveFineTuneState();
     // 清空精调模式相关state
     setSeeds([]);
     setSeedInput("");
     setGeneratedData([]);
     // 加载快速任务状态
     loadQuickWorkspace(activeTask);
   };
   ```

3. **快速任务按任务隔离**：
   - 将 `quickGeneratedItems` 改为 `Record<taskId, GeneratedItem[]>`
   - 每个快速任务有自己的生成结果

---

## 总结与修复优先级

| 优先级 | 问题 | 修复难度 | 用户体验影响 |
|-------|------|---------|-------------|
| P0 | 问题2（生成预览全量重置） | 中 | 高 - 丢失用户编辑 |
| P0 | 问题7（任务模块解耦） | 高 | 高 - 数据混淆 |
| P1 | 问题1（阶段4拼合输入） | 中 | 中 - 生成内容错误 |
| P1 | 问题6（AI扩写失效） | 低 | 中 - 功能不可用 |
| P2 | 问题5（icon置灰不生效） | 低 | 中 - 预期不符 |
| P2 | 问题3（上游数据拼合） | 中 | 中 - 逻辑不完整 |
| P3 | 问题4（温度调节） | 高 | 低 - 增强功能 |

## 建议的代码重构方向

1. **State管理层**：引入TaskWorkspace概念，每个任务有自己的workspace state
2. **数据流优化**：生成流程使用快照模式，避免实时编辑影响生成
3. **Diff算法**：实现种子文本的diff算法，支持增量处理
4. **状态机**：为每个种子定义清晰的状态机（pending -> processing -> completed）
5. **API层优化**：支持temperature参数、forceRefresh参数
