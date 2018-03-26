/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import {SimpleChange} from '../change_detection/change_detection_util';
import {ChangeDetectionStrategy} from '../change_detection/constants';
import {PipeTransform} from '../change_detection/pipe_transform';
import {Provider} from '../core';
import {OnChanges, SimpleChanges} from '../metadata/lifecycle_hooks';
import {RendererType2} from '../render/api';
import {Type} from '../type';
import {resolveRendererType2} from '../view/util';

import {diPublic} from './di';
import {ComponentDef, ComponentDefFeature, ComponentTemplate, DirectiveDef, DirectiveDefFeature, DirectiveDefListOrFactory, PipeDef} from './interfaces/definition';
import {CssSelector} from './interfaces/projection';



/**
 * Create a component definition object.
 *
 *
 * # Example
 * ```
 * class MyDirective {
 *   // Generated by Angular Template Compiler
 *   // [Symbol] syntax will not be supported by TypeScript until v2.7
 *   static ngComponentDef = defineComponent({
 *     ...
 *   });
 * }
 * ```
 */
export function defineComponent<T>(componentDefinition: {
  /**
   * Directive type, needed to configure the injector.
   */
  type: Type<T>;

  /** The selector that will be used to match nodes to this component. */
  selector: CssSelector;

  /**
   * Factory method used to create an instance of directive.
   */
  factory: () => T | ({0: T} & any[]); /* trying to say T | [T, ...any] */

  /**
   * Static attributes to set on host element.
   *
   * Even indices: attribute name
   * Odd indices: attribute value
   */
  attributes?: string[];

  /**
   * A map of input names.
   *
   * The format is in: `{[actualPropertyName: string]:string}`.
   *
   * Which the minifier may translate to: `{[minifiedPropertyName: string]:string}`.
   *
   * This allows the render to re-construct the minified and non-minified names
   * of properties.
   */
  inputs?: {[P in keyof T]?: string};

  /**
   * A map of output names.
   *
   * The format is in: `{[actualPropertyName: string]:string}`.
   *
   * Which the minifier may translate to: `{[minifiedPropertyName: string]:string}`.
   *
   * This allows the render to re-construct the minified and non-minified names
   * of properties.
   */
  outputs?: {[P in keyof T]?: string};

  /**
   * Function executed by the parent template to allow child directive to apply host bindings.
   */
  hostBindings?: (directiveIndex: number, elementIndex: number) => void;

  /**
   * Defines the name that can be used in the template to assign this directive to a variable.
   *
   * See: {@link Directive.exportAs}
   */
  exportAs?: string;

  /**
   * Template function use for rendering DOM.
   *
   * This function has following structure.
   *
   * ```
   * function Template<T>(ctx:T, creationMode: boolean) {
   *   if (creationMode) {
   *     // Contains creation mode instructions.
   *   }
   *   // Contains binding update instructions
   * }
   * ```
   *
   * Common instructions are:
   * Creation mode instructions:
   *  - `elementStart`, `elementEnd`
   *  - `text`
   *  - `container`
   *  - `listener`
   *
   * Binding update instructions:
   * - `bind`
   * - `elementAttribute`
   * - `elementProperty`
   * - `elementClass`
   * - `elementStyle`
   *
   */
  template: ComponentTemplate<T>;

  /**
   * A list of optional features to apply.
   *
   * See: {@link NgOnChangesFeature}, {@link PublicFeature}
   */
  features?: ComponentDefFeature[];

  rendererType?: RendererType2;

  changeDetection?: ChangeDetectionStrategy;

  /**
   * Defines the set of injectable objects that are visible to a Directive and its light DOM
   * children.
   */
  providers?: Provider[];

  /**
   * Defines the set of injectable objects that are visible to its view DOM children.
   */
  viewProviders?: Provider[];

  /**
   * Registry of directives and components that may be found in this component's view.
   *
   * The property is either an array of `DirectiveDef`s or a function which returns the array of
   * `DirectiveDef`s. The function is necessary to be able to support forward declarations.
   */
  directiveDefs?: DirectiveDefListOrFactory | null;
}): ComponentDef<T> {
  const type = componentDefinition.type;
  const def = <ComponentDef<any>>{
    type: type,
    diPublic: null,
    factory: componentDefinition.factory,
    template: componentDefinition.template || null !,
    hostBindings: componentDefinition.hostBindings || null,
    attributes: componentDefinition.attributes || null,
    inputs: invertObject(componentDefinition.inputs),
    outputs: invertObject(componentDefinition.outputs),
    rendererType: resolveRendererType2(componentDefinition.rendererType) || null,
    exportAs: componentDefinition.exportAs,
    onInit: type.prototype.ngOnInit || null,
    doCheck: type.prototype.ngDoCheck || null,
    afterContentInit: type.prototype.ngAfterContentInit || null,
    afterContentChecked: type.prototype.ngAfterContentChecked || null,
    afterViewInit: type.prototype.ngAfterViewInit || null,
    afterViewChecked: type.prototype.ngAfterViewChecked || null,
    onDestroy: type.prototype.ngOnDestroy || null,
    onPush: componentDefinition.changeDetection === ChangeDetectionStrategy.OnPush,
    directiveDefs: componentDefinition.directiveDefs || null,
    selector: componentDefinition.selector
  };
  const feature = componentDefinition.features;
  feature && feature.forEach((fn) => fn(def));
  return def;
}


const PRIVATE_PREFIX = '__ngOnChanges_';

type OnChangesExpando = OnChanges & {
  __ngOnChanges_: SimpleChanges|null|undefined;
  [key: string]: any;
};

/**
 * Creates an NgOnChangesFeature function for a component's features list.
 *
 * It accepts an optional map of minified input property names to original property names,
 * if any input properties have a public alias.
 *
 * The NgOnChangesFeature function that is returned decorates a component with support for
 * the ngOnChanges lifecycle hook, so it should be included in any component that implements
 * that hook.
 *
 * Example usage:
 *
 * ```
 * static ngComponentDef = defineComponent({
 *   ...
 *   inputs: {name: 'publicName'},
 *   features: [NgOnChangesFeature({name: 'name'})]
 * });
 * ```
 *
 * @param inputPropertyNames Map of input property names, if they are aliased
 * @returns DirectiveDefFeature
 */
export function NgOnChangesFeature(inputPropertyNames?: {[key: string]: string}):
    DirectiveDefFeature {
  return function(definition: DirectiveDef<any>): void {
    const inputs = definition.inputs;
    const proto = definition.type.prototype;
    // Place where we will store SimpleChanges if there is a change
    Object.defineProperty(proto, PRIVATE_PREFIX, {value: undefined, writable: true});
    for (let pubKey in inputs) {
      const minKey = inputs[pubKey];
      const propertyName = inputPropertyNames && inputPropertyNames[minKey] || pubKey;
      const privateMinKey = PRIVATE_PREFIX + minKey;
      // Create a place where the actual value will be stored and make it non-enumerable
      Object.defineProperty(proto, privateMinKey, {value: undefined, writable: true});

      const existingDesc = Object.getOwnPropertyDescriptor(proto, minKey);

      // create a getter and setter for property
      Object.defineProperty(proto, minKey, {
        get: function(this: OnChangesExpando) {
          return (existingDesc && existingDesc.get) ? existingDesc.get.call(this) :
                                                      this[privateMinKey];
        },
        set: function(this: OnChangesExpando, value: any) {
          let simpleChanges = this[PRIVATE_PREFIX];
          let isFirstChange = simpleChanges === undefined;
          if (simpleChanges == null) {
            simpleChanges = this[PRIVATE_PREFIX] = {};
          }
          simpleChanges[propertyName] = new SimpleChange(this[privateMinKey], value, isFirstChange);
          (existingDesc && existingDesc.set) ? existingDesc.set.call(this, value) :
                                               this[privateMinKey] = value;
        }
      });
    }

    // If an onInit hook is defined, it will need to wrap the ngOnChanges call
    // so the call order is changes-init-check in creation mode. In subsequent
    // change detection runs, only the check wrapper will be called.
    if (definition.onInit != null) {
      definition.onInit = onChangesWrapper(definition.onInit);
    }

    definition.doCheck = onChangesWrapper(definition.doCheck);
  };

  function onChangesWrapper(delegateHook: (() => void) | null) {
    return function(this: OnChangesExpando) {
      let simpleChanges = this[PRIVATE_PREFIX];
      if (simpleChanges != null) {
        this.ngOnChanges(simpleChanges);
        this[PRIVATE_PREFIX] = null;
      }
      delegateHook && delegateHook.apply(this);
    };
  }
}


export function PublicFeature<T>(definition: DirectiveDef<T>) {
  definition.diPublic = diPublic;
}

const EMPTY = {};

/** Swaps the keys and values of an object. */
function invertObject(obj: any): any {
  if (obj == null) return EMPTY;
  const newObj: any = {};
  for (let minifiedKey in obj) {
    newObj[obj[minifiedKey]] = minifiedKey;
  }
  return newObj;
}

/**
 * Create a directive definition object.
 *
 * # Example
 * ```
 * class MyDirective {
 *   // Generated by Angular Template Compiler
 *   // [Symbol] syntax will not be supported by TypeScript until v2.7
 *   static ngDirectiveDef = defineDirective({
 *     ...
 *   });
 * }
 * ```
 */
export const defineDirective = defineComponent as any as<T>(directiveDefinition: {
  /**
   * Directive type, needed to configure the injector.
   */
  type: Type<T>;

  /** The selector that will be used to match nodes to this directive. */
  selector: CssSelector;

  /**
   * Factory method used to create an instance of directive.
   */
  factory: () => T | ({0: T} & any[]); /* trying to say T | [T, ...any] */

  /**
   * Static attributes to set on host element.
   *
   * Even indices: attribute name
   * Odd indices: attribute value
   */
  attributes?: string[];

  /**
   * A map of input names.
   *
   * The format is in: `{[actualPropertyName: string]:string}`.
   *
   * Which the minifier may translate to: `{[minifiedPropertyName: string]:string}`.
   *
   * This allows the render to re-construct the minified and non-minified names
   * of properties.
   */
  inputs?: {[P in keyof T]?: string};

  /**
   * A map of output names.
   *
   * The format is in: `{[actualPropertyName: string]:string}`.
   *
   * Which the minifier may translate to: `{[minifiedPropertyName: string]:string}`.
   *
   * This allows the render to re-construct the minified and non-minified names
   * of properties.
   */
  outputs?: {[P in keyof T]?: string};

  /**
   * A list of optional features to apply.
   *
   * See: {@link NgOnChangesFeature}, {@link PublicFeature}
   */
  features?: DirectiveDefFeature[];

  /**
   * Function executed by the parent template to allow child directive to apply host bindings.
   */
  hostBindings?: (directiveIndex: number, elementIndex: number) => void;

  /**
   * Defines the name that can be used in the template to assign this directive to a variable.
   *
   * See: {@link Directive.exportAs}
   */
  exportAs?: string;
}) => DirectiveDef<T>;

/**
 * Create a pipe definition object.
 *
 * # Example
 * ```
 * class MyPipe implements PipeTransform {
 *   // Generated by Angular Template Compiler
 *   static ngPipeDef = definePipe({
 *     ...
 *   });
 * }
 * ```
 * @param type Pipe class reference. Needed to extract pipe lifecycle hooks.
 * @param factory A factory for creating a pipe instance.
 * @param pure Whether the pipe is pure.
 */
export function definePipe<T>(
    {type, factory, pure}: {type: Type<T>, factory: () => T, pure?: boolean}): PipeDef<T> {
  return <PipeDef<T>>{
    n: factory,
    pure: pure !== false,
    onDestroy: type.prototype.ngOnDestroy || null
  };
}
