"""Tencent TC3 request signing and self-contained binary glTF validation."""
import datetime
import hashlib
import hmac
import json
import struct
from urllib.parse import urlsplit
from fastapi import HTTPException


def authorization(host, action, content, secret_id, secret_key, timestamp, service='ai3d'):
    date = datetime.datetime.fromtimestamp(timestamp, datetime.timezone.utc).strftime('%Y-%m-%d')
    headers = 'content-type:application/json; charset=utf-8\nhost:' + host + '\nx-tc-action:' + action.lower() + '\n'
    signed = 'content-type;host;x-tc-action'
    canonical = 'POST\n/\n\n' + headers + '\n' + signed + '\n' + hashlib.sha256(content).hexdigest()
    scope = date + '/' + service + '/tc3_request'
    signing = 'TC3-HMAC-SHA256\n' + str(timestamp) + '\n' + scope + '\n' + hashlib.sha256(canonical.encode()).hexdigest()
    def digest(key, value):
        return hmac.new(key, value.encode(), hashlib.sha256).digest()
    key = digest(digest(digest(('TC3' + secret_key).encode(), date), service), 'tc3_request')
    signature = hmac.new(key, signing.encode(), hashlib.sha256).hexdigest()
    return 'TC3-HMAC-SHA256 Credential=' + secret_id + '/' + scope + ', SignedHeaders=' + signed + ', Signature=' + signature


def signed_request(provider, action, payload, secret_id, secret_key, timestamp):
    parts = urlsplit(provider['base_url'])
    if not parts.netloc or parts.path not in {'', '/'} or parts.query or parts.fragment:
        raise HTTPException(400, '混元 3D 地址必须是接口域名根路径')
    content = json.dumps(payload, ensure_ascii=False, separators=(',', ':')).encode()
    return content, {'Authorization': authorization(parts.netloc, action, content, secret_id, secret_key, timestamp),
                     'Content-Type': 'application/json; charset=utf-8', 'Host': parts.netloc, 'X-TC-Action': action, 'X-TC-Version': '2025-05-13',
                     'X-TC-Timestamp': str(timestamp), 'X-TC-Region': provider.get('hunyuan_region') or 'ap-guangzhou'}


def validate_glb(path):
    """Require glTF 2.0 with embedded buffers/images before making an asset ready."""
    try:
        size = path.stat().st_size
        with path.open('rb') as stream:
            if struct.unpack('<4sII', stream.read(12)) != (b'glTF', 2, size):
                raise ValueError()
            json_size, chunk = struct.unpack('<I4s', stream.read(8))
            if chunk != b'JSON' or not 0 < json_size <= min(10 * 1024 * 1024, size - 20) or json_size % 4:
                raise ValueError()
            value = json.loads(stream.read(json_size))
            if value.get('asset', {}).get('version') != '2.0' or not value.get('meshes') or not value.get('scenes'):
                raise ValueError()
            for name in ('scenes','nodes','meshes','buffers','bufferViews','accessors','images'):
                if name in value and not isinstance(value[name], list):
                    raise ValueError()
            def index(item, values):
                return type(item) is int and 0 <= item < len(values)
            nodes, meshes, accessors = value.get('nodes') or [], value['meshes'], value.get('accessors') or []
            if not nodes or not any(isinstance(node, dict) and index(node.get('mesh'), meshes) for node in nodes):
                raise ValueError()
            for scene in value['scenes']:
                if not isinstance(scene, dict) or not isinstance(scene.get('nodes'), list) or any(not index(node, nodes) for node in scene['nodes']):
                    raise ValueError()
            for mesh in meshes:
                if not isinstance(mesh, dict) or not isinstance(mesh.get('primitives'), list) or not mesh['primitives']:
                    raise ValueError()
                for primitive in mesh['primitives']:
                    position = (primitive.get('attributes') or {}).get('POSITION')
                    if not index(position, accessors) or accessors[position].get('type') != 'VEC3' or accessors[position].get('componentType') != 5126 or type(accessors[position].get('count')) is not int or accessors[position]['count'] <= 0:
                        raise ValueError()
            binary = 0
            if stream.tell() < size:
                binary, chunk = struct.unpack('<I4s', stream.read(8))
                if chunk != b'BIN\x00' or binary % 4 or stream.tell() + binary != size:
                    raise ValueError()
            buffers = value.get('buffers') or []
            if len(buffers) != 1 or 'uri' in buffers[0] or type(buffers[0].get('byteLength')) is not int or not 0 < buffers[0]['byteLength'] <= binary:
                raise ValueError()
            for item in value.get('images') or []:
                if 'uri' in item:
                    raise ValueError()  # The result must not request external resources.
            for view in value.get('bufferViews') or []:
                if view.get('buffer', 0) != 0 or type(view.get('byteLength')) is not int or type(view.get('byteOffset', 0)) is not int or view.get('byteOffset', 0) < 0 or view['byteLength'] <= 0 or view.get('byteOffset', 0) + view['byteLength'] > buffers[0]['byteLength']:
                    raise ValueError()
        return value
    except (ValueError, TypeError, KeyError, AttributeError, struct.error, UnicodeError) as error:
        raise HTTPException(502, '供应商模型不是完整的内嵌 GLB，结果来源已保留') from error
