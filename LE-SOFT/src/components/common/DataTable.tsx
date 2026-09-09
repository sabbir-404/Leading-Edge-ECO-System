import React, { useRef } from 'react';
import {
    useReactTable,
    getCoreRowModel,
    getSortedRowModel,
    getFilteredRowModel,
    flexRender,
    ColumnDef,
    SortingState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface DataTableProps<T extends object> {
    data: T[];
    columns: ColumnDef<T, any>[];
    searchQuery?: string;
    onRowClick?: (row: T) => void;
    height?: string | number;
}

export function DataTable<T extends object>({
    data,
    columns,
    searchQuery = '',
    onRowClick,
    height = 500,
}: DataTableProps<T>) {
    const [sorting, setSorting] = React.useState<SortingState>([]);
    const [globalFilter, setGlobalFilter] = React.useState(searchQuery);

    React.useEffect(() => {
        setGlobalFilter(searchQuery);
    }, [searchQuery]);

    const table = useReactTable({
        data,
        columns,
        state: {
            sorting,
            globalFilter,
        },
        onSortingChange: setSorting,
        onGlobalFilterChange: setGlobalFilter,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
    });

    const { rows } = table.getRowModel();
    const parentRef = useRef<HTMLDivElement>(null);

    const rowVirtualizer = useVirtualizer({
        count: rows.length,
        getScrollElement: () => parentRef.current,
        estimateSize: () => 48,
        overscan: 10,
    });

    return (
        <div
            ref={parentRef}
            style={{
                height,
                overflow: 'auto',
                border: '1px solid var(--border-color)',
                borderRadius: '8px',
                background: 'var(--card-bg)',
            }}
        >
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--card-bg)', zIndex: 1, borderBottom: '2px solid var(--border-color)' }}>
                    {table.getHeaderGroups().map(headerGroup => (
                        <tr key={headerGroup.id}>
                            {headerGroup.headers.map(header => (
                                <th
                                    key={header.id}
                                    style={{
                                        padding: '0.75rem 1rem',
                                        fontWeight: 700,
                                        color: 'var(--text-secondary)',
                                        cursor: header.column.getCanSort() ? 'pointer' : 'default',
                                        userSelect: 'none',
                                    }}
                                    onClick={header.column.getToggleSortingHandler()}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                        {{
                                            asc: <ChevronUp size={14} />,
                                            desc: <ChevronDown size={14} />,
                                        }[header.column.getIsSorted() as string] ?? null}
                                    </div>
                                </th>
                            ))}
                        </tr>
                    ))}
                </thead>
                <tbody style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}>
                    {rows.length === 0 ? (
                        <tr>
                            <td colSpan={columns.length} style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
                                No items found.
                            </td>
                        </tr>
                    ) : (
                        rowVirtualizer.getVirtualItems().map(virtualRow => {
                            const row = rows[virtualRow.index];
                            return (
                                <tr
                                    key={row.id}
                                    onClick={() => onRowClick && onRowClick(row.original)}
                                    style={{
                                        position: 'absolute',
                                        top: 0,
                                        left: 0,
                                        width: '100%',
                                        height: `${virtualRow.size}px`,
                                        transform: `translateY(${virtualRow.start}px)`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        borderBottom: '1px solid var(--border-color)',
                                        cursor: onRowClick ? 'pointer' : 'default',
                                        background: virtualRow.index % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.015)',
                                    }}
                                >
                                    {row.getVisibleCells().map(cell => (
                                        <td key={cell.id} style={{ flex: 1, padding: '0.5rem 1rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                        </td>
                                    ))}
                                </tr>
                            );
                        })
                    )}
                </tbody>
            </table>
        </div>
    );
}
