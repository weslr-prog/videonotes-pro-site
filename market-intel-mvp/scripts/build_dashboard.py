#!/usr/bin/env python3
import argparse
import json
from datetime import datetime
from pathlib import Path


def load_json(path: Path) -> dict:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def render_profile_card(run: dict) -> str:
    profile = run.get("profile", "unknown")
    gate_status = run.get("gate_status", "unknown")
    stats = run.get("stats", {})
    top_clusters = run.get("analysis", {}).get("top_clusters", [])

    rows = "".join(
        f"<tr><td>{idx}</td><td>{cluster.get('cluster','')}</td><td>{cluster.get('scores',{}).get('opportunity_score','')}</td><td>{cluster.get('review_count','')}</td></tr>"
        for idx, cluster in enumerate(top_clusters, start=1)
    )
    if not rows:
        rows = "<tr><td colspan='4'>No analyzed clusters (gate failed or no data)</td></tr>"

    return f"""
    <section class='card'>
      <h2>{profile.title()}</h2>
      <p><strong>Gate status:</strong> <span class='{gate_status}'>{gate_status.upper()}</span></p>
      <ul>
        <li>Total rows: {stats.get('total_rows', 0)}</li>
        <li>Errors: {stats.get('error_count', 0)}</li>
        <li>Warnings: {stats.get('warn_count', 0)}</li>
        <li>Duplicate rows: {stats.get('duplicate_rows', 0)}</li>
        <li>Empty text rate: {stats.get('empty_text_rate', 0)}%</li>
      </ul>
      <h3>Top Opportunity Clusters</h3>
      <table>
        <thead><tr><th>#</th><th>Cluster</th><th>Score</th><th>Reviews</th></tr></thead>
        <tbody>{rows}</tbody>
      </table>
      <p class='artifacts'>
        Validation report: {run.get('artifacts',{}).get('validation_md','')}<br>
        Opportunity report: {run.get('artifacts',{}).get('opportunities_md','')}
      </p>
    </section>
    """


def build_html(summary: dict) -> str:
    cards = "".join(render_profile_card(run) for run in summary.get("runs", []))
    generated = summary.get("generated_at", datetime.utcnow().isoformat() + "Z")

    return f"""<!doctype html>
<html lang='en'>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <title>Market Intel Dashboard</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 24px; background: #0f1220; color: #eef1ff; }}
    h1 {{ margin-top: 0; }}
    .meta {{ color: #aab3d1; margin-bottom: 20px; }}
    .grid {{ display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); }}
    .card {{ background: #171b2f; border: 1px solid #2e3558; border-radius: 12px; padding: 14px; }}
    .pass {{ color: #55d18d; }}
    .fail {{ color: #ff7d8b; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 8px; }}
    th, td {{ border-bottom: 1px solid #2e3558; text-align: left; padding: 6px; font-size: 13px; }}
    th {{ color: #aab3d1; }}
    .artifacts {{ color: #aab3d1; font-size: 12px; margin-top: 8px; word-break: break-all; }}
  </style>
</head>
<body>
  <h1>Market Intel Validation + Opportunity Dashboard</h1>
  <p class='meta'>Generated: {generated}</p>
  <div class='grid'>
    {cards}
  </div>
</body>
</html>
"""


def main() -> None:
    parser = argparse.ArgumentParser(description="Build static HTML dashboard from pipeline summary")
    parser.add_argument("--summary-json", default="market-intel-mvp/outputs/weekly-opportunities/pipeline_summary.json", help="Pipeline summary JSON path")
    parser.add_argument("--output-html", default="market-intel-mvp/outputs/weekly-opportunities/dashboard.html", help="Output HTML path")
    args = parser.parse_args()

    summary_path = Path(args.summary_json)
    output_path = Path(args.output_html)

    summary = load_json(summary_path)
    html = build_html(summary)

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(html, encoding="utf-8")

    print(f"Wrote dashboard: {output_path}")


if __name__ == "__main__":
    main()
