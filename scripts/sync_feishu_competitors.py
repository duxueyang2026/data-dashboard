#!/usr/bin/env python3
"""Sync competitor records from a Feishu Bitable view into dashboard.json."""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any


API_BASE = "https://open.feishu.cn/open-apis"
DEFAULT_FIELD_ALIASES = {
    "brand": ["品牌", "品牌名称", "竞品品牌", "brand"],
    "category": ["品类", "类目", "产品品类", "category"],
    "model": ["型号", "产品型号", "商品型号", "model"],
    "country": ["国家", "市场", "国家/市场", "站点", "country", "market"],
    "platform": ["平台", "渠道", "销售平台", "platform", "channel"],
    "sales": ["估算销量", "销量", "月销量", "销售量", "sales", "volume"],
    "rank": ["排名", "类目排名", "榜单排名", "rank"],
    "change": ["排名变化", "排名变动", "较上期变化", "变化", "change"],
}
REQUIRED_FIELDS = ("brand", "sales", "rank")
CHINA_STANDARD_TIME = timezone(timedelta(hours=8), name="Asia/Shanghai")


class SyncError(RuntimeError):
    pass


def request_json(
    method: str,
    url: str,
    *,
    headers: dict[str, str] | None = None,
    payload: dict[str, Any] | None = None,
) -> dict[str, Any]:
    body = None
    request_headers = {"Accept": "application/json", **(headers or {})}
    if payload is not None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request_headers["Content-Type"] = "application/json; charset=utf-8"

    request = urllib.request.Request(
        url,
        data=body,
        headers=request_headers,
        method=method,
    )
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            result = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        raise SyncError(f"Feishu API returned HTTP {error.code}: {detail[:500]}") from error
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
        raise SyncError(f"Unable to read Feishu API response: {error}") from error

    if result.get("code") not in (None, 0):
        raise SyncError(
            f"Feishu API error {result.get('code')}: {result.get('msg', 'unknown error')}"
        )
    return result


def get_tenant_access_token(app_id: str, app_secret: str) -> str:
    result = request_json(
        "POST",
        f"{API_BASE}/auth/v3/tenant_access_token/internal",
        payload={"app_id": app_id, "app_secret": app_secret},
    )
    token = result.get("tenant_access_token")
    if not token:
        raise SyncError("Feishu did not return tenant_access_token.")
    return str(token)


def list_records(
    token: str,
    app_token: str,
    table_id: str,
    view_id: str,
) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    page_token = ""

    while True:
        query = {"page_size": "500", "view_id": view_id}
        if page_token:
            query["page_token"] = page_token
        encoded_app = urllib.parse.quote(app_token, safe="")
        encoded_table = urllib.parse.quote(table_id, safe="")
        url = (
            f"{API_BASE}/bitable/v1/apps/{encoded_app}/tables/{encoded_table}/records"
            f"?{urllib.parse.urlencode(query)}"
        )
        result = request_json(
            "GET",
            url,
            headers={"Authorization": f"Bearer {token}"},
        )
        data = result.get("data") or {}
        page_items = data.get("items") or []
        if not isinstance(page_items, list):
            raise SyncError("Feishu records response does not contain an items array.")
        records.extend(item for item in page_items if isinstance(item, dict))

        if not data.get("has_more"):
            break
        page_token = str(data.get("page_token") or "")
        if not page_token:
            raise SyncError("Feishu reported more records without returning page_token.")

    return records


def normalize_key(value: Any) -> str:
    return re.sub(r"[\W_]+", "", str(value or "").strip().casefold())


def load_field_aliases() -> dict[str, list[str]]:
    aliases = {key: list(values) for key, values in DEFAULT_FIELD_ALIASES.items()}
    raw_mapping = os.getenv("FEISHU_FIELD_MAP", "").strip()
    if not raw_mapping:
        return aliases

    try:
        custom = json.loads(raw_mapping)
    except json.JSONDecodeError as error:
        raise SyncError(f"FEISHU_FIELD_MAP is not valid JSON: {error}") from error
    if not isinstance(custom, dict):
        raise SyncError("FEISHU_FIELD_MAP must be a JSON object.")

    for target, values in custom.items():
        if target not in aliases:
            raise SyncError(f"FEISHU_FIELD_MAP contains unsupported target field: {target}")
        if isinstance(values, str):
            aliases[target] = [values, *aliases[target]]
        elif isinstance(values, list) and all(isinstance(item, str) for item in values):
            aliases[target] = [*values, *aliases[target]]
        else:
            raise SyncError(f"Field mapping for {target} must be a string or string array.")
    return aliases


def scalar_value(value: Any) -> Any:
    if value is None or isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, list):
        values = [scalar_value(item) for item in value]
        values = [item for item in values if item not in (None, "")]
        if not values:
            return ""
        if len(values) == 1:
            return values[0]
        return ", ".join(str(item) for item in values)
    if isinstance(value, dict):
        for key in ("text", "name", "full_name", "value", "title", "link", "url"):
            if key in value:
                return scalar_value(value[key])
        return ", ".join(
            str(item) for item in (scalar_value(part) for part in value.values()) if item
        )
    return str(value)


def find_field(fields: dict[str, Any], aliases: list[str]) -> Any:
    normalized = {normalize_key(key): value for key, value in fields.items()}
    for alias in aliases:
        key = normalize_key(alias)
        if key in normalized:
            return scalar_value(normalized[key])
    return ""


def parse_number(value: Any, *, integer: bool = False) -> int | float:
    if isinstance(value, bool) or value in (None, ""):
        return 0
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).strip().replace(",", "").replace("，", "")
        multiplier = 1.0
        if "万" in text:
            multiplier = 10000.0
        elif re.search(r"[kK]\b", text):
            multiplier = 1000.0
        match = re.search(r"[-+]?\d+(?:\.\d+)?", text)
        if not match:
            return 0
        number = float(match.group()) * multiplier
    return int(round(number)) if integer else number


def parse_change(value: Any) -> int:
    if value in (None, ""):
        return 0
    text = str(value).strip()
    number = int(parse_number(value, integer=True))
    if any(marker in text for marker in ("下降", "下跌", "↓", "▼")):
        return -abs(number)
    if any(marker in text for marker in ("上升", "上涨", "↑", "▲")):
        return abs(number)
    return number


def transform_records(
    records: list[dict[str, Any]], aliases: dict[str, list[str]]
) -> list[dict[str, Any]]:
    transformed: list[dict[str, Any]] = []
    observed_columns: set[str] = set()

    for record in records:
        fields = record.get("fields") or {}
        if not isinstance(fields, dict):
            continue
        observed_columns.update(str(key) for key in fields)
        values = {key: find_field(fields, field_aliases) for key, field_aliases in aliases.items()}
        if not any(value not in (None, "") for value in values.values()):
            continue
        transformed.append(
            {
                "brand": str(values["brand"] or "").strip(),
                "category": str(values["category"] or "").strip(),
                "model": str(values["model"] or "").strip(),
                "country": str(values["country"] or "").strip(),
                "platform": str(values["platform"] or "").strip(),
                "sales": int(parse_number(values["sales"], integer=True)),
                "rank": int(parse_number(values["rank"], integer=True)),
                "change": parse_change(values["change"]),
            }
        )

    if records and not transformed:
        raise SyncError(
            "No Feishu rows matched the configured fields. Available columns: "
            + ", ".join(sorted(observed_columns))
        )
    if transformed:
        missing = [
            field
            for field in REQUIRED_FIELDS
            if all(item.get(field) in (None, "", 0) for item in transformed)
        ]
        if missing:
            raise SyncError(
                "Required competitor fields were not mapped: "
                + ", ".join(missing)
                + ". Available Feishu columns: "
                + ", ".join(sorted(observed_columns))
            )

    return transformed


def update_dashboard(
    dashboard_path: Path,
    competitors: list[dict[str, Any]],
    *,
    source_url: str,
    app_token: str,
    table_id: str,
    view_id: str,
) -> None:
    try:
        dashboard = json.loads(dashboard_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise SyncError(f"Unable to read {dashboard_path}: {error}") from error

    if not isinstance(dashboard, dict) or not isinstance(dashboard.get("meta"), dict):
        raise SyncError("dashboard.json must contain a meta object.")

    now = datetime.now(CHINA_STANDARD_TIME).replace(microsecond=0)
    dashboard["competitors"] = competitors
    dashboard["meta"]["updatedAt"] = now.strftime("%Y-%m-%d %H:%M")
    dashboard["meta"]["source"] = "GitHub Repository + Feishu Bitable"
    dashboard["meta"]["competitorSync"] = {
        "source": "Feishu Bitable",
        "sourceUrl": source_url,
        "appToken": app_token,
        "tableId": table_id,
        "viewId": view_id,
        "syncedAt": now.isoformat(),
        "recordCount": len(competitors),
    }
    dashboard_path.write_text(
        json.dumps(dashboard, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dashboard", default="data/dashboard.json")
    parser.add_argument(
        "--fixture",
        help="Read a local Feishu records response instead of calling the API (for tests).",
    )
    return parser.parse_args()


def required_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SyncError(f"Required environment variable is missing: {name}")
    return value


def main() -> int:
    args = parse_args()
    dashboard_path = Path(args.dashboard)
    app_token = required_env("FEISHU_APP_TOKEN")
    table_id = required_env("FEISHU_TABLE_ID")
    view_id = required_env("FEISHU_VIEW_ID")
    source_url = required_env("FEISHU_SOURCE_URL")
    aliases = load_field_aliases()

    if args.fixture:
        fixture = json.loads(Path(args.fixture).read_text(encoding="utf-8"))
        records = (fixture.get("data") or {}).get("items") or fixture.get("items") or []
    else:
        app_id = required_env("FEISHU_APP_ID")
        app_secret = required_env("FEISHU_APP_SECRET")
        access_token = get_tenant_access_token(app_id, app_secret)
        records = list_records(access_token, app_token, table_id, view_id)

    competitors = transform_records(records, aliases)
    update_dashboard(
        dashboard_path,
        competitors,
        source_url=source_url,
        app_token=app_token,
        table_id=table_id,
        view_id=view_id,
    )
    print(f"Synced {len(competitors)} competitor records into {dashboard_path}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except SyncError as error:
        print(f"Sync failed: {error}", file=sys.stderr)
        raise SystemExit(1)
