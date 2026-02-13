#!/bin/bash

# KojinStudios Bots - Easy Push Script
# Repo: https://github.com/alexsteward/kojinstudios-bots
# Deploys to: bots.kojinstudios.com via Netlify

REPO_URL="https://github.com/alexsteward/kojinstudios-bots.git"

echo "========================================"
echo "  KojinStudios Bots - Push to Deploy"
echo "========================================"

# Check if we're in the right directory
if [ ! -f "index.html" ]; then
    echo "Error: Please run this script from the kojinstudios-bots directory"
    echo "  Current directory: $(pwd)"
    exit 1
fi

# Initialize git if needed
if [ ! -d ".git" ]; then
    echo ""
    echo "Initializing git repository..."
    git init
    git remote add origin "$REPO_URL"
    git branch -M main
fi

# Get commit message from user
echo ""
echo "What did you change? (Enter a commit message):"
read -r commit_message

# If no message provided, use default
if [ -z "$commit_message" ]; then
    commit_message="Update bots site"
fi

echo ""
echo "Adding all changes..."
git add .

echo "Committing: '$commit_message'"
git commit -m "$commit_message"

echo "Pulling latest changes..."
git pull origin main --rebase --allow-unrelated-histories 2>/dev/null || git pull origin main --rebase

echo "Pushing to GitHub..."
git push -u origin main

echo ""
echo "Done! Changes pushed to kojinstudios-bots."
echo "Netlify will auto-deploy to: https://bots.kojinstudios.com"
echo ""
