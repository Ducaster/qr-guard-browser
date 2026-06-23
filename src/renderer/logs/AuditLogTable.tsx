import {
  DataGrid,
  DataGridBody,
  DataGridCell,
  DataGridHeader,
  DataGridHeaderCell,
  DataGridRow,
  Text,
  createTableColumn,
  makeStyles,
  tokens,
  type TableColumnDefinition
} from "@fluentui/react-components";
import { useMemo, type JSX } from "react";

import { Stack } from "../fluentLayout";
import type { AuditGridRow } from "./auditLogFormat";

interface AuditLogTableProps {
  readonly rows: AuditGridRow[];
}

export const AuditLogTable = ({ rows }: AuditLogTableProps): JSX.Element => {
  const styles = useAuditTableStyles();
  const columns = useMemo<TableColumnDefinition<AuditGridRow>[]>(
    () => [
      createTableColumn<AuditGridRow>({
        columnId: "userId",
        renderCell: (item) => item.userId,
        renderHeaderCell: () => "지역"
      }),
      createTableColumn<AuditGridRow>({
        columnId: "time",
        renderCell: (item) => item.time,
        renderHeaderCell: () => "시간"
      }),
      createTableColumn<AuditGridRow>({
        columnId: "reason",
        renderCell: (item) => item.reason,
        renderHeaderCell: () => "사유"
      }),
      createTableColumn<AuditGridRow>({
        columnId: "appVersion",
        renderCell: (item) => item.appVersion,
        renderHeaderCell: () => "버전"
      }),
      createTableColumn<AuditGridRow>({
        columnId: "lastAuthenticatedAt",
        renderCell: (item) => item.lastAuthenticatedAt,
        renderHeaderCell: () => "마지막 인증"
      })
    ],
    []
  );

  return (
    <Stack>
      <div className={styles.tableScroller}>
        <DataGrid
          className={styles.table}
          columns={columns}
          data-testid="audit-log-table"
          focusMode="cell"
          getRowId={getAuditRowId}
          items={rows}
          size="small"
        >
          <DataGridHeader>
            <DataGridRow>
              {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
            </DataGridRow>
          </DataGridHeader>
          <DataGridBody<AuditGridRow>>
            {({ item, rowId }) => (
              <DataGridRow<AuditGridRow> data-testid="audit-event-row" key={rowId}>
                {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
              </DataGridRow>
            )}
          </DataGridBody>
        </DataGrid>
      </div>
      {rows.length === 0 ? <Text align="center">인증 기록이 없습니다.</Text> : null}
    </Stack>
  );
};

const getAuditRowId = (item: AuditGridRow): string => item.rowId;

const useAuditTableStyles = makeStyles({
  table: {
    minWidth: "860px"
  },
  tableScroller: {
    border: `${tokens.strokeWidthThin} solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    overflowX: "auto",
  }
});
