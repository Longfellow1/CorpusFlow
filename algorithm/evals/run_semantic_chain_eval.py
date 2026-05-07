from __future__ import annotations

import argparse
import json
import sys
import time
import urllib.request
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
CASES_FILE = Path(__file__).with_name("semantic_cases.json")
DEFAULT_BASE_URL = "http://127.0.0.1:8001"


def post_json(base_url: str, path: str, payload: dict[str, Any], timeout: int = 120) -> Any:
    request = urllib.request.Request(
        f"{base_url}{path}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def flatten_text(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def analyze_metrics(case: dict[str, Any], analysis: dict[str, Any]) -> dict[str, Any]:
    frame = analysis.get("generation_frame") if isinstance(analysis, dict) else {}
    units = frame.get("units", []) if isinstance(frame, dict) else []
    frame_text = flatten_text(frame)
    tuple_text = flatten_text({
        key: analysis.get(key, "")
        for key in ("intent", "subject", "action", "object", "modifiers")
    })
    must_include = case.get("must_include", [])
    frame_hits = [term for term in must_include if term in frame_text]
    tuple_hits = [term for term in must_include if term in tuple_text]
    return {
        "unit_count": len(units) if isinstance(units, list) else 0,
        "unit_pass": len(units) >= int(case.get("expected_min_units", 1)),
        "frame_slot_recall": len(frame_hits) / max(1, len(must_include)),
        "tuple_slot_recall": len(tuple_hits) / max(1, len(must_include)),
        "frame_hits": frame_hits,
        "tuple_hits": tuple_hits,
    }


def chain_smell_metrics(case_id: str, paraphrases: list[dict[str, Any]]) -> dict[str, Any]:
    texts = [str(item.get("text", "")) for item in paraphrases]
    issue_count = 0
    issue_notes: list[str] = []
    if case_id == "05":
        issue_count += sum(1 for text in texts if "约我去我家" in text or "喊我到我家" in text or "请我去我家" in text)
        if issue_count:
            issue_notes.append("speaker_role_inversion")
    if case_id == "09":
        bad = sum(1 for text in texts if "发给我他" in text or "发给我" in text and "李雷" in text)
        issue_count += bad
        if bad:
            issue_notes.append("recipient_role_inversion")
    if case_id == "28":
        parking_terms = ("停车场", "停车位", "停车区域", "地下车库", "停车的地方", "可以停车")
        drift = sum(1 for text in texts if not any(term in text for term in parking_terms))
        issue_count += drift
        if drift:
            issue_notes.append("correction_target_type_drift")
    return {
        "issue_count": issue_count,
        "issue_rate": issue_count / max(1, len(texts)),
        "issue_notes": issue_notes,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL)
    parser.add_argument("--chain", action="store_true", help="Run expand/paraphrase on representative cases")
    parser.add_argument("--output", default="")
    args = parser.parse_args()

    cases = json.loads(CASES_FILE.read_text(encoding="utf-8"))
    results: list[dict[str, Any]] = []
    chain_ids = {"04", "05", "06", "09", "10", "12", "14", "18", "19", "21", "22", "28"}

    for case in cases:
        started = time.time()
        analysis = post_json(args.base_url, "/analyze", {"sentence": case["text"], "context": {"eval": "semantic_chain_v1"}})
        result = {
            "id": case["id"],
            "category": case["category"],
            "text": case["text"],
            "analysis": analysis,
            "analysis_metrics": analyze_metrics(case, analysis),
            "elapsed": round(time.time() - started, 2),
        }
        if args.chain and case["id"] in chain_ids:
            expansions = post_json(
                args.base_url,
                "/expand",
                {
                    "sentence": case["text"],
                    "analysis": analysis,
                    "overallRequirement": "生成用于评测和训练的数据增强候选，允许适度泛化，但保持同类语义方向。",
                    "workMode": "advanced",
                    "businessType": "evaluation",
                },
            )
            paraphrases = post_json(
                args.base_url,
                "/paraphrases",
                {
                    "sentence": case["text"],
                    "analysis": analysis,
                    "expansions": expansions,
                    "style": "生成6条，既要贴近原句，也要适度泛化。",
                    "overallRequirement": "生成用于评测和训练的数据增强候选，允许适度泛化，但保持同类语义方向。",
                    "workMode": "advanced",
                    "businessType": "evaluation",
                },
            )
            result["expansions"] = expansions
            result["paraphrases"] = paraphrases
            result["chain_metrics"] = chain_smell_metrics(case["id"], paraphrases)
        results.append(result)
        print(
            f"{case['id']} {case['category']} units={result['analysis_metrics']['unit_count']} "
            f"unit_pass={result['analysis_metrics']['unit_pass']} "
            f"frame_recall={result['analysis_metrics']['frame_slot_recall']:.2f}",
            flush=True,
        )

    unit_pass_rate = sum(1 for item in results if item["analysis_metrics"]["unit_pass"]) / len(results)
    avg_frame_recall = sum(item["analysis_metrics"]["frame_slot_recall"] for item in results) / len(results)
    avg_tuple_recall = sum(item["analysis_metrics"]["tuple_slot_recall"] for item in results) / len(results)
    chain_items = [item for item in results if "chain_metrics" in item]
    avg_issue_rate = (
        sum(item["chain_metrics"]["issue_rate"] for item in chain_items) / len(chain_items)
        if chain_items
        else None
    )
    summary = {
        "case_count": len(results),
        "unit_pass_rate": round(unit_pass_rate, 4),
        "avg_frame_slot_recall": round(avg_frame_recall, 4),
        "avg_tuple_slot_recall": round(avg_tuple_recall, 4),
        "avg_chain_issue_rate": round(avg_issue_rate, 4) if avg_issue_rate is not None else None,
    }
    payload = {"summary": summary, "results": results}
    print(json.dumps(summary, ensure_ascii=False, indent=2))
    if args.output:
        output_path = ROOT / args.output
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"Wrote {output_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
