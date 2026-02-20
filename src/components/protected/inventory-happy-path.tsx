"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Item = { id: string; name: string };
type StockRow = { itemId: string; qty: number };

export function InventoryHappyPath() {
  const [orgName, setOrgName] = useState("");
  const [activeOrg, setActiveOrg] = useState<string | null>(null);
  const [itemName, setItemName] = useState("");
  const [items, setItems] = useState<Item[]>([]);
  const [inboundQty, setInboundQty] = useState("1");
  const [selectedItemId, setSelectedItemId] = useState<string>("");
  const [stock, setStock] = useState<StockRow[]>([]);

  const selectedItem = useMemo(
    () => items.find((item) => item.id === selectedItemId),
    [items, selectedItemId],
  );

  return (
    <section className="w-full max-w-xl space-y-6" data-testid="stock-happy-path">
      <div className="space-y-2 rounded border p-4">
        <h3 className="text-lg font-semibold">1. 建立 org</h3>
        <Label htmlFor="orgName">Org 名稱</Label>
        <div className="flex gap-2">
          <Input
            id="orgName"
            value={orgName}
            placeholder="Demo Org"
            onChange={(event) => setOrgName(event.target.value)}
          />
          <Button
            type="button"
            onClick={() => {
              if (!orgName.trim()) return;
              setActiveOrg(orgName.trim());
            }}
          >
            建立 org
          </Button>
        </div>
        {activeOrg ? <p data-testid="active-org">目前 org：{activeOrg}</p> : null}
      </div>

      <div className="space-y-2 rounded border p-4">
        <h3 className="text-lg font-semibold">2. 新增 item</h3>
        <Label htmlFor="itemName">品項名稱</Label>
        <div className="flex gap-2">
          <Input
            id="itemName"
            value={itemName}
            placeholder="Milk"
            onChange={(event) => setItemName(event.target.value)}
          />
          <Button
            type="button"
            disabled={!activeOrg}
            onClick={() => {
              const name = itemName.trim();
              if (!name) return;
              const item = { id: crypto.randomUUID(), name };
              setItems((prev) => [...prev, item]);
              setSelectedItemId(item.id);
              setItemName("");
            }}
          >
            新增 item
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded border p-4">
        <h3 className="text-lg font-semibold">3. 入庫</h3>
        <Label htmlFor="inboundQty">數量</Label>
        <div className="flex gap-2">
          <select
            className="h-10 rounded border px-3"
            value={selectedItemId}
            onChange={(event) => setSelectedItemId(event.target.value)}
            data-testid="item-select"
          >
            <option value="">請選擇品項</option>
            {items.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>
          <Input
            id="inboundQty"
            type="number"
            min={1}
            value={inboundQty}
            onChange={(event) => setInboundQty(event.target.value)}
          />
          <Button
            type="button"
            disabled={!selectedItem}
            onClick={() => {
              const qty = Number(inboundQty);
              if (!selectedItem || !Number.isFinite(qty) || qty <= 0) return;
              setStock((prev) => {
                const current = prev.find((row) => row.itemId === selectedItem.id);
                if (current) {
                  return prev.map((row) =>
                    row.itemId === selectedItem.id ? { ...row, qty: row.qty + qty } : row,
                  );
                }
                return [...prev, { itemId: selectedItem.id, qty }];
              });
            }}
          >
            入庫
          </Button>
        </div>
      </div>

      <div className="space-y-2 rounded border p-4">
        <h3 className="text-lg font-semibold">4. 庫存頁</h3>
        <ul data-testid="stock-list" className="space-y-1">
          {stock.map((row) => {
            const item = items.find((candidate) => candidate.id === row.itemId);
            if (!item) return null;
            return (
              <li key={row.itemId} className="text-sm" data-testid={`stock-row-${item.name}`}>
                {item.name}: {row.qty}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
