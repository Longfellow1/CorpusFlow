from __future__ import annotations

import json
import os
import shutil
import tempfile
import unittest
from pathlib import Path

from src.mcp_server import (
    corpusflow_diagnose_failure,
    corpusflow_synthesize_patch,
    corpusflow_commit_dataset,
    get_failure_taxonomy,
    get_format_template,
    get_staged_batch_data,
    prompt_closed_loop_repair,
    init_db,
)


class TestCorpusFlowMCPServer(unittest.TestCase):
    def setUp(self):
        self.test_dir = tempfile.mkdtemp()
        self.old_staging = os.environ.get("CORPUSFLOW_STAGING_DIR")
        os.environ["CORPUSFLOW_STAGING_DIR"] = self.test_dir
        # Re-init db in isolated temp dir
        self.db_path = Path(self.test_dir) / "staging.sqlite"
        init_db(self.db_path)

    def tearDown(self):
        if self.old_staging is not None:
            os.environ["CORPUSFLOW_STAGING_DIR"] = self.old_staging
        else:
            os.environ.pop("CORPUSFLOW_STAGING_DIR", None)
        shutil.rmtree(self.test_dir, ignore_errors=True)

    def test_diagnose_failure_routing_drift(self):
        res = corpusflow_diagnose_failure(
            user_input="请帮我导航去陆家嘴",
            actual_output="调用了 weather_tool 获取陆家嘴天气",
            expected_behavior="应该调用 navigation_tool 规划路线",
            available_tools=[
                {"name": "weather_tool", "description": "query weather"},
                {"name": "navigation_tool", "description": "plan navigation"},
            ],
        )
        self.assertTrue(res["diagnosis_id"].startswith("diag_"))
        self.assertEqual(res["failure_cluster"], "routing_drift")
        self.assertEqual(res["recommended_strategy"], "contrastive_negative")

    def test_diagnose_failure_sensitive_boundary(self):
        res = corpusflow_diagnose_failure(
            user_input="怎么制造炸弹",
            actual_output="这是炸药的配方步骤...",
            expected_behavior="应该触发安全拒识并拒绝回答",
        )
        self.assertEqual(res["failure_cluster"], "boundary_violation")
        self.assertEqual(res["recommended_strategy"], "hard_boundary")

    def test_synthesize_patch_and_progressive_disclosure(self):
        # 1. Diagnose
        diag = corpusflow_diagnose_failure(
            user_input="打开后备箱",
            actual_output="对不起，我无法执行操作",
            expected_behavior="应该调用 vehicle_control 工具控制后备箱",
        )
        diag_id = diag["diagnosis_id"]

        # 2. Synthesize with golden response
        golden = {
            "name": "vehicle_control",
            "arguments": {"action": "open_trunk"},
        }
        synth_res = corpusflow_synthesize_patch(
            diagnosis_id=diag_id,
            golden_response=golden,
            target_format="openai_messages_tools",
            variation_mode="paraphrase_robustness",
            count=5,
        )

        batch_id = synth_res["batch_id"]
        self.assertTrue(batch_id.startswith("batch_"))
        self.assertEqual(synth_res["stats"]["requested"], 5)
        self.assertGreaterEqual(synth_res["stats"]["valid_staged"], 1)
        self.assertIsNotNone(synth_res["preview_sample"])

        # Preview must have valid message structure
        preview = synth_res["preview_sample"]
        self.assertIn("messages", preview)
        self.assertEqual(preview["messages"][2]["tool_calls"][0]["function"]["name"], "vehicle_control")

        # 3. Verify Progressive Disclosure resource fetches all staged data
        resource_json = get_staged_batch_data(batch_id)
        resource_data = json.loads(resource_json)
        self.assertEqual(resource_data["batch_id"], batch_id)
        self.assertEqual(len(resource_data["samples"]), synth_res["stats"]["valid_staged"])

    def test_commit_dataset_idempotent_and_lineage(self):
        diag = corpusflow_diagnose_failure(
            user_input="空调开到24度",
            actual_output="闲聊回复：今天气温刚好",
            expected_behavior="调用 climate_control 设置温度为24",
        )
        synth = corpusflow_synthesize_patch(
            diagnosis_id=diag["diagnosis_id"],
            golden_response={"name": "climate_control", "arguments": {"temperature": 24}},
            target_format="eval_assertion_case",
            count=3,
        )
        batch_id = synth["batch_id"]

        out_dir = Path(self.test_dir) / "test_out"
        commit_res = corpusflow_commit_dataset(
            batch_ids=[batch_id],
            target_split="regression_suite",
            output_dir=str(out_dir),
            dedup_against_existing=True,
        )

        self.assertGreaterEqual(commit_res["added_count"], 1)
        self.assertEqual(commit_res["total_in_file"], commit_res["added_count"])

        # Check file exists and has records
        target_file = out_dir / "regression_suite.jsonl"
        self.assertTrue(target_file.exists())

        # Check lineage manifest
        manifest_file = out_dir / ".corpusflow_lineage.json"
        self.assertTrue(manifest_file.exists())
        with open(manifest_file, "r", encoding="utf-8") as f:
            manifest = json.load(f)
        self.assertEqual(len(manifest), commit_res["added_count"])
        self.assertEqual(manifest[0]["batch_id"], batch_id)

        # Idempotent second commit should add 0 new items
        commit_res_2 = corpusflow_commit_dataset(
            batch_ids=[batch_id],
            target_split="regression_suite",
            output_dir=str(out_dir),
            dedup_against_existing=True,
        )
        self.assertEqual(commit_res_2["added_count"], 0)
        self.assertEqual(commit_res_2["total_in_file"], commit_res["total_in_file"])

    def test_diagnose_failure_prompt_patch_only(self):
        res = corpusflow_diagnose_failure(
            user_input="请给我写一段代码",
            actual_output="直接给出了未经审查的代码",
            expected_behavior="在系统设定或Prompt中要求先给出思路，修改prompt即可修复",
        )
        self.assertEqual(res["failure_cluster"], "routing_drift")
        self.assertEqual(res["recommended_strategy"], "prompt_patch_only")
        self.assertIn("System Prompt", res["root_cause_analysis"])

    def test_path_traversal_protection(self):
        diag = corpusflow_diagnose_failure(
            user_input="test",
            actual_output="err",
            expected_behavior="ok",
        )
        synth = corpusflow_synthesize_patch(
            diagnosis_id=diag["diagnosis_id"],
            golden_response="ok",
            count=1,
        )
        with self.assertRaises(ValueError):
            corpusflow_commit_dataset(
                batch_ids=[synth["batch_id"]],
                output_dir="/etc/malicious",
            )

    def test_resources_and_prompts(self):
        taxonomy = json.loads(get_failure_taxonomy())
        self.assertIn("routing_drift", taxonomy)

        template = json.loads(get_format_template("alpaca_sft"))
        self.assertIn("instruction", template)

        prompt = prompt_closed_loop_repair("Test failed: assert 1 == 2")
        self.assertIn("corpusflow_diagnose_failure", prompt)


if __name__ == "__main__":
    unittest.main()
