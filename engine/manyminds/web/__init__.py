"""Web layer (v0): FastAPI server + composer->frontend adapter + static UI.

Wires the moved frontend (``static/``) to the manyminds composer
(``/session``) and the minimal dialogue layer (``/turn``). See ``server.py``.
This layer is the experience surface; the composer package stays pure.
"""
