import asyncio
import json
import logging
import os
import re
import subprocess
import sys
import time
from pathlib import Path
import httpx

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)-8s | %(name)s : %(message)s"
)
logger = logging.getLogger("ha_failover_watchdog")

BASE_DIR = Path(__file__).resolve().parent
RENDER_URL = "https://telegram-buxgalter.onrender.com"
RENDER_HEALTH_URL = f"{RENDER_URL}/health"
LOCAL_HEALTH_URL = "http://127.0.0.1:3001/health"
BOT_TOKEN = "8852836604:AAE-GZMzxp-aN1m3MCwX7ffNF6JJDyTdpWU"
OWNER_TELEGRAM_ID = 6707839718
CHECK_INTERVAL_SECONDS = 90  # Har 90 soniyada tekshiradi
STATE_FILE = BASE_DIR / "failover_state.json"


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


def get_current_vercel_target() -> str:
    vercel_path = BASE_DIR / "vercel.json"
    if not vercel_path.exists():
        return "UNKNOWN"
    try:
        with open(vercel_path, "r", encoding="utf-8") as f:
            content = f.read()
        if "telegram-buxgalter.onrender.com" in content:
            return "RENDER"
        elif "trycloudflare.com" in content:
            return "TUNNEL"
    except Exception:
        pass
    return "UNKNOWN"


def get_active_tunnel_url() -> str:
    tunnel_file = BASE_DIR / "tunnel_url.txt"
    if tunnel_file.exists():
        try:
            with open(tunnel_file, "r", encoding="utf-8") as f:
                url = f.read().strip()
                if url.startswith("https://") and "trycloudflare.com" in url:
                    return url
        except Exception:
            pass
    return ""


def update_vercel_route(new_target_url: str, target_name: str) -> bool:
    vercel_path = BASE_DIR / "vercel.json"
    if not vercel_path.exists():
        logger.error("vercel.json topilmadi!")
        return False

    try:
        with open(vercel_path, "r", encoding="utf-8") as f:
            content = f.read()

        old_pattern = r'https://[a-zA-Z0-9\.\-]+\.(?:onrender\.com|trycloudflare\.com)'
        new_content = re.sub(old_pattern, new_target_url, content)

        if new_content == content:
            logger.info(f"vercel.json allaqachon {new_target_url} ga yo'naltirilgan.")
            return True

        with open(vercel_path, "w", encoding="utf-8") as f:
            f.write(new_content)

        logger.info(f"vercel.json yangilandi -> {new_target_url}")

        subprocess.run(["git", "add", "vercel.json"], cwd=str(BASE_DIR), check=True)
        subprocess.run(["git", "commit", "-m", f"chore(ha-failover): auto-route to {target_name} ({new_target_url})"], cwd=str(BASE_DIR), check=True)
        subprocess.run(["git", "push", "origin", "main"], cwd=str(BASE_DIR), check=True)
        logger.info(f"✅ GitHub'ga muvaffaqiyatli push qilindi -> {target_name}")
        return True
    except Exception as e:
        logger.error(f"vercel.json yangilash yoki push qilishda xatolik: {e}")
        return False


async def update_telegram_webhook(target_url: str) -> bool:
    webhook_url = f"{target_url.rstrip('/')}/webhook"
    logger.info(f"📡 Telegram Webhook yangilanmoqda: {webhook_url}")
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook",
                json={
                    "url": webhook_url,
                    "allowed_updates": ["message", "callback_query"],
                    "drop_pending_updates": False
                }
            )
            data = resp.json()
            if data.get("ok"):
                logger.info(f"✅ Telegram Webhook muvaffaqiyatli yo'naltirildi: {webhook_url}")
                return True
            else:
                logger.warning(f"Telegram Webhook javobi: {data}")
    except Exception as e:
        logger.error(f"Telegram Webhook o'rnatishda xatolik: {e}")
    return False


async def notify_owner_telegram(message_html: str):
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(
                f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage",
                json={
                    "chat_id": OWNER_TELEGRAM_ID,
                    "text": message_html,
                    "parse_mode": "HTML"
                }
            )
            if resp.status_code == 200:
                logger.info("Foydalanuvchiga Telegram orqali xabar yuborildi.")
            else:
                logger.warning(f"Telegram xabar yuborishda xatolik: {resp.text}")
    except Exception as e:
        logger.warning(f"Telegram xabarnoma jo'natishda xatolik: {e}")


async def check_render_health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True) as client:
            resp = await client.get(RENDER_HEALTH_URL)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") in ("ok", "healthy"):
                    return True
    except Exception:
        pass
    return False


async def check_local_server_health() -> bool:
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(LOCAL_HEALTH_URL)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("status") in ("ok", "healthy"):
                    return True
    except Exception:
        pass
    return False


async def run_ha_watchdog():
    logger.info("="*65)
    logger.info("🔄 Bi-directional High-Availability Failover Watchdog Started")
    logger.info(f"   Asosiy (Primary): Render ({RENDER_URL})")
    logger.info("   Zaxira (Backup):  Cloudflare Tunnel (Local Machine Port 3001)")
    logger.info(f"   Tekshiruv oralig'i: Har {CHECK_INTERVAL_SECONDS}s")
    logger.info("="*65)

    state = load_state()

    while True:
        try:
            current_target = get_current_vercel_target()
            render_alive = await check_render_health()

            if render_alive:
                state["render_success_count"] += 1
                state["render_fail_count"] = 0
                logger.info(f"[HEALTH] Render: UP (streak: {state['render_success_count']}) | Joriy Vercel target: {current_target}")

                # CASE 1: Render tirildi va 2 marta ketma-ket muvaffaqiyatli ishladi,
                # lekin Vercel/Webhook hali zaxira TUNNELga qarab turibdi -> FAILBACK TO RENDER
                if (current_target == "TUNNEL" or state.get("current_target") == "TUNNEL") and state["render_success_count"] >= 2:
                    logger.info("🎉 RENDER TIKLANDI! Render serveriga avtomatik qaytarilmoqda...")
                    success = update_vercel_route(RENDER_URL, "RENDER")
                    await update_telegram_webhook(RENDER_URL)
                    if success:
                        state["current_target"] = "RENDER"
                        state["last_switch_time"] = time.strftime("%Y-%m-%d %H:%M:%S")
                        save_state(state)
                        msg = (
                            "🎉 <b>Render limiti yangilandi va server to'liq tiklandi!</b>\n\n"
                            "Tizim avtomatik ravishda asosiy <b>Render bulut serveriga</b> (<code>telegram-buxgalter.onrender.com</code>) qaytarildi.\n\n"
                            "✅ Buxgalter boti yana to'liq bulutda 24/7 uzluksiz ishlamoqda!"
                        )
                        await notify_owner_telegram(msg)
            else:
                state["render_fail_count"] += 1
                state["render_success_count"] = 0
                logger.warning(f"[HEALTH] Render: DOWN (streak: {state['render_fail_count']}) | Joriy Vercel target: {current_target}")

                # CASE 2: Render to'xtadi (2 marta ketma-ket xatolik: 503 yoki limit tugagan),
                # lekin target hali RENDER -> FAILOVER TO BACKUP TUNNEL
                if (current_target == "RENDER" or state.get("current_target") != "TUNNEL") and state["render_fail_count"] >= 2:
                    logger.warning("🚨 RENDER LIMITI TUGADI (503)! Zaxira Cloudflare Tunneliga o'tkazilmoqda...")
                    tunnel_url = get_active_tunnel_url()
                    local_alive = await check_local_server_health()

                    if tunnel_url and local_alive:
                        success = update_vercel_route(tunnel_url, "TUNNEL")
                        await update_telegram_webhook(tunnel_url)
                        if success:
                            state["current_target"] = "TUNNEL"
                            state["last_switch_time"] = time.strftime("%Y-%m-%d %H:%M:%S")
                            save_state(state)
                            msg = (
                                "⚠️ <b>Render limiti tugadi yoki server to'xtab qoldi!</b>\n\n"
                                "Tizim uzilishsiz ishlashi uchun so'rovlar avtomatik ravishda <b>Zaxira (Cloudflare Tunnel)</b> serveriga ulandi.\n"
                                f"🌐 Jonli zaxira manzili: <code>{tunnel_url}</code>\n\n"
                                "✅ Telegram Buxgalter boti 100% uzilishsiz ishlamoqda!"
                            )
                            await notify_owner_telegram(msg)
                    else:
                        logger.error(f"Zaxiraga o'tib bo'lmadi: local_alive={local_alive}, tunnel_url={tunnel_url}")

            save_state(state)

        except Exception as e:
            logger.error(f"HA watchdog'da kutilmagan xatolik: {e}", exc_info=True)

        await asyncio.sleep(CHECK_INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        asyncio.run(run_ha_watchdog())
    except KeyboardInterrupt:
        logger.info("Watchdog foydalanuvchi tomonidan to'xtatildi.")
