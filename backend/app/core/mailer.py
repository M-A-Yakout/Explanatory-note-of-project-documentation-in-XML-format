import logging

log = logging.getLogger("pz.mail")


def send_email(to: str, subject: str, body: str) -> None:
    """Dev stub: prints the message. Replace with SMTP in production."""
    log.warning("EMAIL to=%s subject=%s\n%s", to, subject, body)
    print(f"\n--- EMAIL to {to}: {subject}\n{body}\n---", flush=True)
