#!/usr/bin/env python3
"""
KojinStudios Bots - Push to Deploy (Windows / Mac / Linux)
Repo: https://github.com/alexsteward/kojinstudios-bots
Deploys to: bots.kojinstudios.com via Netlify
"""

import os
import subprocess
import sys

REPO_URL = "https://github.com/alexsteward/kojinstudios-bots.git"

def run(cmd, check=True, capture=False):
    if isinstance(cmd, str):
        cmd = cmd.split()
    return subprocess.run(
        cmd,
        check=check,
        capture_output=capture,
        text=True,
        shell=sys.platform == "win32",
    )

def main():
    print("========================================")
    print("  KojinStudios Bots - Push to Deploy")
    print("========================================")

    if not os.path.isfile("index.html"):
        print("Error: Run this script from the kojinstudios-bots directory")
        print(f"  Current directory: {os.getcwd()}")
        sys.exit(1)

    if not os.path.isdir(".git"):
        print("\nInitializing git repository...")
        run("git init")
        run(["git", "remote", "add", "origin", REPO_URL])
        run("git branch -M main")

    msg = input("\nWhat did you change? (Enter a commit message): ").strip()
    if not msg:
        msg = "Update bots site"

    print("\nAdding all changes...")
    run("git add .")

    print(f"Committing: '{msg}'")
    r = subprocess.run(
        ["git", "commit", "-m", msg],
        capture_output=True,
        text=True,
        shell=sys.platform == "win32",
    )
    if r.returncode != 0:
        out = (r.stderr or "") + (r.stdout or "")
        if "nothing to commit" in out or "working tree clean" in out:
            print("Nothing to commit. Pulling and pushing anyway...")
        else:
            print(r.stderr or r.stdout or "Commit failed.")
            sys.exit(1)

    print("Pulling latest changes...")
    try:
        run("git pull origin main --rebase --allow-unrelated-histories", capture=True)
    except subprocess.CalledProcessError:
        try:
            run("git pull origin main --rebase", capture=True)
        except subprocess.CalledProcessError:
            pass

    print("Pushing to GitHub...")
    run("git push -u origin main")

    print("\nDone! Changes pushed to kojinstudios-bots.")
    print("Netlify will auto-deploy to: https://bots.kojinstudios.com\n")

if __name__ == "__main__":
    main()
