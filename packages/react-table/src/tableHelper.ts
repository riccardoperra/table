import { constructTableHelper } from '@tanstack/table-core'
import { useTable } from './useTable'
import type {
  RowData,
  Table,
  TableFeatures,
  TableHelperOptions,
  TableHelper_Core,
  TableOptions,
} from '@tanstack/table-core'

export type TableHelper<
  TFeatures extends TableFeatures,
  TData extends RowData,
> = Omit<TableHelper_Core<TFeatures, TData>, 'tableCreator'> & {
  useTable: (
    tableOptions: Omit<
      TableOptions<TFeatures, TData>,
      '_features' | '_rowModels'
    >,
  ) => Table<TFeatures, TData>
}

export function createTableHelper<
  TFeatures extends TableFeatures,
  TData extends RowData,
>(
  tableHelperOptions: TableHelperOptions<TFeatures, TData>,
): TableHelper<TFeatures, TData> {
  const tableHelper = constructTableHelper(useTable, tableHelperOptions)
  return {
    ...tableHelper,
    useTable: tableHelper.tableCreator,
  } as any
}

// test

// type Person = {
//   firstName: string
//   lastName: string
//   age: number
// }

// const tableHelper = createTableHelper({
//   _features: { RowSelection: {} },
//   TData: {} as Person,
// })

// const columns = [
//   tableHelper.columnHelper.accessor('firstName', { header: 'First Name' }),
//   tableHelper.columnHelper.accessor('lastName', { header: 'Last Name' }),
//   tableHelper.columnHelper.accessor('age', { header: 'Age' }),
//   tableHelper.columnHelper.display({ header: 'Actions', id: 'actions' }),
// ]

// const data: Array<Person> = []

// tableHelper.useTable({
//   columns,
//   data,
// })