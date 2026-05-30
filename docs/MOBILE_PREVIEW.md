# Mobile Preview

Test the app on a real phone or tablet while developing, on the same
Wi-Fi network as your computer. No deployment needed.

## How it works

The Vite dev server is already configured to bind to all network
interfaces (`host: "::"` in `vite.config.ts`, port `8080`), so any
device on the same Wi-Fi can reach it.

## Step by step

### 1. Start the dev server

```bash
bun run dev
```

You'll see something like:

```
  ➜  Local:    http://localhost:8080/
  ➜  Network:  http://192.168.1.42:8080/
  ➜  Network:  http://172.18.0.1:8080/
```

The `Network` URL is what you'll use on your phone.

### 2. Find your computer's LAN IP (if Vite didn't print one you can use)

On Linux/macOS:
```bash
ip -4 addr | grep inet | grep -v 127.0.0.1
# or
ifconfig | grep "inet " | grep -v 127.0.0.1
```

On Windows (PowerShell):
```powershell
ipconfig | findstr IPv4
```

Pick the one on your home/office Wi-Fi network (usually `192.168.x.x`
or `10.x.x.x`).

### 3. Open it on your phone

Make sure the phone is on the **same Wi-Fi** as your computer, then
open the browser and visit:

```
http://<your-computer-ip>:8080
```

For example: `http://192.168.1.42:8080`

The Dalia app will load. Changes you save in Cursor reload
automatically on the phone (hot reload over Vite).

## If it doesn't work

| Symptom | Likely cause | Fix |
|---|---|---|
| Phone shows "connection refused" or hangs | Your computer's firewall is blocking port 8080 | Allow port 8080 on the firewall (Linux: `sudo ufw allow 8080`; macOS: System Settings → Network → Firewall; Windows: Defender Firewall) |
| Phone is on different Wi-Fi (e.g. mobile data, guest network) | Devices can't see each other | Switch the phone to the same Wi-Fi as your computer |
| Address is reachable but assets 404 | You typed `https://` instead of `http://` for local dev | Use `http://` |
| Multiple network interfaces, unsure which IP is the right one | — | Open `Settings → About / Wi-Fi` on your phone, see what subnet it's on (e.g. `192.168.1.x`), pick the matching IP from your computer |

## Testing on a phone that isn't on your Wi-Fi (rare)

If you need to share the dev preview with someone outside your
network (Yoni from his location, for example), use `ngrok`:

```bash
# one-time install:  https://ngrok.com/download
ngrok http 8080
```

ngrok prints a public `https://...ngrok-free.app` URL that proxies
to your local dev server. Share that URL. Stop ngrok with `Ctrl+C`
when finished.

> ⚠️ Don't leave ngrok running unattended. The tunnel is public until
> you stop it.
