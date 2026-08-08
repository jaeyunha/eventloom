import type { Key, ReactNode } from "react";
import styles from "../../styles/design-system.module.css";
import { cx } from "./class-names";

export interface DataTableColumn<Row> {
  id: string;
  header: ReactNode;
  cell: (row: Row) => ReactNode;
  mobileLabel?: string;
  align?: "left" | "center" | "right";
}

export interface DataTableProps<Row> {
  caption: string;
  columns: readonly DataTableColumn<Row>[];
  rows: readonly Row[];
  getRowKey: (row: Row) => Key;
  emptyState?: ReactNode;
  responsive?: boolean;
  className?: string;
  rowClassName?: (row: Row) => string | undefined;
}

function alignmentClass(align: DataTableColumn<unknown>["align"]): string | undefined {
  if (align === "center") {
    return styles.alignCenter;
  }
  if (align === "right") {
    return styles.alignRight;
  }
  return undefined;
}

export function DataTable<Row>({
  caption,
  columns,
  rows,
  getRowKey,
  emptyState = "No results",
  responsive = true,
  className,
  rowClassName,
}: DataTableProps<Row>) {
  return (
    <section
      aria-label={caption}
      className={cx(styles.tableFrame, responsive && styles.responsiveTable, className)}
    >
      <table className={styles.table}>
        <caption className={styles.srOnly}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th className={alignmentClass(column.align)} key={column.id} scope="col">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td className={styles.tableEmpty} colSpan={Math.max(columns.length, 1)}>
                {emptyState}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr className={rowClassName?.(row)} key={getRowKey(row)}>
                {columns.map((column) => (
                  <td
                    className={alignmentClass(column.align)}
                    data-label={column.mobileLabel ?? String(column.header)}
                    key={column.id}
                  >
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  );
}
