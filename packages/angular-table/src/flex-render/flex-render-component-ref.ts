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

    const inputDiff = this.diffInputs(content)
    if (inputDiff) {
      inputDiff.forEachAddedItem(item =>
        this.setInput(item.key, item.currentValue)
      )
      inputDiff.forEachChangedItem(item =>
        this.setInput(item.key, item.currentValue)
      )
      inputDiff.forEachRemovedItem(item => this.setInput(item.key, undefined))
    }

    const outputDiff = this.diffOutputs(content)
    if (outputDiff) {
      outputDiff.forEachAddedItem(item => {
        this.setOutput(item.currentValue, value => {
          const outputCallback =
            content.outputs?.[item.key as keyof typeof content.outputs]
          ;(outputCallback as (...args: any[]) => void)(value)
        })
      })
      outputDiff.forEachRemovedItem(item => {
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
      this.unsubscribeOutput(prop)
    }
  }

  unsubscribeOutput(prop: string) {
    if (prop in this.outputSubscribers) {
      this.outputSubscribers[prop]?.unsubscribe()
      delete this.outputSubscribers[prop]
    }
  }

  setOutputs(outputs: Record<string, Function>) {
    this.unsubscribeOutputs()
    for (const prop in outputs) {
      this.setOutput(prop, value => {
        const outputEmitter = outputs[prop]
        ;(outputEmitter as (...args: any[]) => void)(value)
      })
    }
  }

  setOutput(outputName: string, emitter: OutputEmitterRef<any>['emit']): void {
    if (!this.componentData.allowedOutputNames.includes(outputName)) {
      return
    }
    const instance = this.componentRef.instance
    const output = instance[outputName as keyof typeof instance]
    if (output && output instanceof OutputEmitterRef) {
      this.outputSubscribers[outputName] = output.subscribe(value => {
        emitter(value)
      })
    }
  }

  setInput(key: string, value: unknown) {
    if (this.componentData.allowedInputNames.includes(key)) {
      this.componentRef.setInput(key, value)
    }
  }
}
