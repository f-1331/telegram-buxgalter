import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import threading
import time
from pathlib import Path
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s : %(message)s"
)
logger = logging.getLogger("unified_server")

BASE_DIR = Path(__file__).resolve().parent
LOCAL_PORT = 3001
BOT_TOKEN = "8852836604:AAE-GZMzxp-aN1m3MCwX7ffNF6JJDyTdpWU"
OWNER_TELEGRAM_ID = 6707839718
RENDER_HEALTH_URL = "https://telegram-buxgalter.onrender.com/health"


def drain_pipe(proc):
    """Continuously drain cloudflared stdout to prevent OS pipe buffer overflow."""
    try:
        while proc and proc.poll() is None:
            line = proc.stdout.readline()
            if not line:
                break
    except Exception:
        pass


def start_cloudflared_tunnel():
    """Start cloudflared in the background and extract the live HTTPS tunnel URL."""
    cf_binary = BASE_DIR / "cloudflared.exe"
    if not cf_binary.exists():
        logger.error(f"cloudflared.exe topilmadi: {cf_binary}")
        return None, None

    cmd = [str(cf_binary), "tunnel", "--url", f"http://127.0.0.1:{LOCAL_PORT}", "--no-autoupdate"]
    logger.info(f"Cloudflare Tunnel ishga tushirilmoqda: http://127.0.0.1:{LOCAL_PORT} ...")
    proc = subprocess.Popen(
        cmd,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1
    )

    tunnel_url = None
    start = time.time()
    while time.time() - start < 35:
        line = proc.stdout.readline()
        if not line:
            time.sleep(0.1)
            continue
        line_clean = line.strip()
        if "trycloudflare.com" in line_clean:
            match = re.search(r"https://[a-zA-Z0-9-]+\.trycloudflare\.com", line_clean)
            if match:
                tunnel_url = match.group(0)
                break

    if not tunnel_url:
        logger.error("35 soniya ichida tunnel URL olinmadi.")
        proc.terminate()
        return None, None

    # Start background thread to drain stdout continuously
    threading.Thread(target=drain_pipe, args=(proc,), daemon=True).start()

    logger.info(f"✅ Jonli Cloudflare Tunnel manzili: {tunnel_url}")
    with open(BASE_DIR / "tunnel_url.txt", "w", encoding="utf-8") as f:
        f.write(tunnel_url)

    return proc, tunnel_url


def update_vercel_json_and_push(tunnel_url: str):
    """Update vercel.json routes to forward to the active tunnel and git push."""
    vercel_path = BASE_DIR / "vercel.json"
    if not vercel_path.exists():
        logger.warning("vercel.json topilmadi, o'tkazib yuborildi.")
        return

    try:
        with open(vercel_path, "r", encoding="utf-8") as f:
            content = f.read()

        old_pattern = r'https://[a-zA-Z0-9\.\-]+\.(?:onrender\.com|trycloudflare\.com)'
        new_content = re.sub(old_pattern, tunnel_url, content)

        if new_content != content:
            with open(vercel_path, "w", encoding="utf-8") as f:
                f.write(new_content)
            logger.info("vercel.json yangi tunnel manzili bilan yangilandi.")

            subprocess.run(["git", "add", "vercel.json"], cwd=str(BASE_DIR), check=True)
            subprocess.run(["git", "commit", "-m", f"chore(tunnel): route traffic to {tunnel_url}"], cwd=str(BASE_DIR), check=True)
            subprocess.run(["git", "push", "origin", "main"], cwd=str(BASE_DIR), check=True)
            logger.info("✅ Yangi tunnel yo'nalishi GitHub'ga push qilindi!")
        else:
            logger.info("vercel.json allaqachon to'g'ri sozlangan.")
    except Exception as e:
        logger.warning(f"vercel.json avtomatik yangilashda ogohlantirish: {e}")


def is_render_down():
    try:
        r = httpx.get(RENDER_HEALTH_URL, timeout=5.0)
        return r.status_code != 200
    except Exception:
        return True


def update_telegram_webhook(target_url: str):
    if "onrender.com" in target_url:
        webhook_url = f"{target_url.rstrip('/')}/webhook"
        try:
            r = httpx.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook",
                json={
                    "url": webhook_url,
                    "allowed_updates": ["message", "callback_query"],
                    "drop_pending_updates": False
                },
                timeout=10.0
            )
            if r.json().get("ok"):
                logger.info(f"✅ Telegram Webhook Render'ga ulandi -> {webhook_url}")
        except Exception as e:
            logger.warning(f"Telegram webhook sozlashda xatolik: {e}")
    else:
        # Zaxira rejimda webhook o'chiriladi, shunda lokal bot darhol polling orqali javob beradi
        try:
            r = httpx.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/deleteWebhook",
                json={"drop_pending_updates": False},
                timeout=10.0
            )
            if r.json().get("ok"):
                logger.info("✅ Telegram Webhook tozalandi, lokal bot uzilishsiz xabarlarni qabul qilmoqda.")
        except Exception as e:
            logger.warning(f"Telegram webhook tozalashda xatolik: {e}")


def notify_owner(msg: str):
    try:
        httpx.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
            json={
                "chat_id": OWNER_TELEGRAM_ID,
                "text": msg,
                "parse_mode": "HTML"
            },
            timeout=10.0
        )
    except Exception as e:
        logger.warning(f"Telegram xabarnomada xatolik: {e}")


def is_local_server_running():
    try:
        r = httpx.get(f"http://127.0.0.1:{LOCAL_PORT}/health", timeout=3.0)
        return r.status_code == 200
    except Exception:
        return False


def main():
    logger.info("="*60)
    logger.info("🚀 Shaxsiy AI Buxgalter - Unified Local Server & Tunnel Launcher")
    logger.info("="*60)

    # 1. Start local Node.js server if not already running
    node_proc = None
    if not is_local_server_running():
        logger.info(f"Buxgalter bot Node.js serveri ishga tushirilmoqda (Port: {LOCAL_PORT})...")
        env = os.environ.copy()
        env["PORT"] = str(LOCAL_PORT)
        node_proc = subprocess.Popen(
            ["node", "src/index.js"],
            cwd=str(BASE_DIR),
            env=env
        )
        # Wait up to 10s for node server to start
        for _ in range(20):
            time.sleep(0.5)
            if is_local_server_running():
                break

    if is_local_server_running():
        logger.info("✅ Lokal Buxgalter bot serveri faol ishlamoqda!")
    else:
        logger.error("❌ Lokal server ishga tushmadi!")
        sys.exit(1)

    # 2. Start Cloudflare Tunnel
    cf_proc, tunnel_url = start_cloudflared_tunnel()
    if not tunnel_url:
        logger.error("Cloudflare tunnel olinmadi.")
        if node_proc:
            node_proc.terminate()
        sys.exit(1)

    # 3. If Render is down (e.g. 503 limit), immediately switch traffic to this tunnel!
    if is_render_down():
        logger.warning("🚨 Render hozirda ishlamayapti (503 Limit)! Zaxira tunnel faollashtirilmoqda...")
        update_vercel_json_and_push(tunnel_url)
        update_telegram_webhook(tunnel_url)
        notify_owner(
            f"⚠️ <b>Render serveri to'xtatilgan (503 Limit)!</b>\n\n"
            f"Zaxira tizimi avtomatik ravishda <b>Cloudflare Tunnel</b> ga ulandi.\n"
            f"🌐 Faol zaxira URL: <code>{tunnel_url}</code>\n\n"
            f"✅ Buxgalter boti 100% uzilishsiz ishlamoqda!"
        )
    else:
        logger.info("Render hozirda faol. Tunnel zaxira holatida turadi.")

    logger.info("\n" + "="*60)
    logger.info(f"🟢 TIZIM 100% TAYYOR VA ISHLAMOQDA!")
    logger.info(f"   Lokal Port:  http://127.0.0.1:{LOCAL_PORT}")
    logger.info(f"   Zaxira URL:  {tunnel_url}")
    logger.info("="*60 + "\n")

    try:
        # Keep process alive with auto-healing loops
        while True:
            time.sleep(3)

            # Node.js auto-restart if it stopped
            if node_proc and node_proc.poll() is not None:
                logger.warning("⚠️ Node.js serveri to'xtab qoldi. Qayta ishga tushirilmoqda...")
                env = os.environ.copy()
                env["PORT"] = str(LOCAL_PORT)
                node_proc = subprocess.Popen(["node", "src/index.js"], cwd=str(BASE_DIR), env=env)
                time.sleep(2)

            # Cloudflare tunnel auto-restart if it disconnected
            if cf_proc and cf_proc.poll() is not None:
                logger.warning("⚠️ Cloudflare tunnel uzildi. Qayta ulanmoqda...")
                cf_proc, new_url = start_cloudflared_tunnel()
                if new_url:
                    tunnel_url = new_url
                    logger.info(f"🔄 Yangilangan zaxira tunnel URL: {tunnel_url}")
                    if is_render_down():
                        update_vercel_json_and_push(tunnel_url)
                        update_telegram_webhook(tunnel_url)

    except KeyboardInterrupt:
        logger.info("\nTo'xtatilmoqda...")
    finally:
        if node_proc and node_proc.poll() is None:
            node_proc.terminate()
        if cf_proc and cf_proc.poll() is None:
            cf_proc.terminate()


if __name__ == "__main__":
    main()
