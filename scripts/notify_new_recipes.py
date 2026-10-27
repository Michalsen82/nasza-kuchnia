#!/usr/bin/env python3
"""Notify Nasza Kuchnia's subscribers only about newly published recipe pages.

Called by a GitHub Actions push workflow. SMTP credentials and recipients are
read exclusively from repository Actions secrets, never from tracked files.
"""
from __future__ import annotations

import html
import os
from pathlib import Path
import re
import smtplib
import subprocess
import sys
import time
from email.message import EmailMessage
from email.utils import formataddr
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

SITE_URL = "https://naszakuchnia.pages.dev"
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 465
MAX_CHECKS = 24
CHECK_INTERVAL = 15
NAME_PATTERN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*\.html$")
PAGE_TITLE_PATTERN = re.compile(r"<title[^>]*>(.*?)</title>", re.I | re.S)
RECIPE_SECTION_PATTERN = re.compile(
    r'<section\b[^>]*\bclass="[^"]*\brecipe-view\s+family-recipe\b[^"]*"[^>]*>',
    re.I,
)
H1_PATTERN = re.compile(r"<h1\b[^>]*>(.*?)</h1>", re.I | re.S)
TAG_PATTERN = re.compile(r"<[^>]+>")


def clean_text(fragment: str) -> str:
    return " ".join(html.unescape(TAG_PATTERN.sub("", fragment)).split())


def discover_added_recipe_files(before: str, after: str) -> list[Path]:
    if not re.fullmatch(r"[0-9a-fA-F]{40}", before):
        raise ValueError("Invalid before SHA")
    if not re.fullmatch(r"[0-9a-fA-F]{40}", after):
        raise ValueError("Invalid after SHA")
    if set(before) == {"0"}:
        # The workflow is installed on an existing branch. Do not send alerts
        # about everything when GitHub reports the all-zero initial base SHA.
        print("No previous commit; skipping historical recipes.")
        return []
    proc = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=A", "-z", before, after, "--", "*.html"],
        capture_output=True,
        check=True,
    )
    paths = [Path(p.decode("utf-8")) for p in proc.stdout.split(b"\0") if p]
    return [p for p in paths if len(p.parts) == 1 and NAME_PATTERN.fullmatch(p.name) and p.name != "index.html"]


def title_of_recipe(page: Path) -> str | None:
    try:
        content = page.read_text(encoding="utf-8")
    except OSError:
        return None
    match = RECIPE_SECTION_PATTERN.search(content)
    if not match:
        return None
    # Check the section identity and take its h1, rather than the hidden
    # pre-existing homepage hero h1 that also exists in some template files.
    tag = match.group(0)
    expected_slug = page.stem
    if f'id="{expected_slug}"' not in tag:
        return None
    section = content[match.end():match.end() + 8000]
    h1 = H1_PATTERN.search(section)
    if not h1:
        return None
    title = clean_text(h1.group(1))
    return title if 2 <= len(title) <= 140 else None


def deployed(url: str, title: str) -> bool:
    try:
        req = Request(url, headers={"User-Agent": "NaszaKuchniaRecipeNotifier/1.0", "Cache-Control": "no-cache"})
        with urlopen(req, timeout=12) as response:
            if response.status != 200:
                return False
            contents = response.read(220_000).decode("utf-8", errors="replace")
        m = PAGE_TITLE_PATTERN.search(contents)
        if not m:
            return False
        actual = clean_text(m.group(1))
        # Static recipe pages have titles starting with their unique name.
        return actual == title or actual.startswith(title + " — ")
    except (HTTPError, URLError, TimeoutError, OSError):
        return False


def wait_for_publication(url: str, title: str) -> bool:
    for attempt in range(1, MAX_CHECKS + 1):
        if deployed(url, title):
            print(f"Publication verified: {url}")
            return True
        if attempt < MAX_CHECKS:
            print(f"Waiting for publication ({attempt}/{MAX_CHECKS}): {url}")
            time.sleep(CHECK_INTERVAL)
    return False


def make_email(title: str, url: str, smtp_user: str, recipient: str) -> EmailMessage:
    safe_title = html.escape(title, quote=True)
    safe_url = html.escape(url, quote=True)
    msg = EmailMessage()
    msg["Subject"] = f"Nowość w Naszej Kuchni: {title} ♥"
    msg["From"] = formataddr(("Nasza Kuchnia | Agnieszka i Michał", smtp_user))
    msg["To"] = recipient
    msg.set_content(
        "Nowy przepis w Naszej Kuchni!\n\n"
        f"Dzisiaj do naszej kolekcji dołączył przepis: {title}.\n\n"
        "Zajrzyj do naszej kuchni i sprawdź, jak go przygotować:\n"
        f"{url}\n\n"
        "Smacznego!\nAgnieszka i Michał ♥\n"
    )
    msg.add_alternative(
        f'''<!doctype html>
<html lang="pl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#fcf8fb;font-family:Arial,Helvetica,sans-serif;color:#17334d">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;background:#fcf8fb;padding:32px 12px"><tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#fff;border:1px solid #f5dce6;border-radius:22px;overflow:hidden">
<tr><td align="center" style="padding:32px 24px 20px">
<div style="font-family:Georgia,serif;font-size:28px;font-weight:bold;color:#102b46">Agnieszka<span style="color:#f43d77">♥</span>Michał</div>
<div style="font-size:10px;letter-spacing:4px;font-weight:bold;color:#52657b;margin-top:6px">NASZA KUCHNIA</div>
</td></tr>
<tr><td style="background:#fff1f6;text-align:center;padding:12px 24px;color:#e73871;font-weight:bold;font-size:12px;letter-spacing:2px">NOWY PRZEPIS W NASZEJ KUCHNI</td></tr>
<tr><td align="center" style="padding:35px 30px 40px">
<div style="font-size:17px;line-height:1.7;color:#546881">Do naszej wspólnej książki kucharskiej dołączył właśnie nowy przepis!</div>
<h1 style="font-family:Georgia,serif;font-weight:bold;color:#102b46;font-size:31px;line-height:1.2;margin:18px 0 14px">{safe_title}</h1>
<p style="font-size:15px;line-height:1.8;color:#546881;margin:0 0 32px">Zapraszamy do odkrycia kolejnego domowego smaku. Składniki, wskazówki i przygotowanie krok po kroku czekają już na naszej stronie.</p>
<a href="{safe_url}" style="background:#f43d77;color:#fff;text-decoration:none;font-size:15px;font-weight:bold;border-radius:999px;padding:17px 32px;display:inline-block">ZOBACZ PRZEPIS →</a>
<p style="font-size:14px;line-height:1.7;color:#6d7c8d;margin:34px 0 0">Smacznego!<br><strong style="color:#102b46">Agnieszka ♥ Michał</strong></p>
</td></tr>
<tr><td align="center" style="border-top:1px solid #f4e4eb;padding:22px 24px;font-size:12px;color:#728092">Z miłości do siebie, gotowania i rodzinnych smaków.<br><a href="{safe_url}" style="color:#cc366d;word-break:break-all">{safe_url}</a></td></tr>
</table></td></tr></table></body></html>''',
        subtype="html",
    )
    return msg


def recipients_from_secret(value: str) -> list[str]:
    candidates = re.split(r"[,;\n]+", value)
    addresses = [a.strip() for a in candidates if a.strip()]
    if not addresses or any(not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", a) for a in addresses):
        raise ValueError("Set a comma-separated list of valid addresses in NASZA_KUCHNIA_NOTIFY_TO")
    return list(dict.fromkeys(addresses))


def main() -> int:
    before = os.environ.get("PREVIOUS_COMMIT_SHA", "")
    after = os.environ.get("CURRENT_COMMIT_SHA", "")
    try:
        added_files = discover_added_recipe_files(before, after)
    except (ValueError, subprocess.CalledProcessError) as exc:
        print(f"Could not inspect added files: {exc}", file=sys.stderr)
        return 1
    recipes = [(p, title) for p in added_files if (title := title_of_recipe(p))]
    if not recipes:
        print("No new recipe pages in this push. No emails sent.")
        return 0
    smtp_user = os.environ.get("NASZA_KUCHNIA_SMTP_USER", "").strip()
    smtp_password = os.environ.get("NASZA_KUCHNIA_SMTP_APP_PASSWORD", "").strip()
    recipients_secret = os.environ.get("NASZA_KUCHNIA_NOTIFY_TO", "")
    if not (smtp_user and smtp_password and recipients_secret):
        print(
            "One-time configuration is required: set repository Actions secrets "
            "NASZA_KUCHNIA_SMTP_APP_PASSWORD and NASZA_KUCHNIA_NOTIFY_TO. "
            "The sender address is configured in the GitHub Actions workflow. No emails were sent.",
            file=sys.stderr,
        )
        return 1
    try:
        recipients = recipients_from_secret(recipients_secret)
    except ValueError as exc:
        print(str(exc), file=sys.stderr)
        return 1

    for path, title in recipes:
        url = f"{SITE_URL}/{path.name}"
        if not wait_for_publication(url, title):
            print(f"Recipe did not become public; no email sent: {url}", file=sys.stderr)
            return 1
        messages = [make_email(title, url, smtp_user, recipient) for recipient in recipients]
        # Encrypt transport and send distinct messages so addresses are not exposed to each other.
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT, timeout=30) as client:
            client.login(smtp_user, smtp_password)
            for recipient, msg in zip(recipients, messages):
                client.send_message(msg, from_addr=smtp_user, to_addrs=[recipient])
        print(f"Sent notification for '{title}' to {len(recipients)} recipient(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
