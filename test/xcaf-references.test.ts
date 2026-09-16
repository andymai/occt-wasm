/**
 * Walking an XCAF assembly through its references: a component label is a
 * placed reference to a prototype label, and only the prototype carries the
 * part's name, sub-shapes and children. Exercises getReferredLabel,
 * getLocation, getSubShapes and addSubShape on the XCAFDocument wrapper,
 * both in memory and across a STEP round trip.
 */
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let kernel: any;

beforeAll(async () => {
    const jsPath = resolve(__dirname, "../dist/occt-wasm.js");
    const wasmPath = resolve(__dirname, "../dist/occt-wasm.wasm");
    const createModule = (await import(jsPath)).default;
    const Module = await createModule({
        locateFile: (p: string) => (p.endsWith(".wasm") ? wasmPath : p),
    });
    const mod = await import(resolve(__dirname, "../ts/src/index.ts"));
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    kernel = new (mod.OcctKernel as any)(Module);
}, 30_000);

afterEach(() => kernel.releaseAll());
afterAll(() => kernel[Symbol.dispose]());

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0];

function buildAssembly() {
    const doc = kernel.createXCAFDocument();
    const housing = kernel.makeBox(20, 20, 20);
    const gear = kernel.makeCylinder(5, 10);
    const root = doc.addShape(housing, { name: "housing" });
    const comp = doc.addChild(root, gear, {
        name: "gear-1",
        location: { tx: 10, ty: 0, tz: 5 },
    });
    return { doc, root, comp, gear };
}

describe("XCAFDocument.getReferredLabel", () => {
    it("returns null for a part label and the prototype for a component", () => {
        const { doc, root, comp } = buildAssembly();
        expect(doc.getReferredLabel(root)).toBeNull();

        const proto = doc.getReferredLabel(comp);
        expect(proto).not.toBeNull();
        const info = doc.getLabelInfo(proto);
        expect(info.isComponent).toBe(false);
        expect(info.isAssembly).toBe(false);
        expect(doc.getReferredLabel(proto)).toBeNull();
        doc.close();
    });

    it("lets a walk continue past a component, which has no children itself", () => {
        const { doc, root, comp } = buildAssembly();
        expect(doc.getLabelInfo(comp).isComponent).toBe(true);
        expect(doc.getChildren(comp)).toEqual([]);

        const proto = doc.getReferredLabel(comp)!;
        doc.setName(proto, "gear");
        expect(doc.getLabelInfo(proto).name).toBe("gear");
        expect(doc.getLabelInfo(comp).name).toBe("gear-1");
        // The housing's own box became the first component when it took a child.
        const children = doc.getChildren(root);
        expect(children).toHaveLength(2);
        expect(children[1]).toBe(comp);
        expect(doc.getLabelInfo(children[0]).isComponent).toBe(true);
        expect(doc.getLabelInfo(doc.getReferredLabel(children[0])!).name).toBe("housing");
        doc.close();
    });
});

describe("label tags are stable across reads", () => {
    it("returns the same tag for the same label on every call", () => {
        const { doc, root, comp } = buildAssembly();
        expect(doc.getRoots()).toEqual([root]);
        expect(doc.getRoots()).toEqual([root]);
        expect(doc.getChildren(root)).toEqual(doc.getChildren(root));
        expect(doc.getChildren(root)[1]).toBe(comp);
        const proto = doc.getReferredLabel(comp);
        expect(doc.getReferredLabel(comp)).toBe(proto);
        expect(doc.getReferredLabel(doc.getChildren(root)[1])).toBe(proto);
        doc.close();
    });
});

describe("XCAFDocument.getLocation", () => {
    it("is identity for a part and the placement for a component", () => {
        const { doc, root, comp } = buildAssembly();
        expect(doc.getLocation(root)).toEqual(IDENTITY);
        const m = doc.getLocation(comp);
        expect(m).toHaveLength(12);
        expect(m[3]).toBeCloseTo(10, 9);
        expect(m[7]).toBeCloseTo(0, 9);
        expect(m[11]).toBeCloseTo(5, 9);
        expect([m[0], m[5], m[10]]).toEqual([1, 1, 1]);
        doc.close();
    });

    it("applied to the prototype shape reproduces the component shape", () => {
        const { doc, comp } = buildAssembly();
        const proto = doc.getReferredLabel(comp)!;
        const placed = kernel.transform(doc.getLabelInfo(proto).shapeHandle, doc.getLocation(comp));
        const viaComponent = kernel.getBoundingBox(doc.getLabelInfo(comp).shapeHandle);
        const viaPrototype = kernel.getBoundingBox(placed);
        for (const k of ["xmin", "ymin", "zmin", "xmax", "ymax", "zmax"] as const) {
            expect(viaPrototype[k]).toBeCloseTo(viaComponent[k], 6);
        }
        expect(viaComponent.xmin).toBeCloseTo(5, 6);
        expect(viaComponent.zmax).toBeCloseTo(15, 6);
        doc.close();
    });
});

describe("XCAFDocument sub-shapes", () => {
    it("registers a face of a part with its own name and reads it back", () => {
        const doc = kernel.createXCAFDocument();
        const box = kernel.makeBox(10, 10, 10);
        const part = doc.addShape(box, { name: "block" });
        expect(doc.getSubShapes(part)).toEqual([]);

        const faces = kernel.getSubShapes(box, "face");
        const top = doc.addSubShape(part, faces[5], { name: "top", color: [1, 0, 0] });
        const subs = doc.getSubShapes(part);
        expect(subs).toHaveLength(1);
        const info = doc.getLabelInfo(subs[0]);
        expect(info.name).toBe("top");
        expect(info.hasColor).toBe(true);
        expect(info.color[0]).toBeCloseTo(1, 6);
        expect(kernel.getShapeType(info.shapeHandle)).toBe("face");
        expect(doc.getLabelInfo(top).name).toBe("top");
        doc.close();
    });

    it("rejects a shape that is not a sub-shape of the part", () => {
        const doc = kernel.createXCAFDocument();
        const part = doc.addShape(kernel.makeBox(10, 10, 10));
        const other = kernel.makeSphere(3);
        expect(() => doc.addSubShape(part, other)).toThrow(/sub-shape/);
        doc.close();
    });

    it("resolves a component to its prototype before reading sub-shapes", () => {
        const { doc, comp, gear } = buildAssembly();
        const proto = doc.getReferredLabel(comp)!;
        const faces = kernel.getSubShapes(gear, "face");
        doc.addSubShape(proto, faces[0], { name: "lateral" });
        expect(doc.getSubShapes(comp)).toEqual([]);
        expect(doc.getSubShapes(proto).map((l: number) => doc.getLabelInfo(l).name)).toEqual(["lateral"]);
        doc.close();
    });
});

describe("addShape with { assembly: true }", () => {
    it("decomposes a compound into placed references to prototype labels", () => {
        const doc = kernel.createXCAFDocument();
        const housing = kernel.makeBox(20, 20, 20);
        const gear = kernel.located(kernel.makeCylinder(5, 10), [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 5]);
        const root = doc.addShape(kernel.makeCompound([housing, gear]), { name: "assembly", assembly: true });
        const info = doc.getLabelInfo(root);
        expect(info.isAssembly).toBe(true);
        expect(info.name).toBe("assembly");

        const comps = doc.getChildren(root);
        expect(comps).toHaveLength(2);
        for (const comp of comps) {
            expect(doc.getLabelInfo(comp).isComponent).toBe(true);
            const proto = doc.getReferredLabel(comp);
            expect(proto).not.toBeNull();
            expect(doc.getLabelInfo(proto).isComponent).toBe(false);
        }
        expect(doc.getLocation(comps[0])).toEqual(IDENTITY);
        expect(doc.getLocation(comps[1])[3]).toBeCloseTo(10, 9);
        expect(doc.getLocation(comps[1])[11]).toBeCloseTo(5, 9);
        doc.close();
    });

    it("still adds a compound as one part by default", () => {
        const doc = kernel.createXCAFDocument();
        const root = doc.addShape(kernel.makeCompound([kernel.makeBox(1, 1, 1), kernel.makeBox(2, 2, 2)]));
        expect(doc.getLabelInfo(root).isAssembly).toBe(false);
        expect(doc.getChildren(root)).toEqual([]);
        doc.close();
    });

    it("rejects a non-compound", () => {
        const doc = kernel.createXCAFDocument();
        expect(() => doc.addShape(kernel.makeBox(1, 1, 1), { assembly: true })).toThrow(/compound/);
        doc.close();
    });
});

describe("references survive a STEP round trip", () => {
    it("walks root -> component -> prototype with names and placement intact", () => {
        const doc = kernel.createXCAFDocument();
        const housing = kernel.makeBox(20, 20, 20);
        const gear = kernel.located(kernel.makeCylinder(5, 10), [1, 0, 0, 10, 0, 1, 0, 0, 0, 0, 1, 5]);
        const root = doc.addShape(kernel.makeCompound([housing, gear]), { name: "assembly", assembly: true });
        const comps = doc.getChildren(root);
        doc.setName(comps[0], "housing-1");
        doc.setName(comps[1], "gear-1");
        doc.setName(doc.getReferredLabel(comps[0])!, "housing");
        doc.setName(doc.getReferredLabel(comps[1])!, "gear");
        const step = doc.exportSTEP();
        doc.close();

        const imported = kernel.importXCAFFromSTEP(step);
        const roots = imported.getRoots();
        expect(roots).toHaveLength(1);
        expect(imported.getLabelInfo(roots[0]).isAssembly).toBe(true);
        expect(imported.getLabelInfo(roots[0]).name).toBe("assembly");

        const children = imported.getChildren(roots[0]);
        expect(children).toHaveLength(2);
        const byName = new Map<string, number>();
        for (const child of children) {
            const info = imported.getLabelInfo(child);
            expect(info.isComponent).toBe(true);
            expect(imported.getChildren(child)).toEqual([]);
            const proto = imported.getReferredLabel(child);
            expect(proto).not.toBeNull();
            expect(imported.getLabelInfo(proto).shapeHandle).not.toBeNull();
            byName.set(imported.getLabelInfo(proto).name, child);
        }
        expect([...byName.keys()].sort()).toEqual(["gear", "housing"]);
        expect(imported.getLabelInfo(byName.get("gear")!).name).toBe("gear-1");
        const m = imported.getLocation(byName.get("gear")!);
        expect(m[3]).toBeCloseTo(10, 6);
        expect(m[11]).toBeCloseTo(5, 6);
        expect(imported.getLocation(byName.get("housing")!)).toEqual(IDENTITY);
        imported.close();
    });
});

describe("a part that takes children becomes an assembly", () => {
    it("keeps its own geometry as a first component with its name and color", () => {
        const doc = kernel.createXCAFDocument();
        const box = kernel.makeBox(20, 20, 20);
        const housing = doc.addShape(box, { name: "housing", color: [0.8, 0.2, 0.1] });
        expect(doc.getLabelInfo(housing).isAssembly).toBe(false);

        const gear = doc.addChild(housing, kernel.makeCylinder(5, 10), { name: "gear-1", location: { tx: 30 } });
        const info = doc.getLabelInfo(housing);
        expect(info.isAssembly).toBe(true);
        expect(info.name).toBe("housing");

        const [own, child] = doc.getChildren(housing);
        expect(child).toBe(gear);
        expect(doc.getLocation(own)).toEqual(IDENTITY);
        const proto = doc.getReferredLabel(own)!;
        const protoInfo = doc.getLabelInfo(proto);
        expect(protoInfo.name).toBe("housing");
        expect(protoInfo.hasColor).toBe(true);
        expect(protoInfo.color[0]).toBeCloseTo(0.8, 6);
        expect(kernel.getVolume(protoInfo.shapeHandle)).toBeCloseTo(8000, 3);

        // The assembly's own shape is now the compound of both components.
        expect(kernel.getVolume(info.shapeHandle)).toBeCloseTo(8000 + Math.PI * 25 * 10, 3);
        doc.close();
    });

    it("adds further children without converting again", () => {
        const doc = kernel.createXCAFDocument();
        const housing = doc.addShape(kernel.makeBox(20, 20, 20), { name: "housing" });
        doc.addChild(housing, kernel.makeCylinder(5, 10), { name: "gear-1" });
        doc.addChild(housing, kernel.makeSphere(3), { name: "ball-1" });
        expect(doc.getChildren(housing).map((l: number) => doc.getLabelInfo(l).name)).toEqual([
            "housing",
            "gear-1",
            "ball-1",
        ]);
        doc.close();
    });

    it("moves registered sub-shapes onto the prototype, keeping their tags", () => {
        const doc = kernel.createXCAFDocument();
        const box = kernel.makeBox(10, 10, 10);
        const part = doc.addShape(box, { name: "block" });
        const top = doc.addSubShape(part, kernel.getSubShapes(box, "face")[5], { name: "top", color: [0, 1, 0] });

        doc.addChild(part, kernel.makeSphere(1), { name: "ball-1" });
        expect(doc.getSubShapes(part)).toEqual([]);
        const proto = doc.getReferredLabel(doc.getChildren(part)[0])!;
        const subs = doc.getSubShapes(proto);
        expect(subs).toEqual([top]);
        const info = doc.getLabelInfo(top);
        expect(info.name).toBe("top");
        expect(info.hasColor).toBe(true);
        expect(info.color[1]).toBeCloseTo(1, 6);
        expect(kernel.getShapeType(info.shapeHandle)).toBe("face");
        doc.close();
    });

    it("leaves the document untouched when the child handle is invalid", () => {
        const doc = kernel.createXCAFDocument();
        const part = doc.addShape(kernel.makeBox(10, 10, 10), { name: "block" });
        expect(() => doc.addChild(part, 999999 as never)).toThrow();
        expect(doc.getLabelInfo(part).isAssembly).toBe(false);
        expect(doc.getChildren(part)).toEqual([]);
        doc.close();
    });

    it("rejects a component as parent", () => {
        const doc = kernel.createXCAFDocument();
        const housing = doc.addShape(kernel.makeBox(20, 20, 20));
        const gear = doc.addChild(housing, kernel.makeCylinder(5, 10));
        expect(() => doc.addChild(gear, kernel.makeSphere(1))).toThrow(/component/);
        doc.close();
    });

    it("survives a STEP round trip with both parts and the placement", () => {
        const doc = kernel.createXCAFDocument();
        const housing = doc.addShape(kernel.makeBox(20, 20, 20), { name: "housing", color: [0.8, 0.2, 0.1] });
        doc.addChild(housing, kernel.makeCylinder(5, 10), { name: "gear-1", location: { tx: 10, tz: 5 } });
        const step = doc.exportSTEP();
        doc.close();

        const imported = kernel.importXCAFFromSTEP(step);
        const root = imported.getRoots()[0];
        expect(imported.getLabelInfo(root).isAssembly).toBe(true);
        expect(imported.getLabelInfo(root).name).toBe("housing");
        const children = imported.getChildren(root);
        expect(children).toHaveLength(2);
        const names = children.map((l: number) => imported.getLabelInfo(imported.getReferredLabel(l)!).name);
        expect(names).toContain("housing");
        const gear = children.find((l: number) => imported.getLabelInfo(l).name === "gear-1")!;
        expect(imported.getLocation(gear)[3]).toBeCloseTo(10, 6);
        expect(imported.getLocation(gear)[11]).toBeCloseTo(5, 6);
        const shape = imported.getLabelInfo(root).shapeHandle;
        expect(kernel.getVolume(shape)).toBeCloseTo(8000 + Math.PI * 25 * 10, 1);
        imported.close();
    });
});
