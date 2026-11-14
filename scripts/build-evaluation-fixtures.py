#!/usr/bin/env python3
"""Build CorpusFlow evaluation fixtures from migration-package evidence.

The generated fixtures intentionally redact raw message/session identifiers while
preserving real vehicle-voice queries, answers, quality labels, and context
windows needed for evaluation-mode regression.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import re
import subprocess
import sys
from collections import Counter
from pathlib import Path
from typing import Any

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MIGRATION_ROOT = Path("/Users/Harland/Go/data_analysis/migration_package")
DEFAULT_CHAT_REPORT = Path("/Users/Harland/Go/Chat/CHAT-0410/eval/reports/mt_migration90_20260515_095956_e4a4c8")
DEFAULT_CHAT_PROJECT_ROOT = Path("/Users/Harland/Go/Chat/CHAT-0410")
DEFAULT_CHAT_MULTITURN_DIR = ROOT / "tmp/chat-migration-multiturn"
DEFAULT_ANALYSIS_ID = "analysis_20260427_204247"
CHINESE_CHAR_RE = re.compile(r"[\u4e00-\u9fff]")
LOW_INFORMATION_QUERIES = {
    "到这儿",
    "到这",
    "到时",
    "到了",
    "去哪",
    "去哪里",
    "去",
    "去1",
    "去一",
    "去我去",
    "去的时候",
    "到时候",
    "到时候呢",
    "到你给我看",
    "听懂",
    "听得懂",
    "听你啊",
    "听9个",
    "听你妈",
    "是啥",
    "是多少",
    "登峰",
    "第1个",
    "第一个",
    "路口",
    "查询中",
    "下店",
    "哪个",
    "这个",
    "那个",
    "哪里",
    "在那里",
    "了吗",
    "设置",
    "打开",
    "直接打开",
}
LOW_INFORMATION_PATTERNS = [
    re.compile(r"^(到|去)(这儿|那儿|这里|那里|时|了|哪|哪里|哪儿)?$"),
    re.compile(r"^(这个|那个|哪里|哪儿|在哪|在那里|方向|中心|小路)$"),
    re.compile(r"^听(懂|得懂|你|你啊|你妈|9个)$"),
    re.compile(r"^第[一1]个$"),
]
NEGATIVE_SIGNAL_RE = re.compile(
    r"听不懂|识别不了|打不开|没反应|不要说话|别说话|闭嘴|别吵|太慢|卡顿|死机|受不了|烦|不行|没用|不对|不满意|听不清|不明白"
)
MAP_ACTION_RE = re.compile(r"导航|路线|规划|途经点|怎么走|开车|附近|去|到|离.+多远")
MAP_PLACE_RE = re.compile(
    r"万达|高铁站|火车站|机场|地铁|停车场|加油站|充电站|服务区|公园|超市|商场|广场|医院|学校|大学|酒店|宾馆|高速|目的地|当前位置|附近|[\u4e00-\u9fff]{2,}(路|街|大道|街道|村|镇|县|市|区)"
)
MAP_ROUTE_RE = re.compile(r"路线|途经点|哪条路|这条路|路是哪里|离.+多远|怎么走")
MAP_NOISE_RE = re.compile(
    r"不知道去哪|喂你好|新的急件|任的|就这个|账和|4个朋友|太哦|门口给你|跟着我走吧|导航到了爆|播放|歌曲|小鸭子|鸭子|玩具|刷一下|相信他|哪条路线|这条路|从这边|从那边|去哪里大学|打个|不到超市"
)
MUSIC_INTENT_RE = re.compile(r"播放|放一首|放首|听歌|歌曲|音乐|歌词|专辑|电台|收音机|什么歌|歌手|热门的歌|一首.+歌|播放失败")
APP_INTENT_RE = re.compile(r"打开|启动|进入|关闭")
AIR_CONTROL_RE = re.compile(r"空调|温度|风速|制热|制冷|香氛|除霜|暖风|冷风")
CAR_CONTROL_RE = re.compile(r"车窗|窗户|天窗|座椅|后备箱|钥匙|车门|小憩|模式|收音机|玻璃|后视镜|灯|锁")
KNOWN_APP_RE = re.compile(r"siri|虎嗅|爱奇艺|抖音|微信|高德|百度|酷狗|qq|小铁")
PROFANE_OR_ASR_FRAGMENT_RE = re.compile(r"tmd|你妈")
QUERY_DUPLICATE_CAP_BY_DIMENSION = {
    "migration_domain_error": 1,
    "migration_weak_answer": 1,
    "migration_negative_complaint": 2,
    "migration_explicit_negative_emotion": 2,
    "migration_multiturn_context": 3,
    "chat_eval_execution_failure": 3,
}
DIMENSION_SMOKE_TARGETS = {
    "migration_weak_answer": 6,
    "migration_domain_error": 6,
    "migration_explicit_negative_emotion": 6,
    "migration_negative_complaint": 6,
    "migration_multiturn_context": 4,
    "chat_eval_execution_failure": 6,
}
DIMENSION_CASE_PREFIXES = {
    "migration_domain_error": "migration-domain-error",
    "migration_weak_answer": "migration-weak-answer",
    "migration_negative_complaint": "migration-complaint",
    "migration_explicit_negative_emotion": "migration-negative-emotion",
    "migration_multiturn_context": "migration-multiturn-context",
    "chat_eval_execution_failure": "chat-eval-execution",
}


def clean(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, float) and math.isnan(value):
        return ""
    text = str(value).strip()
    return "" if text.lower() in {"nan", "none", "null"} else text


def chinese_char_count(value: Any) -> int:
    return len(CHINESE_CHAR_RE.findall(clean(value)))


def normalized_query(value: Any) -> str:
    return re.sub(r"\s+", "", clean(value)).lower()


def is_low_information_query(query: str) -> bool:
    compact = normalized_query(query)
    return compact in LOW_INFORMATION_QUERIES or any(pattern.search(compact) for pattern in LOW_INFORMATION_PATTERNS)


def has_negative_signal(row: dict[str, Any]) -> bool:
    text = "\n".join([
        clean(row.get("question") or row.get("user_input")),
        clean(row.get("explicit_reason")),
        clean(row.get("sentiment_reason")),
    ])
    return bool(NEGATIVE_SIGNAL_RE.search(text))


def has_high_confidence_map_query(query: str) -> bool:
    compact = normalized_query(query)
    if is_low_information_query(compact) or PROFANE_OR_ASR_FRAGMENT_RE.search(compact):
        return False
    if re.search(r"导航(哪里|去哪|不知道)|到哪里都|不是.*最高|打卡", compact) or MAP_NOISE_RE.search(compact):
        return False
    if not MAP_ACTION_RE.search(compact):
        return False
    return bool(MAP_PLACE_RE.search(compact) or MAP_ROUTE_RE.search(compact))


def has_high_confidence_music_query(query: str) -> bool:
    compact = normalized_query(query)
    if is_low_information_query(compact) or re.search(r"听(懂|得懂|你|你妈|9个)", compact):
        return False
    if CAR_CONTROL_RE.search(compact) or AIR_CONTROL_RE.search(compact):
        return False
    if compact in {"播放了没有", "是不是播放"} or "视频" in compact:
        return False
    return bool(MUSIC_INTENT_RE.search(compact))


def has_high_confidence_app_query(query: str) -> bool:
    compact = normalized_query(query)
    if is_low_information_query(compact):
        return False
    if CAR_CONTROL_RE.search(compact) or AIR_CONTROL_RE.search(compact) or re.search(r"这个|那个|直接|自动|车辆|他人|反光|加油|手提箱|家园|第.*92|加\d", compact):
        return False
    return bool(KNOWN_APP_RE.search(compact))


def has_high_confidence_control_query(query: str, target_agent: str) -> bool:
    compact = normalized_query(query)
    if is_low_information_query(compact):
        return False
    if target_agent == "airControl":
        if re.search(r"[a-zA-Z]|风速峰.*哪个峰", compact):
            return False
        return bool(AIR_CONTROL_RE.search(compact) and re.search(r"开|关|调|制热|制冷|温度|风速|香氛|除霜|暖风|冷风", compact))
    return bool(CAR_CONTROL_RE.search(compact) and re.search(r"打开|关闭|设置|调|启动|没反应|打不开|为什么", compact))


def new_quality_stats() -> dict[str, Any]:
    return {
        "rejected_total": 0,
        "rejected_by_reason": Counter(),
        "rejected_by_dimension": Counter(),
        "rejected_samples": [],
    }


def record_rejection(stats: dict[str, Any] | None, dimension: str, reason: str, row: dict[str, Any]) -> None:
    if stats is None:
        return
    stats["rejected_total"] += 1
    stats["rejected_by_reason"][reason] += 1
    stats["rejected_by_dimension"][dimension] += 1
    if len(stats["rejected_samples"]) < 24:
        stats["rejected_samples"].append({
            "dimension": dimension,
            "reason": reason,
            "query": clean(row.get("question") or row.get("user_input")),
            "target_agent": clean(row.get("target_agent")),
            "actual_agent": clean(row.get("actual_agent") or row.get("main_skill") or row.get("agent")),
        })


def quality_rejection_reason(row: dict[str, Any], dimension: str) -> str:
    query = clean(row.get("question") or row.get("user_input"))
    if not query:
        return "missing_query"

    if chinese_char_count(query) < 4:
        return "short_chinese_query"

    if dimension in {"migration_domain_error", "migration_weak_answer"}:
        if is_low_information_query(query):
            return "low_information_fragment"

    if dimension == "migration_domain_error":
        target_agent = clean(row.get("target_agent"))
        if target_agent == "mapU" and not has_high_confidence_map_query(query):
            return "weak_mapu_intent"
        if target_agent == "musicX" and not has_high_confidence_music_query(query):
            return "weak_music_intent"
        if target_agent == "app" and not has_high_confidence_app_query(query):
            return "weak_app_intent"
        if target_agent in {"airControl", "carControl"} and not has_high_confidence_control_query(query, target_agent):
            return "weak_vehicle_control_intent"
        if not target_agent:
            return "missing_target_agent"

    if dimension in {"migration_negative_complaint", "migration_explicit_negative_emotion"} and not has_negative_signal(row):
        return "weak_negative_signal"

    return ""


def read_json(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def read_jsonl(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                rows.append(json.loads(line))
    return rows


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")


def risk_types(row: dict[str, Any]) -> list[str]:
    raw = row.get("risk_types", [])
    if isinstance(raw, list):
        return [clean(item) for item in raw if clean(item)]
    return [item for item in re.split(r"[,;|]\s*", clean(raw)) if item]


def synthetic_row_id(prefix: str, index: int) -> str:
    return f"{prefix}-{index:04d}"


def context_lines(row: dict[str, Any], extra: list[str] | None = None) -> str:
    fields = [
        f"risk_types={','.join(risk_types(row))}",
        f"primary_reason={clean(row.get('primary_reason'))}",
        f"secondary_reason={clean(row.get('secondary_reason'))}",
        f"actual_agent={clean(row.get('actual_agent') or row.get('main_skill') or row.get('agent'))}",
        f"target_agent={clean(row.get('target_agent'))}",
        f"sentiment={clean(row.get('sentiment_label'))}/{clean(row.get('sentiment_intensity'))}: {clean(row.get('sentiment_reason'))}",
        f"create_time={clean(row.get('create_time'))}",
        "source_message_id=<redacted>",
    ]
    if extra:
        fields.extend(extra)
    return "\n".join(line for line in fields if line and not line.endswith("="))


def expected_for_dimension(row: dict[str, Any], dimension: str) -> str:
    actual = clean(row.get("actual_agent") or row.get("main_skill") or row.get("agent"))
    target = clean(row.get("target_agent"))
    if dimension == "migration_domain_error":
        return f"应落到正确车载技能域/工具 target_agent={target or '<expected_tool>'}，不要落到 actual_agent={actual or '<actual_tool>'}；需要保留 query 中的导航/音乐/车控等意图。"
    if dimension == "migration_negative_complaint":
        return "应识别投诉、抱怨或体验失败，先短句承认问题，再给出可执行纠偏路径。"
    if dimension == "migration_explicit_negative_emotion":
        return "应显式识别用户负向情绪或体验失败，先承认问题并给出可执行纠偏路径。"
    if dimension == "migration_multiturn_context":
        return "应利用完整多轮上下文处理复询、指代和短追问，不把当前轮当成孤立单轮。"
    if dimension == "chat_eval_execution_failure":
        return "应在多轮 Chat eval 中保持正确模式、工具、有效 query 和可用回答质量。"
    return "应给出具体、可执行、与用户 query 对齐的回答；缺槽时应明确补哪个槽位，避免泛化兜底或空泛弱答。"


def failure_note_for_dimension(row: dict[str, Any], dimension: str) -> str:
    actual = clean(row.get("actual_agent") or row.get("main_skill") or row.get("agent"))
    target = clean(row.get("target_agent"))
    answer = clean(row.get("answer"))
    if dimension == "migration_domain_error":
        return f"落域错误 / wrong tool / 路由错误：target_agent={target or '<missing>'}，actual_agent={actual or '<missing>'}。"
    if dimension == "migration_negative_complaint":
        return f"负向情绪 / 投诉 / complaint：用户表达体验失败，当前回答未充分安抚和纠偏。answer={answer[:120]}"
    if dimension == "migration_explicit_negative_emotion":
        return f"显式负向情绪 / negative emotion：explicit_reason={clean(row.get('explicit_reason')) or clean(row.get('sentiment_reason'))}；需要做情绪识别和纠偏建议。"
    if dimension == "migration_multiturn_context":
        return "多轮上下文 / 复询 / 指代解析失败：需要利用 history、上一轮目标和当前短追问完成恢复。"
    return f"弱答 / weak_answer / 空泛无帮助：actual_agent={actual}，answer={answer[:160]}"


def dimension_for_risk(row: dict[str, Any]) -> str:
    types = set(risk_types(row))
    primary = clean(row.get("primary_reason"))
    if "domain_error" in types or primary == "落域错误":
        return "migration_domain_error"
    if "complaint" in types or "抱怨" in primary:
        return "migration_negative_complaint"
    if "repetition" in types or primary == "复询":
        return "migration_multiturn_context"
    return "migration_weak_answer"


def tags_for_dimension(dimension: str) -> str:
    if dimension == "migration_domain_error":
        return "wrong_tool;domain_error;migration_package"
    if dimension in {"migration_negative_complaint", "migration_explicit_negative_emotion"}:
        return "negative_emotion;weak_answer;migration_package"
    if dimension == "migration_multiturn_context":
        return "memory_missing;coreference_failed;repetition;migration_package"
    if dimension == "chat_eval_execution_failure":
        return "wrong_tool;weak_answer;memory_missing;chat_eval"
    return "weak_answer;migration_package"


def corpusflow_row(
    *,
    case_id: str,
    source: str,
    dimension: str,
    user_input: str,
    actual_output: str,
    retrieved_contexts: str,
    tool_calls: list[str],
    index: int,
    severity: str = "high",
    messages: list[dict[str, str]] | None = None,
) -> dict[str, Any]:
    row: dict[str, Any] = {
        "case_id": case_id,
        "source": source,
        "dimension": dimension,
        "user_input": user_input,
        "actual_output": actual_output,
        "expected_behavior": expected_for_dimension({"actual_agent": tool_calls[-1] if tool_calls else ""}, dimension),
        "grading_result": "fail",
        "pass": "false",
        "failure_note": failure_note_for_dimension({"answer": actual_output, "actual_agent": tool_calls[-1] if tool_calls else ""}, dimension),
        "retrieved_contexts": retrieved_contexts,
        "tool_calls": json.dumps(tool_calls, ensure_ascii=False),
        "session_id": f"migration-fixture-session-{index:04d}",
        "trace_id": f"migration-fixture-trace-{index:04d}",
        "domain": "vehicle_agent",
        "severity": severity,
        "tags": tags_for_dimension(dimension),
    }
    if messages:
        row["messages"] = json.dumps(messages, ensure_ascii=False)
    return row


def risk_row_to_fixture(row: dict[str, Any], index: int) -> dict[str, Any]:
    dimension = dimension_for_risk(row)
    case_prefix = {
        "migration_domain_error": "migration-domain-error",
        "migration_negative_complaint": "migration-complaint",
        "migration_multiturn_context": "migration-repetition-context",
        "migration_weak_answer": "migration-weak-answer",
    }[dimension]
    return {
        "case_id": synthetic_row_id(case_prefix, index),
        "source": f"migration_package.{DEFAULT_ANALYSIS_ID}.risk_analysis",
        "dimension": dimension,
        "user_input": clean(row.get("question")),
        "actual_output": clean(row.get("answer")),
        "expected_behavior": expected_for_dimension(row, dimension),
        "grading_result": "fail",
        "pass": "false",
        "failure_note": failure_note_for_dimension(row, dimension),
        "retrieved_contexts": context_lines(row),
        "tool_calls": json.dumps([clean(row.get("actual_agent") or row.get("main_skill"))], ensure_ascii=False),
        "session_id": f"migration-fixture-session-{index:04d}",
        "trace_id": f"migration-fixture-trace-{index:04d}",
        "domain": "vehicle_agent",
        "severity": "high" if dimension == "migration_domain_error" else "medium",
        "tags": tags_for_dimension(dimension),
    }


def explicit_negative_row_to_fixture(row: dict[str, Any], index: int) -> dict[str, Any]:
    dimension = "migration_explicit_negative_emotion"
    return {
        "case_id": synthetic_row_id("migration-negative-emotion", index),
        "source": f"migration_package.{DEFAULT_ANALYSIS_ID}.sentiment_analysis.explicit_samples.negative",
        "dimension": dimension,
        "user_input": clean(row.get("question")),
        "actual_output": clean(row.get("answer")),
        "expected_behavior": expected_for_dimension(row, dimension),
        "grading_result": "fail",
        "pass": "false",
        "failure_note": failure_note_for_dimension(row, dimension),
        "retrieved_contexts": "\n".join([
            f"agent={clean(row.get('agent'))}",
            f"explicit_reason={clean(row.get('explicit_reason'))}",
            "source_message_id=<redacted>",
        ]),
        "tool_calls": json.dumps([clean(row.get("agent"))], ensure_ascii=False),
        "session_id": f"migration-fixture-session-{index:04d}",
        "trace_id": f"migration-fixture-trace-{index:04d}",
        "domain": "vehicle_agent",
        "severity": "high",
        "tags": tags_for_dimension(dimension),
    }


def chat_subtype(row: dict[str, Any]) -> tuple[str, str, str]:
    text = "\n".join(clean(row.get(key)) for key in [
        "fail_reason",
        "corrected_fail_reason",
        "answer_quality_reason",
        "tool_status",
        "result_quality",
        "effective_query",
        "final_text_snippet",
    ]).lower()
    expected_tool = clean(row.get("corrected_expected_tool") or row.get("expected_tool"))
    got_tool = clean(row.get("got_tool"))
    if "wrong_mode" in text or (expected_tool and got_tool and expected_tool != got_tool):
        return "wrong_tool", "wrong_mode_or_tool", "wrong tool / 模式或工具选择错误"
    if "effective_query" in text or clean(row.get("effective_query")) not in {"", clean(row.get("query"))}:
        return "memory_missing", "effective_query_pollution", "多轮上下文 / effective query 污染"
    if "fallback" in text or "unusable" in text or "无法获取" in text:
        return "weak_answer", "provider_fallback_no_answer", "弱答 / weak_answer / provider fallback 或空结果"
    return "weak_answer", "answer_quality", "弱答 / weak_answer / 回答质量不可用"


def chat_row_to_fixture(row: dict[str, Any], index: int) -> dict[str, Any]:
    signal, subtype, reason = chat_subtype(row)
    case_id = synthetic_row_id(f"chat-eval-{subtype.replace('_', '-')}", index)
    expected_tool = clean(row.get("corrected_expected_tool") or row.get("expected_tool"))
    got_tool = clean(row.get("got_tool"))
    effective_query = clean(row.get("effective_query"))
    final_text = clean(row.get("final_text_snippet"))
    failure_note = (
        f"{reason}：expected_mode={clean(row.get('corrected_expected_mode') or row.get('expected_mode'))}，"
        f"expected_tool={expected_tool}，got_tool={got_tool}，effective_query={effective_query}。"
    )
    if signal == "memory_missing":
        failure_note += " 需要 history/current query 一致性，避免上下文污染。"
    return {
        "case_id": case_id,
        "source": "chat.eval.mt_migration90.answer_quality",
        "dimension": "chat_eval_execution_failure",
        "user_input": clean(row.get("query")),
        "actual_output": final_text,
        "expected_behavior": expected_for_dimension(row, "chat_eval_execution_failure"),
        "grading_result": "fail",
        "pass": "false",
        "failure_note": failure_note,
        "retrieved_contexts": "\n".join([
            f"case_type={clean(row.get('case_type'))}",
            f"turn_case_type={clean(row.get('turn_case_type'))}",
            f"answer_quality={clean(row.get('answer_quality'))}",
            f"answer_quality_reason={clean(row.get('answer_quality_reason'))}",
            "source_message_id=<redacted>",
        ]),
        "tool_calls": json.dumps([got_tool] if got_tool else [], ensure_ascii=False),
        "session_id": f"chat-fixture-session-{index:04d}",
        "trace_id": f"chat-fixture-trace-{index:04d}",
        "domain": "vehicle_agent",
        "severity": "high" if signal == "wrong_tool" else "medium",
        "tags": {
            "wrong_tool": "wrong_tool;chat_eval",
            "memory_missing": "memory_missing;coreference_failed;chat_eval",
            "weak_answer": "weak_answer;chat_eval",
        }[signal],
    }


def ensure_chat_multiturn_dir(chat_project_root: Path, out_dir: Path) -> None:
    full_path = out_dir / "migration_multi_full_100.jsonl"
    if full_path.exists():
        return
    script_path = chat_project_root / "scripts/build_migration_multiturn_eval_dataset.py"
    if not script_path.exists():
        return
    out_dir.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [sys.executable, str(script_path), "--out-dir", str(out_dir)],
        check=True,
        cwd=str(ROOT),
    )


def build_chat_multiturn_rows(
    chat_multiturn_dir: Path,
    chat_badcase_rows: list[dict[str, Any]],
    start_index: int,
    limit: int,
) -> list[dict[str, Any]]:
    cases = read_jsonl(chat_multiturn_dir / "migration_multi_full_100.jsonl")
    if not cases:
        return []
    badcases_by_group: dict[str, list[dict[str, Any]]] = {}
    for row in chat_badcase_rows:
        key = clean(row.get("source_case_id"))
        if not key:
            continue
        badcases_by_group.setdefault(key, []).append(row)

    rows: list[dict[str, Any]] = []
    for case in cases[:limit]:
        turns = case.get("turns") if isinstance(case.get("turns"), list) else []
        if len(turns) < 3:
            continue
        source_case_id = clean(case.get("source_case_id"))
        matched_badcases = badcases_by_group.get(source_case_id) or []
        target_badcase = matched_badcases[-1] if matched_badcases else {}
        target_turn = turns[-1]
        if target_badcase:
            target_turn = next(
                (turn for turn in turns if clean(turn.get("turn_id")) == clean(target_badcase.get("turn_id"))),
                target_turn,
            )
        signal, subtype, reason = chat_subtype(target_badcase) if target_badcase else (
            "memory_missing",
            clean(case.get("case_type")) or "multi_context",
            "多轮上下文 / history 工具链评测样本",
        )
        messages = [{"role": "user", "content": clean(turn.get("query"))} for turn in turns if clean(turn.get("query"))]
        tool_calls = [
            clean(turn.get("expect_tool") or turn.get("source_agent"))
            for turn in turns
            if clean(turn.get("expect_tool") or turn.get("source_agent"))
        ]
        idx = start_index + len(rows)
        actual_output = clean(target_badcase.get("final_text_snippet")) or f"多轮执行失败：{reason}"
        effective_query = clean(target_badcase.get("effective_query"))
        failure_note = (
            f"多轮上下文 / history / coreference eval failure：case_type={clean(case.get('case_type'))}，"
            f"subtype={subtype}，{reason}。"
        )
        if effective_query:
            failure_note += f" effective_query={effective_query}，需要避免上下文污染。"
        row = corpusflow_row(
            case_id=synthetic_row_id("migration-chat-multiturn", idx),
            source="chat.eval.migration_multiturn_from_parquet_sessionizer",
            dimension="migration_multiturn_context",
            user_input=clean(target_turn.get("query")),
            actual_output=actual_output,
            retrieved_contexts="\n".join([
                "context_source=Chat migration multi-turn dataset",
                "raw_source=parquet + migration Sessionizer",
                f"case_type={clean(case.get('case_type'))}",
                f"tags={';'.join(clean(tag) for tag in case.get('tags', []) if clean(tag))}",
                f"turn_count={len(turns)}",
                "source_group_id=<redacted>",
                "source_message_id=<redacted>",
            ]),
            tool_calls=list(dict.fromkeys(tool_calls)),
            index=idx,
            messages=messages,
        )
        row["expected_behavior"] = expected_for_dimension({}, "migration_multiturn_context")
        row["failure_note"] = failure_note
        row["tags"] = {
            "wrong_tool": "memory_missing;coreference_failed;wrong_tool;chat_eval",
            "weak_answer": "memory_missing;coreference_failed;weak_answer;chat_eval",
            "memory_missing": "memory_missing;coreference_failed;chat_eval",
        }.get(signal, "memory_missing;coreference_failed;chat_eval")
        rows.append(row)
    return rows


def load_migration_modules(migration_root: Path):
    sys.path.insert(0, str(migration_root))
    from scripts.core.agent_classifier import AgentClassifier
    from scripts.core.data_loader import DataLoader
    from scripts.core.sessionizer import Sessionizer

    return DataLoader, AgentClassifier, Sessionizer


def build_multiturn_rows(
    migration_root: Path,
    seed_rows: list[dict[str, Any]],
    start_index: int,
    limit: int,
) -> list[dict[str, Any]]:
    if limit <= 0:
        return []
    try:
        DataLoader, AgentClassifier, Sessionizer = load_migration_modules(migration_root)
    except Exception as exc:
        print(f"warning: cannot load migration modules for multi-turn fixtures: {exc}", file=sys.stderr)
        return []

    target_ids = {clean(row.get("message_id")) for row in seed_rows if clean(row.get("message_id"))}
    if not target_ids:
        return []

    loader = DataLoader()
    classifier = AgentClassifier()
    sessionizer = Sessionizer(time_threshold=10, user_aware=True)
    rows: list[dict[str, Any]] = []
    seen_targets: set[str] = set()

    for parquet_path in sorted((migration_root / "data/202603").glob("*.parquet")):
        if len(rows) >= limit:
            break
        df, _ = loader.load_qa_table(str(parquet_path))
        hit_df = df[df["message_id"].astype(str).isin(target_ids - seen_targets)].copy()
        if hit_df.empty:
            continue

        vehicle_session_pairs = set(zip(hit_df["vehicle_id"].astype(str), hit_df["session_id"].astype(str)))
        subset = df[
            df.apply(lambda r: (str(r.get("vehicle_id")), str(r.get("session_id"))) in vehicle_session_pairs, axis=1)
        ].copy()
        if subset.empty:
            continue

        subset = classifier.classify(subset)
        subset = sessionizer.sessionize(subset)
        subset = subset.sort_values(["logical_session_id", "create_time", "message_id"], kind="mergesort")

        for target_message_id in sorted(target_ids - seen_targets):
            target = subset[subset["message_id"].astype(str) == target_message_id]
            if target.empty:
                continue
            target_row = target.iloc[0]
            session = subset[subset["logical_session_id"] == target_row["logical_session_id"]].copy()
            if len(session) < 2:
                session = subset[
                    (subset["vehicle_id"].astype(str) == str(target_row["vehicle_id"]))
                    & (subset["session_id"].astype(str) == str(target_row["session_id"]))
                ].copy()
            session = session.sort_values(["create_time", "message_id"], kind="mergesort").reset_index(drop=True)
            target_positions = session.index[session["message_id"].astype(str) == target_message_id].tolist()
            if not target_positions:
                continue
            pos = target_positions[0]
            window = session.iloc[max(0, pos - 3): min(len(session), pos + 2)].copy()
            if len(window) < 2:
                continue

            messages: list[dict[str, str]] = []
            tool_calls: list[str] = []
            for _, turn in window.iterrows():
                question = clean(turn.get("question"))
                answer = clean(turn.get("answer"))
                agent = clean(turn.get("agent"))
                if question:
                    messages.append({"role": "user", "content": question})
                if str(turn.get("message_id")) != target_message_id and answer:
                    messages.append({"role": "assistant", "content": answer})
                if agent:
                    tool_calls.append(agent)

            current_question = clean(target_row.get("question"))
            actual_output = clean(target_row.get("answer"))
            if not current_question or not messages:
                continue

            idx = start_index + len(rows)
            row = corpusflow_row(
                case_id=synthetic_row_id("migration-multiturn-context", idx),
                source=f"migration_package.{DEFAULT_ANALYSIS_ID}.parquet_sessionizer_context",
                dimension="migration_multiturn_context",
                user_input=current_question,
                actual_output=actual_output,
                retrieved_contexts="\n".join([
                    "context_source=parquet + Sessionizer",
                    f"context_turn_count={len(window)}",
                    f"logical_session_id=<redacted:{idx:04d}>",
                    "source_message_id=<redacted>",
                ]),
                tool_calls=list(dict.fromkeys(tool_calls)),
                index=idx,
                messages=messages,
            )
            row["expected_behavior"] = expected_for_dimension({}, "migration_multiturn_context")
            row["failure_note"] = failure_note_for_dimension({}, "migration_multiturn_context")
            rows.append(row)
            seen_targets.add(target_message_id)
            if len(rows) >= limit:
                break

    return rows


def select_risk_rows(
    rows: list[dict[str, Any]],
    dimension: str,
    limit: int,
    stats: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    selected: list[dict[str, Any]] = []
    query_counts: Counter[str] = Counter()
    duplicate_cap = QUERY_DUPLICATE_CAP_BY_DIMENSION.get(dimension, 2)
    for row in rows:
        if dimension_for_risk(row) != dimension:
            continue
        reason = quality_rejection_reason(row, dimension)
        if reason:
            record_rejection(stats, dimension, reason, row)
            continue
        query_key = normalized_query(row.get("question"))
        if query_counts[query_key] >= duplicate_cap:
            record_rejection(stats, dimension, "duplicate_query_cap", row)
            continue
        selected.append(row)
        query_counts[query_key] += 1
        if len(selected) >= limit:
            break
    return selected


def select_explicit_negative_rows(
    rows: list[dict[str, Any]],
    limit: int,
    stats: dict[str, Any] | None = None,
) -> list[dict[str, Any]]:
    dimension = "migration_explicit_negative_emotion"
    selected: list[dict[str, Any]] = []
    query_counts: Counter[str] = Counter()
    duplicate_cap = QUERY_DUPLICATE_CAP_BY_DIMENSION[dimension]
    for row in rows:
        reason = quality_rejection_reason(row, dimension)
        if reason:
            record_rejection(stats, dimension, reason, row)
            continue
        query_key = normalized_query(row.get("question"))
        if query_counts[query_key] >= duplicate_cap:
            record_rejection(stats, dimension, "duplicate_query_cap", row)
            continue
        selected.append(row)
        query_counts[query_key] += 1
        if len(selected) >= limit:
            break
    return selected


def cap_fixture_duplicates(rows: list[dict[str, Any]], stats: dict[str, Any]) -> list[dict[str, Any]]:
    capped: list[dict[str, Any]] = []
    query_counts: Counter[tuple[str, str]] = Counter()
    for row in rows:
        dimension = clean(row.get("dimension"))
        if chinese_char_count(row.get("user_input")) < 4:
            record_rejection(stats, dimension, "short_chinese_query", row)
            continue
        query_key = normalized_query(row.get("user_input"))
        duplicate_cap = QUERY_DUPLICATE_CAP_BY_DIMENSION.get(dimension, 3)
        counter_key = (dimension, query_key)
        if query_counts[counter_key] >= duplicate_cap:
            record_rejection(stats, dimension, "fixture_duplicate_query_cap", row)
            continue
        capped.append(row)
        query_counts[counter_key] += 1
    return capped


def build_dimensions_rows(full_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: Counter[str] = Counter()
    rows: list[dict[str, Any]] = []
    for row in full_rows:
        dimension = clean(row.get("dimension"))
        target = DIMENSION_SMOKE_TARGETS.get(dimension)
        if target is None or counts[dimension] >= target:
            continue
        counts[dimension] += 1
        prefix = DIMENSION_CASE_PREFIXES[dimension]
        next_row = dict(row)
        next_row["case_id"] = f"{prefix}-{counts[dimension]:03d}"
        next_row["session_id"] = f"migration-dimension-session-{len(rows) + 1:04d}"
        next_row["trace_id"] = f"migration-dimension-trace-{len(rows) + 1:04d}"
        rows.append(next_row)
    return rows


def build_fixture_sets(
    migration_root: Path,
    chat_report: Path,
    chat_project_root: Path,
    chat_multiturn_dir: Path,
) -> tuple[dict[str, list[dict[str, Any]]], dict[str, Any]]:
    analysis_dir = migration_root / "results" / DEFAULT_ANALYSIS_ID
    risk = read_json(analysis_dir / "risk_analysis.json")
    sentiment = read_json(analysis_dir / "sentiment_analysis.json")
    risk_rows = risk.get("high_risk_sessions_full", [])
    explicit_negative = sentiment.get("explicit_samples", {}).get("negative", [])
    quality_stats = new_quality_stats()
    chat_rows = [
        row for row in read_jsonl(chat_report / "badcases_answer_quality.jsonl")
        if clean(row.get("answer_quality")) and clean(row.get("answer_quality")) != "usable"
    ]

    full: list[dict[str, Any]] = []
    index = 1

    for dimension, limit in [
        ("migration_domain_error", 120),
        ("migration_weak_answer", 210),
        ("migration_negative_complaint", 45),
    ]:
        for source_row in select_risk_rows(risk_rows, dimension, limit, quality_stats):
            full.append(risk_row_to_fixture(source_row, index))
            index += 1

    for source_row in select_explicit_negative_rows(explicit_negative, 45, quality_stats):
        full.append(explicit_negative_row_to_fixture(source_row, index))
        index += 1

    ensure_chat_multiturn_dir(chat_project_root, chat_multiturn_dir)
    chat_multiturn_rows = build_chat_multiturn_rows(chat_multiturn_dir, chat_rows, index, 100)
    index += len(chat_multiturn_rows)
    repetition_seeds = select_risk_rows(risk_rows, "migration_multiturn_context", 80)
    repetition_rows = build_multiturn_rows(migration_root, repetition_seeds, index, 25)
    multiturn_rows = [*chat_multiturn_rows, *repetition_rows]
    full.extend(multiturn_rows)
    index += len(multiturn_rows)

    for source_row in chat_rows[:120]:
        full.append(chat_row_to_fixture(source_row, index))
        index += 1

    full = cap_fixture_duplicates(full, quality_stats)

    # Backfill from weak-answer pool if local Chat reports or multi-turn windows are unavailable.
    if len(full) < 520:
        used_queries = {row["user_input"] for row in full}
        for source_row in select_risk_rows(risk_rows, "migration_weak_answer", 520, quality_stats):
            if clean(source_row.get("question")) in used_queries:
                continue
            full.append(risk_row_to_fixture(source_row, index))
            index += 1
            if len(full) >= 520:
                break

    full = cap_fixture_duplicates(full, quality_stats)
    multiturn_rows = [row for row in full if clean(row.get("dimension")) == "migration_multiturn_context"]

    regression_targets = {
        "migration_domain_error": 40,
        "migration_weak_answer": 45,
        "migration_negative_complaint": 20,
        "migration_explicit_negative_emotion": 20,
        "migration_multiturn_context": 20,
        "chat_eval_execution_failure": 25,
    }
    counts: Counter[str] = Counter()
    regression: list[dict[str, Any]] = []
    for row in full:
        dimension = clean(row.get("dimension"))
        if counts[dimension] >= regression_targets.get(dimension, 0):
            continue
        regression.append(row)
        counts[dimension] += 1
    for row in full:
        if len(regression) >= 170:
            break
        if row in regression:
            continue
        regression.append(row)

    fixtures = {
        "migration_badcase_dimensions.jsonl": build_dimensions_rows(full),
        "migration_badcase_regression.jsonl": regression,
        "migration_badcase_full.jsonl": full[: max(520, len(full))],
        "migration_multiturn_context.jsonl": multiturn_rows,
    }
    return fixtures, quality_stats


def fixture_quality_summary(rows: list[dict[str, Any]]) -> dict[str, Any]:
    short_by_dimension: Counter[str] = Counter()
    query_counts: Counter[tuple[str, str]] = Counter()
    for row in rows:
        dimension = clean(row.get("dimension"))
        if chinese_char_count(row.get("user_input")) < 4:
            short_by_dimension[dimension] += 1
        query_counts[(dimension, clean(row.get("user_input")))] += 1
    duplicate_queries = [
        {"dimension": dimension, "query": query, "count": count}
        for (dimension, query), count in query_counts.most_common(20)
        if count > QUERY_DUPLICATE_CAP_BY_DIMENSION.get(dimension, 3)
    ]
    return {
        "short_chinese_query_rows": sum(short_by_dimension.values()),
        "short_chinese_query_rows_by_dimension": dict(short_by_dimension),
        "duplicate_queries_over_cap": duplicate_queries,
    }


def manifest_for(fixtures: dict[str, list[dict[str, Any]]], quality_stats: dict[str, Any]) -> dict[str, Any]:
    return {
        "generated_at": "2026-05-25T00:00:00+08:00",
        "source": {
            "migration_package": str(DEFAULT_MIGRATION_ROOT),
            "analysis_id": DEFAULT_ANALYSIS_ID,
            "chat_report": str(DEFAULT_CHAT_REPORT),
        },
        "quality_gate": {
            "rejected_total": quality_stats["rejected_total"],
            "rejected_by_reason": dict(quality_stats["rejected_by_reason"]),
            "rejected_by_dimension": dict(quality_stats["rejected_by_dimension"]),
            "rejected_samples": quality_stats["rejected_samples"],
            "policy": {
                "all_fixture_user_input_min_chinese_chars": 4,
                "mapu_requires_navigation_action_and_place_signal": True,
                "duplicate_query_caps_by_dimension": QUERY_DUPLICATE_CAP_BY_DIMENSION,
            },
        },
        "fixtures": {
            name: {
                "rows": len(rows),
                "dimension_distribution": dict(Counter(clean(row.get("dimension")) for row in rows)),
                "all_source_ids_redacted": True,
                "quality": fixture_quality_summary(rows),
            }
            for name, rows in fixtures.items()
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Build CorpusFlow evaluation-mode fixtures")
    parser.add_argument("--migration-root", default=os.environ.get("MIGRATION_PACKAGE_ROOT", str(DEFAULT_MIGRATION_ROOT)))
    parser.add_argument("--chat-report", default=os.environ.get("CHAT_EVAL_REPORT_DIR", str(DEFAULT_CHAT_REPORT)))
    parser.add_argument("--chat-project-root", default=os.environ.get("CHAT_PROJECT_ROOT", str(DEFAULT_CHAT_PROJECT_ROOT)))
    parser.add_argument("--chat-multiturn-dir", default=os.environ.get("CHAT_MIGRATION_MULTITURN_DIR", str(DEFAULT_CHAT_MULTITURN_DIR)))
    parser.add_argument("--out-dir", default=str(ROOT / "fixtures/evaluation"))
    args = parser.parse_args()

    migration_root = Path(args.migration_root)
    chat_report = Path(args.chat_report)
    chat_project_root = Path(args.chat_project_root)
    chat_multiturn_dir = Path(args.chat_multiturn_dir)
    out_dir = Path(args.out_dir)
    fixtures, quality_stats = build_fixture_sets(migration_root, chat_report, chat_project_root, chat_multiturn_dir)

    for name, rows in fixtures.items():
        write_jsonl(out_dir / name, rows)

    manifest = manifest_for(fixtures, quality_stats)
    (out_dir / "migration_badcase_fixture_manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
