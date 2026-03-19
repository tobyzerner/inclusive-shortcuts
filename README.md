# Inclusive Shortcuts

**Accessible, DOM-driven keyboard shortcuts for web apps.**

`inclusive-shortcuts` is for apps that want more than a flat keybinding callback map. It lets you define shortcuts once, resolve them against real DOM targets, scope them to the active part of the interface, and layer in richer behavior like keyboard selection and inline shortcut labels.

-   **🌐 DOM-first.** Shortcuts resolve against targets in your markup.
-   **🎯 Scopes.** Reuse the same shortcut IDs across `form`, `editor`, `surface`, or other local contexts.
-   **🗂️ Selection.** Add keyboard selection for lists and other item-based interfaces.
-   **⌨️ Sequence-friendly.** Support bindings like `g h`.
-   **🦮 Accessible.** Dynamically sync `aria-keyshortcuts` and visible labels from the same shortcut definitions.
-   **🧩 Extensible.** Use plugins and lifecycle hooks for labels, ARIA sync, and app-specific runtime behavior.

[**Demo**](https://tobyzerner.github.io/inclusive-shortcuts/index.html)

## Installation

```sh
npm install inclusive-shortcuts
```

## Quick Start

```ts
import {
    createAriaPlugin,
    createLabelsPlugin,
    createSelectionPlugin,
    createShortcuts,
} from 'inclusive-shortcuts';

const selection = createSelectionPlugin();

const runtime = createShortcuts({
    shortcuts: [
        {
            id: 'navigation.home',
            keys: ['g h'],
        },
        {
            id: 'form.submit',
            keys: ['Control+Enter'],
            scopes: ['form'],
        },
        {
            id: 'selection.next',
            keys: ['j'],
            handle: () => selection.next(),
        },
        {
            id: 'selection.previous',
            keys: ['k'],
            handle: () => selection.previous(),
        },
        {
            id: 'selection.edit',
            keys: ['e'],
            scopes: ['selection'],
        },
    ],
    plugins: [selection, createAriaPlugin(), createLabelsPlugin()],
});

runtime.connect();
```

```html
<a href="/" data-shortcut-trigger="navigation.home">Home</a>

<ul>
    <li data-shortcut-selection-key="post_1">
        <button data-shortcut-trigger="selection.edit">
            Edit post
            <kbd data-shortcut-label="selection.edit" aria-hidden="true"></kbd>
        </button>
    </li>

    <li data-shortcut-selection-key="post_2">
        <button data-shortcut-trigger="selection.edit">
            Edit post
            <kbd data-shortcut-label="selection.edit" aria-hidden="true"></kbd>
        </button>
    </li>
</ul>

<form data-shortcut-scope="form">
    <textarea></textarea>

    <button type="submit" data-shortcut-trigger="form.submit">
        Publish
        <kbd data-shortcut-label="form.submit" aria-hidden="true"></kbd>
    </button>
</form>
```

## Usage

`inclusive-shortcuts` combines two sources of truth:

-   shortcut definitions in JavaScript
-   declarative targets and state in the DOM

You define shortcuts once in JavaScript, then mark up the DOM with the elements those shortcuts should resolve to. At runtime, the library uses the shortcut `id`, current focus, active scopes, and optional context hints to find the right target in the active part of the interface. When the keys are pressed, that target is activated.

The core runtime is created with `createShortcuts(options: ShortcutOptions): Shortcuts`.

-   `shortcuts: Shortcut[]` registers your shortcut definitions
-   `root?: HTMLElement` limits resolution and plugin behavior to a subtree, and defaults to `document.body`
-   `plugins?: ShortcutPlugin[]` adds optional behavior such as selection, labels, and ARIA sync

The returned runtime exposes:

-   `connect(): void` to start listening for shortcuts
-   `disconnect(): void` to stop listening and clean up plugins
-   `refresh(): void` to resync after your app adds, removes, hides, or moves shortcut targets, scopes, labels, or selection items

### Shortcut Triggers

The simplest pattern is:

-   define a shortcut with an `id`
-   add `data-shortcut-trigger="<id>"` to the element it should activate

When the shortcut keys are pressed, the runtime activates (clicks or focuses) the matching trigger for you.

Each shortcut definition has this shape:

-   `id: string` stable shortcut identity
-   `keys: string[]` one or more bindings using [`tinykeys`](https://github.com/jamiebuilds/tinykeys) syntax
-   `scopes?: string[]` optional scopes
-   `handle?: (context: ShortcutContext) => boolean | void` optional custom handler

Some common bindings:

-   `'k'` for a single key
-   `'Control+Enter'` for a modified key
-   `'Shift+?'` for shifted punctuation
-   `'g h'` for a key sequence
-   `'$mod+Enter'` for Command on macOS and Control elsewhere

```html
<button data-shortcut-trigger="search">Search</button>
```

```ts
{
    id: 'search',
    keys: ['/'],
}
```

### Custom Handlers

You can define a `handle(context)` callback when a shortcut should run custom JavaScript instead of the default DOM activation, or when it should do custom work before that default behavior.

In practice, this is most useful for shortcuts that move selection, open custom UI, or coordinate state before falling back to the DOM.

`handle(context)` receives:

-   `shortcut`: the matched shortcut definition
-   `target`: the resolved DOM target, when one was found
-   `state`: the current runtime shortcut state, including `root`, `activeElement`, and active scopes
-   `host`: the runtime instance

Return:

-   `true` to mark the shortcut handled
-   `false` to stop shortcut handling and allow native browser behavior
-   no return value to continue through plugins and default target activation

```ts
{
    id: 'debug.shortcut',
    keys: ['Control+K'],
    handle: ({ shortcut, target, state, host }) => {
        console.log('Handling shortcut:', shortcut.id);
        console.log('Resolved target:', target);
        console.log('Active element:', state.activeElement);
        console.log('Runtime root:', host.root);

        return true;
    },
}
```

### Scopes

Scopes let the same shortcut `id` resolve differently depending on where focus is.

-   Add `data-shortcut-scope="<scope>"` to a subtree.
-   Add `scopes: ['<scope>']` to the shortcut definition.

When focus is inside that subtree, the runtime prefers triggers inside the matching scope. If a shortcut has no `scopes`, it resolves globally from the configured runtime root.

```html
<form data-shortcut-scope="form">
    <label>Title <input /></label>
    <button data-shortcut-trigger="form.submit">Publish</button>
</form>
```

```ts
{
    id: 'form.submit',
    keys: ['Control+Enter'],
    scopes: ['form'],
}
```

When focus is inside the form, `Control+Enter` resolves to the `Publish` button instead of any global trigger with the same `id`.

### Contexts

`data-shortcut-context` is a narrower hint within the current scope. When focus is inside a context container, shortcut resolution prefers matching triggers in that context before falling back to the rest of the allowed scope roots.

```html
<form data-shortcut-scope="form">
    <button data-shortcut-trigger="form.submit">Save Draft</button>

    <div data-shortcut-context>
        <label>Body <textarea></textarea></label>
        <button data-shortcut-trigger="form.submit">Publish</button>
    </div>
</form>
```

If focus is inside the textarea in the `data-shortcut-context` block, `Control+Enter` prefers the `Publish` button. Elsewhere in the same form scope, it prefers the first `form.submit` target which is `Save Draft`.

### Hidden Shortcut Resolution

Normally, shortcut resolution ignores hidden content. Add `data-shortcut-hidden` to a subtree when you want it to keep participating in shortcut resolution even while it is hidden.

This is useful for cases where a hidden region should still contribute shortcut targets or labels, without changing the normal visibility rules for the rest of the document. Inert subtrees are still excluded, even when they also have `data-shortcut-hidden`.

```html
<div hidden data-shortcut-hidden>
    <button data-shortcut-trigger="palette">
        Command palette
        <kbd data-shortcut-label="palette" aria-hidden="true"></kbd>
    </button>
</div>
```

```ts
{
    id: 'palette',
    keys: ['Control+K'],
}
```

### Selection

The selection plugin adds a layer for “current item” behavior in lists and similar interfaces. It lets `selection`-scoped shortcuts resolve against the current item, while movement shortcuts such as `j` and `k` can be implemented in JavaScript through the plugin API. It also announces the newly selected item to assistive technology when selection changes.

Create it with `createSelectionPlugin(options?: SelectionOptions): SelectionPlugin`.

Options:

-   `storageKey?: string` persists selection and visibility for the current page via `sessionStorage`
-   `onSelect?: (context: SelectionContext) => void` runs when selection changes
-   `onOverflow?: (context: SelectionOverflowContext) => boolean` handles `next()` or `previous()` at the ends of the list

```html
<ul>
    <li data-shortcut-selection-key="item_1">
        <button data-shortcut-trigger="selection.edit">Edit first item</button>
    </li>
    <li data-shortcut-selection-key="item_2">
        <button data-shortcut-trigger="selection.edit">Edit second item</button>
    </li>
</ul>
```

```ts
const selection = createSelectionPlugin();

const runtime = createShortcuts({
    shortcuts: [
        {
            id: 'selection.next',
            keys: ['j'],
            handle: () => selection.next(),
        },
        {
            id: 'selection.previous',
            keys: ['k'],
            handle: () => selection.previous(),
        },
        {
            id: 'selection.edit',
            keys: ['e'],
            scopes: ['selection'],
        },
    ],
    plugins: [selection],
});
```

The selection plugin exposes:

-   `items(): HTMLElement[]` to get visible selectable items
-   `selected(): HTMLElement | undefined` to get the current item
-   `reset(): boolean` to return to the default item and hide the selection marker
-   `show(): boolean` to reveal the current selection marker
-   `next(): boolean`, `previous(): boolean`, `first(): boolean`, and `last(): boolean` to move selection
-   `select(itemOrKey?: HTMLElement | string): boolean` to select without moving focus
-   `navigate(itemOrKey?: HTMLElement | string): boolean` to select, reveal, focus, and scroll the item into view

#### Primary Target

Add `data-shortcut-selection-primary` when a selectable item contains a specific element that should receive focus during selection navigation.

```html
<article data-shortcut-selection-key="item_1">
    <a href="#" data-shortcut-selection-primary>Open</a>
    <button data-shortcut-trigger="selection.edit">Edit</button>
</article>
```

When selection moves to that item, the plugin prefers to focus and announce the primary element instead of the item container itself.

#### Default Item

Add `data-shortcut-selection-default` to the item that should act as the fallback selection when nothing has been explicitly selected yet.

```html
<article data-shortcut-selection-key="item_1" data-shortcut-selection-default>
    <button data-shortcut-trigger="selection.edit">Edit</button>
</article>
```

This gives `selection`-scoped shortcuts a predictable starting point before the user has moved the selection.

#### Detached Controls

Add `data-shortcut-selection-owner="<key>"` when a related control sits outside the selectable item but should still resolve as belonging to it.

```html
<article data-shortcut-selection-key="item_1" data-shortcut-selection-default>
    <button data-shortcut-trigger="selection.edit">Edit</button>
</article>

<button
    data-shortcut-trigger="selection.archive"
    data-shortcut-selection-owner="item_1"
>
    Archive Item
</button>
```

Selection scrolling uses native `scrollIntoView()`. If your layout has a sticky header, use CSS such as `scroll-padding-top` on the scroll container or `scroll-margin-top` on selectable items.

Selection announcements come from the selected item's primary target when one is marked with `data-shortcut-selection-primary`, preferring its `aria-label` and then its text content. If there is no primary target, the plugin falls back to the item itself.

### Labels

The labels plugin renders the current primary binding into `data-shortcut-label` elements, so visible shortcut hints stay in sync with the same shortcut definitions used at runtime. Labels show and hide automatically as focus, scopes, contexts, or selection change.

Create it with `createLabelsPlugin(): ShortcutPlugin`.

-   `data-shortcut-label="<id>"` renders a visible label for that shortcut
-   when a shortcut has multiple bindings, labels render the first entry in `keys`
-   add `aria-hidden="true"` when the label is decorative inline UI rather than content meant to be announced

```html
<button data-shortcut-trigger="search">
    Search
    <kbd data-shortcut-label="search" aria-hidden="true"></kbd>
</button>
```

```ts
const runtime = createShortcuts({
    shortcuts: [
        {
            id: 'search',
            keys: ['/'],
        },
    ],
    plugins: [createLabelsPlugin()],
});
```

### ARIA Key Shortcuts

The ARIA plugin applies `aria-keyshortcuts` to currently resolved targets when a binding can be expressed in ARIA syntax, so assistive-technology metadata stays in sync with the same shortcut definitions. As focus, scopes, contexts, or selection change, the ARIA metadata moves with the currently resolved targets.

Create it with `createAriaPlugin(): ShortcutPlugin`.

```html
<button data-shortcut-trigger="search">
    Search
</button>
```

```ts
const runtime = createShortcuts({
    shortcuts: [
        {
            id: 'search',
            keys: ['/'],
        },
    ],
    plugins: [createAriaPlugin()],
});
```

## Extending

Plugins are plain objects passed into the runtime.

-   `connect?: (host: Shortcuts) => void | (() => void)` Runs when the runtime connects and may return a cleanup function that runs on disconnect.
-   `refresh?: (host: Shortcuts) => void` Rebuilds plugin state or updates plugin-owned DOM synchronously during `connect()` and `runtime.refresh()`.
-   `scopeRoots?: (context: ShortcutScopeRootsContext) => Iterable<{ scope: string; roots: ParentNode[] }>` Contributes additional roots for a named scope. This is useful for state-derived scopes such as the current selection.
-   `resolveTarget?: (context: ShortcutResolveTargetContext) => HTMLElement | null | void` Returns an `HTMLElement` to override target resolution, `null` to suppress default activation, or no return value to defer to the next plugin or the built-in resolver.
-   `beforeShortcut?: (context: ShortcutBeforeContext) => false | void` Returns `false` to cancel the shortcut before any handler runs, or no return value to continue.
-   `handleShortcut?: (context: ShortcutContext) => boolean | void` Returns `true` to mark the shortcut handled, `false` to stop shortcut handling and allow native browser behavior, or no return value to continue.
-   `afterShortcut?: (context: ShortcutContext) => void` Runs after a shortcut has been handled, whether by a shortcut handler, plugin, or default target activation.

`ShortcutContext` for `handleShortcut` and `afterShortcut` includes `shortcut`, `target`, `state`, and `host`.

The `host` passed to plugin hooks exposes:

-   `root`
-   `shortcuts`
-   `resolveTarget(shortcut, activeElement?)`

Hook order is:

-   `beforeShortcut`
-   target resolution
-   shortcut `handle(context)`
-   plugin `handleShortcut(context)`
-   default target activation
-   `afterShortcut`

## Contributing

Pull requests are welcome. For major changes, please open an issue first to discuss what you would like to change.

## License

[MIT](LICENSE)
