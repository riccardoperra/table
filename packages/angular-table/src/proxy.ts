import { computed, type Signal, untracked } from '@angular/core'
import { type Table } from '@tanstack/table-core'

type Prettify<T> = {
  [K in keyof T]: T[K]
} & {}

type TableProxyAccessor<T> = T extends (...args: any[]) => any
  ? T
  : T extends () => infer U
    ? Signal<U>
    : never

type TableProxy<T extends Table<any>> = Prettify<
  {
    [K in keyof T]: K extends `get${string}` ? TableProxyAccessor<T[K]> : T[K]
  } & {
    options: Signal<T['options']>
  }
>

export type TableResult<T> = Signal<Table<T>> & TableProxy<Table<T>>

export function proxifyTable<T>(tableSignal: Signal<Table<T>>): TableResult<T> {
  const proxyTable = new Proxy(tableSignal, {
    get(target: Signal<Table<T>>, property: keyof Table<T>): any {
      const untypedTarget = target as any
      if (untypedTarget[property]) {
        return untypedTarget[property]
      }
      const table = untracked(target)
      if (!(property in table)) {
        return untypedTarget[property]
      }
      /**
       * Attempt to convert all accessors into computed ones,
       * excluding handlers as they do not retain any reactive value
       */
      if (canTransformPropertyToComputed(property)) {
        const maybeFn = table[property] as Function | never
        if (typeof maybeFn === 'function') {
          Object.defineProperty(untypedTarget, property, {
            value: toComputed(target, maybeFn),
            configurable: true,
            enumerable: true,
          })
        }
      }

      return untypedTarget[property] || table[property]
    },
  })

  return Object.assign(proxyTable, {
    options: computed(() => tableSignal().options),
  }) as TableResult<T>
}

/**
 * Here we should handle all type of accessors:
 * - 0 argument -> e.g. table.getCanNextPage())
 * - 0~1 arguments -> e.g. table.getIsSomeRowsPinned(position?)
 * - 1 required argument -> e.g. table.getColumn(columnId)
 * - 1+ argument -> e.g. table.getRow(id, searchAll?)
 *
 * Since we are not able to detect automatically which accessor could be only 0 argument or with an optional
 * parameter, we'll wrap all accessors into a getter which will cache the resolved properties and
 * return it's value based on the given parameters.
 */
function toComputed<T>(
  signal: Signal<Table<T>>,
  fn: Function
) {
  const computedCache: Record<string, Signal<unknown>> = {}

  const computedFunction = (...argsArray: any[]) => {
    const serializedArgs = serializeArgs(...argsArray)
    if (computedCache.hasOwnProperty(serializedArgs)) {
      return computedCache[serializedArgs]?.()
    }
    const computedSignal = computed(() => {
      // The computed signal will be run on every `table` change
      // but the value will be memoized
      void signal()
      // We'll call the function with the given arguments
      return fn(...argsArray)
    })

    computedCache[serializedArgs] = computedSignal

    return computedSignal()
  }

  Object.defineProperty(computedFunction, '__cache', {
    value: computedCache,
    enumerable: true,
    writable: false,
    configurable: true,
  })

  return computedFunction
}

function serializeArgs(...args: any[]) {
  return JSON.stringify(args)
}

function canTransformPropertyToComputed(propertyName: string) {
  return (
    propertyName.startsWith('get') &&
    (!propertyName.endsWith('Handler') || !propertyName.endsWith('Model'))
  )
}