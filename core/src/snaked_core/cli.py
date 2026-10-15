from __future__ import annotations

import argparse
import asyncio
import os

from .providers import discover
from .server import serve_forever


def main() -> None:
    parser = argparse.ArgumentParser(prog="snaked-core")
    sub = parser.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("serve", help="start the local agent server")
    s.add_argument("--port", type=int, default=8765)
    s.add_argument("--token", default=os.environ.get("SNAKED_TOKEN"))
    sub.add_parser("providers", help="list models you can use right now")
    args = parser.parse_args()

    if args.cmd == "serve":
        asyncio.run(serve_forever(port=args.port, token=args.token))
    elif args.cmd == "providers":
        for p in asyncio.run(discover()):
            print(f"{p.kind.value:13} {p.id:45} {p.label}")
