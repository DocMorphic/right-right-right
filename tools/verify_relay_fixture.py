"""Loopback-only test double for Unity's documented REST + UDP Relay protocol.

Not a public Relay service. Does not test Unity availability, DTLS, NATs or billing.
Run only with the game's explicit --rrr-relay-verify/--rrr-relay-fixture flags.
Never writes player credentials or allocation blobs into its report.
"""
import argparse
import base64
import hashlib
import hmac
import json
import secrets
import socket
import threading
import time
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

PROJECT = '11111111-1111-4111-8111-111111111111'
CODE = 'BCDF67'


def run(http_port, udp_port, report):
    lock = threading.RLock()
    players, allocations, blobs, pairs = {}, {}, {}, set()
    host = None
    counters = dict(Auth=0, Allocate=0, JoinCode=0, Join=0, Binds=0, ValidHmac=0,
                    Rejected=0, Forwarded=0, Pings=0, Connections=0, Closed=0)

    def new_allocation(player):
        identity = uuid.uuid4()
        item = dict(id=str(identity), bytes=identity.bytes, key=secrets.token_bytes(64),
                    blob=identity.bytes + secrets.token_bytes(239), player=player, address=None)
        allocations[identity.bytes] = item
        blobs[item['blob']] = item
        return item

    def response(item, joining):
        def b64(value): return base64.b64encode(value).decode()
        value = dict(allocationId=item['id'], allocationIdBytes=b64(item['bytes']),
                     key=b64(item['key']), connectionData=b64(item['blob']), region='loopback-fixture',
                     serverEndpoints=[dict(connectionType='udp', host='127.0.0.1', port=udp_port, secure=False)])
        if joining: value['hostConnectionData'] = b64(host['blob'])
        return dict(data=dict(allocation=value))

    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *_): pass

        def reply(self, status, body):
            encoded = json.dumps(body).encode()
            self.send_response(status)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Content-Length', str(len(encoded)))
            self.end_headers()
            self.wfile.write(encoded)

        def do_GET(self):
            self.reply(200 if self.path == '/health' else 404, dict(Fixture=True))

        def do_POST(self):
            nonlocal host
            with lock:
                if self.headers.get('ProjectId') != PROJECT or self.headers.get('UnityEnvironment') != 'production':
                    return self.reply(403, {})
                length = int(self.headers.get('Content-Length', '0'))
                if not 0 < length < 4096: return self.reply(400, {})
                try: data = json.loads(self.rfile.read(length))
                except (ValueError, TypeError): return self.reply(400, {})
                if self.path == '/authentication/anonymous':
                    token, session = secrets.token_hex(24), secrets.token_hex(24)
                    players[token] = session
                    counters['Auth'] += 1
                    return self.reply(200, dict(idToken=token, sessionToken=session, expiresIn=3600))
                token = self.headers.get('Authorization', '').removeprefix('Bearer ')
                if token not in players: return self.reply(401, {})
                if self.path == '/allocate':
                    if data.get('maxConnections') != 3: return self.reply(400, {})
                    host = new_allocation(token)
                    counters['Allocate'] += 1
                    return self.reply(201, response(host, False))
                if self.path == '/joincode':
                    if not host or host['player'] != token or data.get('allocationId') != host['id']:
                        return self.reply(404, {})
                    counters['JoinCode'] += 1
                    return self.reply(200, dict(data=dict(joinCode=CODE)))
                if self.path == '/join':
                    if not host or data.get('joinCode') != CODE: return self.reply(404, {})
                    if len(allocations) >= 4: return self.reply(400, {})
                    counters['Join'] += 1
                    return self.reply(200, response(new_allocation(token), True))
                return self.reply(404, {})

    server = ThreadingHTTPServer(('127.0.0.1', http_port), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    udp.bind(('127.0.0.1', udp_port))
    udp.settimeout(.2)
    if hasattr(socket, 'SIO_UDP_CONNRESET'): udp.ioctl(socket.SIO_UDP_CONNRESET, False)
    next_report = 0
    print('RELAY_FIXTURE_READY loopback HTTP/UDP', flush=True)
    try:
        while True:
            try: packet, address = udp.recvfrom(65536)
            except (socket.timeout, ConnectionResetError): packet = b''
            with lock:
                if packet:
                    if len(packet) < 4 or packet[:3] not in (b'\xda\x72\0', b'\x72\xda\0'):
                        counters['Rejected'] += 1
                        continue
                    prefix, kind = packet[:3], packet[3]
                    if kind == 0 and len(packet) >= 40:
                        size = packet[7]
                        item = blobs.get(packet[8:8+size])
                        if not item or len(packet) != 8+size+32 or not hmac.compare_digest(
                                hmac.new(item['key'], packet[:-32], hashlib.sha256).digest(), packet[-32:]):
                            counters['Rejected'] += 1
                            continue
                        item['address'] = address
                        counters['Binds'] += 1
                        counters['ValidHmac'] += 1
                        udp.sendto(prefix + b'\x01', address)
                    elif kind in (2, 3, 9, 10, 11) and len(packet) >= 20:
                        source = allocations.get(packet[4:20])
                        if not source or source['address'] != address:
                            counters['Rejected'] += 1
                            continue
                        if kind == 2:
                            udp.sendto(packet, address)
                            counters['Pings'] += 1
                        elif kind == 3 and len(packet) >= 21:
                            target = blobs.get(packet[21:21+packet[20]])
                            if target and target['address']:
                                pairs.add(frozenset((source['bytes'], target['bytes'])))
                                udp.sendto(prefix + b'\x06' + target['bytes'] + source['bytes'], address)
                                counters['Connections'] += 1
                        elif kind in (9, 10) and len(packet) >= 36:
                            target = allocations.get(packet[20:36])
                            pair = frozenset((source['bytes'], packet[20:36]))
                            if target and target['address'] and pair in pairs:
                                udp.sendto(packet, target['address'])
                                if kind == 10: counters['Forwarded'] += 1
                                else:
                                    pairs.discard(pair)
                                    udp.sendto(packet, address)
                        elif kind == 11:
                            source['address'] = None
                            counters['Closed'] += 1
                if time.monotonic() >= next_report:
                    next_report = time.monotonic() + .3
                    output = dict(counters, FixtureOnly=True, DtlsTested=False,
                                  Allocations=len(allocations), Bound=sum(a['address'] is not None for a in allocations.values()))
                    temp = report.with_suffix('.tmp')
                    temp.write_text(json.dumps(output, indent=2))
                    temp.replace(report)
    finally:
        udp.close()
        server.shutdown()


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--http-port', type=int, default=17887)
    parser.add_argument('--udp-port', type=int, default=17888)
    parser.add_argument('--report', type=Path, required=True)
    args = parser.parse_args()
    run(args.http_port, args.udp_port, args.report)
