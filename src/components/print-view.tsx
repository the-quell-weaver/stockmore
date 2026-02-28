import type { BatchWithRefs } from "@/lib/transactions/service";
import { renderQuantityBoxes } from "@/lib/print/quantity-boxes";

type ItemGroup = {
  itemId: string;
  itemName: string;
  batches: BatchWithRefs[];
};

function groupBatchesByItem(batches: BatchWithRefs[]): ItemGroup[] {
  const map = new Map<string, ItemGroup>();
  for (const batch of batches) {
    const g = map.get(batch.itemId) ?? {
      itemId: batch.itemId,
      itemName: batch.itemName,
      batches: [],
    };
    g.batches.push(batch);
    map.set(batch.itemId, g);
  }
  return [...map.values()];
}

type PrintViewProps = {
  batches: BatchWithRefs[];
  warehouseName: string;
};

export function PrintView({ batches, warehouseName }: PrintViewProps) {
  const groups = groupBatchesByItem(batches);
  const printDate = new Date().toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <div className="hidden print:block p-8 font-sans text-black bg-white">
      {/* Print header */}
      <div className="mb-6 border-b border-gray-300 pb-3">
        <h1 className="text-xl font-bold">庫存清單</h1>
        <p className="text-sm text-gray-600">倉庫：{warehouseName}</p>
        <p className="text-sm text-gray-600">列印日期：{printDate}</p>
      </div>

      {groups.length === 0 ? (
        <p className="text-sm text-gray-500">目前無庫存記錄</p>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => (
            <div key={group.itemId}>
              <h2 className="font-semibold">{group.itemName}</h2>
              <div className="ml-4 mt-1 space-y-1">
                {group.batches.map((batch) => {
                  const meta: string[] = [];
                  if (batch.expiryDate) meta.push(`到期：${batch.expiryDate}`);
                  if (batch.storageLocationName) meta.push(batch.storageLocationName);
                  if (batch.tagName) meta.push(batch.tagName);
                  return (
                    <div key={batch.id} className="flex items-baseline gap-2 text-sm">
                      <span className="font-mono tracking-widest">
                        {renderQuantityBoxes(batch.quantity)}
                      </span>
                      {meta.length > 0 && (
                        <span className="text-gray-600 text-xs">（{meta.join(" · ")}）</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
