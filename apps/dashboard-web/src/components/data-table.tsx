"use client";

import * as React from "react";
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/empty-state";

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  className?: string;
  /** Render row as a card on small screens. Default true. */
  mobileCards?: boolean;
  /** Renderer for mobile card view per row. If absent, falls back to stacked label/value of each visible cell. */
  renderMobileCard?: (row: TData) => React.ReactNode;
  onRowClick?: (row: TData) => void;
}

export function DataTable<TData, TValue>({
  columns,
  data,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyAction,
  className,
  mobileCards = true,
  renderMobileCard,
  onRowClick,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  });

  if (!data.length) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    );
  }

  return (
    <div className={cn("w-full", className)}>
      {/* Desktop table */}
      <div className={cn("rounded-2xl border border-white/[0.06] bg-slate-950/30 overflow-hidden", mobileCards && "hidden sm:block")}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-white/[0.06] bg-white/[0.02]">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id}>
                  {hg.headers.map((header) => {
                    const canSort = header.column.getCanSort();
                    const sorted = header.column.getIsSorted();
                    return (
                      <th
                        key={header.id}
                        scope="col"
                        className={cn(
                          "px-4 py-2.5 text-left text-[10px] font-mono uppercase tracking-[0.15em] text-slate-500",
                          canSort && "cursor-pointer select-none hover:text-slate-300"
                        )}
                        onClick={canSort ? header.column.getToggleSortingHandler() : undefined}
                      >
                        <span className="inline-flex items-center gap-1.5">
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                          {canSort && (
                            sorted === "asc" ? <ChevronUp size={11} /> :
                            sorted === "desc" ? <ChevronDown size={11} /> :
                            <ArrowUpDown size={11} className="opacity-40" />
                          )}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-white/[0.04]">
              {table.getRowModel().rows.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                  className={cn(
                    "transition-colors",
                    onRowClick && "cursor-pointer hover:bg-white/[0.02]"
                  )}
                >
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-3 align-middle text-slate-300 min-w-0">
                      <div className="min-w-0 truncate">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </div>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile cards */}
      {mobileCards && (
        <div className="sm:hidden space-y-2">
          {table.getRowModel().rows.map((row) => (
            <div
              key={row.id}
              onClick={onRowClick ? () => onRowClick(row.original) : undefined}
              className={cn(
                "rounded-xl border border-white/[0.06] bg-slate-950/40 p-4 backdrop-blur-md transition-colors",
                onRowClick && "active:bg-white/[0.04]"
              )}
            >
              {renderMobileCard ? (
                renderMobileCard(row.original)
              ) : (
                <div className="space-y-2">
                  {row.getVisibleCells().map((cell, idx) => {
                    const headerDef = cell.column.columnDef.header;
                    const label = typeof headerDef === "string" ? headerDef : cell.column.id;
                    return (
                      <div key={cell.id} className={cn("flex items-start justify-between gap-3", idx === 0 && "border-b border-white/[0.04] pb-2")}>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 pt-0.5">
                          {label}
                        </span>
                        <div className="text-sm text-slate-200 text-right min-w-0 truncate max-w-[60%]">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
