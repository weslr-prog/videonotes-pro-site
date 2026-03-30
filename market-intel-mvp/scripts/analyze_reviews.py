#!/usr/bin/env python3
import argparse
import json
import re
from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Tuple


CLUSTER_RULES = {
    "reliability_bugs": [
        "bug", "broken", "crash", "error", "doesn't work", "not working", "fails", "issue", "glitch"
    ],
    "performance": [
        "slow", "lag", "laggy", "freeze", "memory", "cpu", "heavy", "stutter", "performance"
    ],
    "missing_features": [
        "missing", "need", "wish", "feature", "add", "would be great", "should have", "please add"
    ],
    "ux_confusion": [
        "confusing", "hard", "difficult", "can't find", "unclear", "not intuitive", "too many clicks"
    ],
    "trust_privacy": [
        "privacy", "permission", "tracking", "trust", "data", "spy", "malware", "unsafe"
    ],
    "pricing_friction": [
        "price", "expensive", "subscription", "paywall", "cost", "trial", "refund", "billing"
    ],
}


@dataclass
class Review:
    platform: str
    item_id: str
    item_name: str
    reviewer_name: str
    review_date: str
    star_rating: int
    review_text: str
    helpful_count: int
    source_url: str


def normalize_text(text: str) -> str:
    value = (text or "").strip().lower()
    value = re.sub(r"\s+", " ", value)
    return value


def parse_int(value, default=0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return default


def classify_review(text: str) -> str:
    normalized = normalize_text(text)
    for cluster, keywords in CLUSTER_RULES.items():
        for keyword in keywords:
            if keyword in normalized:
                return cluster
    return "other"


def parse_review(line_obj: Dict) -> Review:
    return Review(
        platform=str(line_obj.get("platform", "unknown")),
        item_id=str(line_obj.get("item_id", "unknown")),
        item_name=str(line_obj.get("item_name", "unknown")),
        reviewer_name=str(line_obj.get("reviewer_name", "unknown")),
        review_date=str(line_obj.get("review_date", "")),
        star_rating=max(1, min(5, parse_int(line_obj.get("star_rating", 0), 3))),
        review_text=str(line_obj.get("review_text", "")),
        helpful_count=max(0, parse_int(line_obj.get("helpful_count", 0), 0)),
        source_url=str(line_obj.get("source_url", "")),
    )


def dedupe_reviews(reviews: List[Review]) -> List[Review]:
    seen = set()
    unique = []
    for review in reviews:
        key = (
            review.platform,
            review.item_id,
            normalize_text(review.reviewer_name),
            review.review_date,
            normalize_text(review.review_text),
        )
        if key in seen:
            continue
        seen.add(key)
        unique.append(review)
    return unique


def load_ndjson(path: Path) -> List[Review]:
    reviews = []
    with path.open("r", encoding="utf-8") as handle:
        for idx, raw_line in enumerate(handle, start=1):
            line = raw_line.strip()
            if not line:
                continue
            try:
                obj = json.loads(line)
                review = parse_review(obj)
                if normalize_text(review.review_text):
                    reviews.append(review)
            except json.JSONDecodeError as exc:
                raise ValueError(f"Invalid JSON on line {idx}: {exc}")
    return reviews


def score_cluster(total_reviews: int, low_star_reviews: int, helpful_sum: int) -> Dict[str, float]:
    frequency = min(5.0, (total_reviews / 50.0) * 5.0) if total_reviews > 0 else 0.0
    pain = min(5.0, (low_star_reviews / max(1, total_reviews)) * 5.0)
    gap = 3.0 if low_star_reviews > 0 else 2.0
    simplicity = 3.0
    monetization = min(5.0, 1.5 + (helpful_sum / max(1, total_reviews)) * 1.5)
    weighted = 0.30 * pain + 0.25 * frequency + 0.15 * gap + 0.15 * simplicity + 0.15 * monetization
    return {
        "pain_severity": round(pain, 2),
        "frequency": round(frequency, 2),
        "solution_gap": round(gap, 2),
        "build_simplicity": round(simplicity, 2),
        "monetization": round(monetization, 2),
        "opportunity_score": round(weighted, 2),
    }


def build_report(reviews: List[Review], top_n: int = 20) -> Tuple[Dict, str]:
    cluster_reviews = defaultdict(list)
    for review in reviews:
        cluster = classify_review(review.review_text)
        cluster_reviews[cluster].append(review)

    rows = []
    for cluster, entries in cluster_reviews.items():
        low_star = [item for item in entries if item.star_rating <= 3]
        helpful_sum = sum(item.helpful_count for item in entries)
        scores = score_cluster(len(entries), len(low_star), helpful_sum)
        sample = sorted(entries, key=lambda x: (x.helpful_count, -x.star_rating), reverse=True)[:3]
        rows.append({
            "cluster": cluster,
            "review_count": len(entries),
            "low_star_count": len(low_star),
            "helpful_sum": helpful_sum,
            "scores": scores,
            "samples": [
                {
                    "reviewer": item.reviewer_name,
                    "date": item.review_date,
                    "stars": item.star_rating,
                    "helpful": item.helpful_count,
                    "text": item.review_text[:260],
                }
                for item in sample
            ],
        })

    rows.sort(key=lambda x: x["scores"]["opportunity_score"], reverse=True)
    top_rows = rows[:top_n]

    metadata = {
        "generated_at": datetime.utcnow().isoformat() + "Z",
        "review_count": len(reviews),
        "cluster_count": len(rows),
        "top_n": top_n,
        "clusters": top_rows,
    }

    markdown_lines = [
        "# Weekly Opportunities Report",
        "",
        f"Generated: {metadata['generated_at']}",
        f"Review sample size: {metadata['review_count']}",
        "",
        "## Top Opportunity Clusters",
        "",
        "| Rank | Cluster | Reviews | Low-Star | Helpful | Opportunity Score |",
        "|------|---------|---------|----------|---------|-------------------|",
    ]

    for idx, row in enumerate(top_rows, start=1):
        markdown_lines.append(
            f"| {idx} | {row['cluster']} | {row['review_count']} | {row['low_star_count']} | {row['helpful_sum']} | {row['scores']['opportunity_score']} |"
        )

    for idx, row in enumerate(top_rows[:5], start=1):
        markdown_lines.extend([
            "",
            f"### {idx}. {row['cluster']}",
            f"- Opportunity score: {row['scores']['opportunity_score']}",
            f"- Pain severity: {row['scores']['pain_severity']}",
            f"- Frequency: {row['scores']['frequency']}",
            f"- Helpful signal: {row['helpful_sum']}",
            "- Sample reviews:",
        ])
        for sample in row["samples"]:
            markdown_lines.append(
                f"  - ({sample['stars']}★, helpful {sample['helpful']}) {sample['reviewer']} — {sample['text']}"
            )

    return metadata, "\n".join(markdown_lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze review NDJSON and generate opportunity reports")
    parser.add_argument("--input", required=True, help="Path to input NDJSON file")
    parser.add_argument("--output-json", required=True, help="Path to output scored JSON")
    parser.add_argument("--output-md", required=True, help="Path to output markdown report")
    parser.add_argument("--top-n", type=int, default=20, help="Number of clusters to include")
    args = parser.parse_args()

    input_path = Path(args.input)
    output_json = Path(args.output_json)
    output_md = Path(args.output_md)

    reviews = load_ndjson(input_path)
    reviews = dedupe_reviews(reviews)

    metadata, markdown = build_report(reviews, top_n=args.top_n)

    output_json.parent.mkdir(parents=True, exist_ok=True)
    output_md.parent.mkdir(parents=True, exist_ok=True)

    with output_json.open("w", encoding="utf-8") as handle:
        json.dump(metadata, handle, ensure_ascii=False, indent=2)

    with output_md.open("w", encoding="utf-8") as handle:
        handle.write(markdown)

    print(f"Wrote JSON: {output_json}")
    print(f"Wrote report: {output_md}")


if __name__ == "__main__":
    main()
