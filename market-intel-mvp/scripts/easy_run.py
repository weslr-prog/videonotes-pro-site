#!/usr/bin/env python3
import argparse
import subprocess
import sys
from pathlib import Path


def run_command(command: list) -> None:
    result = subprocess.run(command)
    if result.returncode != 0:
        raise SystemExit(result.returncode)


def main() -> None:
    parser = argparse.ArgumentParser(description="One-command run: pipeline + dashboard")
    parser.add_argument("--profiles", default="chrome,edge,firefox", help="Comma-separated profiles")
    parser.add_argument("--input-dir", default="market-intel-mvp/data/raw", help="Input NDJSON directory")
    parser.add_argument("--top-n", default="20", help="Top clusters per profile")
    parser.add_argument("--open", action="store_true", help="Open dashboard in default browser")
    args = parser.parse_args()

    python = sys.executable

    run_command([
        python,
        "market-intel-mvp/scripts/run_pipeline.py",
        "--profiles", args.profiles,
        "--input-dir", args.input_dir,
        "--top-n", str(args.top_n),
    ])

    run_command([
        python,
        "market-intel-mvp/scripts/build_dashboard.py",
    ])

    dashboard = Path("market-intel-mvp/outputs/weekly-opportunities/dashboard.html")
    print(f"Dashboard ready: {dashboard}")

    if args.open:
        if sys.platform == "darwin":
            subprocess.run(["open", str(dashboard)])
        elif sys.platform.startswith("linux"):
            subprocess.run(["xdg-open", str(dashboard)])
        elif sys.platform.startswith("win"):
            subprocess.run(["start", str(dashboard)], shell=True)


if __name__ == "__main__":
    main()
