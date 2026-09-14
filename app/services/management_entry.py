"""Public location of the independent management site; never carry a session."""
import os
from urllib.parse import urlsplit


def management_url():
    value=os.getenv('MANAGEMENT_BASE_URL','').strip().rstrip('/')
    if not value or any(char.isspace() for char in value):
        return None
    try:
        url=urlsplit(value)
        url.port
        if (url.scheme not in {'https','http'} or not url.hostname or url.path or url.query
                or url.fragment or url.username or url.password):
            return None
        if url.scheme=='http' and url.hostname not in {'localhost','127.0.0.1','::1'}:
            return None
    except ValueError:
        return None
    return value+'/'
