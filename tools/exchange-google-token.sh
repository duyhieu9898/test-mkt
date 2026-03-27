#!/bin/bash
# Exchange Google auth code for refresh token
# Usage: ./tools/exchange-google-token.sh "4/0AfxxxxYOUR_AUTH_CODE"

if [ -z "$1" ]; then
  echo "Usage: $0 <auth_code>"
  echo "Paste the auth code from Google OAuth callback"
  exit 1
fi

AUTH_CODE="$1"

# Load credentials from .env
export $(grep -E 'GOOGLE_CLIENT_ID|GOOGLE_CLIENT_SECRET' .env | xargs)

if [ -z "$GOOGLE_CLIENT_ID" ] || [ -z "$GOOGLE_CLIENT_SECRET" ]; then
  echo "❌ GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not found in .env"
  exit 1
fi

REDIRECT_URI="http://localhost:3004/api/auth/callback/google"

echo "Exchanging auth code for refresh token..."
echo ""

RESULT=$(curl -s -X POST https://oauth2.googleapis.com/token \
  -d "client_id=${GOOGLE_CLIENT_ID}" \
  -d "client_secret=${GOOGLE_CLIENT_SECRET}" \
  -d "code=${AUTH_CODE}" \
  -d "grant_type=authorization_code" \
  -d "redirect_uri=${REDIRECT_URI}")

echo "$RESULT" | python3 -m json.tool 2>/dev/null || echo "$RESULT"

# Extract refresh token
REFRESH_TOKEN=$(echo "$RESULT" | python3 -c "import sys,json;d=json.load(sys.stdin);print(d.get('refresh_token',''))" 2>/dev/null)

if [ -n "$REFRESH_TOKEN" ]; then
  echo ""
  echo "✅ Got refresh token!"
  echo ""
  # Update .env
  if grep -q "GOOGLE_REFRESH_TOKEN" .env; then
    sed -i '' "s|GOOGLE_REFRESH_TOKEN=.*|GOOGLE_REFRESH_TOKEN=${REFRESH_TOKEN}|" .env
    echo "✅ Updated GOOGLE_REFRESH_TOKEN in .env"
  else
    echo "GOOGLE_REFRESH_TOKEN=${REFRESH_TOKEN}" >> .env
    echo "✅ Added GOOGLE_REFRESH_TOKEN to .env"
  fi
else
  echo ""
  echo "❌ No refresh token in response. Auth code may have expired."
  echo "   Re-open the auth URL and try again with a fresh code."
fi
