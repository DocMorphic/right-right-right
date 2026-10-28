"""Local UDP forwarding fixture matching a port-sharing tunnel's socket behavior."""
import argparse
import json
import selectors
import socket
import time
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('--report', type=Path, required=True)
args = parser.parse_args()
selector = selectors.DefaultSelector()
upstreams = {}
counts = {str(port): {'Up': 0, 'Down': 0} for port in (7788, 7789, 7790)}
for port in (7788, 7789, 7790):
    listener = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    if hasattr(socket, 'SIO_UDP_CONNRESET'):
        listener.ioctl(socket.SIO_UDP_CONNRESET, False)
    listener.bind(('127.0.0.1', port))
    listener.setblocking(False)
    selector.register(listener, selectors.EVENT_READ, ('listen', port))
last = 0
while True:
    for key, _ in selector.select(.1):
        if key.data[0] == 'listen':
            port = key.data[1]
            try:
                packet, client = key.fileobj.recvfrom(65535)
            except ConnectionResetError:
                continue
            pair = (port, client)
            if pair not in upstreams:
                upstream = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                if hasattr(socket, 'SIO_UDP_CONNRESET'):
                    upstream.ioctl(socket.SIO_UDP_CONNRESET, False)
                upstream.bind(('127.0.0.1', 0))
                upstream.setblocking(False)
                upstreams[pair] = upstream
                selector.register(upstream, selectors.EVENT_READ, ('reply', key.fileobj, client, port))
            upstreams[pair].sendto(packet, ('127.0.0.1', 7787))
            counts[str(port)]['Up'] += 1
        else:
            try:
                packet, _ = key.fileobj.recvfrom(65535)
            except ConnectionResetError:
                continue
            key.data[1].sendto(packet, key.data[2])
            counts[str(key.data[3])]['Down'] += 1
    if time.monotonic() - last > 1:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(json.dumps(counts))
        last = time.monotonic()
