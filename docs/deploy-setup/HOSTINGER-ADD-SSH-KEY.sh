#!/bin/bash
# Run INSIDE Hostinger Browser Terminal (one-time).
# Adds GitHub Actions public key to root authorized_keys.

set -euo pipefail
PUB='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICcO2hE3Lsc7DeNCv06m8jTk7BUglg4fbDYZl92SdJ4k github-actions-dalia-deploy'

mkdir -p /root/.ssh
chmod 700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

if grep -qF 'github-actions-dalia-deploy' /root/.ssh/authorized_keys 2>/dev/null; then
  echo "Key already present."
else
  echo "$PUB" >> /root/.ssh/authorized_keys
  echo "Key added."
fi

echo "=== Effective SSH settings ==="
sshd -T 2>/dev/null | grep -Ei 'passwordauthentication|permitrootlogin|pubkeyauthentication' || true

echo "=== Test from your PC after this ==="
echo "ssh -i github-actions-dalia root@72.60.36.182 echo OK"
