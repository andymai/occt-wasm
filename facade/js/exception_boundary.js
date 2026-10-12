// Pre-link script: lets every Embind call be made again after it throws.
// Injected via --pre-js, so it wraps each invoker as Embind registers it.
//
// A C++ exception that escapes to JS unwinds wasm frames without running their
// epilogues, so the shadow stack pointer stays where the throw left it. With no
// C++ catch to end it, the exception object is never freed, and Embind frees an
// argument's wire value (a std::string's heap copy) only after a normal return.
// Every caught failure would cost stack until the stack ran into static data
// (#400), and heap on top. So each invoker restores the stack pointer when it
// throws, and on a C++ exception frees the argument copies and swaps the
// exception for an Error carrying its what(), freeing the original.
// https://emscripten.org/docs/porting/exceptions.html#handling-c-exceptions-from-javascript

{
    let depth = 0;
    // (type, wireValue) pairs for argument conversions inside guarded calls,
    // innermost call last.
    const wireValues = [];
    const tracked = new WeakSet();

    const trackWireValues = (type) => {
        if (!type?.destructorFunction || tracked.has(type)) return;
        tracked.add(type);
        const toWireType = type.toWireType;
        type.toWireType = function (destructors, value) {
            const wire = toWireType.call(this, destructors, value);
            if (depth) wireValues.push(this, wire);
            return wire;
        };
    };

    // Only a C++ exception is known to have skipped Embind's cleanup: a JS
    // error may come from converting the return value, after the arguments
    // were already freed, and a trap leaves the heap in no state to free into.
    const toError = (e, base) => {
        if (!(e instanceof WebAssembly.Exception)) return e;
        let type, message;
        try {
            [type, message] = getExceptionMessage(e);
        } catch {
            return e;
        }
        decrementExceptionRefcount(e);
        for (let i = base; i < wireValues.length; i += 2) {
            wireValues[i].destructorFunction(wireValues[i + 1]);
        }
        return new Error(message ?? type);
    };

    const craft = craftInvokerFunction;
    craftInvokerFunction = (humanName, argTypes, ...rest) => {
        argTypes.slice(2).forEach(trackWireValues);
        const invoker = craft(humanName, argTypes, ...rest);
        return function (...args) {
            const sp = stackSave();
            const base = wireValues.length;
            depth++;
            try {
                return invoker.apply(this, args);
            } catch (e) {
                stackRestore(sp);
                throw toError(e, base);
            } finally {
                depth--;
                // Writing length unconditionally costs more than the rest of
                // this wrapper on a cheap call.
                if (wireValues.length !== base) wireValues.length = base;
            }
        };
    };
}
