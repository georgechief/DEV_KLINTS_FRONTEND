import {
  writebackPossibleRowsForCheck,
  writebackPossibleToTable,
  type WritebackPossibleRow,
} from "@/lib/writebacks";

export function WritebackPossibleSurfaces({
  checkId,
  rows,
  isPending,
  isError,
  onRetry,
  writebackExecuteEnabled,
}: {
  checkId: string | undefined;
  rows: WritebackPossibleRow[] | undefined;
  isPending: boolean;
  isError: boolean;
  onRetry?: () => void;
  writebackExecuteEnabled?: boolean | null;
}) {
  if (!checkId) return null;

  const match = writebackPossibleRowsForCheck(rows, checkId);
  if (isPending) {
    return (
      <p className="mt-[22px] text-[11px] text-muted-foreground">
        Loading write surfaces…
      </p>
    );
  }
  if (isError) {
    return (
      <div className="mt-[22px]">
        <p className="text-[11px] text-muted-foreground">
          Write surfaces could not be loaded.
        </p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            Retry
          </button>
        ) : null}
      </div>
    );
  }
  if (!match.length) return null;

  const table = writebackPossibleToTable(match, { writebackExecuteEnabled });

  return (
    <details className="mt-[22px] rounded-md border border-border bg-elevated/40 px-3 py-2">
      <summary className="cursor-pointer text-[10px] font-medium uppercase tracking-[0.06em] text-fog">
        Write surfaces · {checkId}
      </summary>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        {table.helper}
      </p>
      <div className="mt-2 overflow-x-auto">
        <table className="fix-preview-table">
          <thead>
            <tr>
              {table.columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, cellIndex) => (
                  <td key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
