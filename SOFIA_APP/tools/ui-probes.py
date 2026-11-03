"""Geometry for the native pager test, never the calendar's horizontal gesture."""
import re
import xml.etree.ElementTree as ET

def box(node):
    values = list(map(int, re.findall(r"-?\d+", node.get("bounds", ""))))
    if len(values) != 4:
        raise AssertionError("Missing native element bounds")
    return values

def home_pager_swipe(tree):
    nodes = list(ET.fromstring(tree).iter("node"))
    # 03/11/2026: o Inicio atual sauda com "Bom dia/Boa tarde/Boa noite, <nome>"; a tela de abertura ainda diz "Olá,"
    headers = [n for n in nodes if re.match(r"(Olá|Bom dia|Boa tarde|Boa noite), ", n.get("text", ""))]
    pagers = [n for n in nodes if n.get("resource-id", "").startswith("sofia-pager-ready:")]
    calendars = [box(n) for n in nodes if n.get("resource-id") in ("calendar-month-swipe", "mini-agenda")]
    if not headers or not pagers:
        raise AssertionError("Home header/pager not visible: cannot guess swipe coordinates")
    hx1, hy1, hx2, hy2 = box(headers[0])
    x1, y1, x2, y2 = box(pagers[0])
    y = hy2 - min(6, (hy2-hy1)//4)
    if not y1 < y < y2 or any(cy1 <= y <= cy2 for _, cy1, _, cy2 in calendars):
        raise AssertionError("Proposed Home swipe overlaps the calendar")
    return [round(x1+(x2-x1)*.82), y, round(x1+(x2-x1)*.15), y]
