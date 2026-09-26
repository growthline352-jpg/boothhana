#!/usr/bin/env python3
"""Verify a RELEASE ZIP without extraction. Exact manifest coverage + SHA-256 + CRC.
Hashes detect mismatches, not authenticity; compare the externally delivered ZIP hash too.
Usage: python verification/v24/verify_package.py release.zip [--expected-sha256 HEX]
Does not rewrite the archive or manifest, and rejects ambiguous ZIP paths/duplicates.
"""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import re
import stat
import zipfile


class InvalidPackage(ValueError):
    pass


def clean_name(name: str) -> str:
    if not name or '\\' in name or '\x00' in name or name.startswith('/'):
        raise InvalidPackage('Unsafe archive path')
    parts=name.split('/')
    if any(p in ('', '.', '..') for p in parts) or ':' in parts[0]:
        raise InvalidPackage('Unsafe archive path: '+name)
    return str(PurePosixPath(name))


def sha256_file(path: Path) -> str:
    digest=hashlib.sha256()
    with path.open('rb') as f:
        for block in iter(lambda:f.read(1024*1024),b''): digest.update(block)
    return digest.hexdigest()


def verify(path: Path, expected_sha256: str|None=None) -> dict:
    digest=sha256_file(path)
    if expected_sha256 is not None:
        if not re.fullmatch(r'[a-fA-F0-9]{64}',expected_sha256):raise InvalidPackage('Expected SHA-256 must be 64 hexadecimal characters')
        if digest!=expected_sha256.lower():raise InvalidPackage('ZIP SHA-256 mismatch')
    with zipfile.ZipFile(path) as z:
        names={};seen=set()
        for info in z.infolist():
            name=clean_name(info.filename.rstrip('/') if info.is_dir() else info.filename)
            if name in seen:raise InvalidPackage('Duplicate archive entry: '+name)
            seen.add(name)
            if stat.S_ISLNK(info.external_attr>>16):raise InvalidPackage('Symlink archive entry: '+name)
            if info.flag_bits&1:raise InvalidPackage('Encrypted archive entry is unsupported')
            if not info.is_dir():names[name]=info
        manifests=[n for n in names if n.endswith('/SHA256SUMS.txt') or n=='SHA256SUMS.txt']
        if len(manifests)!=1:raise InvalidPackage('Exactly one SHA256SUMS.txt is required')
        manifest=manifests[0];prefix=manifest[:-len('SHA256SUMS.txt')]
        listed={}
        for line in z.read(manifest).decode('utf-8').splitlines():
            match=re.fullmatch(r'([a-fA-F0-9]{64})  (.+)',line)
            if match is None:raise InvalidPackage('Malformed manifest line')
            h,rel=match.groups();rel=clean_name(rel);name=prefix+rel
            if name==manifest:raise InvalidPackage('Manifest cannot hash itself')
            if name in listed:raise InvalidPackage('Duplicate manifest path: '+rel)
            listed[name]=h.lower()
        actual=set(names)-{manifest}
        if set(listed)!=actual:
            raise InvalidPackage('Manifest coverage mismatch: missing='+str(sorted(actual-set(listed)))+' absent='+str(sorted(set(listed)-actual)))
        for name,h in listed.items():
            # Reading to EOF also validates each entry's CRC before reporting success.
            got=hashlib.sha256()
            with z.open(names[name]) as f:
                for block in iter(lambda:f.read(1024*1024),b''):got.update(block)
            if got.hexdigest()!=h:raise InvalidPackage('File SHA-256 mismatch: '+name)
    return {'state':'VERIFIED','zipName':path.name,'zipSha256':digest,'fileCount':len(names),
            'checksumCount':len(listed),'matchedChecksums':len(listed),'crc':'PASS',
            'exactCoverage':True,'duplicatePaths':False,'externalDigestChecked':expected_sha256 is not None,
            'authenticityVerified':False}


def main() -> int:
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('zip',type=Path);p.add_argument('--expected-sha256');a=p.parse_args()
    try: result=verify(a.zip,a.expected_sha256)
    except (OSError,ValueError,zipfile.BadZipFile,RuntimeError) as e:
        print(json.dumps({'state':'FAILED','reason':str(e)},ensure_ascii=False));return 2
    print(json.dumps(result,ensure_ascii=False,indent=2));return 0

if __name__=='__main__':raise SystemExit(main())
