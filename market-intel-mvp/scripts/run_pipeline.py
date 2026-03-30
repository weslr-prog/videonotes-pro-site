#!/usr/bin/env python3
import argparse
import json
import sys
from datetime import datetime
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from analyze_reviews import build_report, dedupe_reviews, load_ndjson
from validate_reviews import to_markdown as validation_markdown
from validate_reviews import validate_dataset
from validate_with_profile import evaluate_thresholds, load_profile


def write_json(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        handle.write(content)


def resolve_input_file(input_dir: Path, profile_name: str) -> Path:
    preferred = input_dir / f"{profile_name}_reviews.ndjson"
    fallback = input_dir / "sample_reviews.ndjson"
    if preferred.exists():
        return preferred
    if fallback.exists():
        return fallback
    raise FileNotFoundError(f"No input file found for profile '{profile_name}'. Expected {preferred} or {fallback}")


def run_for_profile(profile_name: str, config_path: Path, input_file: Path, root_dir: Path, top_n: int) -> dict:
    profile = load_profile(config_path, profile_name)

    stats, issues = validate_dataset(
        input_file,
        [value.lower() for value in profile.get("allowed_domains", [])],
        [value.lower() for value in profile.get("blocked_domains", [])],
    )
    threshold_failures = evaluate_thresholds(stats, profile)

    gate_status = "pass"
    if stats.get("status") == "fail" or threshold_failures:
        gate_status = "fail"

    clean_json = root_dir / "data" / "clean" / f"{profile_name}_gate_report.json"
    clean_md = root_dir / "outputs" / "weekly-opportunities" / f"{profile_name}_gate_report.md"

    validation_payload = {
        "profile": profile_name,
        "profile_settings": profile,
        "stats": stats,
        "issues": [issue.__dict__ for issue in issues],
        "threshold_failures": threshold_failures,
        "gate_status": gate_status,
        "input_file": str(input_file),
    }
    write_json(clean_json, validation_payload)
    write_text(clean_md, validation_markdown(stats, issues))

    opportunities_json = root_dir / "data" / "scored" / f"{profile_name}_opportunities.json"
    opportunities_md = root_dir / "outputs" / "weekly-opportunities" / f"{profile_name}_opportunities.md"

    analysis_summary = {
        "profile": profile_name,
        "input_file": str(input_file),
        "gate_status": gate_status,
        "top_clusters": [],
        "review_count": 0,
    }

    if gate_status == "pass":
        reviews = dedupe_reviews(load_ndjson(input_file))
        report_json, report_md = build_report(reviews, top_n=top_n)
        write_json(opportunities_json, report_json)
        write_text(opportunities_md, report_md)

        analysis_summary.update({
            "review_count": report_json.get("review_count", 0),
            "top_clusters": report_json.get("clusters", [])[:5],
        })

    return {
        "profile": profile_name,
        "input_file": str(input_file),
        "gate_status": gate_status,
        "stats": stats,
        "threshold_failures": threshold_failures,
        "artifacts": {
            "validation_json": str(clean_json),
            "validation_md": str(clean_md),
            "opportunities_json": str(opportunities_json),
            "opportunities_md": str(opportunities_md),
        },
        "analysis": analysis_summary,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Run validation + analysis pipeline for one or more profiles")
    parser.add_argument("--profiles", default="chrome,edge,firefox", help="Comma-separated profile names")
    parser.add_argument("--config", default="market-intel-mvp/config/platform_profiles.json", help="Path to profile config JSON")
    parser.add_argument("--input-dir", default="market-intel-mvp/data/raw", help="Directory with NDJSON input files")
    parser.add_argument("--root-dir", default="market-intel-mvp", help="Root directory for outputs")
    parser.add_argument("--top-n", type=int, default=20, help="Top clusters per profile")
    parser.add_argument("--summary-json", default="market-intel-mvp/outputs/weekly-opportunities/pipeline_summary.json", help="Output summary JSON")
    args = parser.parse_args()

    root_dir = Path(args.root_dir)
    input_dir = Path(args.input_dir)
    config_path = Path(args.config)

    profiles = [name.strip() for name in args.profiles.split(",") if name.strip()]

    runs = []
    for profile in profiles:
        input_file = resolve_input_file(input_dir, profile)
        run_result = run_for_profile(profile, config_path, input_file, root_dir, args.top_n)
        runs.append(run_result)

    payload = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "profiles": profiles,
        "runs": runs,
    }

    summary_path = Path(args.summary_json)
    write_json(summary_path, payload)

    print(f"Wrote pipeline summary: {summary_path}")
    for run in runs:
        print(f"[{run['profile']}] gate={run['gate_status']} input={run['input_file']}")


if __name__ == "__main__":
    main()
