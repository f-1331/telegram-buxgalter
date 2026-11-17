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
logger = logging.getLogger("unified_ha_server")

BASE_DIR = Path(__file__).resolve().parent
LOCAL_PORT = 3001
BOT_TOKEN = "8852836604:AAE-GZMzxp-aN1m3MCwX7ffNF6JJDyTdpWU"
OWNER_TELEGRAM_ID = 6707839718
RENDER_URL = "https://telegram-buxgalter.onrender.com"
RENDER_HEALTH_URL = f"{RENDER_URL}/health"
STATE_FILE = BASE_DIR / "failover_state.json"
CHECK_INTERVAL_SECONDS = 90


def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            with open(STATE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {
        "current_target": "UNKNOWN",
        "render_fail_count": 0,
        "render_success_count": 0,
        "last_switch_time": None
    }


def save_state(state: dict):
    try:
        with open(STATE_FILE, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception as e:
        logger.warning(f"Could not save state: {e}")


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


def is_render_healthy() -> bool:
    try:
        r = httpx.get(RENDER_HEALTH_URL, timeout=7.0, follow_redirects=True)
        return r.status_code == 200
    except Exception:
        return False


def is_local_server_healthy() -> bool:
    try:
        r = httpx.get(f"http://127.0.0.1:{LOCAL_PORT}/health", timeout=3.0)
        return r.status_code == 200
    except Exception:
        return False


def update_vercel_json_and_push(new_target_url: str, target_name: str) -> bool:
    vercel_path = BASE_DIR / "vercel.json"
    if not vercel_path.exists():
        return False

    try:
        with open(vercel_path, "r", encoding="utf-8") as f:
            content = f.read()

        old_pattern = r'https://[a-zA-Z0-9\.\-]+\.(?:onrender\.com|trycloudflare\.com)'
        new_content = re.sub(old_pattern, new_target_url, content)

        if new_content == content:
            return True

        with open(vercel_path, "w", encoding="utf-8") as f:
            f.write(new_content)
        logger.info(f"vercel.json yangilandi -> {new_target_url}")

        subprocess.run(["git", "add", "vercel.json"], cwd=str(BASE_DIR), check=True)
        subprocess.run(
            ["git", "commit", "-m", f"chore(ha-failover): route traffic to {target_name} ({new_target_url})"],
            cwd=str(BASE_DIR),
            check=True
        )
        subprocess.run(["git", "push", "origin", "main"], cwd=str(BASE_DIR), check=True)
        logger.info(f"✅ GitHub'ga push qilindi -> {target_name}")
        return True
    except Exception as e:
        logger.warning(f"vercel.json yangilash yoki git push xatoligi: {e}")
        return False


def set_telegram_webhook_to_render() -> bool:
    webhook_url = f"{RENDER_URL}/webhook"
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
            logger.info(f"✅ Telegram Webhook Render bulutiga ulandi: {webhook_url}")
            return True
    except Exception as e:
        logger.warning(f"setWebhook xatoligi: {e}")
    return False


def delete_telegram_webhook_for_local_polling() -> bool:
    try:
        r = httpx.post(
            f"https://api.telegram.org/bot{BOT_TOKEN}/deleteWebhook",
            json={"drop_pending_updates": False},
            timeout=10.0
        )
        if r.json().get("ok"):
            logger.info("✅ Telegram Webhook tozalandi, lokal bot polling orqali to'siqsiz ishlamoqda.")
            return True
    except Exception as e:
        logger.warning(f"deleteWebhook xatoligi: {e}")
    return False


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

    # Continuously drain stdout
    threading.Thread(target=drain_pipe, args=(proc,), daemon=True).start()

    logger.info(f"✅ Jonli Cloudflare Tunnel manzili: {tunnel_url}")
    with open(BASE_DIR / "tunnel_url.txt", "w", encoding="utf-8") as f:
        f.write(tunnel_url)

    return proc, tunnel_url


def start_node_bot():
    """Start Node.js bot process."""
    logger.info(f"Buxgalter bot Node.js jarayoni ishga tushirilmoqda (Port: {LOCAL_PORT})...")
    env = os.environ.copy()
    env["PORT"] = str(LOCAL_PORT)
    proc = subprocess.Popen(
        ["node", "src/index.js"],
        cwd=str(BASE_DIR),
        env=env
    )
    return proc


def kill_existing_port_listeners(port: int):
    """Cleanly close any existing process occupying LOCAL_PORT."""
    try:
        cmd = f'powershell -Command "Get-NetTCPConnection -LocalPort {port} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess"'
        out = subprocess.check_output(cmd, shell=True, text=True).strip()
        if out:
            pids = [int(p) for p in out.splitlines() if p.strip().isdigit()]
            for pid in pids:
                if pid != os.getpid():
                    logger.info(f"Port {port} band bo'lgani sababli PID {pid} to'xtatilmoqda...")
                    subprocess.run(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except Exception:
        pass


def main():
    logger.info("=" * 65)
    logger.info("🚀 SHAXSIY AI BUXGALTER - BI-DIRECTIONAL HA AUTO-FAILOVER & SERVER")
    logger.info(f"   Asosiy (Primary): Render ({RENDER_URL})")
    logger.info(f"   Zaxira (Backup):  Lokal Polling + Cloudflare Tunnel (Port {LOCAL_PORT})")
    logger.info(f"   Tekshiruv oralig'i: Har {CHECK_INTERVAL_SECONDS} soniyada")
    logger.info("=" * 65)

    # 1. Clean port 3001 if occupied by ghost processes
    kill_existing_port_listeners(LOCAL_PORT)
    time.sleep(1)

    # 2. Start local Node.js bot server
    node_proc = start_node_bot()

    # Wait up to 10s for local bot to report healthy
    for _ in range(20):
        time.sleep(0.5)
        if is_local_server_healthy():
            break

    if is_local_server_healthy():
        logger.info("✅ Lokal Buxgalter bot serveri faol ishlamoqda!")
    else:
        logger.warning("⚠️ Lokal server hali /health ga javob bermadi, davom etilmoqda...")

    # 3. Start Cloudflare Tunnel
    cf_proc, tunnel_url = start_cloudflared_tunnel()

    # 4. Check initial health of Render
    state = load_state()
    render_alive = is_render_healthy()

    if not render_alive:
        logger.warning("🚨 Render hozirda ishlamayapti (503 Limit)! Zaxira lokal rejim faollashtirilmoqda...")
        delete_telegram_webhook_for_local_polling()
        if tunnel_url:
            update_vercel_json_and_push(tunnel_url, "TUNNEL")
        state["current_target"] = "TUNNEL"
        state["render_fail_count"] = 2
        state["render_success_count"] = 0
        state["last_switch_time"] = time.strftime("%Y-%m-%d %H:%M:%S")
        save_state(state)
        notify_owner(
            f"⚠️ <b>Render serveri to'xtatilgan (503 Limit)!</b>\n\n"
            f"Zaxira tizimi avtomatik ravishda <b>Lokal Server + Cloudflare Tunnel</b>ga ulandi.\n"
            f"🌐 Faol zaxira URL: <code>{tunnel_url or 'Local Polling'}</code>\n\n"
            f"✅ Buxgalter boti 100% uzilishsiz ishlamoqda!"
        )
    else:
        logger.info("Render faol (200 OK). Webhook Render bulutiga yo'naltirilmoqda...")
        set_telegram_webhook_to_render()
        update_vercel_json_and_push(RENDER_URL, "RENDER")
        state["current_target"] = "RENDER"
        state["render_fail_count"] = 0
        state["render_success_count"] = 2
        save_state(state)

    logger.info("\n" + "=" * 65)
    logger.info("🟢 TIZIM TO'LIQ ISHGA TUSHDI VA AVTOMATIK NAZORAT BOSHLANDI!")
    logger.info(f"   Joriy Rejim: {state['current_target']}")
    logger.info(f"   Lokal Port:  http://127.0.0.1:{LOCAL_PORT}")
    logger.info(f"   Zaxira URL:  {tunnel_url}")
    logger.info("=" * 65 + "\n")

    last_health_check = time.time()

    try:
        while True:
            time.sleep(3)
            now = time.time()

            # --- PROCESS GUARDIAN ---
            # Auto-restart Node.js if died
            if node_proc and node_proc.poll() is not None:
                logger.warning("⚠️ Node.js serveri to'xtab qoldi! 2 soniyada qayta ishga tushirilmoqda...")
                time.sleep(2)
                node_proc = start_node_bot()

            # Auto-restart Cloudflared if died
            if cf_proc and cf_proc.poll() is not None:
                logger.warning("⚠️ Cloudflare tunnel uzildi! Qayta ulanmoqda...")
                cf_proc, new_url = start_cloudflared_tunnel()
                if new_url:
                    tunnel_url = new_url
                    logger.info(f"🔄 Yangi tunnel URL: {tunnel_url}")
                    if state.get("current_target") == "TUNNEL":
                        update_vercel_json_and_push(tunnel_url, "TUNNEL")

            # --- BI-DIRECTIONAL 90s HEALTH WATCHDOG ---
            if now - last_health_check >= CHECK_INTERVAL_SECONDS:
                last_health_check = now
                current_target = state.get("current_target", "UNKNOWN")
                render_now = is_render_healthy()

                if render_now:
                    state["render_success_count"] = state.get("render_success_count", 0) + 1
                    state["render_fail_count"] = 0
                    logger.info(f"[HEALTH] Render: UP (streak: {state['render_success_count']}) | Target: {current_target}")

                    # FAILBACK TO RENDER: Render 2 marta ketma-ket muvaffaqiyatli bo'lsa va joriy holat TUNNEL bo'lsa
                    if current_target == "TUNNEL" and state["render_success_count"] >= 2:
                        logger.info("🎉 RENDER TIKLANDI! Asosiy Render serveriga qaytarilmoqda...")
                        set_telegram_webhook_to_render()
                        update_vercel_json_and_push(RENDER_URL, "RENDER")
                        state["current_target"] = "RENDER"
                        state["last_switch_time"] = time.strftime("%Y-%m-%d %H:%M:%S")
                        save_state(state)
                        notify_owner(
                            "🎉 <b>Render limiti yangilandi va server to'liq tiklandi!</b>\n\n"
                            f"Tizim avtomatik ravishda asosiy <b>Render bulut serveriga</b> (<code>{RENDER_URL}</code>) qaytarildi.\n\n"
                            "✅ Buxgalter boti yana to'liq bulutda 24/7 uzluksiz ishlamoqda!"
                        )
                else:
                    state["render_fail_count"] = state.get("render_fail_count", 0) + 1
                    state["render_success_count"] = 0
                    logger.warning(f"[HEALTH] Render: DOWN (streak: {state['render_fail_count']}) | Target: {current_target}")

                    # FAILOVER TO TUNNEL: Render 2 marta ketma-ket 503 bersa va target RENDER bo'lsa
                    if current_target != "TUNNEL" and state["render_fail_count"] >= 2:
                        logger.warning("🚨 RENDER TO'XTATILDI (503)! Zaxira rejimga o'tkazilmoqda...")
                        delete_telegram_webhook_for_local_polling()
                        if tunnel_url:
                            update_vercel_json_and_push(tunnel_url, "TUNNEL")
                        state["current_target"] = "TUNNEL"
                        state["last_switch_time"] = time.strftime("%Y-%m-%d %H:%M:%S")
                        save_state(state)
                        notify_owner(
                            "⚠️ <b>Render limiti tugadi yoki server to'xtab qoldi (503)!</b>\n\n"
                            "Tizim uzilishsiz ishlashi uchun so'rovlar avtomatik ravishda <b>Zaxira (Cloudflare Tunnel)</b> serveriga ulandi.\n"
                            f"🌐 Jonli zaxira manzili: <code>{tunnel_url or 'Lokal Polling'}</code>\n\n"
                            "✅ Telegram Buxgalter boti 100% uzilishsiz ishlamoqda!"
                        )

                save_state(state)

    except KeyboardInterrupt:
        logger.info("\nFoydalanuvchi tomonidan to'xtatildi...")
    finally:
        if node_proc and node_proc.poll() is None:
            node_proc.terminate()
        if cf_proc and cf_proc.poll() is None:
            cf_proc.terminate()
        logger.info("Barcha xizmatlar to'xtatildi.")


if __name__ == "__main__":
    main()
