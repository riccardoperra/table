import {
  ChangeDetectorRef,
  ComponentRef,
  inject,
  Injectable,
  Injector,
  KeyValueDiffer,
  KeyValueDiffers,
  OutputEmitterRef,
  OutputRefSubscription,
  ViewContainerRef,
} from '@angular/core'
import { FlexRenderComponent } from './flex-render-component'

@Injectable()
export class FlexRenderComponentFactory {
  #viewContainerRef = inject(ViewContainerRef)

  createComponent<T>(
    flexRenderComponent: FlexRenderComponent<T>,
    componentInjector: Injector
  ): FlexRenderComponentRef<T> {
    const componentRef = this.#viewContainerRef.createComponent(
      flexRenderComponent.component,
      {
        injector: componentInjector,
      }
    )

    return new FlexRenderComponentRef(
      componentRef,
      flexRenderComponent,
      componentInjector
    )
  }
}

export class FlexRenderComponentRef<T> {
  componentData: FlexRenderComponent<T>
  readonly #keyValueDiffersFactory: KeyValueDiffers
  #inputValueDiffer: KeyValueDiffer<any, any>
  #outputValueDiffer: KeyValueDiffer<any, any>

  outputSubscribers: Record<string, OutputRefSubscription> = {}

  constructor(
    readonly componentRef: ComponentRef<T>,
    componentData: FlexRenderComponent<T>,
    readonly componentInjector: Injector
  ) {
    this.componentData = componentData
    this.#keyValueDiffersFactory = componentInjector.get(KeyValueDiffers)
    this.#inputValueDiffer = this.#keyValueDiffersFactory
      .find(this.componentData.inputs ?? {})
      .create()
    this.#inputValueDiffer.diff(this.componentData.inputs ?? {})
    this.#outputValueDiffer = this.#keyValueDiffersFactory
      .find(this.componentData.outputs ?? {})
      .create()
    this.#outputValueDiffer.diff(this.componentData.outputs ?? {})

    this.componentRef.onDestroy(() => {
      this.unsubscribeOutputs()
    })
  }

  get component() {
    return this.componentData.component
  }

  get inputs() {
    return this.componentData.inputs ?? {}
  }

  /**
   * Get component inputs diff by the given item
   */
  diffInputs(item: FlexRenderComponent<T>) {
    return this.#inputValueDiffer.diff(item.inputs ?? {})
  }

  /**
   * Get component outputs diff by the given item
   */
  diffOutputs(item: FlexRenderComponent<T>) {
    return this.#outputValueDiffer.diff(item.outputs ?? {})
  }

  /**
   *
   * @param compare Whether the current ref component instance is the same as the given one
   */
  eqType(compare: FlexRenderComponent<T>): boolean {
    return compare.component === this.component
  }

  /**
   * Tries to update current component refs input by the new given content component.
   */
  update(content: FlexRenderComponent<T>) {
    const eq = this.eqType(content)
    if (!eq) return
    const inputChanges = this.diffInputs(content)
    const outputChanges = this.diffOutputs(content)

    if (inputChanges) {
      const { forEachAddedItem, forEachChangedItem, forEachRemovedItem } =
        inputChanges
      forEachAddedItem(item => this.setInput(item.key, item.currentValue))
      forEachChangedItem(item => this.setInput(item.key, item.currentValue))
      forEachRemovedItem(item => this.setInput(item.key, undefined))
    }

    if (outputChanges) {
      const { forEachAddedItem, forEachRemovedItem } = outputChanges
      forEachAddedItem(item => {
        const instance = this.componentRef.instance
        const output = instance[item.key as keyof typeof instance]
        if (output && output instanceof OutputEmitterRef) {
          this.outputSubscribers[item.key] = output.subscribe(value => {
            const outputCallback =
              content.outputs?.[item.key as keyof typeof content.outputs]
            ;(outputCallback as (...args: any[]) => void)(value)
          })
        }
      })

      forEachRemovedItem(item => {
        if (this.outputSubscribers[item.key]) {
          this.outputSubscribers[item.key]?.unsubscribe()
        }
      })
    }

    this.componentData = content
  }

  markAsDirty(): void {
    this.componentRef.injector.get(ChangeDetectorRef).markForCheck()
  }

  setInputs(inputs: Record<string, unknown>) {
    for (const prop in inputs) {
      this.setInput(prop, inputs[prop])
    }
  }

  unsubscribeOutputs(): void {
    for (const prop in this.outputSubscribers) {
      this.outputSubscribers[prop]?.unsubscribe()
      delete this.outputSubscribers[prop]
    }
  }

  setOutputs(outputs: Record<string, Function>) {
    this.unsubscribeOutputs()
    for (const prop in outputs) {
      const instance = this.componentRef.instance
      const output = instance[prop as keyof typeof instance]
      if (output && output instanceof OutputEmitterRef) {
        this.outputSubscribers[prop] = output.subscribe(value => {
          const outputCallback = outputs[prop]
          ;(outputCallback as (...args: any[]) => void)(value)
        })
      }
    }
  }

  setInput(key: string, value: unknown) {
    if (this.componentData.allowedInputNames.includes(key)) {
      this.componentRef.setInput(key, value)
    }
  }
}
