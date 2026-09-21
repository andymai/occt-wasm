// Post-link script: adds Symbol.dispose support to all Embind classes.
// Injected via --post-js during Emscripten linking.
// Enables TC39 Explicit Resource Management: `using shape = kernel.makeBox(...)`

if (typeof Symbol !== "undefined" && Symbol.dispose) {
    const proto = Module["__proto__"] || Object.getPrototypeOf(Module);
    // Patch all Embind-registered classes to support Symbol.dispose
    for (const key of Object.getOwnPropertyNames(Module)) {
        const val = Module[key];
        if (
            typeof val === "function" &&
            val.prototype &&
            typeof val.prototype.delete === "function" &&
            !val.prototype[Symbol.dispose]
        ) {
            val.prototype[Symbol.dispose] = function () {
                if (!this.isDeleted()) {
                    this.delete();
                }
            };
        }
    }
}
