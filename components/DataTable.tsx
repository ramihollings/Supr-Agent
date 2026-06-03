"use client";

import type { ReactNode } from "react";

export interface DataTableColumn<T> {
  /** Key into the row. Used to generate the React key when no id field is set. */
  key: string;
  /** Column header. Pass a string for plain text. */
  label: ReactNode;
  /**
   * Renderer. If omitted, the column displays the raw value at `row[key]`
   * as text. Use the renderer to format dates, status pills, badges, etc.
   */
  render?: (row: T) => ReactNode;
  /**
   * Tailwind class on the <td> for this column. Useful for width, text
   * alignment, or hiding at certain breakpoints.
   */
  className?: string;
  /** Header className, e.g. uppercase text tracking. */
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  /** Extract a stable React key. Defaults to the row at the column key. */
  rowKey?: (row: T, index: number) => string | number;
  /** Optional row-level onClick handler; renders the rows as buttons. */
  onRowClick?: (row: T) => void;
  /** Empty-state copy when rows is empty. Defaults to "No records". */
  emptyMessage?: ReactNode;
  /** Additional class on the outer wrapper. */
  className?: string;
  /** Optional table aria-label. */
  ariaLabel?: string;
}

/**
 * Shared table component for list pages.
 *
 * Most of the app's list pages repeat the same neobrutalist
 * styling: a `border-2 border-primary` table, `font-headline font-bold
 * uppercase text-xs` header row, `bg-surface` body rows with a
 * hover state. This component captures that pattern so new list pages
 * don't reinvent it.
 *
 * Type-safe: columns are generic over T; the row type is inferred
 * from the rows prop. Renders are optional, so simple tables can omit
 * them and just rely on the cell's string value.
 */
export function DataTable<T>({
  columns,
  rows,
  rowKey,
  onRowClick,
  emptyMessage = 'No records.',
  className,
  ariaLabel,
}: DataTableProps<T>) {
  if (rows.length === 0) {
    return (
      <div className={`border-2 border-dashed border-outline-variant p-6 text-center ${className ?? ''}`}>
        <p className="font-body text-xs text-on-surface-variant">{emptyMessage}</p>
      </div>
    );
  }

  const RowTag = 'div';

  return (
    <div className={`border-2 border-primary bg-surface overflow-x-auto ${className ?? ''}`}>
      <table className="w-full text-left text-xs" aria-label={ariaLabel}>
        <thead className="bg-primary text-on-primary">
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={`font-headline font-bold uppercase tracking-wider px-3 py-2 ${c.headerClassName ?? ''}`}
              >
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const key = rowKey ? rowKey(row, idx) : idx;
            const cellClass = onRowClick
              ? 'hover:bg-surface-container focus:outline-none focus-visible:bg-surface-container w-full text-left'
              : '';
            return (
              <tr key={key} className="border-t border-outline-variant hover:bg-surface-container transition-colors">
                {columns.map((c) => {
                  const value = c.render ? c.render(row) : (row as Record<string, unknown>)[c.key] as ReactNode;
                  return (
                    <td
                      key={c.key}
                      className={`px-3 py-2 align-middle ${c.className ?? ''}`}
                    >
                      {onRowClick ? (
                        <button
                          type="button"
                          onClick={() => onRowClick(row)}
                          className="w-full text-left hover:bg-surface-container focus:outline-none focus-visible:bg-surface-container"
                        >
                          {value}
                        </button>
                      ) : (
                        value
                      )}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
