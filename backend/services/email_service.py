import smtplib
from email.message import EmailMessage
from config import settings

SMTP_EMAIL = settings.SMTP_EMAIL
SMTP_PASSWORD = settings.SMTP_PASSWORD


def send_reset_email(target_email: str, code: str):
    msg = EmailMessage()
    msg.set_content(f"""
    Hello,

    You requested a password reset for your TrashVision account.
    Your 6-digit verification code is: {code}

    This code will expire in 10 minutes. If you did not request this, please ignore this email.

    Best regards,
    TrashVision Team
    """)

    msg["Subject"] = "TrashVision Password Reset"
    msg["From"] = SMTP_EMAIL
    msg["To"] = target_email

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(msg)
        return True
    except Exception as e:
        print(f"EMAIL ERROR: {e}")
        return False