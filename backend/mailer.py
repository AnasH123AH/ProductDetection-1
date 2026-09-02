"""
VisionaryAI Mailer
Sends real emails via Gmail SMTP using an App Password.
Credentials are never committed to git: they're loaded from environment
variables (SMTP_EMAIL / SMTP_APP_PASSWORD) or a local, gitignored
backend/email_config.json file.
"""

import json
import os
import smtplib
from email.mime.text import MIMEText

CONFIG_PATH = os.path.join(os.path.dirname(__file__), 'email_config.json')


def _load_credentials():
    email = os.environ.get('SMTP_EMAIL')
    app_password = os.environ.get('SMTP_APP_PASSWORD')
    if email and app_password:
        return email, app_password

    if os.path.exists(CONFIG_PATH):
        with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
            config = json.load(f)
        return config.get('smtp_email'), config.get('smtp_app_password')

    return None, None


def is_configured():
    email, app_password = _load_credentials()
    return bool(email and app_password)


def send_password_reset_email(to_email, reset_link):
    email, app_password = _load_credentials()
    if not email or not app_password:
        raise RuntimeError(
            'SMTP credentials not configured. Set SMTP_EMAIL and SMTP_APP_PASSWORD '
            'environment variables, or create backend/email_config.json.'
        )

    subject = 'Reset your VisionaryAI password'
    body = (
        f"Hi,\n\n"
        f"We received a request to reset the password for your VisionaryAI account.\n\n"
        f"Reset link:\n{reset_link}\n\n"
        f"This link expires in 30 minutes. If you didn't request this, you can ignore this email.\n\n"
        f"- VisionaryAI"
    )

    msg = MIMEText(body, 'plain', 'utf-8')
    msg['Subject'] = subject
    msg['From'] = f'VisionaryAI <{email}>'
    msg['To'] = to_email

    with smtplib.SMTP_SSL('smtp.gmail.com', 465, timeout=10) as server:
        server.login(email, app_password)
        server.sendmail(email, [to_email], msg.as_string())
