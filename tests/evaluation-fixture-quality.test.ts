import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

type FixtureRow = {
  case_id: string;
  dimension: string;
  user_input: string;
  retrieved_contexts?: string;
};

const FIXTURE_FILES = [
  "fixtures/evaluation/migration_badcase_dimensions.jsonl",
  "fixtures/evaluation/migration_badcase_regression.jsonl",
  "fixtures/evaluation/migration_badcase_full.jsonl",
  "fixtures/evaluation/migration_multiturn_context.jsonl",
];

const BANNED_LOW_VALUE_QUERIES = [
  /^到这儿$/,
  /^到时$/,
  /^到了$/,
  /^去哪$/,
  /^去$/,
  /^去1$/,
  /^查询中$/,
  /^第1个$/,
  /^听懂$/,
  /去still alive没女/,
  /导航去不知道去哪/,
  /播放然后这个窗户/,
  /然后打开这个/,
  /打开绘画/,
];

function readJsonl(filePath: string): FixtureRow[] {
  return fs.readFileSync(filePath, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as FixtureRow);
}

function chineseCharCount(value: string) {
  return [...value.matchAll(/[\u4e00-\u9fff]/g)].length;
}

function targetAgent(row: FixtureRow) {
  return row.retrieved_contexts?.match(/target_agent=([^\n]+)/)?.[1] || "";
}

test("migration evaluation fixtures exclude low-value short and noisy queries", () => {
  for (const filePath of FIXTURE_FILES) {
    const rows = readJsonl(filePath);

    assert.ok(rows.length > 0, `${filePath} should not be empty`);

    for (const [index, row] of rows.entries()) {
      assert.ok(
        chineseCharCount(row.user_input) >= 4,
        `${filePath}:${index + 1} has too few Chinese chars: ${row.user_input}`,
      );
      assert.ok(
        !BANNED_LOW_VALUE_QUERIES.some((pattern) => pattern.test(row.user_input)),
        `${filePath}:${index + 1} still contains low-value query: ${row.user_input}`,
      );
    }
  }
});

test("full migration fixture records quality-gate rejections", () => {
  const manifest = JSON.parse(
    fs.readFileSync("fixtures/evaluation/migration_badcase_fixture_manifest.json", "utf-8"),
  ) as {
    quality_gate: {
      rejected_total: number;
      rejected_by_reason: Record<string, number>;
      rejected_samples: Array<{ query: string; reason: string }>;
    };
    fixtures: Record<string, { rows: number; quality: { short_chinese_query_rows: number } }>;
  };
  const fullRows = readJsonl("fixtures/evaluation/migration_badcase_full.jsonl");
  const domainRows = fullRows.filter((row) => row.dimension === "migration_domain_error");

  assert.ok(manifest.quality_gate.rejected_total >= 300);
  assert.ok(manifest.quality_gate.rejected_by_reason.short_chinese_query >= 100);
  assert.ok(manifest.quality_gate.rejected_samples.some((sample) => (
    sample.query === "去still alive没女" && sample.reason === "short_chinese_query"
  )));
  assert.ok(manifest.fixtures["migration_badcase_full.jsonl"].rows >= 500);
  assert.equal(manifest.fixtures["migration_badcase_full.jsonl"].quality.short_chinese_query_rows, 0);
  assert.ok(domainRows.length >= 20);
});

test("domain-error fixtures keep target-agent intent self-evident", () => {
  const domainRows = readJsonl("fixtures/evaluation/migration_badcase_full.jsonl")
    .filter((row) => row.dimension === "migration_domain_error");

  for (const row of domainRows) {
    const target = targetAgent(row);
    const query = row.user_input;
    if (target === "mapU") {
      assert.match(query, /万达|高铁站|公园|停车场|超市|街道|路线|途经点|导航|广元/);
    } else if (target === "musicX") {
      assert.match(query, /播放|歌|音乐|歌词/);
    } else if (target === "app") {
      assert.match(query, /虎嗅|siri|爱奇艺|抖音|微信|高德|百度|酷狗|qq|小铁/i);
    } else if (target === "airControl") {
      assert.match(query, /空调|制热|制冷|香氛/);
    } else if (target === "carControl") {
      assert.match(query, /车窗|窗户|天窗|座椅|后备箱|钥匙|车门|小憩|模式|收音机|玻璃|后视镜|灯|锁/);
    } else {
      assert.fail(`unexpected target_agent for ${row.case_id}: ${target}`);
    }
  }
});
