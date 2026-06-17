#!/bin/bash
# Run in Hostinger Browser Terminal — diagnose + fix SSH key auth for root.
set -euo pipefail

EXPECTED='AAAAC3NzaC1lZDI1NTE5AAAAICcO2hE3Lsc7DeNCv06m8jTk7BUglg4fbDYZl92SdJ4k'
PUB='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAICcO2hE3Lsc7DeNCv06m8jTk7BUglg4fbDYZl92SdJ4k github-actions-dalia-deploy'

echo "=== /root permissions ==="
ls -ld /root /root/.ssh /root/.ssh/authorized_keys 2>/dev/null || true

echo ""
echo "=== authorized_keys (grep dalia) ==="
grep -n 'dalia\|github-actions' /root/.ssh/authorized_keys 2>/dev/null || echo "(no matching line)"

echo ""
echo "=== sshd effective ==="
sshd -T 2>/dev/null | grep -Ei 'permitrootlogin|pubkeyauthentication|authorizedkeysfile|passwordauthentication' || true

echo ""
echo "=== Fix permissions + ensure exact key line ==="
mkdir -p /root/.ssh
chmod 700 /root/.ssh
chown root:root /root/.ssh
touch /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys
chown root:root /root/.ssh/authorized_keys

# Remove broken/partial lines and CRLF artifacts
sed -i '/github-actions-dalia-deploy/d' /root/.ssh/authorized_keys
sed -i '/\r$/d' /root/.ssh/authorized_keys 2>/dev/null || true
echo "$PUB" >> /root/.ssh/authorized_keys

if grep -qF "$EXPECTED" /root/.ssh/authorized_keys; then
  echo "OK: expected public key present"
else
  echo "FAIL: key still missing"
  exit 1
fi

echo ""
echo "=== Restart ssh (safe) ==="
systemctl reload ssh 2>/dev/null || systemctl reload sshd 2>/dev/null || service ssh reload

echo "Done. Test from PC:"
echo "ssh -i github-actions-dalia root@72.60.36.182 echo OK"
