#!/usr/bin/env bash
# Installe puis déploie la fonction d'email quotidien de l'agent SEA.
set -euo pipefail
DIR="supabase/functions/agent-sea-email"
mkdir -p "$DIR"
cp scripts/sea-agent/edge/agent-sea-email.ts "$DIR/index.ts"
supabase functions deploy agent-sea-email --project-ref bvvbkaluajgdurxnnqqu --no-verify-jwt
