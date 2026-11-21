import argparse
import asyncio
from datetime import datetime, timedelta, timezone
import json
import os
from pathlib import Path
import re
import webbrowser

import aiohttp
from aiohttp import web
import discord

BASE_DIR = Path(__file__).resolve().parent
ENV_PATH = BASE_DIR / ".env"
CONFIG_PATH = BASE_DIR / "bot_config.json"

TZ_PARINTINS = timezone(timedelta(hours=-4))
GRACE_SECONDS = 3600

DEFAULT_MESSAGES = {
    "start": "Hora de jogar, baitolas! O baú vai abrir, bora pro Fortnite 🎮",
    "hourly": "Lembrete: o baú está aberto, baitolas! Bora pro Fortnite 🎮",
    "end": "O baú fechou, baitolas! Fim da {sessao}. Valeu squad 🎮",
}

WEBHOOK_RE = re.compile(
    r"^https://(?:(?:ptb|canary)\.)?(?:discord|discordapp)\.com/api/webhooks/\d+/[\w-]+/?$"
)


def load_env_file(path: Path) -> None:
    if not path.exists():
        return
    for raw_line in path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, val = line.split("=", 1)
        key = key.strip()
        val = val.strip()
        if len(val) >= 2 and ((val[0] == val[-1] == '"') or (val[0] == val[-1] == "'")):
            val = val[1:-1]
        if key:
            os.environ.setdefault(key, val)


def default_config() -> dict:
    return {
        "guild_id": None,
        "channel_id": None,
        "enabled": False,
        "mention_everyone": True,
        "messages": dict(DEFAULT_MESSAGES),
        "sent": {},
        "logs": [],
    }


def load_config() -> dict:
    cfg = default_config()
    if not CONFIG_PATH.exists():
        return cfg
    try:
        raw = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            cfg["guild_id"] = str(raw["guild_id"]) if raw.get("guild_id") else None
            cfg["channel_id"] = str(raw["channel_id"]) if raw.get("channel_id") else None
            cfg["enabled"] = bool(raw.get("enabled", False))
            cfg["mention_everyone"] = bool(raw.get("mention_everyone", True))
            msgs = raw.get("messages")
            if isinstance(msgs, dict):
                for k in DEFAULT_MESSAGES:
                    v = msgs.get(k)
                    if isinstance(v, str) and v.strip():
                        cfg["messages"][k] = v.strip()
            if isinstance(raw.get("sent"), dict):
                cfg["sent"] = raw["sent"]
            if isinstance(raw.get("logs"), list):
                cfg["logs"] = raw["logs"][-25:]
    except Exception:
        pass
    return cfg


def save_config(cfg: dict) -> None:
    CONFIG_PATH.write_text(
        json.dumps(cfg, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )


def add_log(cfg: dict, level: str, text: str) -> None:
    now_str = datetime.now(TZ_PARINTINS).strftime("%d/%m %H:%M:%S")
    cfg.setdefault("logs", []).append({
        "time": now_str,
        "level": level,
        "text": text,
    })
    cfg["logs"] = cfg["logs"][-25:]


def prune_old_sent(cfg: dict, now_ts: float) -> None:
    cutoff = now_ts - 14 * 86400
    sent = cfg.get("sent", {})
    stale = [k for k, v in sent.items() if isinstance(v, (int, float)) and v < cutoff]
    for k in stale:
        del sent[k]


def build_sessions_for_saturday(sab_date) -> list:
    sab_key = sab_date.strftime("%Y-%m-%d")
    s1_start = datetime(sab_date.year, sab_date.month, sab_date.day, 15, 0, tzinfo=TZ_PARINTINS)
    s1_end = datetime(sab_date.year, sab_date.month, sab_date.day, 17, 0, tzinfo=TZ_PARINTINS)
    s2_start = datetime(sab_date.year, sab_date.month, sab_date.day, 22, 0, tzinfo=TZ_PARINTINS)
    s2_end = s2_start + timedelta(hours=2)
    return [
        {"prefix": f"{sab_key}_s0", "nome": "primeira sessão", "inicio": s1_start, "fim": s1_end},
        {"prefix": f"{sab_key}_s1", "nome": "segunda sessão", "inicio": s2_start, "fim": s2_end},
    ]


def build_events(now_dt: datetime | None = None) -> list:
    now_local = (now_dt or datetime.now(TZ_PARINTINS)).astimezone(TZ_PARINTINS)
    diff_sab = (5 - now_local.weekday()) % 7
    next_sab = (now_local + timedelta(days=diff_sab)).date()
    prev_sab = next_sab - timedelta(days=7)

    events = []
    for sab in (prev_sab, next_sab):
        for s in build_sessions_for_saturday(sab):
            events.append({
                "key": f"{s['prefix']}_start",
                "at": s["inicio"],
                "tipo": "start",
                "sessao": s["nome"],
                "data": s["inicio"].strftime("%d/%m"),
                "hora": s["inicio"].strftime("%H:%M"),
            })
            cursor = s["inicio"] + timedelta(hours=1)
            hour_idx = 0
            while cursor < s["fim"]:
                events.append({
                    "key": f"{s['prefix']}_hour{hour_idx}",
                    "at": cursor,
                    "tipo": "hourly",
                    "sessao": s["nome"],
                    "data": cursor.strftime("%d/%m"),
                    "hora": cursor.strftime("%H:%M"),
                })
                hour_idx += 1
                cursor += timedelta(hours=1)
            events.append({
                "key": f"{s['prefix']}_end",
                "at": s["fim"],
                "tipo": "end",
                "sessao": s["nome"],
                "data": s["fim"].strftime("%d/%m"),
                "hora": s["fim"].strftime("%H:%M"),
            })

    events.sort(key=lambda ev: ev["at"])
    return events


def format_message(tipo: str, sessao: str, messages: dict, mention_everyone: bool) -> str:
    template = messages.get(tipo) or DEFAULT_MESSAGES.get(tipo, "")
    body = template.replace("{sessao}", sessao)
    if mention_everyone:
        return f"@everyone\n{body}"
    return body


def parse_hex_color(color_str: str | None) -> int:
    if not color_str:
        return 0xFFC93C
    cleaned = color_str.strip().lstrip("#")
    if len(cleaned) == 6:
        try:
            return int(cleaned, 16)
        except ValueError:
            pass
    return 0xFFC93C


class BauDiscordBot(discord.Client):
    def __init__(self, config: dict, use_members_intent: bool = True) -> None:
        intents = discord.Intents.default()
        intents.members = use_members_intent
        super().__init__(intents=intents)
        self.config = config
        self.members_intent_enabled = use_members_intent
        self.bot_error: str | None = None
        self.scheduler_task: asyncio.Task | None = None

    async def setup_hook(self) -> None:
        self.scheduler_task = asyncio.create_task(self.scheduler_loop())

    async def on_ready(self) -> None:
        self.bot_error = None
        print(f"[BOT] Conectado como {self.user} ({len(self.guilds)} servidor(es))")
        add_log(self.config, "info", f"Bot conectado como {self.user} em {len(self.guilds)} servidor(es).")
        save_config(self.config)

    async def resolve_channel(self, channel_id_str: str):
        cid = int(channel_id_str)
        ch = self.get_channel(cid)
        if ch is None:
            ch = await self.fetch_channel(cid)
        return ch

    async def send_to_channel(self, channel_id_str: str, content: str, mention_everyone: bool) -> None:
        ch = await self.resolve_channel(channel_id_str)
        allowed = discord.AllowedMentions(everyone=mention_everyone)
        await ch.send(content=content, allowed_mentions=allowed)

    async def send_via_channel_webhook(
        self,
        channel_id_str: str,
        content: str | None,
        username: str | None,
        avatar_url: str | None,
        embed: discord.Embed | None,
        allowed_mentions: discord.AllowedMentions,
    ) -> None:
        ch = await self.resolve_channel(channel_id_str)
        webhooks = await ch.webhooks()
        target_wh = None
        for wh in webhooks:
            if wh.user and self.user and wh.user.id == self.user.id:
                target_wh = wh
                break
        if target_wh is None:
            for wh in webhooks:
                if wh.token and wh.name == "Alya Bot Webhook":
                    target_wh = wh
                    break
        if target_wh is None:
            target_wh = await ch.create_webhook(name="Alya Bot Webhook")

        kwargs = {
            "allowed_mentions": allowed_mentions,
            "wait": True,
        }
        if content:
            kwargs["content"] = content
        if username:
            kwargs["username"] = username
        if avatar_url:
            kwargs["avatar_url"] = avatar_url
        if embed is not None:
            kwargs["embed"] = embed
        await target_wh.send(**kwargs)

    async def scheduler_loop(self) -> None:
        await self.wait_until_ready()
        while not self.is_closed():
            try:
                if self.config.get("enabled") and self.config.get("channel_id"):
                    now_dt = datetime.now(TZ_PARINTINS)
                    now_ts = now_dt.timestamp()
                    events = build_events(now_dt)
                    changed = False

                    for ev in events:
                        key = ev["key"]
                        if key in self.config["sent"]:
                            continue
                        delta = now_ts - ev["at"].timestamp()
                        if 0 <= delta <= GRACE_SECONDS:
                            msg = format_message(
                                ev["tipo"],
                                ev["sessao"],
                                self.config["messages"],
                                self.config.get("mention_everyone", True),
                            )
                            self.config["sent"][key] = int(now_ts)
                            prune_old_sent(self.config, now_ts)
                            changed = True
                            try:
                                await self.send_to_channel(
                                    self.config["channel_id"],
                                    msg,
                                    self.config.get("mention_everyone", True),
                                )
                                add_log(
                                    self.config,
                                    "success",
                                    f"Aviso enviado ({ev['tipo']} · {ev['sessao']} {ev['data']} {ev['hora']}).",
                                )
                            except Exception as exc:
                                add_log(
                                    self.config,
                                    "error",
                                    f"Falha ao enviar aviso ({ev['hora']}): {exc}",
                                )
                    if changed:
                        save_config(self.config)
            except Exception as exc:
                print(f"[SCHEDULER] Erro: {exc}")
            await asyncio.sleep(5)


def serialize_state(bot: BauDiscordBot) -> dict:
    now_dt = datetime.now(TZ_PARINTINS)
    now_ts = now_dt.timestamp()
    cfg = bot.config
    sent_map = cfg.get("sent", {})

    guilds_data = []
    if bot.is_ready():
        for g in sorted(bot.guilds, key=lambda x: x.name.lower()):
            me = g.me
            channels_data = []
            for ch in sorted(g.text_channels, key=lambda c: c.position):
                can_send = True
                can_webhook = False
                if me is not None:
                    perms = ch.permissions_for(me)
                    can_send = bool(perms.view_channel and perms.send_messages)
                    can_webhook = bool(perms.view_channel and perms.manage_webhooks)
                channels_data.append({
                    "id": str(ch.id),
                    "name": ch.name,
                    "category": ch.category.name if ch.category else None,
                    "can_send": can_send,
                    "can_webhook": can_webhook,
                })
            guilds_data.append({
                "id": str(g.id),
                "name": g.name,
                "icon_url": str(g.icon.url) if g.icon else None,
                "member_count": g.member_count,
                "channels": channels_data,
            })

    events_data = []
    for ev in build_events(now_dt):
        ev_ts = ev["at"].timestamp()
        is_sent = ev["key"] in sent_map
        is_expired = (now_ts - ev_ts) > GRACE_SECONDS
        if is_expired and not is_sent:
            continue
        if is_expired and is_sent and (now_ts - ev_ts) > 86400:
            continue
        events_data.append({
            "key": ev["key"],
            "at_ms": int(ev_ts * 1000),
            "tipo": ev["tipo"],
            "sessao": ev["sessao"],
            "data": ev["data"],
            "hora": ev["hora"],
            "sent": is_sent,
        })

    bot_user = bot.user
    latency_ms = round(bot.latency * 1000) if bot.is_ready() and bot.latency == bot.latency else None
    return {
        "bot": {
            "ready": bot.is_ready(),
            "tag": str(bot_user) if bot_user else None,
            "id": str(bot_user.id) if bot_user else None,
            "avatar_url": str(bot_user.display_avatar.url) if bot_user else None,
            "latency_ms": latency_ms,
            "guild_count": len(bot.guilds) if bot.is_ready() else 0,
            "members_intent": bot.members_intent_enabled,
            "error": bot.bot_error,
        },
        "guilds": guilds_data,
        "config": {
            "guild_id": cfg.get("guild_id"),
            "channel_id": cfg.get("channel_id"),
            "enabled": cfg.get("enabled", False),
            "mention_everyone": cfg.get("mention_everyone", True),
            "messages": cfg.get("messages", DEFAULT_MESSAGES),
        },
        "events": events_data,
        "logs": list(reversed(cfg.get("logs", []))),
    }


def create_web_app(ctx: dict) -> web.Application:
    app = web.Application()

    def get_bot() -> BauDiscordBot:
        return ctx["bot"]

    async def serve_dashboard(_request: web.Request) -> web.FileResponse:
        return web.FileResponse(BASE_DIR / "dashboard.html")

    async def serve_mensagens(_request: web.Request) -> web.FileResponse:
        return web.FileResponse(BASE_DIR / "mensagens.html")

    async def serve_page(request: web.Request) -> web.Response:
        name = request.match_info["page"]
        allowed = {
            "index.html",
            "timer_bau_do_fortnite.html",
            "notificador_discord_bau_do_fortnite.html",
            "dashboard.html",
            "mensagens.html",
        }
        if name not in allowed:
            raise web.HTTPNotFound()
        return web.FileResponse(BASE_DIR / name)

    async def api_state(_request: web.Request) -> web.Response:
        return web.json_response(serialize_state(get_bot()))

    async def api_config(request: web.Request) -> web.Response:
        bot = get_bot()
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "JSON inválido."}, status=400)

        cfg = bot.config
        if "guild_id" in body:
            cfg["guild_id"] = str(body["guild_id"]) if body["guild_id"] else None
        if "channel_id" in body:
            cfg["channel_id"] = str(body["channel_id"]) if body["channel_id"] else None
        if "enabled" in body:
            cfg["enabled"] = bool(body["enabled"])
        if "mention_everyone" in body:
            cfg["mention_everyone"] = bool(body["mention_everyone"])
        if isinstance(body.get("messages"), dict):
            for k in DEFAULT_MESSAGES:
                val = body["messages"].get(k)
                if isinstance(val, str) and val.strip():
                    cfg["messages"][k] = val.strip()

        if cfg["enabled"] and not cfg["channel_id"]:
            cfg["enabled"] = False
            save_config(cfg)
            return web.json_response(
                {"ok": False, "error": "Escolha um servidor e um canal antes de ativar.", "state": serialize_state(bot)},
                status=400,
            )

        status_txt = "ativados" if cfg["enabled"] else "salvos (desativado)"
        add_log(cfg, "info", f"Configurações {status_txt}.")
        save_config(cfg)
        return web.json_response({"ok": True, "state": serialize_state(bot)})

    async def api_test(request: web.Request) -> web.Response:
        bot = get_bot()
        if not bot.is_ready():
            return web.json_response({"ok": False, "error": "O bot ainda não conectou ao Discord."}, status=503)
        try:
            body = await request.json()
        except Exception:
            body = {}

        channel_id = str(body.get("channel_id") or bot.config.get("channel_id") or "").strip()
        if not channel_id:
            return web.json_response({"ok": False, "error": "Selecione um canal primeiro."}, status=400)

        mention = bool(body.get("mention_everyone", False))
        custom_text = body.get("message")
        if isinstance(custom_text, str) and custom_text.strip():
            content = custom_text.strip()
        else:
            content = "Teste da Alya do Fortnite! O bot está pronto para avisar sobre o Baú neste canal 🎮"
        if mention:
            content = f"@everyone\n{content}"

        try:
            await bot.send_to_channel(channel_id, content, mention)
            add_log(bot.config, "success", f"Mensagem de teste enviada para o canal {channel_id}.")
            save_config(bot.config)
            return web.json_response({"ok": True, "state": serialize_state(bot)})
        except discord.Forbidden:
            add_log(bot.config, "error", f"Sem permissão para enviar no canal {channel_id}.")
            save_config(bot.config)
            return web.json_response(
                {"ok": False, "error": "O bot não tem permissão para enviar mensagens nesse canal."},
                status=403,
            )
        except Exception as exc:
            add_log(bot.config, "error", f"Erro ao enviar teste: {exc}")
            save_config(bot.config)
            return web.json_response({"ok": False, "error": f"Erro ao enviar: {exc}"}, status=500)

    async def api_guild_targets(request: web.Request) -> web.Response:
        bot = get_bot()
        if not bot.is_ready():
            return web.json_response({"ok": False, "error": "Bot ainda não conectado."}, status=503)

        guild_id_str = request.match_info["guild_id"]
        try:
            guild = bot.get_guild(int(guild_id_str))
        except ValueError:
            guild = None
        if guild is None:
            return web.json_response({"ok": False, "error": "Servidor não encontrado."}, status=404)

        roles = []
        for r in sorted(guild.roles, key=lambda x: x.position, reverse=True):
            if r.is_default():
                continue
            hex_color = f"#{r.color.value:06x}" if r.color.value else "#b4addb"
            roles.append({
                "id": str(r.id),
                "name": r.name,
                "color": hex_color,
                "mentionable": r.mentionable,
            })

        members_list = []
        members_available = bot.members_intent_enabled
        if bot.members_intent_enabled:
            raw_members = list(guild.members)
            if len(raw_members) <= 1:
                try:
                    raw_members = [m async for m in guild.fetch_members(limit=200)]
                except Exception:
                    members_available = False
            for m in sorted(raw_members, key=lambda x: x.display_name.lower())[:200]:
                if bot.user and m.id == bot.user.id:
                    continue
                members_list.append({
                    "id": str(m.id),
                    "name": m.name,
                    "display_name": m.display_name,
                    "bot": m.bot,
                    "avatar_url": str(m.display_avatar.url),
                })

        return web.json_response({
            "ok": True,
            "roles": roles,
            "members": members_list,
            "members_available": members_available,
        })

    async def api_resolve_user(request: web.Request) -> web.Response:
        bot = get_bot()
        if not bot.is_ready():
            return web.json_response({"ok": False, "error": "Bot ainda não conectado."}, status=503)
        uid_str = request.match_info["user_id"].strip()
        if not uid_str.isdigit():
            return web.json_response({"ok": False, "error": "ID de usuário inválido."}, status=400)
        try:
            user = bot.get_user(int(uid_str)) or await bot.fetch_user(int(uid_str))
            return web.json_response({
                "ok": True,
                "user": {
                    "id": str(user.id),
                    "name": user.name,
                    "display_name": user.display_name,
                    "avatar_url": str(user.display_avatar.url),
                },
            })
        except discord.NotFound:
            return web.json_response({"ok": False, "error": "Usuário não encontrado no Discord."}, status=404)
        except Exception as exc:
            return web.json_response({"ok": False, "error": f"Falha ao buscar usuário: {exc}"}, status=500)

    async def api_leave_guild(request: web.Request) -> web.Response:
        bot = get_bot()
        if not bot.is_ready():
            return web.json_response({"ok": False, "error": "Bot ainda não conectado."}, status=503)
        guild_id_str = request.match_info["guild_id"]
        try:
            guild = bot.get_guild(int(guild_id_str))
        except ValueError:
            guild = None
        if guild is None:
            return web.json_response({"ok": False, "error": "Servidor não encontrado."}, status=404)

        guild_name = guild.name
        try:
            await guild.leave()
        except Exception as exc:
            add_log(bot.config, "error", f"Erro ao sair de {guild_name}: {exc}")
            save_config(bot.config)
            return web.json_response({"ok": False, "error": f"Não foi possível sair do servidor: {exc}"}, status=500)

        if bot.config.get("guild_id") == str(guild_id_str):
            bot.config["guild_id"] = None
            bot.config["channel_id"] = None
            bot.config["enabled"] = False

        add_log(bot.config, "info", f"Bot saiu do servidor \"{guild_name}\".")
        save_config(bot.config)
        return web.json_response({"ok": True, "state": serialize_state(bot)})

    async def api_send_custom(request: web.Request) -> web.Response:
        bot = get_bot()
        try:
            body = await request.json()
        except Exception:
            return web.json_response({"ok": False, "error": "JSON inválido."}, status=400)

        mode = str(body.get("mode") or "channel_webhook").strip()
        channel_id = str(body.get("channel_id") or "").strip()
        webhook_url = str(body.get("webhook_url") or "").strip()
        webhook_name = str(body.get("webhook_name") or "").strip() or None
        webhook_avatar = str(body.get("webhook_avatar") or "").strip() or None
        content = str(body.get("content") or "").strip() or None

        embed_obj = None
        raw_embed = body.get("embed")
        if isinstance(raw_embed, dict):
            e_title = str(raw_embed.get("title") or "").strip()
            e_desc = str(raw_embed.get("description") or "").strip()
            e_color = parse_hex_color(raw_embed.get("color"))
            if e_title or e_desc:
                embed_obj = discord.Embed(
                    title=e_title or None,
                    description=e_desc or None,
                    color=e_color,
                )

        if not content and embed_obj is None:
            return web.json_response(
                {"ok": False, "error": "Escreva uma mensagem ou preencha o embed antes de enviar."},
                status=400,
            )

        allowed = discord.AllowedMentions(everyone=True, users=True, roles=True)

        if mode == "webhook_url":
            if not WEBHOOK_RE.match(webhook_url):
                return web.json_response({"ok": False, "error": "URL do webhook inválida."}, status=400)
            try:
                async with aiohttp.ClientSession() as session:
                    wh = discord.Webhook.from_url(webhook_url, session=session)
                    kwargs = {"allowed_mentions": allowed, "wait": True}
                    if content:
                        kwargs["content"] = content
                    if webhook_name:
                        kwargs["username"] = webhook_name
                    if webhook_avatar:
                        kwargs["avatar_url"] = webhook_avatar
                    if embed_obj is not None:
                        kwargs["embed"] = embed_obj
                    await wh.send(**kwargs)
                add_log(bot.config, "success", "Mensagem enviada via URL de webhook.")
                save_config(bot.config)
                return web.json_response({"ok": True, "state": serialize_state(bot)})
            except Exception as exc:
                add_log(bot.config, "error", f"Erro ao enviar via URL de webhook: {exc}")
                save_config(bot.config)
                return web.json_response({"ok": False, "error": f"Falha no webhook: {exc}"}, status=500)

        if not bot.is_ready():
            return web.json_response({"ok": False, "error": "O bot ainda não conectou ao Discord."}, status=503)
        if not channel_id:
            return web.json_response({"ok": False, "error": "Selecione um servidor e um canal."}, status=400)

        try:
            if mode == "channel_webhook":
                await bot.send_via_channel_webhook(
                    channel_id,
                    content,
                    webhook_name,
                    webhook_avatar,
                    embed_obj,
                    allowed,
                )
                add_log(bot.config, "success", f"Webhook enviado no canal {channel_id}.")
            else:
                ch = await bot.resolve_channel(channel_id)
                kwargs = {"allowed_mentions": allowed}
                if content:
                    kwargs["content"] = content
                if embed_obj is not None:
                    kwargs["embed"] = embed_obj
                await ch.send(**kwargs)
                add_log(bot.config, "success", f"Mensagem do bot enviada no canal {channel_id}.")
            save_config(bot.config)
            return web.json_response({"ok": True, "state": serialize_state(bot)})
        except discord.Forbidden:
            err_msg = (
                "O bot precisa da permissão 'Gerenciar Webhooks' nesse canal (ou troque o modo para 'Enviar como Bot')."
                if mode == "channel_webhook"
                else "O bot não tem permissão para enviar mensagens nesse canal."
            )
            add_log(bot.config, "error", err_msg)
            save_config(bot.config)
            return web.json_response({"ok": False, "error": err_msg}, status=403)
        except Exception as exc:
            add_log(bot.config, "error", f"Erro ao enviar mensagem: {exc}")
            save_config(bot.config)
            return web.json_response({"ok": False, "error": f"Erro ao enviar: {exc}"}, status=500)

    app.router.add_get("/", serve_dashboard)
    app.router.add_get("/mensagens", serve_mensagens)
    app.router.add_get("/api/state", api_state)
    app.router.add_post("/api/config", api_config)
    app.router.add_post("/api/test", api_test)
    app.router.add_get("/api/guilds/{guild_id}/targets", api_guild_targets)
    app.router.add_post("/api/guilds/{guild_id}/leave", api_leave_guild)
    app.router.add_get("/api/resolve-user/{user_id}", api_resolve_user)
    app.router.add_post("/api/send-custom", api_send_custom)
    app.router.add_static("/assets", BASE_DIR / "assets")
    app.router.add_static("/css", BASE_DIR / "css")
    app.router.add_static("/js", BASE_DIR / "js")
    app.router.add_get("/{page}", serve_page)
    return app


async def run_all(open_browser: bool = True) -> None:
    load_env_file(ENV_PATH)
    token = os.environ.get("DISCORD_TOKEN") or os.environ.get("TOKEN") or ""
    token = token.strip()

    host = os.environ.get("DASHBOARD_HOST", "127.0.0.1").strip() or "127.0.0.1"
    port = int(os.environ.get("DASHBOARD_PORT", "8765"))

    cfg = load_config()
    ctx = {"bot": BauDiscordBot(cfg, use_members_intent=True)}
    app = create_web_app(ctx)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, host, port)
    await site.start()

    url = f"http://{host}:{port}/"
    print(f"[DASHBOARD] Disponível em {url}")
    print(f"[DASHBOARD] Painel de Webhooks, Menções e Servidores: {url}mensagens")
    if open_browser:
        webbrowser.open(url)

    if not token:
        ctx["bot"].bot_error = "DISCORD_TOKEN não encontrado no arquivo .env."
        print(f"[ERRO] {ctx['bot'].bot_error}")
        try:
            await asyncio.Event().wait()
        finally:
            await runner.cleanup()
        return

    try:
        try:
            await ctx["bot"].start(token)
        except discord.PrivilegedIntentsRequired:
            print("[AVISO] Server Members Intent desativada no Portal do Discord; iniciando sem lista automática de membros.")
            add_log(cfg, "info", "Iniciado sem 'Server Members Intent' (use o campo de ID de usuário para mencionar pessoas).")
            save_config(cfg)
            if not ctx["bot"].is_closed():
                await ctx["bot"].close()
            ctx["bot"] = BauDiscordBot(cfg, use_members_intent=False)
            await ctx["bot"].start(token)
    except discord.LoginFailure:
        ctx["bot"].bot_error = "Token do Discord inválido. Verifique o DISCORD_TOKEN no .env."
        print(f"[ERRO] {ctx['bot'].bot_error}")
        await asyncio.Event().wait()
    except Exception as exc:
        ctx["bot"].bot_error = f"Falha ao conectar no Discord: {exc}"
        print(f"[ERRO] {ctx['bot'].bot_error}")
        await asyncio.Event().wait()
    finally:
        bot = ctx["bot"]
        if bot.scheduler_task:
            bot.scheduler_task.cancel()
        if not bot.is_closed():
            await bot.close()
        await runner.cleanup()


def main() -> None:
    parser = argparse.ArgumentParser(description="Bot Discord + Dashboard do Baú do Fortnite")
    parser.add_argument("--no-browser", action="store_true", help="Não abrir o navegador automaticamente")
    args = parser.parse_args()

    try:
        asyncio.run(run_all(open_browser=not args.no_browser))
    except KeyboardInterrupt:
        print("\n[BOT] Encerrado pelo usuário.")


if __name__ == "__main__":
    main()
