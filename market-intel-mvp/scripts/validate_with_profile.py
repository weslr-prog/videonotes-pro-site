#!/usr/bin/env python3
import argparse
import json
from datetime import datetime
from pathlib import Path

from validate_reviews import validate_dataset


def load_profile(config_path: Path, profile_name: str) -> dict:
    with config_path.open("r", encoding="utf-8") as handle:
        config = json.load(handle)

    profiles = config.get("profiles", {})
    if profile_name not in profiles:
        raise ValueError(f"Profile '{profile_name}' not found in {config_path}")
    return profiles[profile_name]


def compute_duplicate_rate(total_rows: int, duplicate_rows: int) -> float:
    if total_rows <= 0:
        return 0.0
    return round((duplicate_rows / total_rows) * 100.0, 2)


def evaluate_thresholds(stats: dict, profile: dict) -> list:
    failures = []
    minimum_records = int(profile.get("minimum_records", 0))
    max_duplicate_rate = float(profile.get("max_duplicate_rate_percent", 100.0))
    max_empty_text_rate = float(profile.get("max_empty_text_rate_percent", 100.0))

    duplicate_rate = compute_duplicate_rate(stats.get("total_rows", 0), stats.get("duplicate_rows", 0))
    empty_rate = float(stats.get("empty_text_rate", 0.0))

    if stats.get("total_rows", 0) < minimum_records:
        failures.append(f"minimum_records failed: {stats.get('total_rows', 0)} < {minimum_records}")
    if duplicate_rate > max_duplicate_rate:
        failures.append(f"duplicate_rate failed: {duplicate_rate}% > {max_duplicate_rate}%")
    if empty_rate > max_empty_text_rate:
        failures.append(f"empty_text_rate failed: {empty_rate}% > {max_empty_text_rate}%")

    return failures


def to_markdown(profile_name: str, profile: dict, stats: dict, threshold_failures: list) -> str:
    lines = [
        "# Profile Validation Gate Report",
        "",
        f"Generated: {datetime.utcnow().isoformat()}Z",
        f"Profile: {profile_name}",
        "",
        "## Profile Settings",
        "",
        f"- Platform: {profile.get('platform', 'unknown')}",
        f"- Allowed domains: {', '.join(profile.get('allowed_domains', [])) or 'none'}",
        f"- Blocked domains: {', '.join(profile.get('blocked_domains', [])) or 'none'}",
        f"- Minimum records: {profile.get('minimum_records', 0)}",
        f"- Max duplicate rate: {profile.get('max_duplicate_rate_percent', 100)}%",
        f"- Max empty-text rate: {profile.get('max_empty_text_rate_percent', 100)}%",
        f"- Language filter: {', '.join(profile.get('language_filter', [])) or 'none'}",
        "",
        "## Dataset Summary",
        "",
        f"- Total rows: {stats.get('total_rows', 0)}",
        f"- Error count: {stats.get('error_count', 0)}",
        f"- Warning count: {stats.get('warn_count', 0)}",
        f"- Duplicate rows: {stats.get('duplicate_rows', 0)}",
        f"- Empty text rate: {stats.get('empty_text_rate', 0)}%",
        "",
        "## Threshold Gate",
        "",
    ]

    if stats.get("status") == "fail":
        lines.append("- FAILED: base validation has errors")
    elif threshold_failures:
        lines.append("- FAILED: threshold checks failed")
        for failure in threshold_failures:
            lines.append(f"  - {failure}")
    else:
        lines.append("- PASSED: base validation + threshold checks")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Run validation with preconfigured platform thresholds")
    parser.add_argument("--profile", required=True, choices=["chrome", "edge", "firefox"], help="Profile name")
    parser.add_argument("--input", required=True, help="Input NDJSON file")
    parser.add_argument("--config", default="market-intel-mvp/config/platform_profiles.json", help="Path to profile config")
    parser.add_argument("--output-json", required=True, help="Output JSON report")
    parser.add_argument("--output-md", required=True, help="Output markdown report")
    args = parser.parse_args()

    input_path = Path(args.input)
    config_path = Path(args.config)
    output_json = Path(args.output_json)
    output_md = Path(args.output_md)

    profile = load_profile(config_path, args.profile)
    allowed_domains = [value.lower() for value in profile.get("allowed_domains", [])]
    blocked_domains = [value.lower() for value in profile.get("blocked_domains", [])]

    stats, issues = validate_dataset(input_path, allowed_domains, blocked_domains)
    threshold_failures = evaluate_thresholds(stats, profile)

    gate_status = "pass"
    if stats.get("status") == "fail" or threshold_failures:
        gate_status = "fail"

    payload = {
        "profile": args.profile,
        "profile_settings": profile,
        "stats": stats,
        "issues": [issue.__dict__ for issue in issues],
        "threshold_failures": threshold_failures,
        "gate_status": gate_status,
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)

    with output_json.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    with output_md.open("w", encoding="utf-8") as handle:
        handle.write(to_markdown(args.profile, profile, stats, threshold_failures))

    print(f"Wrote profile validation JSON: {output_json}")
    print(f"Wrote profile validation report: {output_md}")

    if gate_status == "fail":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
