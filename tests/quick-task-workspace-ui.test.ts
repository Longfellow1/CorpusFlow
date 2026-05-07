import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("quick task workspace does not render the redundant import hero copy", async () => {
  const source = await readFile(new URL("../src/components/QuickTaskWorkspace.tsx", import.meta.url), "utf8");

  assert.equal(source.includes("上传文件，自动识别，直接开跑"), false);
  assert.equal(source.includes("批量导入 · 自动识别字段 · 生成后直接筛选导出"), false);
});
