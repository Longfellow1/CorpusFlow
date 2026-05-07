import assert from "node:assert/strict";
import test from "node:test";
import {
  detectQuickTaskKindFromHeaders,
  buildQuickTaskInputText,
  buildQuickTaskSeedText,
  buildQuickTaskInstructionText,
  buildQuickTaskSystemText,
  normalizeQuickTaskRows,
  parseQuickTaskFile,
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
