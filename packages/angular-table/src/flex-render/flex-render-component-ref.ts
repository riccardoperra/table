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
  #inputValueDiffer: KeyValueDiffer<string, unknown>
  #outputValueDiffer: KeyValueDiffer<
    string,
    undefined | ((...args: any[]) => void)
  >

  readonly #outputSubscribers: Record<string, OutputRefSubscription> = {}
  readonly #outputCallbacks: Record<string, (...args: any[]) => void> = {}

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
   * Get component input and output diff by the given item
   */
  diff(item: FlexRenderComponent<T>) {
    return {
      inputDiff: this.#inputValueDiffer.diff(item.inputs ?? {}),
      outputDiff: this.#outputValueDiffer.diff(item.outputs ?? {}),
    }
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
    const { inputDiff, outputDiff } = this.diff(content)
    if (inputDiff) {
      inputDiff.forEachAddedItem(item =>
        this.setInput(item.key, item.currentValue)
      )
      inputDiff.forEachChangedItem(item =>
        this.setInput(item.key, item.currentValue)
      )
      inputDiff.forEachRemovedItem(item => this.setInput(item.key, undefined))
    }
    if (outputDiff) {
      outputDiff.forEachAddedItem(item => {
        this.setOutput(item.key, item.currentValue)
      })
      outputDiff.forEachChangedItem(item => {
        if (item.currentValue) {
          this.#outputCallbacks[item.key] = item.currentValue
        } else {
          this.unsubscribeOutput(item.key)
        }
      })
      outputDiff.forEachRemovedItem(item => {
        this.unsubscribeOutput(item.key)
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
    for (const prop in this.#outputSubscribers) {
      this.unsubscribeOutput(prop)
    }
  }

  unsubscribeOutput(prop: string) {
    if (prop in this.#outputSubscribers) {
      this.#outputSubscribers[prop]?.unsubscribe()
      delete this.#outputSubscribers[prop]
      delete this.#outputCallbacks[prop]
    }
  }

  setOutputs(outputs: Record<string, Function>) {
    this.unsubscribeOutputs()
    for (const prop in outputs) {
      this.setOutput(prop, outputs[prop] as (...args: any[]) => void)
    }
  }

  setInput(key: string, value: unknown) {
    if (this.componentData.allowedInputNames.includes(key)) {
      this.componentRef.setInput(key, value)
    }
  }

  setOutput(
    outputName: string,
    emit: OutputEmitterRef<any>['emit'] | undefined | null
  ): void {
    if (!this.componentData.allowedOutputNames.includes(outputName)) {
      return
    }
    if (!emit) {
      this.unsubscribeOutput(outputName)
      return
    }
    this.#outputCallbacks[outputName] = emit

    if (outputName in this.#outputSubscribers) {
      return
    }
    const instance = this.componentRef.instance
    const output = instance[outputName as keyof typeof instance]
    if (output && output instanceof OutputEmitterRef) {
      this.#outputSubscribers[outputName] = output.subscribe(value =>
        this.#outputCallbacks[outputName]?.(value)
      )
    }
  }
}
