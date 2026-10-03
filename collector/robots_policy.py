"""Robots rules with longest-path precedence; unknown records grant no access."""
import re
from fnmatch import fnmatchcase
from urllib.parse import urlsplit,quote

def allowed(text,agent,url):
    groups=[];agents=[];rules=[];started=False
    for line in text.splitlines():
        line=line.split('#',1)[0].strip()
        if ':' not in line:continue
        key,value=line.split(':',1);key=key.strip().lower();value=value.strip()
        if key=='user-agent':
            if started:groups.append((agents,rules));agents=[];rules=[];started=False
            agents.append(value.casefold())
        elif key in ('allow','disallow') and agents:
            started=True
            if value:rules.append((key,value))
    if agents:groups.append((agents,rules))
    token=agent.split('/',1)[0].casefold()
    specific=[(max((len(a) for a in agents if a!='*' and a in token),default=0),rules) for agents,rules in groups]
    length=max((n for n,_ in specific),default=0)
    chosen=[rules for n,rules in specific if n==length] if length else [rules for agents,rules in groups if '*' in agents]
    parsed=urlsplit(url);path=(parsed.path or '/')+('?' + parsed.query if parsed.query else '')
    def norm(value):
        value=quote(value,safe="/%:@!$&'()*+,;=-._~?[]")
        return re.sub(r'%([0-9a-fA-F]{2})',lambda m:chr(int(m[1],16)) if chr(int(m[1],16)) in 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~' else '%'+m[1].upper(),value)
    path=norm(path);matches=[]
    for rules in chosen:
        for kind,pattern in rules:
            pattern=norm(pattern);end=pattern.endswith('$');pattern=pattern[:-1] if end else pattern
            if len(pattern)>8192:return False
            # Only '*' is a wildcard. Queries and brackets are literal. stdlib
            # glob translation uses atomic groups to bound multi-star matching.
            glob=''.join({'?':'[?]','[':'[[]',']':'[]]'}.get(c,c) for c in pattern)
            if fnmatchcase(path,glob+('' if end else '*')):
                matches.append((len(pattern.replace('*','').encode('utf-8')),kind=='allow'))
    return max(matches,default=(0,True))[1]
