import assert from "node:assert/strict";
import test from "node:test";
import ExcelJS from "exceljs";
import {
  detectQuickTaskKindFromHeaders,
  buildQuickTaskInputText,
  buildQuickTaskSeedText,
  buildQuickTaskInstructionText,
  buildQuickTaskSystemText,
  normalizeQuickTaskRows,
  parseQuickTaskFile,
  resolveQuickImportSystemTemplate,
} from "../src/utils/quickTaskImport";

test("detects pure query imports from query headers", () => {
  const kind = detectQuickTaskKindFromHeaders(["query", "note"]);
  assert.equal(kind, "instruct");
});

test("detects instruction fine-tune imports from input and output headers", () => {
  const kind = detectQuickTaskKindFromHeaders(["instruction", "input", "output"]);
  assert.equal(kind, "instruct");
});

test("detects instruction imports when output header is misspelled as outpu", () => {
  const kind = detectQuickTaskKindFromHeaders(["instruction", "input", "outpu"]);
  assert.equal(kind, "instruct");
});

test("keeps instruction column unchanged when normalizing instruction rows", () => {
  const rows = normalizeQuickTaskRows(
    [
      {
        instruction: "请改写下面的句子",
        input: "帮我打开后盖",
        output: "请帮我打开后备箱",
      },
    ],
    "instruct",
  );

  assert.equal(rows[0]?.instruction, "请改写下面的句子");
  assert.equal(rows[0]?.input, "帮我打开后盖");
  assert.equal(rows[0]?.output, "请帮我打开后备箱");
});

test("maps common query headers to alpaca instruction", () => {
  const rows = normalizeQuickTaskRows(
    [
      {
        user_query: "播放陶喆的歌",
        context: "车机在线音乐场景",
        assistant: "好的，正在为你播放陶喆的歌曲。",
        role: "你是车载语音助手",
      },
    ],
    "instruct",
  );

  assert.equal(rows[0]?.instruction, "播放陶喆的歌");
  assert.equal(rows[0]?.input, "车机在线音乐场景");
  assert.equal(rows[0]?.output, "好的，正在为你播放陶喆的歌曲。");
  assert.equal(rows[0]?.system, "你是车载语音助手");
});

test("maps chinese question fields to alpaca instruction", () => {
  const rows = normalizeQuickTaskRows(
    [
      {
        "问题": "周星驰是不是有新电影",
        "材料": "娱乐查询",
        "角色设定": "你是车载语音助手",
      },
    ],
    "instruct",
  );

  assert.equal(rows[0]?.instruction, "周星驰是不是有新电影");
  assert.equal(rows[0]?.input, "娱乐查询");
  assert.equal(rows[0]?.system, "你是车载语音助手");
});

test("builds quick seed text for qa rows without extra labels", () => {
  const seedText = buildQuickTaskSeedText(
    { query: "帮我打开后盖", raw: { query: "帮我打开后盖" } },
    "qa",
  );

  assert.equal(seedText, "帮我打开后盖");
});

test("builds quick seed text for instruct rows from instruction", () => {
  const seedText = buildQuickTaskSeedText(
    {
      instruction: "请根据输入改写",
      input: "帮我打开后盖",
      output: "请帮我打开后备箱",
      raw: {},
    },
    "instruct",
  );

  assert.equal(seedText, "请根据输入改写");
});

test("uses instruction as alpaca seed and keeps input as context when instruction exists", () => {
  const rows = normalizeQuickTaskRows(
    [
      {
        instruction: "你是车载语音助手，请简洁响应",
        input: "播放陶喆的歌",
        output: "",
      },
    ],
    "instruct",
  );

  assert.equal(rows[0]?.instruction, "你是车载语音助手，请简洁响应");
  assert.equal(rows[0]?.input, "播放陶喆的歌");
  assert.equal(buildQuickTaskSeedText(rows[0]!, "instruct"), "你是车载语音助手，请简洁响应");
  assert.equal(buildQuickTaskInstructionText(rows[0]!), "你是车载语音助手，请简洁响应");
  assert.equal(buildQuickTaskInputText(rows[0]!), "播放陶喆的歌");
});

test("uses legacy input-only rows as instruction seeds without duplicating input", () => {
  const row = {
    instruction: "",
    input: "播放陶喆的歌",
    output: "",
    raw: {},
  };

  assert.equal(buildQuickTaskSeedText(row, "instruct"), "播放陶喆的歌");
  assert.equal(buildQuickTaskInstructionText(row), "播放陶喆的歌");
  assert.equal(buildQuickTaskInputText(row), "");
});

test("does not use system prompt as instruction fallback", () => {
  assert.equal(
    buildQuickTaskInstructionText(
      {
        instruction: "按文件里的任务提示处理",
        input: "播放陶喆的歌",
        raw: {},
      }
    ),
    "按文件里的任务提示处理",
  );

  assert.equal(
    buildQuickTaskInstructionText(
      {
        instruction: "",
        raw: {},
      }
    ),
    "",
  );
});

test("uses per-row system before the shared system prompt fallback", () => {
  assert.equal(
    buildQuickTaskSystemText(
      {
        instruction: "播放陶喆的歌",
        system: "文件里的 system",
        raw: {},
      },
      "界面统一 System Prompt",
    ),
    "文件里的 system",
  );

  assert.equal(
    buildQuickTaskSystemText(
      {
        instruction: "播放陶喆的歌",
        raw: {},
      },
      "界面统一 System Prompt",
    ),
    "界面统一 System Prompt",
  );
});

test("parses utf-8 csv uploads without corrupting chinese text", async () => {
  const file = new File(
    [
      "query,input,output,system\n",
      "周星驰是不是有新电影,,目前没有查询到周星驰新电影相关信息,你是车载语音助手\n",
      "色情片在哪里看,,,\n",
    ],
    "demo.csv",
    { type: "text/csv" },
  );

  const parsed = await parseQuickTaskFile(file);

  assert.equal(parsed.rows[0]?.instruction, "周星驰是不是有新电影");
  assert.equal(parsed.rows[0]?.system, "你是车载语音助手");
  assert.equal(parsed.rows[1]?.instruction, "色情片在哪里看");
});

test("parses xlsx uploads without the vulnerable sheetjs parser", async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Seeds");
  worksheet.addRow(["instruction", "input", "output", "system"]);
  worksheet.addRow(["播放陶喆的歌", "车机音乐", "好的，正在播放陶喆的歌曲。", "你是车载语音助手"]);

  const buffer = await workbook.xlsx.writeBuffer();
  const file = new File([buffer], "demo.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const parsed = await parseQuickTaskFile(file);

  assert.equal(parsed.kind, "instruct");
  assert.deepEqual(parsed.headers, ["instruction", "input", "output", "system"]);
  assert.equal(parsed.rows[0]?.instruction, "播放陶喆的歌");
  assert.equal(parsed.rows[0]?.input, "车机音乐");
  assert.equal(parsed.rows[0]?.output, "好的，正在播放陶喆的歌曲。");
});

test("parses xlsx data when a notes sheet comes first and headers start below a title row", async () => {
  const workbook = new ExcelJS.Workbook();
  const notes = workbook.addWorksheet("字段说明");
  notes.addRow(["字段", "用途"]);
  notes.addRow(["system", "助手角色"]);

  const worksheet = workbook.addWorksheet("LONG CHAT");
  worksheet.addRow(["LONG CHAT 批量样例"]);
  worksheet.addRow([]);
  worksheet.addRow(["System", "Instruction", "Input", "Output", "History"]);
  worksheet.addRow([
    "你是通用中文对话助手，回答要自然、简洁。",
    "帮我整理会议纪要",
    "团队讨论了版本冻结和演示链路。",
    "可以，建议确认部署分支并完成演示自测。",
    '[{"role":"user","content":"内容有点散"},{"role":"assistant","content":"我可以帮你整理。"}]',
  ]);

  const buffer = await workbook.xlsx.writeBuffer();
  const file = new File([buffer], "LONG CHAT.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  const parsed = await parseQuickTaskFile(file);

  assert.equal(parsed.kind, "instruct");
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.columns.system, "System");
  assert.equal(parsed.rows[0]?.system, "你是通用中文对话助手，回答要自然、简洁。");
});

test("uses the first imported row system as the visible quick instruction template", () => {
  const template = resolveQuickImportSystemTemplate(
    [
      {
        instruction: "帮我整理会议纪要",
        system: "你是通用中文对话助手，回答要自然、简洁。",
        raw: {},
      },
    ],
    "默认助手角色",
  );

  assert.equal(template, "你是通用中文对话助手，回答要自然、简洁。");
});
