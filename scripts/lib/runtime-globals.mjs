import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import vm from 'node:vm';

const root = fileURLToPath(new URL('../..', import.meta.url));

export function loadRuntime(files, globals = {}) {
    const context = vm.createContext({ console, window: {}, ...globals });

    for (const file of files) {
        vm.runInContext(readFileSync(join(root, file), 'utf8'), context, { filename: file });
    }

    return context;
}

export function setRuntimeGlobal(context, name, value) {
    context.__runtimeValue = value;
    vm.runInContext(`${name} = __runtimeValue`, context);
    delete context.__runtimeValue;
}

export function callRuntime(context, expression) {
    return vm.runInContext(expression, context);
}
