"""SMTP delivery; verification material never appears in API responses or logs."""
import os
import smtplib
import ssl
from email.message import EmailMessage
from app.services import authorization as az


def configured():
    return all(os.getenv(k) for k in ('SMTP_HOST', 'SMTP_FROM', 'EMAIL_TOKEN_SECRET')) and len(os.getenv('EMAIL_TOKEN_SECRET', '')) >= 32


def send(recipient, subject, body):
    if not configured():
        az.fail('email_not_configured', 503)
    message = EmailMessage()
    message['From'] = os.environ['SMTP_FROM']
    message['To'] = recipient
    message['Subject'] = subject
    message.set_content(body)
    try:
        mode = os.getenv('SMTP_TLS', 'starttls')
        if mode not in {'starttls', 'ssl'}:
            az.fail('email_not_configured', 503)
        context = ssl.create_default_context()
        port = int(os.getenv('SMTP_PORT', '465' if mode == 'ssl' else '587'))
        client = smtplib.SMTP_SSL(os.environ['SMTP_HOST'], port, timeout=10, context=context) if mode == 'ssl' else smtplib.SMTP(os.environ['SMTP_HOST'], port, timeout=10)
        with client:
            if mode == 'starttls':
                client.starttls(context=context)
            if os.getenv('SMTP_USERNAME'):
                client.login(os.environ['SMTP_USERNAME'], os.environ.get('SMTP_PASSWORD', ''))
            client.send_message(message)
    except (OSError, smtplib.SMTPException, ValueError):
        az.fail('email_delivery_failed', 503)
