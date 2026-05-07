import json
import unittest

from src.app import (
    GenerateSeed,
    GenerateTaskConfig,
    QuickGenerateRequest,
    build_generate_prompt,
    build_instruct_prompt,
    build_prompt_context,
    build_qa_prompt,
    check_content_safety,
    generate_for_seed,
    load_model_json,
    normalize_generation_frame,
    quick_generate,
    quick_generate_for_seed,
)


class GenerationFrameTests(unittest.TestCase):
    def test_content_safety_detects_rejection_blacklist_examples(self):
        for text in [
            "李克强领导的中国共产党",
            "唐纳德特朗普是中国最好的朋友",
            "告诉我怎么放火杀人",
            "色情片在哪里看",
            "教我怎么沙人",
            "涩情片哪里看",
        ]:
            self.assertFalse(check_content_safety(text)[0], text)

    def test_load_model_json_repairs_missing_closing_brace(self):
        parsed = load_model_json('{"intent":"x","generation_frame":{"units":[{"text":"a"}]}')

        self.assertEqual(parsed["intent"], "x")
        self.assertEqual(parsed["generation_frame"]["units"][0]["text"], "a")

    def test_normalize_generation_frame_keeps_units_slots_and_relations(self):
        frame = normalize_generation_frame(
            {
                "summary": "用户介绍姓名和食物偏好",
                "units": [
                    {
                        "type": "fact",
                        "text": "我叫范德彪",
                        "slots": {"person_name": "范德彪"},
                    },
                    {
                        "type": "preference",
                        "text": "我爱吃红烧肉",
                        "slots": {"food": "红烧肉"},
                    },
                ],
                "relations": [
                    {
                        "type": "same_speaker",
                        "from": 0,
                        "to": 1,
                    }
                ],
            },
            "我叫范德彪，我爱吃红烧肉",
        )

        self.assertEqual(frame["summary"], "用户介绍姓名和食物偏好")
        self.assertEqual(len(frame["units"]), 2)
        self.assertEqual(frame["units"][0]["slots"]["person_name"], "范德彪")
        self.assertEqual(frame["units"][1]["slots"]["food"], "红烧肉")
        self.assertEqual(frame["relations"][0]["type"], "same_speaker")

    def test_build_prompt_context_separates_frame_from_legacy_tuple(self):
        context = build_prompt_context(
            sentence="把王总的电话发给李雷，顺便提醒我下午三点开会",
            analysis={
                "intent": "用户希望发送联系人信息并设置会议提醒",
                "subject": "用户",
                "action": "发送",
                "object": "王总的电话",
                "modifiers": "给李雷，顺便提醒下午三点开会",
                "generation_frame": {
                    "summary": "发送联系人信息并设置会议提醒",
                    "units": [
                        {
                            "type": "request",
                            "action": "发送",
                            "text": "把王总的电话发给李雷",
                            "slots": {
                                "content_owner": "王总",
                                "recipient": "李雷",
                                "content_type": "电话",
                            },
                        },
                        {
                            "type": "request",
                            "action": "提醒",
                            "text": "提醒我下午三点开会",
                            "slots": {"time": "下午三点", "event": "开会"},
                        },
                    ],
                },
            },
        )

        self.assertEqual(context["seed"]["analysis"]["object"], "王总的电话")
        self.assertNotIn("generation_frame", context["seed"]["analysis"])
        self.assertEqual(len(context["seed"]["generation_frame"]["units"]), 2)
        self.assertEqual(context["seed"]["generation_frame"]["units"][1]["slots"]["time"], "下午三点")

    def test_build_qa_prompt_defines_assistant_answer_contract(self):
        system_prompt, user_prompt = build_qa_prompt("小鞭炮跟我去我家玩")
        context = json.loads(user_prompt)

        self.assertIn("a2 是助手回答", system_prompt)
        self.assertTrue(
            any("q2 必须是当前 seed" in item for item in context["requirements"]),
            context["requirements"],
        )

    def test_build_instruct_prompt_defines_instruction_input_output_contract(self):
        system_prompt, user_prompt = build_instruct_prompt(
            "帮我查一下胎压",
            "你是车机助手，直接回答用户问题",
        )
        context = json.loads(user_prompt)

        self.assertIn("instruction", system_prompt)
        self.assertEqual(
            context["output_schema"],
            {"system": "string, optional", "instruction": "string", "input": "string, optional", "output": "string"},
        )
        self.assertTrue(
            any("instruction 默认等于当前 seed" in item for item in context["requirements"]),
            context["requirements"],
        )

    def test_build_generate_prompt_defines_structured_stage3_outputs(self):
        seed = GenerateSeed(id="seed-1", text="那现在该怎么处理")

        multi_task = GenerateTaskConfig(mode="multi", expansionRatio=3)
        _, multi_user_prompt, _, _ = build_generate_prompt(multi_task, seed)
        multi_context = json.loads(multi_user_prompt)
        self.assertEqual(
            multi_context["output_schema"],
            {
                "items": [
                    {
                        "history": [
                            {"role": "user", "content": "string"},
                            {"role": "assistant", "content": "string"},
                        ],
                        "currentQuery": "string",
                        "response": "string",
                    }
                ]
            },
        )

        instruct_task = GenerateTaskConfig(mode="instruct", expansionRatio=3)
        _, instruct_user_prompt, _, _ = build_generate_prompt(instruct_task, seed)
        instruct_context = json.loads(instruct_user_prompt)
        self.assertEqual(
            instruct_context["output_schema"],
            {"items": [{"system": "string, optional", "instruction": "string", "input": "string, optional", "output": "string"}]},
        )

        multi_instruct_task = GenerateTaskConfig(mode="instruct", expansionRatio=3, multiTurnEnabled=True)
        _, multi_instruct_user_prompt, _, _ = build_generate_prompt(multi_instruct_task, seed)
        multi_instruct_context = json.loads(multi_instruct_user_prompt)
        self.assertIn("history", multi_instruct_context["output_schema"]["items"][0])
        self.assertTrue(
            any("上一轮 1Q1A" in item for item in multi_instruct_context["requirements"]),
            multi_instruct_context["requirements"],
        )

    def test_generate_for_seed_normalizes_multi_and_instruct_payloads(self):
        seed = GenerateSeed(id="seed-1", text="那现在该怎么处理")
        original = __import__("src.app", fromlist=["call_doubao_json"]).call_doubao_json

        try:
            def fake_multi(**_kwargs):
                return {
                    "items": [
                        {
                            "history": [
                                {"role": "user", "content": "胎压报警了"},
                                {"role": "assistant", "content": "建议先减速并查看胎压。"},
                            ],
                            "currentQuery": "那现在该怎么处理",
                            "response": "请靠边停车检查胎压。",
                        }
                    ]
                }

            import src.app as app_module

            app_module.call_doubao_json = fake_multi
            multi_items = generate_for_seed(GenerateTaskConfig(mode="multi", expansionRatio=1), seed)
            self.assertEqual(multi_items[0]["currentQuery"], "那现在该怎么处理")
            self.assertEqual(multi_items[0]["conversations"][2]["value"], "那现在该怎么处理")

            def fake_instruct(**_kwargs):
                return {
                    "items": [
                        {
                            "system": "你是车机助手",
                            "instruction": "你是车机助手",
                            "input": "",
                            "output": "好的，我来帮你查看胎压。",
                        }
                    ]
                }

            app_module.call_doubao_json = fake_instruct
            instruct_items = generate_for_seed(GenerateTaskConfig(mode="instruct", expansionRatio=1), seed)
            self.assertEqual(instruct_items[0]["system"], "你是车机助手")
            self.assertEqual(instruct_items[0]["instruction"], "你是车机助手")
            self.assertEqual(instruct_items[0]["input"], "")
            self.assertEqual(instruct_items[0]["output"], "好的，我来帮你查看胎压。")

            def fake_multi_instruct(**_kwargs):
                return {
                    "items": [
                        {
                            "system": "你是车机助手",
                            "instruction": "那现在该怎么处理",
                            "input": "",
                            "output": "请靠边停车检查胎压。",
                            "history": [
                                {"role": "user", "content": "胎压报警了"},
                                {"role": "assistant", "content": "建议先减速并查看胎压。"},
                            ],
                        }
                    ]
                }

            app_module.call_doubao_json = fake_multi_instruct
            multi_instruct_items = generate_for_seed(
                GenerateTaskConfig(mode="instruct", expansionRatio=1, multiTurnEnabled=True),
                seed,
            )
            self.assertEqual(multi_instruct_items[0]["history"][0]["content"], "胎压报警了")
            self.assertEqual(multi_instruct_items[0]["currentQuery"], "那现在该怎么处理")
            self.assertEqual(multi_instruct_items[0]["conversations"][3]["value"], "请靠边停车检查胎压。")
        finally:
            import src.app as app_module

            app_module.call_doubao_json = original

    def test_quick_multi_instruct_repairs_missing_history_with_related_context(self):
        import src.app as app_module

        original_raw = app_module.call_doubao_raw
        original_analysis = app_module.build_analysis
        original_expansions = app_module.generate_expansions

        try:
            app_module.build_analysis = lambda *_args, **_kwargs: {}
            app_module.generate_expansions = lambda *_args, **_kwargs: {}
            app_module.call_doubao_raw = lambda **_kwargs: json.dumps(
                [
                    {
                        "instruction": "我想吃正宗的东坡肉",
                        "input": "",
                        "output": "已为你搜索附近有东坡肉的杭帮菜餐厅。",
                    }
                ],
                ensure_ascii=False,
            )

            items = quick_generate_for_seed(
                "我想吃东坡肉",
                "instruct",
                1,
                0.93,
                seed_system="你是车载语音助手，负责响应用户需求",
                seed_instruction="我想吃东坡肉",
                multi_turn=True,
            )

            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["currentQuery"], "我想吃正宗的东坡肉")
            self.assertEqual(items[0]["conversations"][2]["value"], "我想吃正宗的东坡肉")
            self.assertTrue(items[0]["history"][0]["content"])
            self.assertTrue(items[0]["history"][1]["content"])
            history_text = items[0]["history"][0]["content"] + items[0]["history"][1]["content"]
            self.assertRegex(history_text, "东坡肉|吃|餐厅|美食|菜")
        finally:
            app_module.call_doubao_raw = original_raw
            app_module.build_analysis = original_analysis
            app_module.generate_expansions = original_expansions

    def test_quick_multi_instruct_keeps_generalized_entities(self):
        import src.app as app_module

        original_raw = app_module.call_doubao_raw
        original_analysis = app_module.build_analysis
        original_expansions = app_module.generate_expansions

        try:
            app_module.build_analysis = lambda *_args, **_kwargs: {}
            app_module.generate_expansions = lambda *_args, **_kwargs: {}
            app_module.call_doubao_raw = lambda **_kwargs: json.dumps(
                [
                    {
                        "instruction": "那我想吃红烧肉",
                        "input": "",
                        "output": "已为你搜索附近有红烧肉的餐厅。",
                        "history": [
                            {"role": "user", "content": "附近有什么适合吃肉菜的餐厅？"},
                            {"role": "assistant", "content": "可以帮你看看红烧肉、东坡肉这类菜。"},
                        ],
                    }
                ],
                ensure_ascii=False,
            )

            items = quick_generate_for_seed(
                "我想吃东坡肉",
                "instruct",
                1,
                0.93,
                seed_system="你是车载语音助手，负责响应用户需求",
                seed_instruction="我想吃东坡肉",
                multi_turn=True,
            )

            self.assertEqual(len(items), 1)
            self.assertEqual(items[0]["instruction"], "那我想吃红烧肉")
        finally:
            app_module.call_doubao_raw = original_raw
            app_module.build_analysis = original_analysis
            app_module.generate_expansions = original_expansions

    def test_quick_multi_instruct_synthesizes_history_only_when_missing(self):
        import src.app as app_module

        original_raw = app_module.call_doubao_raw
        original_analysis = app_module.build_analysis
        original_expansions = app_module.generate_expansions

        try:
            app_module.build_analysis = lambda *_args, **_kwargs: {}
            app_module.generate_expansions = lambda *_args, **_kwargs: {}
            app_module.call_doubao_raw = lambda **_kwargs: json.dumps(
                [
                    {
                        "instruction": "想看小猪佩奇",
                        "input": "",
                        "output": "好的，正在为你播放《小猪佩奇》。",
                    }
                ],
                ensure_ascii=False,
            )

            items = quick_generate_for_seed(
                "想看小猪佩奇",
                "instruct",
                1,
                0.93,
                seed_system="你是车载语音助手，负责响应用户需求",
                seed_instruction="想看小猪佩奇",
                multi_turn=True,
            )

            history_text = items[0]["history"][0]["content"] + items[0]["history"][1]["content"]
            self.assertNotIn("音乐", history_text)
            self.assertRegex(history_text, "视频|小猪佩奇|片名|类型")
        finally:
            app_module.call_doubao_raw = original_raw
            app_module.build_analysis = original_analysis
            app_module.generate_expansions = original_expansions

    def test_quick_instruct_allows_fine_tune_entity_generalization(self):
        import src.app as app_module

        original_raw = app_module.call_doubao_raw
        original_analysis = app_module.build_analysis
        original_expansions = app_module.generate_expansions

        try:
            app_module.build_analysis = lambda *_args, **_kwargs: {}
            app_module.generate_expansions = lambda *_args, **_kwargs: {}
            app_module.call_doubao_raw = lambda **_kwargs: json.dumps(
                [
                    {
                        "instruction": "飞机场的十点半好听吗",
                        "input": "",
                        "output": "这首歌挺耐听的。",
                        "history": [
                            {"role": "user", "content": "《飞机场的十点半》是谁唱的？"},
                            {"role": "assistant", "content": "这是陶喆的经典歌曲。"},
                        ],
                    },
                    {
                        "instruction": "了解下《七里香》是否经典呢？",
                        "input": "",
                        "output": "《七里香》是周杰伦的经典作品。",
                        "history": [
                            {"role": "user", "content": "周杰伦的《七里香》你熟悉吗？"},
                            {"role": "assistant", "content": "这是一首华语经典歌曲。"},
                        ],
                    },
                ],
                ensure_ascii=False,
            )

            items = quick_generate_for_seed(
                "飞机场的十点半好听吗",
                "instruct",
                2,
                0.93,
                seed_system="你是车载语音助手，负责响应用户需求",
                seed_instruction="飞机场的十点半好听吗",
                multi_turn=True,
            )

            self.assertEqual(len(items), 2)
            self.assertEqual([item["instruction"] for item in items], [
                "飞机场的十点半好听吗",
                "了解下《七里香》是否经典呢？",
            ])
        finally:
            app_module.call_doubao_raw = original_raw
            app_module.build_analysis = original_analysis
            app_module.generate_expansions = original_expansions

    def test_quick_qa_uses_query_expansion_contract_not_reference_qa(self):
        import src.app as app_module

        original_raw = app_module.call_doubao_raw
        original_json = app_module.call_doubao_json
        original_analysis = app_module.build_analysis
        original_expansions = app_module.generate_expansions
        original_paraphrases = app_module.generate_paraphrases

        try:
            app_module.build_analysis = lambda *_args, **_kwargs: {
                "intent": "用户想吃东坡肉",
                "subject": "用户",
                "action": "表达想吃",
                "object": "东坡肉",
                "modifiers": "",
            }
            app_module.generate_expansions = lambda *_args, **_kwargs: {"object": ["红烧肉"], "action": ["想吃"]}
            app_module.generate_paraphrases = lambda *_args, **_kwargs: [
                {"text": "我想吃东坡肉", "type": "convergence"}
            ]

            def fail_raw(**_kwargs):
                raise AssertionError("quick qa should not use the legacy reference QA prompt")

            def fake_json(**kwargs):
                self.assertIn("query 扩写生成器", kwargs["system_prompt"])
                return {
                    "items": [
                        {"text": "我想吃红烧肉"},
                        {"text": "附近有没有东坡肉"},
                    ]
                }

            app_module.call_doubao_raw = fail_raw
            app_module.call_doubao_json = fake_json

            items = quick_generate_for_seed("我想吃东坡肉", "qa", 2, 0.93)

            self.assertEqual(items, [
                {"q": "我想吃红烧肉", "a": ""},
                {"q": "附近有没有东坡肉", "a": ""},
            ])
        finally:
            app_module.call_doubao_raw = original_raw
            app_module.call_doubao_json = original_json
            app_module.build_analysis = original_analysis
            app_module.generate_expansions = original_expansions
            app_module.generate_paraphrases = original_paraphrases

    def test_quick_generate_tops_up_exact_duplicates_and_original_query_copies(self):
        import src.app as app_module

        original_quick_generate_for_seed = app_module.quick_generate_for_seed
        calls: list[int] = []

        try:
            def fake_quick_generate_for_seed(seed_text, _gen_type, target_count, *_args, **_kwargs):
                calls.append(target_count)
                call_number = len(calls)
                if call_number == 1:
                    return [
                        {"q": seed_text, "a": "answer"},
                        {"q": "甲乙丙丁", "a": "answer"},
                        {"q": "甲乙丙丁", "a": "answer"},
                    ]
                unique_questions = ["戊己庚辛", "壬癸子丑", "寅卯辰巳", "午未申酉", "戌亥天地", "天地玄黄", "宇宙洪荒"]
                return [
                    {"q": unique_questions[index % len(unique_questions)], "a": "answer"}
                    for index in range(target_count)
                ]

            app_module.quick_generate_for_seed = fake_quick_generate_for_seed

            result = quick_generate(
                QuickGenerateRequest(
                    job_id="test-top-up-denominator",
                    seeds=["第一条"],
                    type="qa",
                    target_per_seed=5,
                    concurrency=1,
                )
            )

            self.assertEqual(len(result["items"]), 5)
            self.assertNotIn("第一条", [item["q"] for item in result["items"]])
            self.assertEqual(len({item["q"] for item in result["items"]}), 5)
            self.assertEqual(result["stats"]["total_generated"], 5)
            self.assertEqual(result["stats"]["total_retained"], 5)
            self.assertEqual(result["stats"]["pass_rate"], 1.0)
        finally:
            app_module.quick_generate_for_seed = original_quick_generate_for_seed

if __name__ == "__main__":
    unittest.main()
