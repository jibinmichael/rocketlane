import { defineConfig, globalIgnores } from "eslint/config"
import nextVitals from "eslint-config-next/core-web-vitals"
import nextTs from "eslint-config-next/typescript"

const CORE_BOUNDARY_MESSAGE =
  "core/ is framework-free. Import only from @/core/* and zod. See docs/agent-context/02-architecture-contract.md"

const RELATIVE_PARENT_MESSAGE =
  "Inside core/, import other modules via @/core/<module>/... so boundaries are checkable."

const BASE_CORE_PATHS = ["react", "react-dom", "next", "motion", "motion/react"].map((name) => ({
  name,
  message: CORE_BOUNDARY_MESSAGE,
}))

const BASE_CORE_PATTERNS = [
  { group: ["next/*", "react/*", "react-dom/*", "motion/*"], message: CORE_BOUNDARY_MESSAGE },
  {
    group: ["@/components/*", "@/app/*", "@/hooks/*", "@/lib/*", "@/types/*"],
    message: CORE_BOUNDARY_MESSAGE,
  },
  {
    group: ["@/fixtures/*"],
    message: "Fixtures are data. Load them through core/ingestion, never import them.",
  },
  { group: ["../*"], message: RELATIVE_PARENT_MESSAGE },
]

// Every core rule includes the base boundary; per-module rules add intra-core restrictions on top.
// (A later flat-config object replaces the rule for matching files, so the base must be repeated.)
const coreRule = (forbiddenModules = [], decision = "") => ({
  "no-restricted-imports": [
    "error",
    {
      paths: BASE_CORE_PATHS,
      patterns: [
        ...BASE_CORE_PATTERNS,
        ...forbiddenModules.map((module) => ({
          group: [`@/core/${module}/*`],
          message: `This module may not import core/${module} (${decision}).`,
        })),
      ],
    },
  ],
})

const ALL_CORE_MODULES = [
  "agent",
  "execution",
  "system",
  "mission",
  "governance",
  "resolver",
  "ingestion",
  "telemetry",
  "routine",
  "evaluation",
]

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  { files: ["core/**/*.ts"], rules: coreRule() },
  {
    files: ["core/agent/**/*.ts"],
    rules: coreRule(["execution", "system"], "D-18 plan-authority boundary"),
  },
  {
    files: ["core/governance/**/*.ts", "core/resolver/**/*.ts"],
    rules: coreRule(
      ["system", "execution", "agent"],
      "governance and resolver are pure over domain",
    ),
  },
  {
    files: ["core/mission/**/*.ts"],
    rules: coreRule(["system", "execution", "agent"], "mission never calls the system of record"),
  },
  {
    files: ["core/domain/**/*.ts"],
    rules: coreRule(ALL_CORE_MODULES, "domain depends on nothing"),
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "coverage/**",
    "next-env.d.ts",
  ]),
])

export default eslintConfig
