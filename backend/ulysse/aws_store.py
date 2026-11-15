"""AWS store: DynamoDB (records) + S3 (values over 300 KB, e.g. dossiers with their evidence).
Same interface as LocalStore (get/put/list/delete/append/incr/wipe)."""
from __future__ import annotations

import json
import os
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key

LIMITE_ITEM = 300_000


class AwsStore:
    def __init__(self, table: str | None = None, bucket: str | None = None):
        self.t = boto3.resource("dynamodb").Table(table or os.environ["ULYSSE_TABLE"])
        self.s3 = boto3.client("s3")
        self.bucket = bucket or os.environ["ULYSSE_DATA_BUCKET"]

    def put(self, kind: str, key: str, value: Any) -> None:
        raw = json.dumps(value, ensure_ascii=False, default=str)
        if len(raw.encode()) > LIMITE_ITEM:
            path = f"store/{kind}/{key}.json"
            self.s3.put_object(Bucket=self.bucket, Key=path, Body=raw.encode(), ContentType="application/json")
            self.t.put_item(Item={"pk": kind, "sk": key, "s3": path})
        else:
            self.t.put_item(Item={"pk": kind, "sk": key, "v": raw})

    def get(self, kind: str, key: str, default: Any = None) -> Any:
        it = self.t.get_item(Key={"pk": kind, "sk": key}, ConsistentRead=True).get("Item")
        if not it:
            return default
        if "n" in it and "v" not in it:          # counters written by incr()
            return float(it["n"])
        if "s3" in it:
            return json.loads(self.s3.get_object(Bucket=self.bucket, Key=it["s3"])["Body"].read())
        return json.loads(it["v"])

    def list(self, kind: str) -> list[str]:
        out, kw = [], {"KeyConditionExpression": Key("pk").eq(kind), "ProjectionExpression": "sk"}
        while True:
            r = self.t.query(**kw)
            out += [i["sk"] for i in r["Items"]]
            if "LastEvaluatedKey" not in r:
                return sorted(out)
            kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]

    def delete(self, kind: str, key: str) -> None:
        self.t.delete_item(Key={"pk": kind, "sk": key})

    def append(self, kind: str, key: str, item: Any, cap: int = 500) -> None:
        items = self.get(kind, key, [])
        items.append(item)
        self.put(kind, key, items[-cap:])

    def incr(self, kind: str, key: str, by: float) -> float:
        r = self.t.update_item(Key={"pk": kind, "sk": key}, UpdateExpression="ADD n :b",
                               ExpressionAttributeValues={":b": Decimal(str(by))}, ReturnValues="UPDATED_NEW")
        return float(r["Attributes"]["n"])

    def wipe(self) -> None:
        """Demo reset: delete every record (the table only holds fictitious demo data)."""
        kw = {"ProjectionExpression": "pk, sk"}
        while True:
            r = self.t.scan(**kw)
            with self.t.batch_writer() as b:
                for i in r["Items"]:
                    b.delete_item(Key={"pk": i["pk"], "sk": i["sk"]})
            if "LastEvaluatedKey" not in r:
                return
            kw["ExclusiveStartKey"] = r["LastEvaluatedKey"]
