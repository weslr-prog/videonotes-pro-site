#!/usr/bin/env python3
import argparse
import json
import re
from collections import Counter
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple
from urllib.parse import urlparse

REQUIRED_FIELDS = [
    "platform",
    "item_id",
    "item_name",
    "reviewer_name",
    "review_date",
    "star_rating",
    "review_text",
    "helpful_count",
    "source_url",
]


@dataclass
class ValidationIssue:
    severity: str
    code: str
    message: str
    line: int = 0


def normalize_text(value: str) -> str:
    value = (value or "").strip().lower()
    return re.sub(r"\s+", " ", value)


def parse_float(value, default=0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def parse_int(value, default=0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def parse_date(value: str) -> bool:
    value = (value or "").strip()
    if not value:
        return False
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%dT%H:%M:%SZ"):
        try:
            datetime.strptime(value, fmt)
            return True
        except ValueError:
            continue
    return False


def domain_of(url: str) -> str:
    try:
        return (urlparse(url).hostname or "").lower()
    except Exception:
        return ""


def validate_row(obj: Dict, line_no: int, allowed_domains: List[str], blocked_domains: List[str]) -> List[ValidationIssue]:
    issues: List[ValidationIssue] = []

    for field in REQUIRED_FIELDS:
        if field not in obj:
            issues.append(ValidationIssue("error", "missing_field", f"Missing required field: {field}", line_no))

    if issues:
        return issues

    star_rating = parse_float(obj.get("star_rating"), -1)
    if not (1 <= star_rating <= 5):
        issues.append(ValidationIssue("error", "invalid_star_rating", f"star_rating out of range: {star_rating}", line_no))

    helpful_count = parse_int(obj.get("helpful_count"), -1)
    if helpful_count < 0:
        issues.append(ValidationIssue("error", "invalid_helpful_count", f"helpful_count negative: {helpful_count}", line_no))

    if not parse_date(str(obj.get("review_date", ""))):
        issues.append(ValidationIssue("warn", "date_format", "review_date is not ISO-like format", line_no))

    review_text = normalize_text(str(obj.get("review_text", "")))
    if not review_text:
        issues.append(ValidationIssue("warn", "empty_text", "review_text is empty", line_no))

    src_url = str(obj.get("source_url", ""))
    domain = domain_of(src_url)
    if not domain:
        issues.append(ValidationIssue("error", "invalid_source_url", "source_url missing/invalid domain", line_no))
    else:
        if allowed_domains and not any(domain.endswith(allowed) for allowed in allowed_domains):
            issues.append(ValidationIssue("warn", "unexpected_domain", f"Domain not in allowed list: {domain}", line_no))
        if any(domain.endswith(blocked) for blocked in blocked_domains):
            issues.append(ValidationIssue("error", "blocked_domain", f"Blocked domain detected: {domain}", line_no))

    return issues


def validate_dataset(input_path: Path, allowed_domains: List[str], blocked_domains: List[str]) -> Tuple[Dict, List[ValidationIssue]]:
    issues: List[ValidationIssue] = []
    parsed_rows: List[Dict] = []

    with input_path.open("r", encoding="utf-8") as handle:
        for line_no, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
            except json.JSONDecodeError as exc:
                issues.append(ValidationIssue("error", "invalid_json", f"Invalid JSON: {exc}", line_no))
                continue
            parsed_rows.append(obj)
            issues.extend(validate_row(obj, line_no, allowed_domains, blocked_domains))

    total_rows = len(parsed_rows)
    empty_text_count = sum(1 for row in parsed_rows if not normalize_text(str(row.get("review_text", ""))))

    duplicate_keys = Counter()
    for row in parsed_rows:
        key = (
            str(row.get("platform", "")),
            str(row.get("item_id", "")),
            normalize_text(str(row.get("reviewer_name", ""))),
            str(row.get("review_date", "")),
            normalize_text(str(row.get("review_text", ""))),
        )
        duplicate_keys[key] += 1

    duplicate_count = sum(count - 1 for count in duplicate_keys.values() if count > 1)
    if duplicate_count > 0:
        issues.append(ValidationIssue("warn", "duplicates", f"Detected duplicate rows: {duplicate_count}"))

    domain_counts = Counter(domain_of(str(row.get("source_url", ""))) for row in parsed_rows)

    stats = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "total_rows": total_rows,
        "duplicate_rows": duplicate_count,
        "empty_text_rows": empty_text_count,
        "empty_text_rate": round((empty_text_count / max(1, total_rows)) * 100.0, 2),
        "domain_distribution": dict(domain_counts),
        "error_count": sum(1 for item in issues if item.severity == "error"),
        "warn_count": sum(1 for item in issues if item.severity == "warn"),
        "status": "pass" if not any(item.severity == "error" for item in issues) else "fail",
    }

    return stats, issues


def to_markdown(stats: Dict, issues: List[ValidationIssue]) -> str:
    lines = [
        "# Review Dataset Validation Report",
        "",
        f"Generated: {stats['generated_at']}",
        f"Status: **{stats['status'].upper()}**",
        "",
        "## Summary",
        "",
        f"- Total rows: {stats['total_rows']}",
        f"- Errors: {stats['error_count']}",
        f"- Warnings: {stats['warn_count']}",
        f"- Duplicate rows: {stats['duplicate_rows']}",
        f"- Empty text rows: {stats['empty_text_rows']} ({stats['empty_text_rate']}%)",
        "",
        "## Domain Distribution",
        "",
    ]

    if stats["domain_distribution"]:
        for domain, count in sorted(stats["domain_distribution"].items(), key=lambda x: x[1], reverse=True):
            lines.append(f"- {domain or 'unknown'}: {count}")
    else:
        lines.append("- No domain data")

    lines.extend(["", "## Issues", ""])
    if not issues:
        lines.append("- No issues found")
    else:
        for issue in issues:
            line_ref = f" (line {issue.line})" if issue.line else ""
            lines.append(f"- [{issue.severity.upper()}] {issue.code}{line_ref}: {issue.message}")

    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Validate review NDJSON for schema and data-quality issues")
    parser.add_argument("--input", required=True, help="Path to NDJSON dataset")
    parser.add_argument("--output-json", required=True, help="Path to output JSON validation summary")
    parser.add_argument("--output-md", required=True, help="Path to output markdown validation report")
    parser.add_argument("--allowed-domains", default="", help="Comma-separated allowed domains (e.g. chromewebstore.google.com)")
    parser.add_argument("--blocked-domains", default="support.google.com", help="Comma-separated blocked domains")
    args = parser.parse_args()

    allowed_domains = [d.strip().lower() for d in args.allowed_domains.split(",") if d.strip()]
    blocked_domains = [d.strip().lower() for d in args.blocked_domains.split(",") if d.strip()]

    input_path = Path(args.input)
    output_json = Path(args.output_json)
    output_md = Path(args.output_md)

    stats, issues = validate_dataset(input_path, allowed_domains, blocked_domains)

    payload = {
        "stats": stats,
        "issues": [issue.__dict__ for issue in issues],
    }

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)

    with output_json.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)

    with output_md.open("w", encoding="utf-8") as handle:
        handle.write(to_markdown(stats, issues))

    print(f"Wrote validation JSON: {output_json}")
    print(f"Wrote validation report: {output_md}")
    if stats["status"] == "fail":
        raise SystemExit(2)


if __name__ == "__main__":
    main()
