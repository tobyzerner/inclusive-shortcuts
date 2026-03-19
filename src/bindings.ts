import {
    matchKeyBindingPress,
    parseKeybinding,
    type KeyBindingPress,
} from 'tinykeys';
import type { Shortcut } from './core';
import { isEditableTarget } from './dom';

const BINDING_MODIFIER_ORDER = ['Alt', 'Control', 'Meta', 'Shift'];

export type Binding = {
    presses: KeyBindingPress[];
    shortcuts: Shortcut[];
};

export function bindings(shortcuts: Iterable<Shortcut>): Binding[] {
    const bindings: Binding[] = [];

    for (const shortcut of shortcuts) {
        for (const binding of shortcut.keys) {
            const presses = parseKeybinding(binding.trim());
            const existingBinding = bindings.find((binding) =>
                keyBindingSequencesEqual(binding.presses, presses)
            );

            if (existingBinding) {
                existingBinding.shortcuts.push(shortcut);
                continue;
            }

            bindings.push({ shortcuts: [shortcut], presses });
        }
    }

    return bindings;
}

export function matchBindings(
    e: KeyboardEvent,
    bindings: Binding[],
    pressIndex = 0
): Binding[] {
    return bindings.filter(
        (binding) =>
            matchKeyBindingPress(e, binding.presses[pressIndex]) &&
            !ignoreCharacterShortcutInEditableTarget(
                binding.presses[pressIndex],
                e
            )
    );
}

export function splitBindingsByPressCount(
    bindings: Binding[],
    pressCount: number
): {
    completedBindings: Binding[];
    continuedBindings: Binding[];
} {
    const completedBindings: Binding[] = [];
    const continuedBindings: Binding[] = [];

    for (const binding of bindings) {
        if (binding.presses.length === pressCount) {
            completedBindings.push(binding);
            continue;
        }

        if (binding.presses.length > pressCount) {
            continuedBindings.push(binding);
        }
    }

    return {
        completedBindings,
        continuedBindings,
    };
}

export function isModifierOnlyKey(e: KeyboardEvent): boolean {
    return ['Shift', 'Meta', 'Alt', 'Control'].includes(e.key);
}

function keyBindingSequencesEqual(
    left: KeyBindingPress[],
    right: KeyBindingPress[]
): boolean {
    return (
        left.length === right.length &&
        left.every((press, index) =>
            keyBindingPressesEqual(press, right[index])
        )
    );
}

function ignoreCharacterShortcutInEditableTarget(
    [, key]: KeyBindingPress,
    e: KeyboardEvent
): boolean {
    if (!isEditableTarget(e.target)) {
        return false;
    }

    if (key instanceof RegExp || key.length !== 1) {
        return false;
    }

    return e.getModifierState('AltGraph') || (!e.metaKey && !e.ctrlKey);
}

function keyBindingPressesEqual(
    [leftMods, leftKey]: KeyBindingPress,
    [rightMods, rightKey]: KeyBindingPress
): boolean {
    return (
        keyBindingPartsEqual(leftKey, rightKey) &&
        keyBindingModifiersEqual(leftMods, rightMods)
    );
}

function keyBindingPartsEqual(
    left: KeyBindingPress[1],
    right: KeyBindingPress[1]
) {
    if (left instanceof RegExp || right instanceof RegExp) {
        return (
            left instanceof RegExp &&
            right instanceof RegExp &&
            left.source === right.source &&
            left.flags === right.flags
        );
    }

    return left === right;
}

function keyBindingModifiersEqual(left: string[], right: string[]): boolean {
    const normalizedLeft = [...left].sort(compareBindingModifiers);
    const normalizedRight = [...right].sort(compareBindingModifiers);

    return (
        normalizedLeft.length === normalizedRight.length &&
        normalizedLeft.every(
            (modifier, index) => modifier === normalizedRight[index]
        )
    );
}

function compareBindingModifiers(left: string, right: string): number {
    const unknownRank = BINDING_MODIFIER_ORDER.length;
    const leftRank = BINDING_MODIFIER_ORDER.indexOf(left);
    const rightRank = BINDING_MODIFIER_ORDER.indexOf(right);

    return (
        (leftRank === -1 ? unknownRank : leftRank) -
            (rightRank === -1 ? unknownRank : rightRank) ||
        left.localeCompare(right)
    );
}
