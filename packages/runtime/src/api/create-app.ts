import type {
  App as VueApp,
  Component,
  ComponentOptions,
  ComponentPublicInstance,
  Directive,
  InjectionKey,
  Plugin,
} from "vue";
import { createApp as createDevApp } from "../dev/create-app.ts";
import type { RootProps } from "../session/session.ts";
import type { MountOptions } from "./mount-options.ts";

type ConsumerVuePrivateAppKey = Extract<keyof VueApp<unknown>, `_${string}`>;
type ConsumerVueFluentAppKey = "use" | "mixin" | "component" | "directive" | "provide" | "filter";
type ConsumerVuePublicAppSurface = Omit<
  VueApp<unknown>,
  ConsumerVuePrivateAppKey | ConsumerVueFluentAppKey | "mount"
>;
type ConsumerVueCompatFilter = Parameters<NonNullable<VueApp<unknown>["filter"]>>[1];

/**
 * A Vue application whose mount target is a terminal host.
 *
 * The ordinary public Vue application surface comes from the consumer's
 * installed Vue version. Runtime replaces Vue's DOM-oriented `mount()` and
 * excludes underscore-prefixed renderer internals.
 */
export interface TuiApp extends ConsumerVuePublicAppSurface {
  use<Options extends unknown[]>(plugin: Plugin<Options>, ...options: NoInfer<Options>): this;
  use<Options>(plugin: Plugin<Options>, options: NoInfer<Options>): this;
  mixin(mixin: ComponentOptions): this;
  component(name: string): Component | undefined;
  component<T extends Component>(name: string, component: T): this;
  directive<T = unknown, V = unknown>(name: string): Directive<T, V> | undefined;
  directive<T = unknown, V = unknown>(name: string, directive: Directive<T, V>): this;
  provide<T, K = InjectionKey<T> | string | number>(
    key: K,
    value: K extends InjectionKey<infer V> ? V : T,
  ): this;
  filter?(name: string): ConsumerVueCompatFilter | undefined;
  filter?(name: string, filter: ConsumerVueCompatFilter): this;
  mount(options?: MountOptions): ComponentPublicInstance;
  waitUntilExit(): Promise<void>;
  waitUntilRenderFlush(): Promise<void>;
}

/** Create a terminal app with the stable public mount-options contract. */
export function createApp(root: Component, rootProps?: RootProps | null): TuiApp {
  return createDevApp(root, rootProps) as TuiApp;
}
